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
              className="absolute pointer-events-none z-50 flex flex-col items-start origin-top-left"
              initial={{ left: cursor.x, top: cursor.y, opacity: 0 }}
              animate={{ left: cursor.x, top: cursor.y, opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ 
                left: { type: "spring", damping: 30, stiffness: 400, mass: 0.5 },
                top: { type: "spring", damping: 30, stiffness: 400, mass: 0.5 },
                opacity: { duration: 0.2 }
              }}
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
    <div className="relative">
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        className="drop-shadow-xl"
        style={{ filter: `drop-shadow(0px 2px 4px rgba(0,0,0,0.5))` }}
      >
        <path
          d="M5.65376 12.3673H5.46026L5.31717 12.4976L0.500002 16.8829L0.500002 1.19177L11.7841 12.3673H5.65376Z"
          fill={color || "#3b82f6"}
          stroke="white"
          strokeWidth="1.5"
        />
      </svg>
      <div 
        className="absolute left-4 top-4 bg-black/70 backdrop-blur-md text-white text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap border border-white/10 shadow-lg"
        style={{ backgroundColor: color ? `${color}dd` : 'rgba(0,0,0,0.7)' }}
      >
        {label}
      </div>
    </div>
  );
}
