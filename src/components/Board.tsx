import React, { useEffect, useState, useRef, memo } from 'react';
import { useBoardStore, type ElementType, type BoardElement } from '@/lib/store';
import { useP2P } from '@/lib/p2p';
import { nanoid } from 'nanoid';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Type,
    Image as ImageIcon,
    Code,
    StickyNote,
    MousePointer2,
    Eraser,
    X,
    Hand,
    Minus,
    Plus,
    Key
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface BoardProps {
    roomId: string;
}

export function Board({ roomId }: BoardProps) {
    const store = useBoardStore();
    const { broadcast, accessDenied, retryJoin, isConnected } = useP2P(roomId);
    const containerRef = useRef<HTMLDivElement>(null);

    // Viewport State (Infinite Canvas)
    const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
    const [isPanning, setIsPanning] = useState(false);

    // Local state
    const [activeTool, setActiveTool] = useState<ElementType | 'select' | 'hand'>('select');

    // Passcode Challenge State
    const [passwordInput, setPasswordInput] = useState('');

    // Modal State
    const [modalOpen, setModalOpen] = useState(false);
    const [pendingTool, setPendingTool] = useState<ElementType | null>(null);
    const [pendingClick, setPendingClick] = useState<{ x: number, y: number } | null>(null);
    const [inputValue, setInputValue] = useState('');

    useEffect(() => {
        store.setRoomId(roomId);
        store.saveRoom(roomId);
    }, [roomId]);

    // BLOCK RENDER IF ACCESS DENIED
    if (accessDenied) {
        return (
            <div className="w-full h-screen flex items-center justify-center bg-[#0f0f11] text-foreground bg-dot-pattern">
                <div className="glass p-8 rounded-2xl border border-white/10 shadow-2xl max-w-md w-full text-center space-y-6">
                    <div className="mx-auto w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center text-red-500">
                        <Key size={24} />
                    </div>
                    <h2 className="text-2xl font-bold">Room Locked</h2>
                    <p className="text-muted-foreground">This room is protected by a password.</p>

                    <div className="flex gap-2">
                        <Input
                            type="password"
                            placeholder="Enter Password..."
                            value={passwordInput}
                            onChange={(e) => setPasswordInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && retryJoin(passwordInput)}
                            className="bg-black/20 border-white/10"
                            autoFocus
                        />
                        <Button onClick={() => retryJoin(passwordInput)}>Unlock</Button>
                    </div>
                </div>
            </div>
        )
    }

    // --- Coordinate Systems ---
    const toWorld = (screenX: number, screenY: number) => {
        // Offset by viewport position and scale
        return {
            x: (screenX - viewport.x) / viewport.scale,
            y: (screenY - viewport.y) / viewport.scale
        };
    };

    const toScreen = (worldX: number, worldY: number) => {
        return {
            x: worldX * viewport.scale + viewport.x,
            y: worldY * viewport.scale + viewport.y
        };
    };

    // --- Handlers ---

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const onWheel = (e: WheelEvent) => {
            e.preventDefault(); // Stop browser zoom / scroll

            if (e.ctrlKey || e.metaKey) {
                // Standard Pinch-Zoom trackpad behavior
                const zoomSensitivity = 0.002;
                const delta = -e.deltaY * zoomSensitivity;

                setViewport(prev => {
                    const newScale = Math.min(Math.max(prev.scale + delta, 0.1), 5);
                    // Simple center zoom for trackpad to avoid complex cursor calc issues for now, or refine it.
                    // Or just keep existing logic but prevent default.
                    return { ...prev, scale: newScale };
                });
            } else {
                // Mouse Wheel -> Zoom
                const zoomSensitivity = 0.001;
                const delta = -e.deltaY * zoomSensitivity;

                setViewport(prev => {
                    const newScale = Math.min(Math.max(prev.scale + delta, 0.1), 5);
                    // Keep same mouse position:
                    // worldX = (mouseX - prev.x) / prev.scale
                    // newX = mouseX - worldX * newScale
                    const rect = container.getBoundingClientRect();
                    const mouseX = e.clientX - rect.left;
                    const mouseY = e.clientY - rect.top;

                    const worldX = (mouseX - prev.x) / prev.scale;
                    const worldY = (mouseY - prev.y) / prev.scale;

                    return {
                        x: mouseX - worldX * newScale,
                        y: mouseY - worldY * newScale,
                        scale: newScale
                    };
                });
            }
        };

        container.addEventListener('wheel', onWheel, { passive: false });
        return () => container.removeEventListener('wheel', onWheel);
    }, []);

    // Removed React onWheel to avoid conflicts

    const handlePointerDown = (e: React.PointerEvent) => {
        // Pan on Middle Click OR Left Click + Space (simulated by activeTool check if we had it) OR Hand Tool
        if (activeTool === 'hand' || e.button === 1) {
            e.preventDefault();
            setIsPanning(true);
            const startX = e.clientX;
            const startY = e.clientY;
            const initialView = { ...viewport };

            const onPointerMove = (ev: PointerEvent) => {
                const dx = ev.clientX - startX;
                const dy = ev.clientY - startY;
                setViewport({
                    ...initialView,
                    x: initialView.x + dx,
                    y: initialView.y + dy
                });
            };

            const onPointerUp = () => {
                setIsPanning(false);
                window.removeEventListener('pointermove', onPointerMove);
                window.removeEventListener('pointerup', onPointerUp);
            };

            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);
        }
    };

    // Cursor Broadcast (Throttled)
    const lastCursorUpdate = useRef(0);
    const handleMouseMove = (e: React.MouseEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Broadcast World Coordinates
        const worldPos = toWorld(mouseX, mouseY);

        const now = Date.now();
        if (now - lastCursorUpdate.current > 30) {
            broadcast({
                type: 'CURSOR_MOVE',
                payload: {
                    x: worldPos.x,
                    y: worldPos.y,
                    userId: store.userId,
                    username: store.username,
                    color: '#8b5cf6'
                }
            });
            lastCursorUpdate.current = now;
        }
    };

    const handleDragUpdate = (id: string, newWorldX: number, newWorldY: number, final: boolean) => {
        // Received World Coordinates
        if (final) {
            store.updateElement(id, { x: newWorldX, y: newWorldY });
            broadcast({ type: 'UPDATE_ELEMENT', payload: { id, updates: { x: newWorldX, y: newWorldY } } });
        } else {
            broadcast({ type: 'UPDATE_ELEMENT', payload: { id, updates: { x: newWorldX, y: newWorldY } } });
        }
    }

    const handleCanvasClick = (e: React.MouseEvent) => {
        if (activeTool === 'select' || activeTool === 'hand' || isPanning) return;
        if (!containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const worldPos = toWorld(mouseX, mouseY);

        // Open Modal
        setPendingTool(activeTool);
        setPendingClick(worldPos);
        setInputValue('');
        setModalOpen(true);
    };

    const handleModalSubmit = () => {
        if (!pendingTool || !pendingClick) return;

        const content = inputValue || (pendingTool === 'sticky' ? 'New Note' : 'Content');
        const id = nanoid();
        const newElement: BoardElement = {
            id,
            type: pendingTool,
            x: pendingClick.x,
            y: pendingClick.y,
            content,
            createdBy: store.userId,
        };

        store.addElement(newElement);
        broadcast({ type: 'ADD_ELEMENT', payload: newElement });
        setModalOpen(false);
        setPendingTool(null);
        setPendingClick(null);
        setActiveTool('select');
    };

    const handleClearBoard = () => {
        if (!confirm('Clear the entire board?')) return;
        Object.keys(store.elements).forEach(id => {
            store.deleteElement(id);
            broadcast({ type: 'DELETE_ELEMENT', payload: { id } });
        });
    };

    const handleDeleteElement = (id: string) => {
        store.deleteElement(id);
        broadcast({ type: 'DELETE_ELEMENT', payload: { id } });
    }

    return (
        <div className="relative w-full h-screen overflow-hidden bg-[#0f0f11] text-foreground">
            <Dialog open={modalOpen} onOpenChange={(open) => !open && setModalOpen(false)}>
                <DialogContent className="glass border-white/10 text-white">
                    <DialogHeader>
                        <DialogTitle>Add Content</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <Label className="mb-2 block text-muted-foreground">
                            {pendingTool === 'image' ? 'Image Link' : pendingTool === 'code' ? 'Code' : 'Text'}
                        </Label>
                        {pendingTool === 'code' || pendingTool === 'text' || pendingTool === 'sticky' ? (
                            <textarea
                                className="flex min-h-[120px] w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                placeholder="Type here..."
                                autoFocus
                            />
                        ) : (
                            <Input
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                placeholder="https://..."
                                autoFocus
                            />
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleModalSubmit}>Add to Board</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Zoom Controls */}
            <div className="absolute bottom-6 right-6 z-50 flex flex-col gap-2 glass p-2 rounded-xl border border-white/10">
                <button onClick={() => setViewport(v => ({ ...v, scale: Math.min(v.scale + 0.1, 5) }))} className="p-2 hover:bg-white/10 rounded-lg"><Plus size={20} /></button>
                <div className="text-center text-xs font-mono opacity-50">{Math.round(viewport.scale * 100)}%</div>
                <button onClick={() => setViewport(v => ({ ...v, scale: Math.max(v.scale - 0.1, 0.1) }))} className="p-2 hover:bg-white/10 rounded-lg"><Minus size={20} /></button>
            </div>

            {/* Invite Button */}
            <div className="absolute bottom-6 left-6 z-50">
                <Button
                    onClick={() => {
                        navigator.clipboard.writeText(window.location.href);
                        // Simple toast fallback
                        const btn = document.getElementById('invite-text');
                        if (btn) btn.innerText = 'Copied!';
                        setTimeout(() => { if (btn) btn.innerText = 'Invite Friend'; }, 2000);
                    }}
                    className="glass border-white/10 hover:bg-white/10 text-white gap-2 transition-all shadow-xl"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
                    <span id="invite-text">Invite Friend</span>
                </Button>
            </div>

            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 glass px-2 py-2 rounded-2xl flex gap-1 shadow-2xl border border-white/10">
                <ToolButton active={activeTool === 'select'} onClick={() => setActiveTool('select')} icon={<MousePointer2 size={18} />} label="Select" />
                <ToolButton active={activeTool === 'hand'} onClick={() => setActiveTool('hand')} icon={<Hand size={18} />} label="Pan" />
                <div className="w-px bg-white/10 mx-1 h-8 self-center" />
                <ToolButton active={activeTool === 'text'} onClick={() => setActiveTool('text')} icon={<Type size={18} />} label="Text" />
                <ToolButton active={activeTool === 'image'} onClick={() => setActiveTool('image')} icon={<ImageIcon size={18} />} label="Image" />
                <ToolButton active={activeTool === 'code'} onClick={() => setActiveTool('code')} icon={<Code size={18} />} label="Code" />
                <ToolButton active={activeTool === 'sticky'} onClick={() => setActiveTool('sticky')} icon={<StickyNote size={18} />} label="Note" />
                <div className="w-px bg-destructive/20 mx-1 h-8 self-center" />
                <button onClick={handleClearBoard} className="p-2 rounded-xl hover:bg-destructive/20 text-destructive/80 hover:text-destructive transition-colors"><Eraser size={18} /></button>
            </div>

            <div
                ref={containerRef}
                className={cn(
                    "w-full h-full relative outline-none touch-none overflow-hidden",
                    activeTool === 'hand' || isPanning ? "cursor-grabbing" : activeTool !== 'select' ? "cursor-crosshair" : "cursor-default"
                )}
                onMouseMove={handleMouseMove}
                onPointerDown={handlePointerDown}
                onClick={handleCanvasClick}
            >
                {/* World Container - Scaled & Panned */}
                <div
                    className="absolute top-0 left-0 w-full h-full origin-top-left will-change-transform"
                    style={{
                        transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`
                    }}
                >
                    {/* Grid (Scaled with world) */}
                    {/* Infinite grid typically needs to be offset by modulus. 
                 But applying to container scales it correctly. 
                 We just need it to be large enough? 
                 Actually, background-image on a div that follows viewport?
             */}
                    <div className="absolute -top-[50000px] -left-[50000px] w-[100000px] h-[100000px] opacity-[0.05] pointer-events-none"
                        style={{
                            backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
                            backgroundSize: '40px 40px'
                        }}
                    />

                    <AnimatePresence>
                        {Object.values(store.elements).map((el) => (
                            <MemoizedDraggableElement
                                key={el.id}
                                data={el}
                                activeTool={activeTool}
                                scale={viewport.scale}
                                onDelete={() => handleDeleteElement(el.id)}
                                onDragUpdate={(x, y, final) => handleDragUpdate(el.id, x, y, final)}
                            />
                        ))}
                    </AnimatePresence>

                    {/* Cursors in World Space */}
                    {Object.entries(store.cursors).map(([id, cursor]) => {
                        if (id === store.userId) return null;
                        return (
                            <motion.div
                                key={id}
                                className="absolute pointer-events-none z-50 flex flex-col items-start"
                                initial={{ left: cursor.x, top: cursor.y }}
                                animate={{ left: cursor.x, top: cursor.y }}
                                transition={{ type: "tween", ease: "linear", duration: 0.1 }}
                                // Scale the cursor itself inversely? Usually we want cursors to stay constant size or scale?
                                // "elements should be there... x,y shoudnt be messed"
                                // If we scale the container, the cursor div scales too.
                                // To keep cursor constant size visually while taking position in scaled world:
                                style={{ transform: `scale(${1 / viewport.scale})` }}
                            >
                                <UserCursorIcon color={cursor.color} label={cursor.username} />
                            </motion.div>
                        )
                    })}
                </div>
            </div>
        </div>
    );
}

// --- Subcomponents ---

function UserCursorIcon({ color, label }: { color: string, label: string }) {
    return (
        <>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="drop-shadow-md">
                <path d="M5.65376 12.3673H5.46026L5.31717 12.4976L0.500002 16.8829L0.500002 1.19177L11.7841 12.3673H5.65376Z" fill={color || '#fff'} stroke="black" strokeWidth="1" />
            </svg>
            <div className="ml-4 -mt-2 bg-black/50 backdrop-blur-sm text-white text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap border border-white/10">
                {label}
            </div>
        </>
    )
}

const requestThrottle = (callback: Function, delay: number) => {
    let lastTime = 0;
    return (...args: any[]) => {
        const now = Date.now();
        if (now - lastTime >= delay) {
            callback(...args);
            lastTime = now;
        }
    };
};

const MemoizedDraggableElement = memo(DraggableElement, (prev, next) => {
    return (
        prev.data.x === next.data.x &&
        prev.data.y === next.data.y &&
        prev.data.content === next.data.content &&
        prev.activeTool === next.activeTool &&
        prev.scale === next.scale
    );
});

function DraggableElement({
    data,
    activeTool,
    onDelete,
    onDragUpdate,
    scale
}: {
    data: BoardElement,
    activeTool: string,
    onDelete: () => void,
    onDragUpdate: (x: number, y: number, final: boolean) => void,
    scale: number
}) {
    const elementRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);

    // Throttled broadcast
    const broadcastMove = useRef(requestThrottle((x: number, y: number) => {
        onDragUpdate(x, y, false);
    }, 50)).current;

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

            // Critical: Delta must be divided by scale to map back to World Units
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

    return (
        <div
            ref={elementRef}
            className={cn(
                "absolute top-0 left-0 transition-shadow group select-none touch-none will-change-transform",
                activeTool === 'select' ? "cursor-grab active:cursor-grabbing hover:ring-2 ring-primary/50" : "pointer-events-none",
                data.type === 'image' && "p-0",
            )}
            style={{
                transform: `translate(${data.x}px, ${data.y}px)`
            }}
            onPointerDown={handlePointerDown}
        >

            <div className={cn(
                "relative rounded-xl border-2 border-transparent transition-transform",
                data.type === 'code' && "bg-[#0d1117] font-mono text-sm border-white/10 shadow-xl overflow-hidden min-w-[300px]",
                data.type === 'text' && "bg-transparent min-w-[50px] p-2 hover:bg-white/5 rounded-lg hover:border-white/10",
                data.type === 'sticky' && "bg-[#fef9c3] text-black shadow-lg rotate-1 font-[Patrick_Hand] text-2xl w-[220px] h-[220px] flex items-center justify-center p-6 text-center leading-tight hover:rotate-0",
                data.type === 'image' && "border-none",
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
                    <div className="outline-none whitespace-pre-wrap max-w-md font-medium text-lg leading-relaxed text-balance">
                        {data.content}
                    </div>
                )}
                {data.type === 'code' && (
                    <div className="w-full">
                        <div className="flex items-center gap-2 px-3 py-2 bg-[#161b22] border-b border-white/10">
                            <div className="flex gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-[#fa7970]" />
                                <span className="w-2.5 h-2.5 rounded-full bg-[#faa356]" />
                                <span className="w-2.5 h-2.5 rounded-full bg-[#7ce38b]" />
                            </div>
                        </div>
                        <div className="p-4 overflow-x-auto bg-[#0d1117]">
                            <pre className="text-sm font-mono text-[#c9d1d9] selection:bg-white/20 select-text">
                                <code className="outline-none block">{data.content}</code>
                            </pre>
                        </div>
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
            </div>
        </div>
    )
}

function ToolButton({ active, onClick, icon, label }: any) {
    return (
        <button onClick={onClick} className={cn("p-2.5 rounded-xl transition-all flex items-center justify-center gap-2 relative group", active ? "bg-primary text-primary-foreground shadow-[0_0_15px_-3px_rgba(139,92,246,0.6)]" : "hover:bg-white/5 text-muted-foreground hover:text-white")}>
            {icon}
            <span className="absolute top-12 bg-black/80 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 border border-white/10 backdrop-blur-md">{label}</span>
        </button>
    );
}
