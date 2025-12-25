import confetti from 'canvas-confetti';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useBoardStore, type ElementType, type BoardElement } from '../lib/store';
import { useP2P } from '../lib/p2p';
import { nanoid } from 'nanoid';
import { AnimatePresence } from 'framer-motion';
import { get, set } from 'idb-keyval';
import { Key } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Input } from './ui/input';

import { GestureController, type HandData } from './GestureController';
import { Toolbar } from './board/Toolbar';
import { AddContentDialog } from './board/AddContentDialog';
import { MemoizedDraggableElement } from './board/DraggableElement';
import { Cursors } from './board/Cursors';
import { GestureOverlay } from './board/GestureOverlay';
import { useGestureLogic } from './board/useGestureLogic';

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
    { name: 'Inter', value: 'Inter, sans-serif' },
    { name: 'Mono', value: 'ui-monospace, monospace' },
    { name: 'Serif', value: 'Georgia, serif' },
    { name: 'Cursive', value: 'Pacifico, cursive' },
    { name: 'Bold', value: 'Inter, sans-serif', weight: 700 },
];

export function Board({ roomId }: BoardProps) {
    const store = useBoardStore();
    const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const viewportRef = useRef(viewport);

    // Sync Ref -> State for committed changes (debounced)
    const commitViewport = useCallback(debounce((newViewport: any) => {
        setViewport(newViewport);
    }, 200), []);

    // Helper to update Visual Viewport immediately (Direct DOM)
    const updateVisualViewport = (updaterOrValue: any, commit = false) => {
        const current = viewportRef.current;
        const next = typeof updaterOrValue === 'function' ? updaterOrValue(current) : updaterOrValue;

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
    const [activeTool, setActiveTool] = useState<ElementType | 'select' | 'hand' | 'pen' | 'path'>('select');
    const [gestureMode, setGestureMode] = useState(false);

    // Dialogs
    const [modalOpen, setModalOpen] = useState(false);
    const [pendingTool, setPendingTool] = useState<ElementType | null>(null);
    const [pendingClick, setPendingClick] = useState<{ x: number, y: number } | null>(null);

    // Inline Text
    const [inlineText, setInlineText] = useState<{ x: number, y: number, value: string, font: string } | null>(null);
    const inlineInputRef = useRef<HTMLInputElement>(null);
    const [selectedFont, setSelectedFont] = useState('Inter');

    // Pan State
    const [isPanning, setIsPanning] = useState(false);

    // Pen State
    const currentPathPoints = useRef<{ x: number, y: number }[]>([]);
    const tempPathRef = useRef<SVGPathElement>(null);
    const isDrawing = useRef(false);

    // Coordinates
    const toWorld = (screenX: number, screenY: number) => {
        const v = viewportRef.current; // Use Ref for latest interactive state
        return {
            x: (screenX - v.x) / v.scale,
            y: (screenY - v.y) / v.scale
        };
    };

    const toScreen = (worldX: number, worldY: number) => {
        const v = viewportRef.current;
        return {
            x: worldX * v.scale + v.x,
            y: worldY * v.scale + v.y
        };
    };

    // P2P
    const handleRemoteConfetti = (x: number, y: number) => {
        const screen = toScreen(x, y);
        confetti({
            particleCount: 100,
            spread: 70,
            origin: { x: screen.x / window.innerWidth, y: screen.y / window.innerHeight },
            zIndex: 9999
        });
    };

    const { broadcast, accessDenied, retryJoin, isConnected } = useP2P(roomId, { onConfetti: handleRemoteConfetti });

    const handleDragUpdate = (id: string, newWorldX: number, newWorldY: number, final: boolean) => {
        const updates = { x: newWorldX, y: newWorldY, lastModifiedAt: Date.now() };
        if (final) {
            store.updateElement(id, updates);
        }
        broadcast({ type: 'UPDATE_ELEMENT', payload: { id, updates } });
    }

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
        }
    });

    const handleLocalConfettiGesture = (screenX: number, screenY: number) => {
        confetti({
            particleCount: 100,
            spread: 70,
            origin: { x: screenX / window.innerWidth, y: screenY / window.innerHeight },
            zIndex: 9999
        });
        const worldPos = toWorld(screenX, screenY);
        broadcast({ type: 'CONFETTI', payload: worldPos });
    };

    // Persistence
    const [passwordInput, setPasswordInput] = useState('');

    useEffect(() => {
        store.setRoomId(roomId);
        const hostMarker = localStorage.getItem(`realim_is_host_${roomId}`);
        const hostPassword = localStorage.getItem(`room_pass_${roomId}`);
        const isCreator = hostMarker === 'true' || !!hostPassword;
        store.setIsHost(isCreator);

        get(`realim_room_${roomId}`).then((val) => {
            if (val && Object.keys(val).length > 0) {
                if (Object.keys(store.elements).length === 0) {
                    Object.values(val).forEach((el: any) => store.addElement(el));
                }
            }
        });
        store.saveRoom(roomId);
    }, [roomId]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (Object.keys(store.elements).length > 0) {
                set(`realim_room_${roomId}`, store.elements);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [store.elements, roomId]);

    // Auto-center on latest element when joining/loading
    const hasAutoCenteredRef = useRef(false);
    const lastElementCountRef = useRef(0);

    useEffect(() => {
        const elements = Object.values(store.elements);
        const currentCount = elements.length;

        const isFirstLoad = !hasAutoCenteredRef.current && currentCount > 0;
        const isNewSyncData = currentCount > 0 && lastElementCountRef.current === 0 && currentCount > 0;

        if (!isFirstLoad && !isNewSyncData) {
            lastElementCountRef.current = currentCount;
            return;
        }

        const timer = setTimeout(() => {
            const allElements = Object.values(store.elements);
            if (allElements.length === 0) return;

            let latest = allElements
                .sort((a, b) => {
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
                    scale: initialScale
                };

                updateVisualViewport(newV, true); // Commit immediately
                hasAutoCenteredRef.current = true;
                console.log('[Board] Auto-centered on element:', latest.id);
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
                    const newScale = Math.min(Math.max(prev.scale + delta, 0.5), 5);
                    return { ...prev, scale: newScale };
                });

                // Commit debounced for state sync (render handles correctly)
                commitViewport(viewportRef.current);

            } else {
                const zoomSensitivity = 0.001;
                const delta = -e.deltaY * zoomSensitivity;

                updateVisualViewport((prev: any) => {
                    const newScale = Math.min(Math.max(prev.scale + delta, 0.5), 5);
                    const rect = container.getBoundingClientRect();
                    // Note: This rect reads might be forced layout but onWheel is high freq anyway.
                    // Better to use viewportRef logic if possible, but mouse relative zoom needs mouse position.
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
                // Commit debounced for state sync (render handles correctly)
                commitViewport(viewportRef.current);
            }
        };
        container.addEventListener('wheel', onWheel, { passive: false });
        // NOTE: We do NOT remove event listener here because strict mode might remove/add rapidly.
        // Actually we MUST remove it to avoid leaks.
        return () => container.removeEventListener('wheel', onWheel);
    }, [commitViewport]);

    // Pointer Handlers
    const handlePointerDown = (e: React.PointerEvent) => {
        if (activeTool === 'hand' || e.button === 1) {
            e.preventDefault();
            setIsPanning(true);
            const startX = e.clientX;
            const startY = e.clientY;
            const initialView = { ...viewportRef.current }; // Read from REF
            const onPointerMove = (ev: PointerEvent) => {
                // FAST DOM UPDATE
                const dx = ev.clientX - startX;
                const dy = ev.clientY - startY;
                updateVisualViewport({ ...initialView, x: initialView.x + dx, y: initialView.y + dy });
            };
            const onPointerUp = () => {
                setIsPanning(false);
                window.removeEventListener('pointermove', onPointerMove);
                window.removeEventListener('pointerup', onPointerUp);

                // Commit final state
                setViewport(viewportRef.current);
            };
            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);
        } else if (activeTool === 'path') {
            e.preventDefault();
            e.stopPropagation();
            const target = e.currentTarget as Element;
            target.setPointerCapture(e.pointerId);

            isDrawing.current = true;
            const rect = containerRef.current!.getBoundingClientRect();
            const worldPos = toWorld(e.clientX - rect.left, e.clientY - rect.top);

            // Start Path
            currentPathPoints.current = [worldPos];
            if (tempPathRef.current) {
                tempPathRef.current.setAttribute('d', `M ${worldPos.x} ${worldPos.y}`);
                tempPathRef.current.style.display = 'block';
            }
        }
    };

    const lastCursorUpdate = useRef(0);
    const handleMouseMove = (e: React.MouseEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldPos = toWorld(mouseX, mouseY);

        // Drawing Logic
        if (isDrawing.current && activeTool === 'path') {
            currentPathPoints.current.push(worldPos);
            if (tempPathRef.current) {
                const d = tempPathRef.current.getAttribute('d') || '';
                tempPathRef.current.setAttribute('d', d + ` L ${worldPos.x} ${worldPos.y}`);
            }
            return;
        }

        const now = Date.now();
        if (now - lastCursorUpdate.current > 16) {
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

    const handlePointerUp = (e: React.PointerEvent) => {
        if (isDrawing.current) {
            isDrawing.current = false;
            e.currentTarget.releasePointerCapture(e.pointerId);

            if (currentPathPoints.current.length > 2) {
                // Finalize Path
                const points = currentPathPoints.current;

                // Calculate bounding box for normalization
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                points.forEach(p => {
                    if (p.x < minX) minX = p.x;
                    if (p.y < minY) minY = p.y;
                    if (p.x > maxX) maxX = p.x;
                    if (p.y > maxY) maxY = p.y;
                });

                const width = maxX - minX;
                const height = maxY - minY;

                // Normalize points relative to minX, minY
                const relativePoints = points.map(p => ({ x: p.x - minX, y: p.y - minY }));

                const id = nanoid();
                const newElement: BoardElement = {
                    id,
                    type: 'path',
                    x: minX,
                    y: minY,
                    width,
                    height,
                    content: 'Path',
                    points: relativePoints,
                    strokeColor: '#fff',
                    strokeWidth: 4,
                    createdBy: store.userId,
                    createdAt: Date.now(),
                };

                store.addElement(newElement);
                broadcast({ type: 'ADD_ELEMENT', payload: newElement });
            }

            currentPathPoints.current = [];
            if (tempPathRef.current) {
                tempPathRef.current.setAttribute('d', '');
                tempPathRef.current.style.display = 'none';
            }
        }
    };

    const handleCanvasClick = (e: React.MouseEvent) => {
        if (inlineText && inlineText.value.trim()) {
            commitInlineText();
            return;
        } else if (inlineText) {
            setInlineText(null);
        }
        if (activeTool === 'select' || activeTool === 'hand' || isPanning || activeTool === 'path' || isDrawing.current) return;
        if (!containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldPos = toWorld(mouseX, mouseY);

        if (activeTool === 'text') {
            setInlineText({ x: worldPos.x, y: worldPos.y, value: '', font: selectedFont });
            setTimeout(() => inlineInputRef.current?.focus(), 0);
            return;
        }

        setPendingTool(activeTool as ElementType);
        setPendingClick(worldPos);
        setModalOpen(true);
    };

    const commitInlineText = () => {
        if (!inlineText || !inlineText.value.trim()) {
            setInlineText(null);
            return;
        }
        const id = nanoid();
        const fontOption = FONT_OPTIONS.find(f => f.name === inlineText.font) || FONT_OPTIONS[0];
        const newElement: BoardElement = {
            id,
            type: 'text',
            x: inlineText.x,
            y: inlineText.y,
            content: inlineText.value,
            createdBy: store.userId,
            createdAt: Date.now(),
            font: fontOption.value,
            fontWeight: fontOption.weight,
        };
        store.addElement(newElement);
        broadcast({ type: 'ADD_ELEMENT', payload: newElement });
        setInlineText(null);
        setActiveTool('select');
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
        set(`realim_room_${roomId}`, {});
    };

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
                        <Input type="password" placeholder="Enter Password..." value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && retryJoin(passwordInput)} className="bg-black/20 border-white/10" autoFocus />
                        <Button onClick={() => retryJoin(passwordInput)}>Unlock</Button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="relative w-full h-screen overflow-hidden bg-[#0f0f11] text-foreground">
            <AddContentDialog
                open={modalOpen}
                onOpenChange={setModalOpen}
                pendingTool={pendingTool}
                onSubmit={handleModalSubmit}
            />

            {/* Zoom Controls */}
            <div className="absolute bottom-4 sm:bottom-6 right-4 sm:right-6 z-50 flex flex-col gap-2 glass p-2 rounded-xl border border-white/10">
                <button onClick={() => updateVisualViewport((v: any) => ({ ...v, scale: Math.min(v.scale + 0.1, 5) }), true)} className="p-3 sm:p-2 hover:bg-white/10 active:bg-white/20 rounded-lg touch-manipulation">+</button>
                <div className="text-center text-xs font-mono opacity-50">{Math.round(viewport.scale * 100)}%</div>
                <button onClick={() => updateVisualViewport((v: any) => ({ ...v, scale: Math.max(v.scale - 0.1, 0.5) }), true)} className="p-3 sm:p-2 hover:bg-white/10 active:bg-white/20 rounded-lg touch-manipulation">-</button>
            </div>

            {/* Invite Button */}
            <div className="absolute bottom-4 sm:bottom-6 left-4 sm:left-6 z-50">
                <Button onClick={() => {
                    const inviteUrl = `${window.location.origin}/board/${roomId}`;
                    navigator.clipboard.writeText(inviteUrl);
                    const btn = document.getElementById('invite-text');
                    if (btn) btn.innerText = 'Copied!';
                    setTimeout(() => { if (btn) btn.innerText = 'Invite Friend'; }, 2000);
                }}
                    className="glass border-white/10 shadow-2xl hover:bg-white/10 active:bg-white/20 text-white gap-2 h-10 sm:h-auto px-3 sm:px-4 text-sm sm:text-base touch-manipulation"
                >
                    <span id="invite-text">Invite Friend</span>
                </Button>
            </div>

            {/* Gesture Toggle */}
            <div className="absolute bottom-16 sm:bottom-20 left-4 sm:left-6 md:bottom-auto md:left-auto md:top-6 md:right-6 z-50">
                <Button size="icon" onClick={() => setGestureMode(!gestureMode)} className={cn("glass border-white/10 transition-all shadow-xl rounded-full w-10 h-10 sm:w-12 sm:h-12 touch-manipulation", gestureMode ? "bg-primary text-white" : "hover:bg-white/10 active:bg-white/20 text-muted-foreground")}>
                    G
                </Button>
            </div>

            <Toolbar activeTool={activeTool} setActiveTool={setActiveTool} onClearBoard={handleClearBoard} />

            {/* Text Font Options */}
            {activeTool === 'text' && (
                <div className="absolute top-16 sm:top-20 left-1/2 -translate-x-1/2 z-50 glass px-2 py-2 rounded-xl flex gap-1 shadow-xl border border-white/10">
                    {FONT_OPTIONS.map((font) => (
                        <button key={font.name} onClick={() => setSelectedFont(font.name)} className={cn("px-3 py-1.5 rounded-lg text-sm transition-all", selectedFont === font.name ? "bg-primary text-white" : "hover:bg-white/10 text-muted-foreground hover:text-white")} style={{ fontFamily: font.value, fontWeight: font.weight || 400 }}>
                            {font.name}
                        </button>
                    ))}
                </div>
            )}

            <GestureController
                enabled={gestureMode}
                onConfettiGesture={handleLocalConfettiGesture}
                onHandsUpdate={handleHandsUpdate}
            />

            <GestureOverlay ref={gestureOverlayRef} enabled={gestureMode} />

            <div
                ref={containerRef}
                className={cn(
                    "w-full h-full relative outline-none touch-none overflow-hidden",
                    activeTool === 'hand' || isPanning ? "cursor-grabbing" : activeTool === 'path' ? "cursor-crosshair" : activeTool !== 'select' ? "cursor-crosshair" : "cursor-default"
                )}
                onMouseMove={handleMouseMove}
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onClick={handleCanvasClick}
            >
                <div
                    ref={contentRef}
                    className="absolute top-0 left-0 w-full h-full origin-top-left will-change-transform" // Removed Duration/Easing for raw 60FPS feel
                    style={{
                        transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.scale})`,
                        backfaceVisibility: 'hidden'
                    }}
                >
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
                                onDelete={() => {
                                    store.deleteElement(el.id);
                                    broadcast({ type: 'DELETE_ELEMENT', payload: { id: el.id } });
                                }}
                                onDragUpdate={(x, y, final) => handleDragUpdate(el.id, x, y, final)}
                                onElementUpdate={(updates) => {
                                    store.updateElement(el.id, updates);
                                    broadcast({ type: 'UPDATE_ELEMENT', payload: { id: el.id, updates } });
                                }}
                            />
                        ))}
                    </AnimatePresence>

                    {/* Temporary Path for Drawing */}
                    <svg className="absolute top-0 left-0 overflow-visible pointer-events-none w-0 h-0">
                        <path
                            ref={tempPathRef}
                            stroke="#fff"
                            strokeWidth={4}
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{ display: 'none' }}
                        />
                    </svg>

                    {inlineText && (
                        <input
                            ref={inlineInputRef}
                            type="text"
                            value={inlineText.value}
                            onChange={(e) => setInlineText({ ...inlineText, value: e.target.value })}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') commitInlineText();
                                else if (e.key === 'Escape') { setInlineText(null); setActiveTool('select'); }
                            }}
                            onBlur={() => { if (inlineText.value.trim()) commitInlineText(); else setInlineText(null); }}
                            className="absolute bg-transparent border-none outline-none text-white text-lg font-medium caret-primary min-w-[100px]"
                            style={{ left: inlineText.x, top: inlineText.y, transform: 'translateY(-50%)' }}
                            placeholder="Type here..."
                            autoFocus
                        />
                    )}

                    <Cursors cursors={store.cursors} currentUserId={store.userId} viewportScale={viewport.scale} />
                </div>
            </div>
        </div>
    );
}
