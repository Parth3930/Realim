import React from "react";
import { LazyMotion, domAnimation, m } from "framer-motion";
import type { UserCursor } from "../../lib/store";

interface CursorsProps {
  cursors: Record<string, UserCursor>;
  currentUserId: string;
  viewportScale: number;
}

export function Cursors({
  cursors,
  currentUserId,
  viewportScale,
}: CursorsProps) {
  return (
    <LazyMotion features={domAnimation}>
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-visible">
        {Object.entries(cursors).map(([id, cursor]) => {
          if (id === currentUserId) return null;
          return (
            <m.div
              key={id}
              className="absolute pointer-events-none z-50 flex flex-col items-start"
              initial={{ left: cursor.x, top: cursor.y }}
              animate={{ left: cursor.x, top: cursor.y }}
              transition={{ type: "tween", ease: "linear", duration: 0.1 }}
              style={{ transform: `scale(${1 / viewportScale})` }}
            >
              <UserCursorIcon color={cursor.color} label={cursor.username} />
            </m.div>
          );
        })}
      </div>
    </LazyMotion>
  );
}

function UserCursorIcon({ color, label }: { color: string; label: string }) {
  return (
    <>
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        className="drop-shadow-md"
      >
        <path
          d="M5.65376 12.3673H5.46026L5.31717 12.4976L0.500002 16.8829L0.500002 1.19177L11.7841 12.3673H5.65376Z"
          fill={color || "#fff"}
          stroke="black"
          strokeWidth="1"
        />
      </svg>
      <div className="ml-4 -mt-2 bg-black/50 backdrop-blur-sm text-white text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap border border-white/10">
        {label}
      </div>
    </>
  );
}
