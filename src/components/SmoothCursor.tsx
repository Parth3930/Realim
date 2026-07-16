import { useEffect, useRef, useState } from "react";
import { motion, useSpring } from "framer-motion";

export interface SmoothCursorProps {
  color?: string;
}

const DESKTOP_QUERY = "(any-hover: hover) and (any-pointer: fine)";

export function SmoothCursor({ color = "#0A0A0A" }: SmoothCursorProps) {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  const cursorX = useSpring(0, { stiffness: 500, damping: 40, mass: 0.6 });
  const cursorY = useSpring(0, { stiffness: 500, damping: 40, mass: 0.6 });
  const dotX = useSpring(0, { stiffness: 180, damping: 20, mass: 0.4 });
  const dotY = useSpring(0, { stiffness: 180, damping: 20, mass: 0.4 });
  const scale = useSpring(1, { stiffness: 600, damping: 30 });
  const rafId = useRef(0);

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const update = () => setIsEnabled(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!isEnabled) return;

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      if (rafId.current) return;
      rafId.current = requestAnimationFrame(() => {
        cursorX.set(e.clientX);
        cursorY.set(e.clientY);
        dotX.set(e.clientX);
        dotY.set(e.clientY);
        setIsVisible(true);
        rafId.current = 0;
      });
    };

    const onDown = () => scale.set(0.75);
    const onUp = () => scale.set(1);

    document.body.style.cursor = "none";
    document.body.classList.add("cursor-none");
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "auto";
      document.body.classList.remove("cursor-none");
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [isEnabled, cursorX, cursorY, dotX, dotY, scale]);

  if (!isEnabled) return null;

  return (
    <>
      {/* Outer ring — lags behind slightly */}
      <motion.div
        style={{
          position: "fixed",
          left: dotX,
          top: dotY,
          translateX: "-50%",
          translateY: "-50%",
          zIndex: 99999,
          pointerEvents: "none",
          opacity: isVisible ? 1 : 0,
          scale,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            border: `2px solid ${color}`,
            opacity: 0.35,
          }}
        />
      </motion.div>

      {/* Inner dot — snaps fast */}
      <motion.div
        style={{
          position: "fixed",
          left: cursorX,
          top: cursorY,
          translateX: "-50%",
          translateY: "-50%",
          zIndex: 100000,
          pointerEvents: "none",
          opacity: isVisible ? 1 : 0,
          scale,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: color,
          }}
        />
      </motion.div>
    </>
  );
}
