import React from 'react';
import { MousePointer2, Hand, Type, Image as ImageIcon, Music, StickyNote, Eraser, Pen, Gamepad2, Trash2, Square } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useBoardStore, type ElementType } from '../../lib/store';
import { motion } from 'framer-motion';

interface ToolbarProps {
    activeTool: ElementType | 'select' | 'hand' | 'pen' | 'path' | 'character' | 'eraser' | 'shape';
    setActiveTool: (tool: ElementType | 'select' | 'hand' | 'pen' | 'path' | 'character' | 'eraser' | 'shape') => void;
    onClearBoard: () => void;
}

export function Toolbar({ activeTool, setActiveTool, onClearBoard }: ToolbarProps) {
    const isHost = useBoardStore((state) => state.isHost);

    return (
        <motion.div
            initial={{ y: 50, opacity: 0, x: "-50%" }}
            animate={{ y: 0, opacity: 1, x: "-50%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="absolute bottom-5 left-1/2 z-50 flex items-center gap-0.5 p-1.5 rounded-2xl bg-white border-2 border-[#0A0A0A] shadow-[4px_4px_0_#0A0A0A]"
        >
            <ToolButton active={activeTool === 'select'} onClick={() => setActiveTool('select')} icon={<MousePointer2 size={17} />} label="Select" />
            <ToolButton active={activeTool === 'hand'} onClick={() => setActiveTool('hand')} icon={<Hand size={17} />} label="Pan" />

            <Divider />

            <ToolButton active={activeTool === 'path'} onClick={() => setActiveTool('path')} icon={<Pen size={17} />} label="Draw" />
            <ToolButton active={activeTool === 'eraser'} onClick={() => setActiveTool('eraser')} icon={<Eraser size={17} />} label="Eraser" />

            <Divider />

            <ToolButton active={activeTool === 'text'} onClick={() => setActiveTool('text')} icon={<Type size={17} />} label="Text" />
            <ToolButton active={activeTool === 'sticky'} onClick={() => setActiveTool('sticky')} icon={<StickyNote size={17} />} label="Note" />
            <ToolButton active={activeTool === 'shape'} onClick={() => setActiveTool('shape')} icon={<Square size={17} />} label="Shape" />
            <ToolButton active={activeTool === 'image'} onClick={() => setActiveTool('image')} icon={<ImageIcon size={17} />} label="Image" />
            <ToolButton active={activeTool === 'music'} onClick={() => setActiveTool('music')} icon={<Music size={17} />} label="Music" />
            <ToolButton active={activeTool === 'character'} onClick={() => setActiveTool('character')} icon={<Gamepad2 size={17} />} label="Player" />

            {isHost && (
                <>
                    <Divider />
                    <ToolButton active={false} onClick={onClearBoard} icon={<Trash2 size={17} />} label="Clear All" isDestructive />
                </>
            )}
        </motion.div>
    );
}

function Divider() {
    return <div className="w-px h-6 bg-[#0A0A0A]/15 mx-1 flex-shrink-0" />;
}

function ToolButton({ active, onClick, icon, label, isDestructive }: {
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
    isDestructive?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            title={label}
            className={cn(
                "relative p-2.5 rounded-xl transition-all flex items-center justify-center group touch-manipulation select-none border-2",
                active
                    ? "bg-[#F5C842] border-[#0A0A0A] text-[#0A0A0A] shadow-[2px_2px_0_#0A0A0A]"
                    : isDestructive
                        ? "border-transparent text-[#E8553A]/70 hover:bg-[#E8553A]/10 hover:border-[#E8553A] hover:text-[#E8553A]"
                        : "border-transparent text-[#0A0A0A]/40 hover:bg-[#0A0A0A]/8 hover:text-[#0A0A0A] hover:border-[#0A0A0A]/20"
            )}
        >
            {icon}
            {/* Tooltip */}
            <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-[#0A0A0A] text-white text-[11px] font-black px-2.5 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 uppercase tracking-wide">
                {label}
            </span>
            {active && (
                <motion.span
                    layoutId="toolbar-active"
                    className="absolute -bottom-[3px] w-1 h-1 rounded-full bg-[#0A0A0A]"
                />
            )}
        </button>
    );
}
