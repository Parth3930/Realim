import React from "react";
import { Button } from "../ui/button";
import { Gamepad2, Square } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/** Keyboard key badge */
const K = ({ children }: { children: React.ReactNode }) => (
  <span className="w-7 h-7 flex items-center justify-center bg-black/40 backdrop-blur-md rounded-md border border-white/20 text-xs font-mono font-bold text-white shadow-inner">
    {children}
  </span>
);

interface GameUIProps {
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
}

export function GameUI({ isPlaying, setIsPlaying }: GameUIProps) {
  return (
    <>
      {/* Play Button - Moved to Top Right (below gesture toggle) to avoid overlap */}
      <div className="absolute top-[149px] right-6 z-50 flex flex-col items-end gap-3">
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Button
            size="default"
            className={`relative overflow-hidden shadow-lg border backdrop-blur-xl transition-all duration-300 font-bold tracking-wide rounded-xl px-5 py-6 ${
              isPlaying
                ? "bg-red-500/10 hover:bg-red-500/20 border-red-500/50 text-red-500"
                : "bg-violet-500/10 hover:bg-violet-500/20 border-violet-500/50 text-violet-400"
            }`}
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {/* Subtle glowing background effect */}
            <div
              className={`absolute inset-0 blur-xl opacity-30 ${
                isPlaying ? "bg-red-600" : "bg-violet-600"
              }`}
            />
            
            <span className="relative z-10 flex items-center gap-2 text-sm uppercase">
              {isPlaying ? (
                <>
                  <Square className="w-4 h-4 fill-current" />
                  Stop Game
                </>
              ) : (
                <>
                  <Gamepad2 className="w-4 h-4" />
                  Start Game
                </>
              )}
            </span>
          </Button>
        </motion.div>
      </div>

      {/* Overlay Instructions when playing */}
      <AnimatePresence>
        {isPlaying && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="absolute top-6 left-1/2 -translate-x-1/2 pointer-events-none z-40"
          >
            <div className="bg-black/20 backdrop-blur-xl px-6 py-3 rounded-2xl text-white border border-white/10 shadow-2xl flex items-center gap-5">
              <div className="flex gap-1.5">
                <K>W</K>
                <K>A</K>
                <K>S</K>
                <K>D</K>
              </div>
              <span className="font-semibold text-sm tracking-widest uppercase text-white/80">
                To Move
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
