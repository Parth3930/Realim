import React, { useEffect, useState, useRef, memo } from 'react';
import { useBoardStore, type ElementType, type BoardElement } from '../lib/store';
import { useP2P } from '../lib/p2p';
import { nanoid } from 'nanoid';
import { motion, AnimatePresence } from 'framer-motion';
import { get, set } from 'idb-keyval';
import {
    Type,
    Image as ImageIcon,
    StickyNote,
    MousePointer2,
    Eraser,
    X,
    Hand,
    Minus,
    Plus,
    Key
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

import { GestureController } from './GestureController';

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

    // Refs for Gesture Logic (Stale Closure Prevention)
    const viewportRef = useRef(viewport);
    useEffect(() => { viewportRef.current = viewport; }, [viewport]);

    // Local state
    const [activeTool, setActiveTool] = useState<ElementType | 'select' | 'hand'>('select');
    const [gestureMode, setGestureMode] = useState(false);
    const [virtualCursor, setVirtualCursor] = useState<{ x: number, y: number, isPinching: boolean, isFist: boolean, landmarks?: any[], grabStatus?: 'grabbed' | 'miss' | null } | null>(null);
    const lastGestureRef = useRef<{ x: number, y: number } | null>(null);
    const grabbedElRef = useRef<{ id: string, offsetX: number, offsetY: number, element?: HTMLElement } | null>(null);
    const wasPinchingRef = useRef(false);
    const grabStatusRef = useRef<'grabbed' | 'miss' | null>(null);
    const panVelocityRef = useRef({ x: 0, y: 0 });
    const pinchReleaseCounterRef = useRef(0);
    const fistActiveCounterRef = useRef(0);

    // Passcode Challenge State
    const [passwordInput, setPasswordInput] = useState('');

    // Modal State
    const [modalOpen, setModalOpen] = useState(false);
    const [pendingTool, setPendingTool] = useState<ElementType | null>(null);
    const [pendingClick, setPendingClick] = useState<{ x: number, y: number } | null>(null);
    const [inputValue, setInputValue] = useState('');

    // Persistence: Load
    useEffect(() => {
        store.setRoomId(roomId);
        get(`realim_room_${roomId}`).then((val) => {
            if (val && Object.keys(val).length > 0) {
                // We have saved content - we're the host of this board
                store.setIsHost(true);
                if (Object.keys(store.elements).length === 0) {
                    // Load saved state to store
                    Object.values(val).forEach((el: any) => store.addElement(el));
                }
            }
        });
        store.saveRoom(roomId);
    }, [roomId]);

    // Persistence: Save
    useEffect(() => {
        const timer = setTimeout(() => {
            if (Object.keys(store.elements).length > 0) {
                set(`realim_room_${roomId}`, store.elements);
            }
        }, 1000);
        return () => clearTimeout(timer);
    }, [store.elements, roomId]);

    // Auto-center on latest element when joining/loading
    const hasAutoCenteredRef = useRef(false);
    useEffect(() => {
        // Only auto-center once when elements first load
        if (hasAutoCenteredRef.current) return;

        const elements = Object.values(store.elements);
        if (elements.length === 0) return;

        // Wait a bit for all elements to load
        const timer = setTimeout(() => {
            const allElements = Object.values(store.elements);
            if (allElements.length === 0) return;

            // Try to find latest by timestamp
            let latest = allElements
                .filter(el => el.createdAt)
                .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];

            // Fallback to any element if no timestamps
            if (!latest) {
                latest = allElements[allElements.length - 1];
            }

            if (latest) {
                // Center viewport on this element
                const centerX = window.innerWidth / 2;
                const centerY = window.innerHeight / 2;
                setViewport({
                    x: centerX - latest.x,
                    y: centerY - latest.y,
                    scale: 1
                });
                hasAutoCenteredRef.current = true;
            }
        }, 500); // Increased delay to ensure elements are loaded

        return () => clearTimeout(timer);
    }, [store.elements]); // Trigger when elements change

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
    // Use Ref for Gesture Callbacks to avoid stale viewport
    const toWorldRef = (screenX: number, screenY: number) => {
        const v = viewportRef.current;
        return {
            x: (screenX - v.x) / v.scale,
            y: (screenY - v.y) / v.scale
        };
    };

    const toWorld = (screenX: number, screenY: number) => {
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

    const handleDragUpdate = (id: string, newWorldX: number, newWorldY: number, final: boolean) => {
        if (final) {
            store.updateElement(id, { x: newWorldX, y: newWorldY });
            broadcast({ type: 'UPDATE_ELEMENT', payload: { id, updates: { x: newWorldX, y: newWorldY } } });
        } else {
            broadcast({ type: 'UPDATE_ELEMENT', payload: { id, updates: { x: newWorldX, y: newWorldY } } });
        }
    }

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            if (e.ctrlKey || e.metaKey) {
                const zoomSensitivity = 0.002;
                const delta = -e.deltaY * zoomSensitivity;
                setViewport(prev => {
                    const newScale = Math.min(Math.max(prev.scale + delta, 0.1), 5);
                    return { ...prev, scale: newScale };
                });
            } else {
                const zoomSensitivity = 0.001;
                const delta = -e.deltaY * zoomSensitivity;
                setViewport(prev => {
                    const newScale = Math.min(Math.max(prev.scale + delta, 0.1), 5);
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


    const handlePointerDown = (e: React.PointerEvent) => {
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

    const lastCursorUpdate = useRef(0);
    const handleMouseMove = (e: React.MouseEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
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

    const handleCanvasClick = (e: React.MouseEvent) => {
        if (activeTool === 'select' || activeTool === 'hand' || isPanning) return;
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldPos = toWorld(mouseX, mouseY);
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
            createdAt: Date.now(), // Add timestamp for auto-scroll
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
        // Clear persisted storage as well
        set(`realim_room_${roomId}`, {});
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
                            {pendingTool === 'image' ? 'Image Link' : 'Text'}
                        </Label>
                        {pendingTool === 'text' || pendingTool === 'sticky' ? (
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
                        const inviteUrl = `${window.location.origin}/board/${roomId}`;
                        navigator.clipboard.writeText(inviteUrl);
                        const btn = document.getElementById('invite-text');
                        if (btn) btn.innerText = 'Copied!';
                        setTimeout(() => { if (btn) btn.innerText = 'Invite Friend'; }, 2000);
                    }}
                    className="glass border-white/10 shadow-2xl hover:bg-white/10 text-white gap-2"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
                    <span id="invite-text">Invite Friend</span>
                </Button>
            </div>

            {/* Gesture Toggle */}
            <div className="absolute bottom-20 left-6 md:bottom-auto md:left-auto md:top-6 md:right-6 z-50">
                <Button
                    size="icon"
                    onClick={() => setGestureMode(!gestureMode)}
                    className={cn("glass border-white/10 transition-all shadow-xl rounded-full w-12 h-12", gestureMode ? "bg-primary text-white" : "hover:bg-white/10 text-muted-foreground")}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" /><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2" /><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" /><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" /></svg>
                </Button>
            </div>

            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 glass px-2 py-2 rounded-2xl flex gap-1 shadow-2xl border border-white/10">
                <ToolButton active={activeTool === 'select'} onClick={() => setActiveTool('select')} icon={<MousePointer2 size={18} />} label="Select" />
                <ToolButton active={activeTool === 'hand'} onClick={() => setActiveTool('hand')} icon={<Hand size={18} />} label="Pan" />
                <div className="w-px bg-white/10 mx-1 h-8 self-center" />
                <ToolButton active={activeTool === 'text'} onClick={() => setActiveTool('text')} icon={<Type size={18} />} label="Text" />
                <ToolButton active={activeTool === 'image'} onClick={() => setActiveTool('image')} icon={<ImageIcon size={18} />} label="Image" />
                <ToolButton active={activeTool === 'sticky'} onClick={() => setActiveTool('sticky')} icon={<StickyNote size={18} />} label="Note" />
                {store.isHost && (
                    <>
                        <div className="w-px bg-destructive/20 mx-1 h-8 self-center" />
                        <button onClick={handleClearBoard} className="p-2 rounded-xl hover:bg-destructive/20 text-destructive/80 hover:text-destructive transition-colors"><Eraser size={18} /></button>
                    </>
                )}
            </div>


            <GestureController
                enabled={gestureMode}
                onCursorUpdate={(x, y, isPinching, isFist, landmarks) => {
                    let interactionX = x;
                    let interactionY = y;

                    // Use Midpoint between Thumb (4) and Index (8) for better accuracy
                    if (landmarks && landmarks.length > 8) {
                        const thumb = landmarks[4];
                        const index = landmarks[8];
                        // Mirror X coordinate (camera is mirrored)
                        const thumbScreenX = (1 - thumb.x) * window.innerWidth;
                        const indexScreenX = (1 - index.x) * window.innerWidth;
                        const thumbScreenY = thumb.y * window.innerHeight;
                        const indexScreenY = index.y * window.innerHeight;

                        interactionX = (thumbScreenX + indexScreenX) / 2;
                        interactionY = (thumbScreenY + indexScreenY) / 2;
                    }

                    // Use ref for grab status to persist across renders
                    let currentGrabStatus = grabStatusRef.current;

                    // Track interaction point for drag (even if temporarily not pinching due to flicker)
                    const v = viewportRef.current;
                    const wX = (interactionX - v.x) / v.scale;
                    const wY = (interactionY - v.y) / v.scale;

                    // --- PINCH GRAB LOGIC with DEBOUNCE ---
                    // If we're currently holding something, be very sticky about it
                    const isHolding = grabbedElRef.current !== null && grabStatusRef.current === 'grabbed';

                    if (isPinching) {
                        // Reset release counter when pinching
                        pinchReleaseCounterRef.current = 0;

                        if (!isHolding && !wasPinchingRef.current) {
                            // PINCH START - Find element under cursor
                            const candidates = document.querySelectorAll('[data-element-id]');
                            let bestElement: HTMLElement | null = null;
                            let bestElementId: string | null = null;
                            let minDist = Infinity;
                            const SEARCH_RADIUS = 100; // px - larger for easier grabbing

                            candidates.forEach((el) => {
                                const rect = el.getBoundingClientRect();
                                const centerX = rect.left + rect.width / 2;
                                const centerY = rect.top + rect.height / 2;

                                // Check if point inside rect
                                const inside = interactionX >= rect.left && interactionX <= rect.right &&
                                    interactionY >= rect.top && interactionY <= rect.bottom;

                                const dist = Math.hypot(interactionX - centerX, interactionY - centerY);

                                if (inside) {
                                    const score = -1000 + dist;
                                    if (score < minDist) {
                                        minDist = score;
                                        bestElement = el as HTMLElement;
                                        bestElementId = bestElement.dataset.elementId || null;
                                    }
                                } else if (dist < SEARCH_RADIUS && dist < minDist) {
                                    minDist = dist;
                                    bestElement = el as HTMLElement;
                                    bestElementId = bestElement.dataset.elementId || null;
                                }
                            });

                            if (bestElementId && bestElement) {
                                // GRAB SUCCESS
                                currentGrabStatus = 'grabbed';
                                grabStatusRef.current = 'grabbed';

                                // Get current position from DOM transform (more accurate than store which may be stale)
                                // Parse the transform: translate(Xpx, Ypx)
                                const el = bestElement as HTMLElement;
                                const transformStyle = el.style.transform;
                                let currentX = 0;
                                let currentY = 0;

                                if (transformStyle) {
                                    const match = transformStyle.match(/translate\(([^,]+)px,\s*([^)]+)px\)/);
                                    if (match) {
                                        currentX = parseFloat(match[1]);
                                        currentY = parseFloat(match[2]);
                                    }
                                }

                                // Fallback to store if transform parsing failed
                                if (currentX === 0 && currentY === 0) {
                                    const elementData = store.elements[bestElementId];
                                    if (elementData) {
                                        currentX = elementData.x;
                                        currentY = elementData.y;
                                    }
                                }

                                grabbedElRef.current = {
                                    id: bestElementId,
                                    offsetX: wX - currentX,
                                    offsetY: wY - currentY,
                                    element: bestElement
                                };
                            } else {
                                // GRAB MISS
                                currentGrabStatus = 'miss';
                                grabStatusRef.current = 'miss';
                                grabbedElRef.current = null;
                            }
                        }
                    } else {
                        // NOT PINCHING - but maybe just a flicker?
                        if (isHolding) {
                            // Increment release counter
                            pinchReleaseCounterRef.current++;

                            // Only release after N consecutive non-pinch frames (debounce)
                            const RELEASE_THRESHOLD = 5;
                            if (pinchReleaseCounterRef.current >= RELEASE_THRESHOLD) {
                                // Actually release now
                                if (grabbedElRef.current) {
                                    const newX = wX - grabbedElRef.current.offsetX;
                                    const newY = wY - grabbedElRef.current.offsetY;
                                    handleDragUpdate(grabbedElRef.current.id, newX, newY, true);
                                }
                                grabbedElRef.current = null;
                                currentGrabStatus = null;
                                grabStatusRef.current = null;
                                pinchReleaseCounterRef.current = 0;
                            }
                            // If under threshold, stay in grabbed state (ignore flicker)
                        } else {
                            // Not holding anything, safe to reset
                            if (grabStatusRef.current !== null) {
                                currentGrabStatus = null;
                                grabStatusRef.current = null;
                            }
                            pinchReleaseCounterRef.current = 0;
                        }
                    }

                    // DRAG - Always update position while holding (even during flicker)
                    if (grabbedElRef.current && grabStatusRef.current === 'grabbed') {
                        const newX = wX - grabbedElRef.current.offsetX;
                        const newY = wY - grabbedElRef.current.offsetY;

                        // Direct DOM update for smooth visual
                        if (grabbedElRef.current.element) {
                            grabbedElRef.current.element.style.transform = `translate(${newX}px, ${newY}px)`;
                        }

                        // Throttled store update for sync
                        handleDragUpdate(grabbedElRef.current.id, newX, newY, false);
                    }

                    wasPinchingRef.current = isPinching;

                    // FIST PAN - Completely blocked during grab/pinch activity
                    // Must NOT be pinching, NOT holding anything, and NOT in any grab state
                    const canFistPan = isFist &&
                        !isPinching &&
                        !grabbedElRef.current &&
                        grabStatusRef.current === null &&
                        pinchReleaseCounterRef.current === 0;

                    if (canFistPan) {
                        // Debounce fist activation to prevent accidental triggers
                        fistActiveCounterRef.current++;

                        // Only start panning after 3 consecutive fist frames
                        if (fistActiveCounterRef.current >= 3) {
                            if (lastGestureRef.current) {
                                const dx = interactionX - lastGestureRef.current.x;
                                const dy = interactionY - lastGestureRef.current.y;

                                // Smooth pan using lerp
                                panVelocityRef.current = {
                                    x: panVelocityRef.current.x * 0.6 + dx * 0.4,
                                    y: panVelocityRef.current.y * 0.6 + dy * 0.4
                                };

                                setViewport(prev => ({
                                    ...prev,
                                    x: prev.x + panVelocityRef.current.x,
                                    y: prev.y + panVelocityRef.current.y
                                }));
                            }
                            lastGestureRef.current = { x: interactionX, y: interactionY };
                        }
                    } else {
                        // Reset fist tracking
                        fistActiveCounterRef.current = 0;
                        lastGestureRef.current = null;
                        panVelocityRef.current = { x: 0, y: 0 };
                    }

                    // Update State for visuals
                    setVirtualCursor({
                        x: interactionX,
                        y: interactionY,
                        isPinching,
                        isFist,
                        landmarks,
                        grabStatus: currentGrabStatus
                    });
                }}
            />

            {/* Virtual Gesture Overlay */}
            {gestureMode && virtualCursor && (
                <div className="fixed inset-0 z-[1000] pointer-events-none overflow-hidden">

                    {/* Interaction Midpoint Indicator */}
                    <div
                        className={cn(
                            "absolute w-3 h-3 rounded-full z-50",
                            virtualCursor.grabStatus === 'grabbed' ? "bg-green-400/70" :
                                virtualCursor.grabStatus === 'miss' ? "bg-red-400/70" :
                                    "bg-yellow-400/50"
                        )}
                        style={{
                            left: virtualCursor.x,
                            top: virtualCursor.y,
                            transform: 'translate(-50%, -50%)'
                        }}
                    />

                    {/* Hand Landmarks - NO TRANSITIONS for instant tracking */}
                    {virtualCursor.landmarks && virtualCursor.landmarks.map((point: any, i: number) => {
                        const isTip = [4, 8, 12, 16, 20].includes(i);
                        const isActionFinger = (i === 4 || i === 8);

                        const screenX = (1 - point.x) * window.innerWidth;
                        const screenY = point.y * window.innerHeight;

                        if (isTip) {
                            let size = 16; // w-4 = 16px
                            let bgColor = 'rgba(255,255,255,1)';
                            let shadow = '0 0 15px rgba(255,255,255,0.8)';

                            if (isActionFinger && virtualCursor.isPinching) {
                                size = 24; // w-6 = 24px
                                if (virtualCursor.grabStatus === 'grabbed') {
                                    bgColor = '#22c55e';
                                    shadow = '0 0 20px #22c55e';
                                } else if (virtualCursor.grabStatus === 'miss') {
                                    bgColor = '#ef4444';
                                    shadow = '0 0 20px #ef4444';
                                } else {
                                    bgColor = '#fb923c';
                                    shadow = '0 0 15px #fb923c';
                                }
                            }

                            return (
                                <div
                                    key={i}
                                    style={{
                                        position: 'absolute',
                                        left: screenX,
                                        top: screenY,
                                        width: size,
                                        height: size,
                                        borderRadius: '50%',
                                        backgroundColor: bgColor,
                                        boxShadow: shadow,
                                        transform: 'translate(-50%, -50%)',
                                        pointerEvents: 'none'
                                    }}
                                />
                            )
                        }

                        // Non-tip landmarks - smaller dots
                        return (
                            <div
                                key={i}
                                style={{
                                    position: 'absolute',
                                    left: screenX,
                                    top: screenY,
                                    width: 6,
                                    height: 6,
                                    borderRadius: '50%',
                                    backgroundColor: 'rgba(255,255,255,0.4)',
                                    transform: 'translate(-50%, -50%)',
                                    pointerEvents: 'none'
                                }}
                            />
                        )
                    })}
                </div>
            )}

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
                <div
                    className="absolute top-0 left-0 w-full h-full origin-top-left will-change-transform"
                    style={{
                        transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`
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
                                onDelete={() => handleDeleteElement(el.id)}
                                onDragUpdate={(x, y, final) => handleDragUpdate(el.id, x, y, final)}
                            />
                        ))}
                    </AnimatePresence>

                    {/* Cursors */}
                    {Object.entries(store.cursors).map(([id, cursor]) => {
                        if (id === store.userId) return null;
                        return (
                            <motion.div
                                key={id}
                                className="absolute pointer-events-none z-50 flex flex-col items-start"
                                initial={{ left: cursor.x, top: cursor.y }}
                                animate={{ left: cursor.x, top: cursor.y }}
                                transition={{ type: "tween", ease: "linear", duration: 0.1 }}
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
            // Add data-element-id here for Gesture Hit Testing
            data-element-id={data.id}
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
