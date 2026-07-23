import { useEffect, useRef } from "react";
import { useBoardStore } from "../../lib/store";

const GRAVITY = 0.6;
const JUMP_FORCE = -12; // Hop force
const MOVE_SPEED = 5;
const TERMINAL_VELOCITY = 15;
const PLAYER_SIZE = 40; // 40x40

export function useCharacterPhysics({
  isPlaying,
  myCharId,
  onFollow,
  broadcast,
}: {
  isPlaying: boolean;
  myCharId: string | undefined;
  onFollow?: (x: number, y: number) => void;
  broadcast?: (msg: any) => void;
}) {
  const store = useBoardStore();

  // Physics State (Refs for loop)
  const physicsRef = useRef({
    vx: 0,
    vy: 0,
    x: 0,
    y: 0,
    isGrounded: false,
    lastSync: 0,
  });

  // Inputs
  const keys = useRef<Set<string>>(new Set());

  // Initial Sync when entering play mode
  useEffect(() => {
    if (myCharId && store.elements[myCharId]) {
      const el = store.elements[myCharId];
      physicsRef.current.x = el.x;
      physicsRef.current.y = el.y;
      physicsRef.current.vx = el.vx || 0;
      physicsRef.current.vy = el.vy || 0;
    }
  }, [myCharId, isPlaying]);

  // Input Listeners
  useEffect(() => {
    if (!isPlaying) return;

    const onDown = (e: KeyboardEvent) => keys.current.add(e.key.toLowerCase());
    const onUp = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [isPlaying]);

  // Physics Loop
  useEffect(() => {
    if (!isPlaying || !myCharId) return;

    let rafId: number;
    const loop = () => {
      const p = physicsRef.current;
      const k = keys.current;

      // 1. Horizontal Move (WASD Only)
      if (k.has("d")) {
        p.vx = MOVE_SPEED;
      } else if (k.has("a")) {
        p.vx = -MOVE_SPEED;
      } else {
        p.vx = 0;
      }

      // 2. Jump (W or Space)
      if ((k.has("w") || k.has(" ")) && p.isGrounded) {
        p.vy = JUMP_FORCE;
        p.isGrounded = false;
      }

      // 3. Gravity
      p.vy += GRAVITY;
      if (p.vy > TERMINAL_VELOCITY) p.vy = TERMINAL_VELOCITY;

      // 4. Apply Velocity
      let nextX = p.x + p.vx;
      let nextY = p.y + p.vy;

      // 5. Collision Detection (Rotated + Scaled + Paths)
      const allElements = Object.values(useBoardStore.getState().elements);
      const platforms = allElements.filter(
        (el) => el.type !== "character" && el.type !== "path"
      );
      const pathElements = allElements.filter((el) => el.type === "path");

      p.isGrounded = false;

      // Dual Feet Points (Check both corners for stability)
      const feetLX = nextX + 5;
      const feetRX = nextX + PLAYER_SIZE - 5;
      const feetY = nextY + PLAYER_SIZE;

      const SINK_DEPTH = 4;

      // --- Block Collisions ---
      for (const platform of platforms) {
        const baseW =
          platform.width ||
          (platform.type === "text"
            ? platform.content.length * 10
            : platform.type === "sticky"
              ? 220
              : 100);
        const scale = platform.scale || 1;
        const effectiveW = baseW * scale;

        const baseRotation =
          platform.rotation || (platform.type === "sticky" ? 1 : 0);
        const angle = baseRotation * (Math.PI / 180);
        const cos = Math.cos(-angle);
        const sin = Math.sin(-angle);

        const ox = platform.x;
        const oy = platform.y;

        for (const fx of [feetLX, feetRX]) {
          const rx = fx - ox;
          const ry = feetY - oy;

          const localX = rx * cos - ry * sin;
          const localY = rx * sin + ry * cos;

          if (localX >= 2 && localX <= effectiveW - 2) {
            if (p.vy >= 0 && localY > -10 && localY < 25) {
              const targetLocalY = SINK_DEPTH;
              const backCos = Math.cos(angle);
              const backSin = Math.sin(angle);

              const worldSnapX = localX * backCos - targetLocalY * backSin + ox;
              const worldSnapY = localX * backSin + targetLocalY * backCos + oy;

              nextY = worldSnapY - PLAYER_SIZE;
              nextX = worldSnapX - (fx === feetLX ? 5 : PLAYER_SIZE - 5);

              p.vy = 0;
              p.isGrounded = true;
              break;
            }
          }
        }
        if (p.isGrounded) break;
      }

      // --- Path Drawing Collisions ---
      if (!p.isGrounded) {
        for (const pathEl of pathElements) {
          if (!pathEl.points || pathEl.points.length < 2) continue;

          const ox = pathEl.x;
          const oy = pathEl.y;

          for (let i = 0; i < pathEl.points.length - 1; i++) {
            const p1 = pathEl.points[i];
            const p2 = pathEl.points[i + 1];

            // Points in world space
            const w1x = p1.x + ox;
            const w1y = p1.y + oy;
            const w2x = p2.x + ox;
            const w2y = p2.y + oy;

            for (const fx of [feetLX, feetRX]) {
              const minX = Math.min(w1x, w2x);
              const maxX = Math.max(w1x, w2x);

              if (fx >= minX - 10 && fx <= maxX + 10) {
                // Linear interpolation for Y at this X
                let targetY;
                if (Math.abs(w2x - w1x) < 0.1) {
                  targetY = Math.min(w1y, w2y);
                } else {
                  const t = (fx - w1x) / (w2x - w1x);
                  targetY = w1y + t * (w2y - w1y);
                }

                // Check if feet are crossing this segment from above
                if (
                  p.vy >= 0 &&
                  feetY >= targetY - 10 &&
                  feetY <= targetY + 20
                ) {
                  nextY = targetY - PLAYER_SIZE;
                  p.vy = 0;
                  p.isGrounded = true;
                  break;
                }
              }
            }
            if (p.isGrounded) break;
          }
          if (p.isGrounded) break;
        }
      }

      // 6. Floor / Death (Clamped to Grid Bounds)
      if (nextY > 2000 || nextX < -2000 || nextX > 2000) {
        const el = useBoardStore.getState().elements[myCharId];
        nextX = el.respawnX || 0;
        nextY = el.respawnY || 0;
        p.vy = 0;
      }

      // Update Physics State
      p.x = nextX;
      p.y = nextY;

      // 7. Sync to Store
      const updates = {
        x: nextX,
        y: nextY,
        vx: p.vx,
        vy: p.vy,
        facing: (p.vx > 0 ? "right" : p.vx < 0 ? "left" : undefined) as any,
        isGrounded: p.isGrounded,
        lastModifiedAt: Date.now(),
      };

      store.updateElement(myCharId, updates);

      // 7.5 Broadcast to Peers (If moving or state changed)
      if (
        broadcast &&
        (p.vx !== 0 ||
          p.vy !== 0 ||
          !p.isGrounded ||
          Date.now() - p.lastSync > 100)
      ) {
        broadcast({
          type: "UPDATE_ELEMENT",
          payload: { id: myCharId, updates },
        });
        p.lastSync = Date.now();
      }

      // 8. Trigger Camera Follow
      if (onFollow) {
        onFollow(nextX, nextY);
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, myCharId, store, broadcast, onFollow]);
}
