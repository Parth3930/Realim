import confetti from "canvas-confetti";
import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  useBoardStore,
  type ElementType,
  type BoardElement,
} from "../lib/store";
import { useP2P } from "../lib/p2p";
import { nanoid } from "nanoid";
import { AnimatePresence } from "framer-motion";
import { get, set } from "idb-keyval";
import { Key, Circle, Triangle, Square } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

import { GestureController, type HandData } from "./GestureController";
import { Toolbar } from "./board/Toolbar";
import { AddContentDialog } from "./board/AddContentDialog";
import { MemoizedDraggableElement } from "./board/DraggableElement";
import { Cursors } from "./board/Cursors";
import { GestureOverlay } from "./board/GestureOverlay";
import { useGestureLogic } from "./board/useGestureLogic";
import { Character } from "./board/Character";
import { CharacterController } from "./board/CharacterController";
import { Chat } from "./board/Chat";
import { SmoothCursor } from "./SmoothCursor";

// Deterministic color from userId string
const USER_COLORS = [
  "#7c3aed", "#2563eb", "#db2777", "#059669", "#d97706",
  "#dc2626", "#0891b2", "#7c3aed", "#65a30d", "#ea580c",
];
function getUserColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

// Debounce helper
const debounce = (func: Function, wait: number) => {
  let timeout: any;
  return (...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

interface BoardProps {
  roomId: string;
}

const FONT_OPTIONS = [
  { name: "Inter", value: "Inter, sans-serif" },
  { name: "Mono", value: "ui-monospace, monospace" },
  { name: "Serif", value: "Georgia, serif" },
  { name: "Cursive", value: "Pacifico, cursive" },
  { name: "Bold", value: "Inter, sans-serif", weight: 700 },
];

export function Board({ roomId }: BoardProps) {
  const store = useBoardStore();
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef(viewport);

  // Sync Ref -> State for committed changes (debounced)
  const commitViewport = useCallback(
    debounce((newViewport: any) => {
      setViewport(newViewport);
    }, 200),
    [],
  );

  // Helper to update Visual Viewport immediately (Direct DOM)
  const updateVisualViewport = (updaterOrValue: any, commit = false) => {
    const current = viewportRef.current;
    const next =
      typeof updaterOrValue === "function"
        ? updaterOrValue(current)
        : updaterOrValue;

    // Clamp Viewport to Grid Bounds (World [-2000, 2000])
    if (containerRef.current) {
      const { width, height } = containerRef.current.getBoundingClientRect();
      const halfW = 2000 * next.scale;
      const halfH = 2000 * next.scale;

      if (width > halfW * 2) {
        next.x = width / 2;
      } else {
        next.x = Math.min(Math.max(next.x, width - halfW), halfW);
      }

      if (height > halfH * 2) {
        next.y = height / 2;
      } else {
        next.y = Math.min(Math.max(next.y, height - halfH), halfH);
      }
    }

    // Update Ref (Source of truth for interactions)
    viewportRef.current = next;

    // Visual Update
    if (contentRef.current) {
      contentRef.current.style.transform = `translate3d(${next.x}px, ${next.y}px, 0) scale(${next.scale})`;
    }

    // Commit to State (triggers React Render)
    if (commit) {
      setViewport(next);
    } else {
      // Debounced commit for persistent zoom state during continuous gestures
      commitViewport(next);
    }
  };

  // Tools & Mode
  const [activeTool, setActiveTool] = useState<
    ElementType | "select" | "hand" | "pen" | "path" | "character" | "eraser"
  >("select");
  const [gestureMode, setGestureMode] = useState(false);

  const [selectedCharType, setSelectedCharType] = useState(0);
  const [selectedShapeType, setSelectedShapeType] = useState<"rectangle" | "circle" | "triangle">("rectangle");

  // Dialogs
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingTool, setPendingTool] = useState<ElementType | null>(null);
  const [pendingClick, setPendingClick] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Inline Text
  const [inlineText, setInlineText] = useState<{
    x: number;
    y: number;
    value: string;
    font: string;
  } | null>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const [selectedFont, setSelectedFont] = useState("Inter");

  // Pan State
  const [isPanning, setIsPanning] = useState(false);

  // Draw State
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [strokeColor, setStrokeColor] = useState("#0A0A0A");
  const currentDrawingId = useRef<string | null>(null);
  const currentPathPoints = useRef<{ x: number; y: number }[]>([]);
  const isDrawing = useRef(false);

  // Coordinates
  const toWorld = (screenX: number, screenY: number) => {
    const v = viewportRef.current; // Use Ref for latest interactive state
    return {
      x: (screenX - v.x) / v.scale,
      y: (screenY - v.y) / v.scale,
    };
  };

  const toScreen = (worldX: number, worldY: number) => {
    const v = viewportRef.current;
    return {
      x: worldX * v.scale + v.x,
      y: worldY * v.scale + v.y,
    };
  };

  // P2P
  const handleRemoteConfetti = (x: number, y: number) => {
    const screen = toScreen(x, y);
    confetti({
      particleCount: 100,
      spread: 70,
      origin: {
        x: screen.x / window.innerWidth,
        y: screen.y / window.innerHeight,
      },
      zIndex: 9999,
    });
  };

  const { broadcast, accessDenied, retryJoin, isConnected } = useP2P(roomId, {
    onConfetti: handleRemoteConfetti,
  });

  const handleDragUpdate = (
    id: string,
    newWorldX: number,
    newWorldY: number,
    final: boolean,
  ) => {
    const updates = { x: newWorldX, y: newWorldY, lastModifiedAt: Date.now() };
    if (final) {
      store.updateElement(id, updates);
    }
    broadcast({ type: "UPDATE_ELEMENT", payload: { id, updates } });
  };

  // Gesture Logic
  const gestureOverlayRef = useRef<any>(null);
  const { handleHandsUpdate } = useGestureLogic({
    viewportRef,
    setViewport: updateVisualViewport, // Pass our optimized updater
    broadcast,
    handleDragUpdate,
    setVirtualCursors: (cursors: any) => {
      if (gestureOverlayRef.current) {
        gestureOverlayRef.current.updateCursors(cursors);
      }
    },
  });

  const handleLocalConfettiGesture = (screenX: number, screenY: number) => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: {
        x: screenX / window.innerWidth,
        y: screenY / window.innerHeight,
      },
      zIndex: 9999,
    });
    const worldPos = toWorld(screenX, screenY);
    broadcast({ type: "CONFETTI", payload: worldPos });
  };

  // Persistence
  const [passwordInput, setPasswordInput] = useState("");

  useEffect(() => {
    store.setRoomId(roomId);
    const hostMarker = localStorage.getItem(`peerdraw_is_host_${roomId}`);
    const hostPassword = localStorage.getItem(`room_pass_${roomId}`);
    const isCreator = hostMarker === "true" || !!hostPassword;
    store.setIsHost(isCreator);

    get(`peerdraw_room_${roomId}`).then((val) => {
      if (val && Object.keys(val).length > 0) {
        if (Object.keys(store.elements).length === 0) {
          Object.values(val).forEach((el: any) => store.addElement(el));
        }
      }
    });
    store.saveRoom(roomId);
  }, [roomId]);

  const prevElementCountRef = useRef(0);
  useEffect(() => {
    const count = Object.keys(store.elements).length;
    const prev = prevElementCountRef.current;
    prevElementCountRef.current = count;

    // If elements were DELETED, save immediately (don't wait for debounce)
    // This prevents erased items from ghosting back on reload
    if (count < prev) {
      set(`peerdraw_room_${roomId}`, store.elements);
      return;
    }

    // For adds/updates (e.g. drawing), debounce to avoid hammering IDB
    const timer = setTimeout(() => {
      set(`peerdraw_room_${roomId}`, store.elements);
    }, 300);
    return () => clearTimeout(timer);
  }, [store.elements, roomId]);

  // Auto-center on latest element
  const hasAutoCenteredRef = useRef(false);
  const lastElementCountRef = useRef(0);

  useEffect(() => {
    const elements = Object.values(store.elements);
    const currentCount = elements.length;

    const isFirstLoad = !hasAutoCenteredRef.current && currentCount > 0;
    const isNewSyncData =
      currentCount > 0 && lastElementCountRef.current === 0 && currentCount > 0;

    if (!isFirstLoad && !isNewSyncData) {
      lastElementCountRef.current = currentCount;
      return;
    }

    const timer = setTimeout(() => {
      const allElements = Object.values(store.elements);
      if (allElements.length === 0) return;

      let latest = allElements.sort((a, b) => {
        const aTime = a.lastModifiedAt || a.createdAt || 0;
        const bTime = b.lastModifiedAt || b.createdAt || 0;
        return bTime - aTime;
      })[0];

      if (!latest) {
        latest = allElements[allElements.length - 1];
      }

      if (latest) {
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        const initialScale = 0.75;

        const newV = {
          x: centerX - latest.x * initialScale,
          y: centerY - latest.y * initialScale,
          scale: initialScale,
        };

        updateVisualViewport(newV, true); // Commit immediately
        hasAutoCenteredRef.current = true;
      }

      lastElementCountRef.current = allElements.length;
    }, 100);

    return () => clearTimeout(timer);
  }, [store.elements]);

  // Zoom/Pan/Touch Handlers
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const zoomSensitivity = 0.002;
        const delta = -e.deltaY * zoomSensitivity;

        updateVisualViewport((prev: any) => {
          const newScale = Math.min(Math.max(prev.scale + delta, 0.5), 2);
          return { ...prev, scale: newScale };
        });
        commitViewport(viewportRef.current);
      } else {
        const zoomSensitivity = 0.001;
        const delta = -e.deltaY * zoomSensitivity;

        updateVisualViewport((prev: any) => {
          const newScale = Math.min(Math.max(prev.scale + delta, 0.5), 2);
          const rect = container.getBoundingClientRect();
          const mouseX = e.clientX - rect.left;
          const mouseY = e.clientY - rect.top;
          const worldX = (mouseX - prev.x) / prev.scale;
          const worldY = (mouseY - prev.y) / prev.scale;
          return {
            x: mouseX - worldX * newScale,
            y: mouseY - worldY * newScale,
            scale: newScale,
          };
        });
        commitViewport(viewportRef.current);
      }
    };
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, [commitViewport]);

  // Keyboard Navigation (Smooth w/ Inertia)
  const activeKeys = useRef<Set<string>>(new Set());
  const keyVelocity = useRef({ x: 0, y: 0 });
  const keyRafId = useRef<number | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeTool === "text" || inlineText || modalOpen) return;
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      )
        return;

      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        activeKeys.current.add(e.key);
        startKeyLoop();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      activeKeys.current.delete(e.key);
    };

    const startKeyLoop = () => {
      if (keyRafId.current) return;

      const update = () => {
        const keys = activeKeys.current;
        const v = keyVelocity.current;
        const ACCEL = 1.0;
        const FRICTION = 0.85;
        const MAX_SPEED = 15;

        let targetDx = 0;
        let targetDy = 0;

        if (keys.has("ArrowUp")) targetDy += ACCEL;
        if (keys.has("ArrowDown")) targetDy -= ACCEL;
        if (keys.has("ArrowLeft")) targetDx += ACCEL;
        if (keys.has("ArrowRight")) targetDx -= ACCEL;

        if (targetDx !== 0) {
          v.x += targetDx;
          v.x = Math.min(Math.max(v.x, -MAX_SPEED), MAX_SPEED);
        } else {
          v.x *= FRICTION;
          if (Math.abs(v.x) < 0.1) v.x = 0;
        }

        if (targetDy !== 0) {
          v.y += targetDy;
          v.y = Math.min(Math.max(v.y, -MAX_SPEED), MAX_SPEED);
        } else {
          v.y *= FRICTION;
          if (Math.abs(v.y) < 0.1) v.y = 0;
        }

        if (v.x === 0 && v.y === 0 && keys.size === 0) {
          keyRafId.current = null;
          return;
        }

        updateVisualViewport((prev: any) => ({
          ...prev,
          x: prev.x + v.x,
          y: prev.y + v.y,
        }));
        commitViewport(viewportRef.current);

        keyRafId.current = requestAnimationFrame(update);
      };
      keyRafId.current = requestAnimationFrame(update);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      if (keyRafId.current) cancelAnimationFrame(keyRafId.current);
    };
  }, [activeTool, inlineText, modalOpen, commitViewport]);

  // Pointer Handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    if (activeTool === "hand" || e.button === 1) {
      e.preventDefault();
      setIsPanning(true);
      const startX = e.clientX;
      const startY = e.clientY;
      const initialView = { ...viewportRef.current };
      const onPointerMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        updateVisualViewport({
          ...initialView,
          x: initialView.x + dx,
          y: initialView.y + dy,
        });
      };
      const onPointerUp = () => {
        setIsPanning(false);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        setViewport(viewportRef.current);
      };
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    } else if (activeTool === "path") {
      e.preventDefault();
      e.stopPropagation();

      isDrawing.current = true;
      const rect = containerRef.current!.getBoundingClientRect();
      const startWorldPos = toWorld(
        e.clientX - rect.left,
        e.clientY - rect.top,
      );

      const id = nanoid();
      currentDrawingId.current = id;
      // Store absolute world positions while drawing — normalize on every update
      currentPathPoints.current = [startWorldPos];

      const newElement: BoardElement = {
        id,
        type: "path",
        x: startWorldPos.x,
        y: startWorldPos.y,
        width: 1,
        height: 1,
        content: "Path",
        points: [{ x: 0, y: 0 }],
        strokeColor,
        strokeWidth,
        createdBy: store.userId,
        createdAt: Date.now(),
        lastModifiedAt: Date.now(),
      };

      store.addElement(newElement);
      broadcast({ type: "ADD_ELEMENT", payload: newElement });

      const throttledBroadcast = debounce((updates: any) => {
        broadcast({
          type: "UPDATE_ELEMENT",
          payload: { id, updates },
        });
      }, 32);

      // Helper: normalize absolute world points into element-relative coords
      // so that el.x/y = top-left of bounding box, and all points >= 0
      const normalize = (absPoints: { x: number; y: number }[]) => {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        absPoints.forEach((p) => {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        });
        return {
          x: minX,
          y: minY,
          width: Math.max(maxX - minX, 4),
          height: Math.max(maxY - minY, 4),
          points: absPoints.map((p) => ({ x: p.x - minX, y: p.y - minY })),
        };
      };

      const onMove = (ev: PointerEvent) => {
        if (!isDrawing.current || !currentDrawingId.current) return;
        const r = containerRef.current!.getBoundingClientRect();
        const wp = toWorld(ev.clientX - r.left, ev.clientY - r.top);

        // Accumulate absolute world positions
        currentPathPoints.current.push(wp);

        // Normalize on every frame so the element always sits at its true top-left
        const norm = normalize(currentPathPoints.current);
        const updates = { ...norm, lastModifiedAt: Date.now() };

        store.updateElement(currentDrawingId.current, updates);
        throttledBroadcast(updates);
      };

      const onUp = () => {
        if (isDrawing.current) {
          isDrawing.current = false;
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);

          if (currentDrawingId.current) {
            const norm = normalize(currentPathPoints.current);
            const finalUpdates = { ...norm, lastModifiedAt: Date.now() };
            store.updateElement(currentDrawingId.current, finalUpdates);
            broadcast({
              type: "UPDATE_ELEMENT",
              payload: { id: currentDrawingId.current, updates: finalUpdates },
            });
          }

          currentDrawingId.current = null;
          currentPathPoints.current = [];
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    } else if (activeTool === "eraser") {
      e.preventDefault();
      e.stopPropagation();
      isDrawing.current = true;

      // Eraser: compute accurate world-space bounds per element type
      const getWorldBounds = (el: any) => {
        // For paths, compute actual bounds from the relative points array
        if (el.type === 'path' && el.points && el.points.length > 0) {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          el.points.forEach((p: {x: number; y: number}) => {
            minX = Math.min(minX, el.x + p.x);
            minY = Math.min(minY, el.y + p.y);
            maxX = Math.max(maxX, el.x + p.x);
            maxY = Math.max(maxY, el.y + p.y);
          });
          return { left: minX, top: minY, right: maxX, bottom: maxY };
        }
        // For all other elements, use stored x/y/width/height
        return {
          left: el.x,
          top: el.y,
          right: el.x + (el.width || 120),
          bottom: el.y + (el.height || 120),
        };
      };

      const ERASE_RADIUS = 20;

      const eraseElementsAtWorldPos = (clientX: number, clientY: number) => {
        if (!containerRef.current) return;
        const r = containerRef.current.getBoundingClientRect();
        const worldPos = toWorld(clientX - r.left, clientY - r.top);
        // Snapshot keys to avoid mutating while iterating
        const elements = Object.values(store.elements);
        elements.forEach((el) => {
          const b = getWorldBounds(el);
          if (
            worldPos.x >= b.left - ERASE_RADIUS &&
            worldPos.x <= b.right + ERASE_RADIUS &&
            worldPos.y >= b.top - ERASE_RADIUS &&
            worldPos.y <= b.bottom + ERASE_RADIUS
          ) {
            store.deleteElement(el.id);
            broadcast({ type: "DELETE_ELEMENT", payload: { id: el.id } });
          }
        });
      };

      eraseElementsAtWorldPos(e.clientX, e.clientY);

      const onMove = (ev: PointerEvent) => {
        if (!isDrawing.current) return;
        eraseElementsAtWorldPos(ev.clientX, ev.clientY);
      };

      const onUp = () => {
        isDrawing.current = false;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    }
  };

  const lastCursorUpdate = useRef(0);
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!containerRef.current || isDrawing.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const worldPos = toWorld(mouseX, mouseY);

    const now = Date.now();
    if (now - lastCursorUpdate.current > 16) {
      broadcast({
        type: "CURSOR_MOVE",
        payload: {
          x: worldPos.x,
          y: worldPos.y,
          userId: store.userId,
          username: store.username,
          color: getUserColor(store.userId),
        },
      });
      lastCursorUpdate.current = now;
    }
  };

  const handlePointerUp = (_e: React.PointerEvent) => {
    // Handled by window listeners for active tools like 'path'
  };

  const commitInlineText = () => {
    if (!inlineText || !inlineText.value.trim()) {
      setInlineText(null);
      return;
    }
    const id = nanoid();
    const fontOption =
      FONT_OPTIONS.find((f) => f.name === inlineText.font) || FONT_OPTIONS[0];
    const newElement: BoardElement = {
      id,
      type: "text",
      x: inlineText.x,
      y: inlineText.y,
      content: inlineText.value,
      createdBy: store.userId,
      createdAt: Date.now(),
      font: fontOption.value,
      fontWeight: fontOption.weight,
      strokeColor: strokeColor,
    };
    store.addElement(newElement);
    broadcast({ type: "ADD_ELEMENT", payload: newElement });
    setInlineText(null);
    setActiveTool("select");
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (inlineText && inlineText.value.trim()) {
      commitInlineText();
      return;
    } else if (inlineText) {
      setInlineText(null);
    }
    if (
      activeTool === "select" ||
      activeTool === "hand" ||
      isPanning ||
      activeTool === "path" ||
      activeTool === "eraser" ||
      isDrawing.current
    )
      return;
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const worldPos = toWorld(mouseX, mouseY);

    if (activeTool === "text") {
      setInlineText({
        x: worldPos.x,
        y: worldPos.y,
        value: "",
        font: selectedFont,
      });
      setTimeout(() => inlineInputRef.current?.focus(), 0);
      return;
    }

    // Spawn Character
    if (activeTool === "character") {
      const id = nanoid();
      const existing = Object.values(store.elements).find(
        (el) => el.type === "character" && el.playerId === store.userId,
      );
      if (existing) {
        store.deleteElement(existing.id);
        broadcast({ type: "DELETE_ELEMENT", payload: { id: existing.id } });
      }

      const newElement: BoardElement = {
        id,
        type: "character",
        x: worldPos.x - 20,
        y: worldPos.y - 40,
        content: "Player",
        createdBy: store.userId,
        createdAt: Date.now(),
        charType: selectedCharType,
        playerId: store.userId,
        respawnX: worldPos.x - 20,
        respawnY: worldPos.y - 40,
        vx: 0,
        vy: 0,
        isGrounded: true,
      };
      store.addElement(newElement);
      broadcast({ type: "ADD_ELEMENT", payload: newElement });
      setActiveTool("select");
      return;
    }

    // Spawn Shape
    if (activeTool === "shape") {
      const id = nanoid();
      
      const newElement: BoardElement = {
        id,
        type: "shape",
        x: worldPos.x - 50,
        y: worldPos.y - 50,
        width: 100,
        height: 100,
        content: "",
        shapeType: selectedShapeType,
        backgroundColor: strokeColor,
        createdBy: store.userId,
        createdAt: Date.now(),
      };
      store.addElement(newElement);
      broadcast({ type: "ADD_ELEMENT", payload: newElement });
      setActiveTool("select");
      return;
    }

    setPendingTool(activeTool as ElementType);
    setPendingClick(worldPos);
    setModalOpen(true);
  };

  const handleModalSubmit = (content: string, type: ElementType) => {
    if (!pendingClick) return;
    const id = nanoid();
    const newElement: BoardElement = {
      id,
      type,
      x: pendingClick.x,
      y: pendingClick.y,
      content,
      createdBy: store.userId,
      createdAt: Date.now(),
    };
    store.addElement(newElement);
    broadcast({ type: "ADD_ELEMENT", payload: newElement });
    setModalOpen(false);
    setPendingTool(null);
    setPendingClick(null);
    setActiveTool("select");
  };

  const handleClearBoard = () => {
    if (!confirm("Clear the entire board?")) return;
    Object.keys(store.elements).forEach((id) => {
      store.deleteElement(id);
      broadcast({ type: "DELETE_ELEMENT", payload: { id } });
    });
    set(`peerdraw_room_${roomId}`, {});
  };

  if (accessDenied) {
    return (
      <div className="w-full h-screen flex items-center justify-center" style={{ background: '#F5EDDA', backgroundImage: 'radial-gradient(#0A0A0A 1px, transparent 1px)', backgroundSize: '24px 24px' }}>
        <div className="bg-white p-8 rounded-2xl border-3 border-[#0A0A0A] shadow-[6px_6px_0_#0A0A0A] max-w-md w-full text-center space-y-6 border-[3px]">
          <div className="mx-auto w-12 h-12 bg-[#E8553A]/10 border-2 border-[#E8553A] rounded-xl flex items-center justify-center text-[#E8553A]">
            <Key size={22} />
          </div>
          <h2 className="text-2xl font-black uppercase tracking-tight text-[#0A0A0A]">Room Locked</h2>
          <p className="text-[#0A0A0A]/50 font-medium">This room is protected by a password.</p>
          <div className="flex gap-2">
            <Input
              type="password"
              placeholder="Enter Password..."
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && retryJoin(passwordInput)}
              className="bg-[#F5EDDA] border-2 border-[#0A0A0A] text-[#0A0A0A]"
            />
            <Button onClick={() => retryJoin(passwordInput)} className="bg-[#0A0A0A] text-white border-2 border-[#0A0A0A] hover:bg-[#E8553A]">Unlock</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative w-full h-screen overflow-hidden text-[#0A0A0A]"
      style={{ background: '#F5EDDA', backgroundImage: 'radial-gradient(#0A0A0A26 1px, transparent 1px)', backgroundSize: '24px 24px' }}
    >
      {/* Smooth cursor */}
      <SmoothCursor color="#0A0A0A" />

      <AddContentDialog
        open={modalOpen}
        onOpenChange={setModalOpen}
        pendingTool={pendingTool}
        onSubmit={handleModalSubmit}
      />

      {/* Zoom Controls */}
      <div className="absolute bottom-4 sm:bottom-6 right-4 sm:right-6 z-50 flex flex-col items-center gap-0 bg-white border-2 border-[#0A0A0A] rounded-xl shadow-[3px_3px_0_#0A0A0A] overflow-hidden">
        <button
          onClick={() =>
            updateVisualViewport(
              (v: any) => ({ ...v, scale: Math.min(v.scale + 0.1, 2) }),
              true,
            )
          }
          className="w-9 h-9 flex items-center justify-center font-black text-[#0A0A0A] hover:bg-[#F5C842] transition-colors text-lg"
        >
          +
        </button>
        <div className="text-center text-[10px] font-black opacity-40 border-y-2 border-[#0A0A0A]/10 w-full text-center py-1">
          {Math.round(viewport.scale * 100)}%
        </div>
        <button
          onClick={() =>
            updateVisualViewport(
              (v: any) => ({ ...v, scale: Math.max(v.scale - 0.1, 0.5) }),
              true,
            )
          }
          className="w-9 h-9 flex items-center justify-center font-black text-[#0A0A0A] hover:bg-[#F5C842] transition-colors text-lg"
        >
          -
        </button>
      </div>

      {/* Invite Button */}
      <div className="absolute bottom-4 sm:bottom-6 left-4 sm:left-6 z-50">
        <Button
          onClick={() => {
            const inviteUrl = `${window.location.origin}/board/${roomId}`;
            navigator.clipboard.writeText(inviteUrl);
            const btn = document.getElementById("invite-text");
            if (btn) btn.innerText = "Copied!";
            setTimeout(() => {
              if (btn) btn.innerText = "Invite Friend";
            }, 2000);
          }}
          className="bg-white border-2 border-[#0A0A0A] text-[#0A0A0A] font-black uppercase text-xs tracking-wide shadow-[3px_3px_0_#0A0A0A] hover:shadow-[1px_1px_0_#0A0A0A] hover:translate-x-[2px] hover:translate-y-[2px] transition-all px-4 h-9 touch-manipulation"
        >
          <span id="invite-text">Invite Friend</span>
        </Button>
      </div>

      {/* Gesture Toggle */}
      <div className="absolute bottom-16 sm:bottom-20 left-4 sm:left-6 md:bottom-auto md:left-auto md:top-6 md:right-6 z-50">
        <Button
          size="icon"
          onClick={() => setGestureMode(!gestureMode)}
          className={cn(
            "border-2 border-[#0A0A0A] transition-all shadow-[3px_3px_0_#0A0A0A] rounded-xl w-10 h-10 sm:w-11 sm:h-11 touch-manipulation font-black text-sm",
            gestureMode
              ? "bg-[#F5C842] text-[#0A0A0A]"
              : "bg-white text-[#0A0A0A]/50 hover:text-[#0A0A0A] hover:shadow-[1px_1px_0_#0A0A0A] hover:translate-x-[2px] hover:translate-y-[2px]",
          )}
        >
          G
        </Button>
      </div>

      <Toolbar
        activeTool={activeTool}
        setActiveTool={setActiveTool}
        onClearBoard={handleClearBoard}
      />

      {/* Character Picker — left side, won't overlap toolbar */}
      {activeTool === "character" && (
        <div
          className="absolute left-4 sm:left-6 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-1.5 p-2 rounded-2xl bg-white border-2 border-[#0A0A0A] shadow-[4px_4px_0_#0A0A0A] animate-in fade-in slide-in-from-left-4"
        >
          <p className="text-[9px] font-black text-[#0A0A0A]/40 uppercase tracking-widest text-center mb-0.5">Skin</p>
          {Array.from({ length: 10 }).map((_, i) => (
            <button
              key={i}
              onClick={() => setSelectedCharType(i)}
              className={cn(
                "relative p-1 rounded-xl transition-all hover:bg-[#F5C842]/30 hover:scale-110 border-2",
                selectedCharType === i ? "bg-[#F5C842] border-[#0A0A0A] shadow-[2px_2px_0_#0A0A0A]" : "border-transparent",
              )}
            >
              <div className="w-7 h-7 pointer-events-none">
                <Character
                  type={i}
                  facing="right"
                  isGrounded={true}
                  isMoving={false}
                />
              </div>
            </button>
          ))}
          <div className="h-px w-full bg-[#0A0A0A]/10 my-0.5" />
          <p className="text-[8px] text-[#0A0A0A]/30 font-bold text-center uppercase">click board</p>
        </div>
      )}

      {/* Text Tool Options */}
      {activeTool === "text" && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-50 bg-white border-2 border-[#0A0A0A] px-4 py-3 rounded-xl flex gap-4 shadow-[4px_4px_0_#0A0A0A] items-center animate-in fade-in slide-in-from-bottom-4">
          <div className="flex gap-2">
            {[
              "#0A0A0A",
              "#E8553A",
              "#2ed573",
              "#1e90ff",
              "#F5C842",
              "#a855f7",
            ].map((color) => (
              <button
                key={color}
                onClick={() => setStrokeColor(color)}
                className={cn(
                  "w-6 h-6 rounded-full transition-transform hover:scale-110 border-2",
                  strokeColor === color
                    ? "border-[#0A0A0A] scale-110 shadow-[2px_2px_0_#0A0A0A]"
                    : "border-[#0A0A0A]/30",
                )}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <div className="w-px h-6 bg-[#0A0A0A]/15" />
          <div className="flex gap-1">
            {FONT_OPTIONS.map((font) => (
              <button
                key={font.name}
                onClick={() => setSelectedFont(font.name)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm transition-all font-bold border-2",
                  selectedFont === font.name
                    ? "bg-[#F5C842] text-[#0A0A0A] border-[#0A0A0A] shadow-[2px_2px_0_#0A0A0A]"
                    : "border-transparent text-[#0A0A0A]/50 hover:bg-[#0A0A0A]/5 hover:text-[#0A0A0A]",
                )}
                style={{ fontFamily: font.value, fontWeight: font.weight || 400 }}
              >
                {font.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Shape Tool Options */}
      {activeTool === "shape" && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-50 bg-white border-2 border-[#0A0A0A] px-4 py-3 rounded-xl flex gap-4 shadow-[4px_4px_0_#0A0A0A] items-center animate-in fade-in slide-in-from-bottom-4">
          <div className="flex gap-2 items-center">
            {[
              { type: 'rectangle', icon: <Square size={16} strokeWidth={2.5} /> },
              { type: 'circle', icon: <Circle size={16} strokeWidth={2.5} /> },
              { type: 'triangle', icon: <Triangle size={16} strokeWidth={2.5} /> }
            ].map(({ type, icon }) => (
              <button
                key={type}
                onClick={() => setSelectedShapeType(type as any)}
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center transition-all border-2",
                  selectedShapeType === type
                    ? "bg-[#F5C842] border-[#0A0A0A] shadow-[2px_2px_0_#0A0A0A] text-[#0A0A0A]"
                    : "border-transparent text-[#0A0A0A]/40 hover:bg-[#0A0A0A]/5 hover:text-[#0A0A0A]"
                )}
              >
                {icon}
              </button>
            ))}
          </div>
          <div className="w-px h-6 bg-[#0A0A0A]/15" />
          <div className="flex gap-2">
            {[
              "#0A0A0A",
              "#E8553A",
              "#2ed573",
              "#1e90ff",
              "#F5C842",
              "#a855f7",
            ].map((color) => (
              <button
                key={color}
                onClick={() => setStrokeColor(color)}
                className={cn(
                  "w-6 h-6 rounded-full transition-transform hover:scale-110 border-2",
                  strokeColor === color
                    ? "border-[#0A0A0A] scale-110 shadow-[2px_2px_0_#0A0A0A]"
                    : "border-[#0A0A0A]/30",
                )}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Draw Tool Options */}
      {activeTool === "path" && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-50 bg-white border-2 border-[#0A0A0A] px-4 py-3 rounded-xl flex gap-4 shadow-[4px_4px_0_#0A0A0A] items-center animate-in fade-in slide-in-from-bottom-4">
          <div className="flex gap-2">
            {[
              "#0A0A0A",
              "#E8553A",
              "#2ed573",
              "#1e90ff",
              "#F5C842",
              "#a855f7",
            ].map((color) => (
              <button
                key={color}
                onClick={() => setStrokeColor(color)}
                className={cn(
                  "w-6 h-6 rounded-full transition-transform hover:scale-110 border-2",
                  strokeColor === color
                    ? "border-[#0A0A0A] scale-110 shadow-[2px_2px_0_#0A0A0A]"
                    : "border-[#0A0A0A]/30",
                )}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <div className="w-px h-6 bg-[#0A0A0A]/15" />
          <div className="flex gap-2 items-center">
            {[2, 4, 8, 12].map((width) => (
              <button
                key={width}
                onClick={() => setStrokeWidth(width)}
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center transition-all border-2",
                  strokeWidth === width
                    ? "bg-[#F5C842] border-[#0A0A0A] shadow-[2px_2px_0_#0A0A0A]"
                    : "border-transparent text-[#0A0A0A]/40 hover:bg-[#0A0A0A]/5",
                )}
              >
                <div
                  className="rounded-full bg-[#0A0A0A]"
                  style={{ width: width, height: width }}
                />
              </button>
            ))}
          </div>
        </div>
      )}



      <GestureController
        enabled={gestureMode}
        onConfettiGesture={handleLocalConfettiGesture}
        onHandsUpdate={handleHandsUpdate}
      />

      <GestureOverlay ref={gestureOverlayRef} enabled={gestureMode} />
      {Object.values(store.elements).some(
        (el) => el.type === "character" && el.playerId === store.userId,
      ) && (
        <CharacterController
          broadcast={broadcast}
          onFollow={(x, y) => {
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;
            updateVisualViewport((prev: any) => ({
              ...prev,
              x: centerX - (x + 20) * prev.scale,
              y: centerY - (y + 20) * prev.scale,
            }));
          }}
        />
      )}

      <div
        ref={containerRef}
        role="application"
        tabIndex={0}
        className="w-full h-full relative outline-none touch-none overflow-hidden"
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onClick={handleCanvasClick}
        onKeyDown={(e) => {
          const target = e.target as HTMLElement;
          if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
          if (e.key === "Enter" || e.key === " ") {
            handleCanvasClick(e as any);
          }
        }}
      >
        <div
          ref={contentRef}
          className="absolute top-0 left-0 w-full h-full origin-top-left will-change-transform" // Removed Duration/Easing for raw 60FPS feel
          style={{
            transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.scale})`,
            backfaceVisibility: "hidden",
          }}
        >
          <div
            className="absolute -top-[2000px] -left-[2000px] w-[4000px] h-[4000px] pointer-events-none overflow-hidden rounded-sm ring-1 ring-white/10"
            style={{
              backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
              backgroundSize: "40px 40px",
              opacity: 0.05,
            }}
          />

          <AnimatePresence>
            {Object.values(store.elements).map((el) => (
              <MemoizedDraggableElement
                key={el.id}
                data={el}
                activeTool={activeTool}
                scale={viewport.scale}
                onDelete={() => {
                  store.deleteElement(el.id);
                  broadcast({ type: "DELETE_ELEMENT", payload: { id: el.id } });
                }}
                onDragUpdate={(x, y, final) =>
                  handleDragUpdate(el.id, x, y, final)
                }
                onElementUpdate={(updates) => {
                  store.updateElement(el.id, updates);
                  broadcast({
                    type: "UPDATE_ELEMENT",
                    payload: { id: el.id, updates },
                  });
                }}
              />
            ))}
          </AnimatePresence>

          {inlineText && (
            <input
              ref={inlineInputRef}
              type="text"
              value={inlineText.value}
              onChange={(e) =>
                setInlineText({ ...inlineText, value: e.target.value })
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") commitInlineText();
                else if (e.key === "Escape") {
                  setInlineText(null);
                  setActiveTool("select");
                }
              }}
              onBlur={() => {
                if (inlineText.value.trim()) commitInlineText();
                else setInlineText(null);
              }}
              className="absolute bg-transparent border-none outline-none text-lg font-medium caret-primary min-w-[100px]"
              style={{
                left: inlineText.x,
                top: inlineText.y,
                transform: "translateY(-50%)",
                color: strokeColor,
              }}
              placeholder="Type here..."
            />
          )}

          <Cursors
            cursors={store.cursors}
            currentUserId={store.userId}
            viewportScale={viewport.scale}
          />
        </div>
      </div>

      <Chat broadcast={broadcast} />
    </div>
  );
}
