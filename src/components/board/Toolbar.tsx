import { MousePointer2, Hand, Type, Image as ImageIcon, Music, StickyNote, Eraser, Pen, Gamepad2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useBoardStore, type ElementType } from '../../lib/store';

interface ToolbarProps {
    activeTool: ElementType | 'select' | 'hand' | 'pen' | 'path' | 'character';
    setActiveTool: (tool: ElementType | 'select' | 'hand' | 'pen' | 'path' | 'character') => void;
    onClearBoard: () => void;
}

export function Toolbar({ activeTool, setActiveTool, onClearBoard }: ToolbarProps) {
    const isHost = useBoardStore((state) => state.isHost);

    return (
        <div className="absolute top-4 sm:top-6 left-1/2 -translate-x-1/2 z-50 glass px-1 sm:px-2 py-1 sm:py-2 rounded-xl sm:rounded-2xl flex gap-0.5 sm:gap-1 shadow-2xl border border-white/10 max-w-[calc(100vw-2rem)]">
            <ToolButton active={activeTool === 'select'} onClick={() => setActiveTool('select')} icon={<MousePointer2 size={16} className="sm:w-[18px] sm:h-[18px]" />} label="Select" />
            <ToolButton active={activeTool === 'hand'} onClick={() => setActiveTool('hand')} icon={<Hand size={16} className="sm:w-[18px] sm:h-[18px]" />} label="Pan" />
            <div className="w-px bg-white/10 mx-0.5 sm:mx-1 h-6 sm:h-8 self-center" />
            <ToolButton active={activeTool === 'text'} onClick={() => setActiveTool('text')} icon={<Type size={16} className="sm:w-[18px] sm:h-[18px]" />} label="Text" />
            <ToolButton active={activeTool === 'image'} onClick={() => setActiveTool('image')} icon={<ImageIcon size={16} className="sm:w-[18px] sm:h-[18px]" />} label="Image" />
            <ToolButton active={activeTool === 'music'} onClick={() => setActiveTool('music')} icon={<Music size={16} className="sm:w-[18px] sm:h-[18px]" />} label="Music" />
            <ToolButton active={activeTool === 'sticky'} onClick={() => setActiveTool('sticky')} icon={<StickyNote size={16} className="sm:w-[18px] sm:h-[18px]" />} label="Note" />
            <ToolButton active={activeTool === 'path'} onClick={() => setActiveTool('path')} icon={<Pen size={16} className="sm:w-[18px] sm:h-[18px]" />} label="Draw" />
            <ToolButton active={activeTool === 'character'} onClick={() => setActiveTool('character')} icon={<Gamepad2 size={16} className="sm:w-[18px] sm:h-[18px]" />} label="Player" />

            {isHost && (
                <>
                    <div className="w-px bg-destructive/20 mx-1 h-8 self-center" />
                    <button onClick={onClearBoard} className="p-2 rounded-xl hover:bg-destructive/20 text-destructive/80 hover:text-destructive transition-colors"><Eraser size={18} /></button>
                </>
            )}
        </div>
    );
}

function ToolButton({ active, onClick, icon, label }: any) {
    return (
        <button onClick={onClick} className={cn("p-2 sm:p-2.5 rounded-lg sm:rounded-xl transition-all flex items-center justify-center gap-2 relative group touch-manipulation active:scale-95", active ? "bg-primary text-primary-foreground shadow-[0_0_15px_-3px_rgba(139,92,246,0.6)]" : "hover:bg-white/5 active:bg-white/10 text-muted-foreground hover:text-white")}>
            {icon}
            <span className="absolute top-10 sm:top-12 bg-black/80 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 border border-white/10 backdrop-blur-md">{label}</span>
        </button>
    );
}
