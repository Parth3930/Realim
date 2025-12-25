import React, { useRef, memo } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { BoardElement } from '../../lib/store';
import { MusicElementComponent } from './MediaElements';

// RAF-based throttle for smoother, faster sync
export const requestThrottle = (callback: Function, _delay: number) => {
    let pending = false;
    let latestArgs: any[] = [];
    return (...args: any[]) => {
        latestArgs = args;
        if (!pending) {
            pending = true;
            requestAnimationFrame(() => {
                callback(...latestArgs);
                pending = false;
            });
        }
    };
};

export const MemoizedDraggableElement = memo(DraggableElement, (prev, next) => {
    return (
        prev.data.x === next.data.x &&
        prev.data.y === next.data.y &&
        prev.data.content === next.data.content &&
        prev.data.rotation === next.data.rotation &&
        prev.data.scale === next.data.scale &&
        prev.data.isPlaying === next.data.isPlaying &&
        prev.data.playbackTime === next.data.playbackTime &&
        prev.activeTool === next.activeTool &&
        prev.scale === next.scale &&
        // Checks for path
        prev.data.points === next.data.points &&
        prev.data.strokeColor === next.data.strokeColor
    );
});

function DraggableElement({
    data,
    activeTool,
    onDelete,
    onDragUpdate,
    onElementUpdate,
    scale
}: {
    data: BoardElement,
    activeTool: string,
    onDelete: () => void,
    onDragUpdate: (x: number, y: number, final: boolean) => void,
    onElementUpdate: (updates: Partial<BoardElement>) => void,
    scale: number
}) {
    const elementRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);

    // Use RAF-based throttle for instant sync during drag
    const broadcastMove = useRef(requestThrottle((x: number, y: number) => {
        onDragUpdate(x, y, false);
    }, 16)).current; // 16ms = ~60fps

    const handlePointerDown = (e: React.PointerEvent) => {
        if (activeTool !== 'select') return;
        if (e.button !== 0) return;

        e.preventDefault();
        e.stopPropagation();

        const target = e.currentTarget as HTMLDivElement;
        target.setPointerCapture(e.pointerId);
        isDragging.current = true;

        target.classList.add('ring-2', 'ring-primary', 'z-50', 'scale-[1.02]');

        const startX = e.clientX;
        const startY = e.clientY;
        const initialX = data.x;
        const initialY = data.y;

        const onPointerMove = (ev: PointerEvent) => {
            if (!isDragging.current) return;
            const deltaX = (ev.clientX - startX) / scale;
            const deltaY = (ev.clientY - startY) / scale;

            const newX = initialX + deltaX;
            const newY = initialY + deltaY;

            if (elementRef.current) {
                elementRef.current.style.transform = `translate(${newX}px, ${newY}px)`;
            }
            broadcastMove(newX, newY);
        };

        const onPointerUp = (ev: PointerEvent) => {
            isDragging.current = false;
            target.releasePointerCapture(ev.pointerId);
            target.removeEventListener('pointermove', onPointerMove);
            target.removeEventListener('pointerup', onPointerUp);

            target.classList.remove('ring-2', 'ring-primary', 'z-50', 'scale-[1.02]');

            const deltaX = (ev.clientX - startX) / scale;
            const deltaY = (ev.clientY - startY) / scale;
            const newX = initialX + deltaX;
            const newY = initialY + deltaY;

            onDragUpdate(newX, newY, true);
        };

        target.addEventListener('pointermove', onPointerMove);
        target.addEventListener('pointerup', onPointerUp);
    };

    // Helper to render path
    const renderPath = () => {
        if (!data.points || data.points.length < 2) return null;

        // Convert points to SVG path 'd'
        // Assuming points are relative to x,y (0,0 is the element position)
        const d = `M ${data.points[0].x} ${data.points[0].y} ` +
            data.points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');

        return (
            <svg
                width={data.width || 100}
                height={data.height || 100}
                className="overflow-visible pointer-events-none"
            >
                <path
                    d={d}
                    stroke={data.strokeColor || "#ffffff"}
                    strokeWidth={data.strokeWidth || 4}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>
        );
    };

    return (
        <div
            ref={elementRef}
            // Add data-element-id here for Gesture Hit Testing
            data-element-id={data.id}
            className={cn(
                "absolute top-0 left-0 transition-shadow group select-none touch-none will-change-transform origin-top-left",
                activeTool === 'select' ? "cursor-grab active:cursor-grabbing hover:ring-2 ring-primary/50" : "pointer-events-none",
                data.type === 'image' && "p-0",
                data.type === 'path' && "p-0", // Path should have no padding
            )}
            style={{
                transform: `translate3d(${data.x}px, ${data.y}px, 0) rotate(${data.rotation || 0}deg)${data.type !== 'text' ? ` scale(${data.scale || 1})` : ''}`,
                fontSize: data.type === 'text' ? `${20 * (data.scale || 1)}px` : undefined,
                fontFamily: data.font || undefined,
                fontWeight: data.fontWeight || undefined,
                transition: isDragging.current ? 'none' : 'transform 0.1s cubic-bezier(0.2, 0.8, 0.2, 1)',
                backfaceVisibility: 'hidden',
            }}
            onPointerDown={handlePointerDown}
        >
            <div className={cn(
                "relative rounded-xl border-2 border-transparent transition-transform",
                data.type === 'text' && "bg-transparent min-w-[50px] p-2 hover:bg-white/5 rounded-lg hover:border-white/10",
                data.type === 'sticky' && "bg-[#fef9c3] text-black shadow-lg rotate-1 font-[Patrick_Hand] text-2xl w-[220px] h-[220px] flex items-center justify-center p-6 text-center leading-tight hover:rotate-0",
                data.type === 'image' && "border-none",
                data.type === 'path' && "border-none",
            )}>
                {activeTool === 'select' && (
                    <button
                        onPointerDown={(e) => { e.stopPropagation(); onDelete(); }}
                        className="absolute -top-3 -right-3 w-6 h-6 bg-destructive text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:scale-110 z-[60]"
                    >
                        <X size={12} strokeWidth={3} />
                    </button>
                )}

                {data.type === 'text' && (
                    <div className="outline-none whitespace-pre-wrap max-w-none font-medium leading-relaxed text-balance">
                        {data.content}
                    </div>
                )}
                {data.type === 'sticky' && (
                    <div className="w-full h-full flex flex-col items-center justify-center relative">
                        <div className="absolute top-0 w-full h-8 bg-black/5 mix-blend-multiply" />
                        <p className="w-full break-words">{data.content}</p>
                    </div>
                )}
                {data.type === 'image' && (
                    <img
                        src={data.content}
                        className="max-w-[400px] max-h-[400px] object-contain rounded-lg shadow-2xl bg-black/50 pointer-events-none select-none"
                        draggable={false}
                    />
                )}
                {data.type === 'music' && (
                    <MusicElementComponent
                        data={data}
                        onUpdate={onElementUpdate}
                    />
                )}
                {data.type === 'path' && renderPath()}
            </div>
        </div>
    )
}
