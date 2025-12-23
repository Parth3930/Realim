import confetti from 'canvas-confetti';
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

import { GestureController, type HandData } from './GestureController';

interface BoardProps {
    roomId: string;
}

export function Board({ roomId }: BoardProps) {
    const store = useBoardStore();

    // Viewport State (Infinite Canvas)
    // Defined here so confetti handler can access it
    const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });



    const toScreen = (worldX: number, worldY: number) => {
        return {
            x: worldX * viewport.scale + viewport.x,
            y: worldY * viewport.scale + viewport.y
        };
    };

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
    const containerRef = useRef<HTMLDivElement>(null);

    // Initial Pan State

    const [isPanning, setIsPanning] = useState(false);

    // Refs for Gesture Logic (Stale Closure Prevention)
    const viewportRef = useRef(viewport);
    useEffect(() => { viewportRef.current = viewport; }, [viewport]);

    // Local state
    const [activeTool, setActiveTool] = useState<ElementType | 'select' | 'hand'>('select');
    const [gestureMode, setGestureMode] = useState(false);
    const [virtualCursors, setVirtualCursors] = useState<(HandData & { grabStatus: 'grabbed' | 'miss' | null })[]>([]);

    // Refs for Multi-Hand Gesture Logic
    const handRefs = useRef<Record<string, {
        lastGesture: { x: number, y: number } | null;
        grabbedEl: { id: string, offsetX: number, offsetY: number, element?: HTMLElement } | null;
        wasPinching: boolean;
        grabStatus: 'grabbed' | 'miss' | null;
        panVelocity: { x: number, y: number };
        pinchReleaseCounter: number;
        fistActiveCounter: number;
        smoothedPos: { x: number, y: number } | null;
        lastBroadcastTime: number;
    }>>({});

    const getHandRef = (handedness: string) => {
        if (!handRefs.current[handedness]) {
            handRefs.current[handedness] = {
                lastGesture: null,
                grabbedEl: null,
                wasPinching: false,
                grabStatus: null,
                panVelocity: { x: 0, y: 0 },
                pinchReleaseCounter: 0,
                fistActiveCounter: 0,
                smoothedPos: null,
                lastBroadcastTime: 0
            };
        }
        return handRefs.current[handedness];
    };

    const dualHandRef = useRef<{
        active: boolean;
        elementId: string | null;
        initialDist: number;
        initialAngle: number;
        initialScale: number;
        initialRotation: number;
        initialMidpoint: { x: number, y: number };
        elementInitialPos: { x: number, y: number };
        currentTransform: { x: number, y: number, scale: number, rotation: number } | null;
    }>({
        active: false,
        elementId: null,
        initialDist: 0,
        initialAngle: 0,
        initialScale: 1,
        initialRotation: 0,
        initialMidpoint: { x: 0, y: 0 },
        elementInitialPos: { x: 0, y: 0 },
        currentTransform: null
    });

    // Passcode Challenge State
    const [passwordInput, setPasswordInput] = useState('');

    // Modal State
    const [modalOpen, setModalOpen] = useState(false);
    const [pendingTool, setPendingTool] = useState<ElementType | null>(null);
    const [pendingClick, setPendingClick] = useState<{ x: number, y: number } | null>(null);
    const [inputValue, setInputValue] = useState('');

    // Inline Text State
    const [inlineText, setInlineText] = useState<{ x: number, y: number, value: string, font: string } | null>(null);
    const inlineInputRef = useRef<HTMLInputElement>(null);
    const [selectedFont, setSelectedFont] = useState('Inter');

    const FONT_OPTIONS = [
        { name: 'Inter', value: 'Inter, sans-serif' },
        { name: 'Mono', value: 'ui-monospace, monospace' },
        { name: 'Serif', value: 'Georgia, serif' },
        { name: 'Cursive', value: 'Pacifico, cursive' },
        { name: 'Bold', value: 'Inter, sans-serif', weight: 700 },
    ];

    // Persistence: Load
    useEffect(() => {
        store.setRoomId(roomId);

        const hostMarker = localStorage.getItem(`realim_is_host_${roomId}`);
        const hostPassword = localStorage.getItem(`room_pass_${roomId}`);

        // Determine host status FIRST based on localStorage markers
        // This is the authoritative source - not having saved content
        const isCreator = hostMarker === 'true' || !!hostPassword;

        if (isCreator) {
            console.log('[Board] We created this room, setting host');
            store.setIsHost(true);
        } else {
            console.log('[Board] Not the room creator, not host');
            store.setIsHost(false);
        }

        // Load saved elements from IndexedDB (separate from host logic)
        get(`realim_room_${roomId}`).then((val) => {
            if (val && Object.keys(val).length > 0) {
                // Only load if our store is empty
                if (Object.keys(store.elements).length === 0) {
                    console.log('[Board] Loading saved elements from IndexedDB');
                    Object.values(val).forEach((el: any) => store.addElement(el));
                }
            }
        });

        store.saveRoom(roomId);
    }, [roomId]);

    // Persistence: Save (fast debounce)
    useEffect(() => {
        const timer = setTimeout(() => {
            if (Object.keys(store.elements).length > 0) {
                set(`realim_room_${roomId}`, store.elements);
            }
        }, 300); // Fast save for instant feel
        return () => clearTimeout(timer);
    }, [store.elements, roomId]);

    // Auto-center on latest element when joining/loading
    const hasAutoCenteredRef = useRef(false);
    const lastElementCountRef = useRef(0);

    useEffect(() => {
        const elements = Object.values(store.elements);
        const currentCount = elements.length;

        // Auto-center on first load OR when significant new elements arrive from sync
        const isFirstLoad = !hasAutoCenteredRef.current && currentCount > 0;
        const isNewSyncData = currentCount > 0 && lastElementCountRef.current === 0 && currentCount > 0;

        if (!isFirstLoad && !isNewSyncData) {
            lastElementCountRef.current = currentCount;
            return;
        }

        // Wait a bit for all elements to load
        const timer = setTimeout(() => {
            const allElements = Object.values(store.elements);
            if (allElements.length === 0) return;

            // Try to find latest by modification time, then creation time
            let latest = allElements
                .sort((a, b) => {
                    const aTime = a.lastModifiedAt || a.createdAt || 0;
                    const bTime = b.lastModifiedAt || b.createdAt || 0;
                    return bTime - aTime;
                })[0];

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
                console.log('[Board] Auto-centered on element:', latest.id);
            }

            lastElementCountRef.current = allElements.length;
        }, 100); // Fast auto-center for instant sync feel

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



    // --- Handlers ---

    // Confetti Gesture Handler (Local)
    const handleLocalConfettiGesture = (screenX: number, screenY: number) => {
        // Trigger local visual
        confetti({
            particleCount: 100,
            spread: 70,
            origin: { x: screenX / window.innerWidth, y: screenY / window.innerHeight },
            zIndex: 9999
        });

        // Broadcast to peers
        const worldPos = toWorld(screenX, screenY);
        broadcast({ type: 'CONFETTI', payload: worldPos });
    };

    // File Upload Handler
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                if (typeof ev.target?.result === 'string') {
                    setInputValue(ev.target.result);
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const handleDragUpdate = (id: string, newWorldX: number, newWorldY: number, final: boolean) => {
        const updates = { x: newWorldX, y: newWorldY, lastModifiedAt: Date.now() };
        if (final) {
            store.updateElement(id, updates);
            broadcast({ type: 'UPDATE_ELEMENT', payload: { id, updates } });
        } else {
            broadcast({ type: 'UPDATE_ELEMENT', payload: { id, updates } });
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
                    const newScale = Math.min(Math.max(prev.scale + delta, 0.3), 5); // Min 0.3 to keep grid clean
                    return { ...prev, scale: newScale };
                });
            } else {
                const zoomSensitivity = 0.001;
                const delta = -e.deltaY * zoomSensitivity;
                setViewport(prev => {
                    const newScale = Math.min(Math.max(prev.scale + delta, 0.3), 5); // Min 0.3 to keep grid clean
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

        // Touch gesture handling for mobile pinch-to-zoom and pan
        let initialTouchDist = 0;
        let initialTouchMidpoint = { x: 0, y: 0 };
        let initialViewportOnTouch = { x: 0, y: 0, scale: 1 };
        let isTouchZooming = false;
        let isTouchPanning = false;
        let lastTouchPos = { x: 0, y: 0 };

        const onTouchStart = (e: TouchEvent) => {
            if (e.touches.length === 2) {
                // Two finger gesture - pinch zoom or pan
                e.preventDefault();
                const t1 = e.touches[0];
                const t2 = e.touches[1];
                initialTouchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
                initialTouchMidpoint = {
                    x: (t1.clientX + t2.clientX) / 2,
                    y: (t1.clientY + t2.clientY) / 2
                };
                initialViewportOnTouch = { ...viewportRef.current };
                isTouchZooming = true;
                isTouchPanning = true;
            } else if (e.touches.length === 1 && activeTool === 'hand') {
                // Single finger pan when hand tool is active
                e.preventDefault();
                lastTouchPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                initialViewportOnTouch = { ...viewportRef.current };
                isTouchPanning = true;
            }
        };

        const onTouchMove = (e: TouchEvent) => {
            if (e.touches.length === 2 && isTouchZooming) {
                e.preventDefault();
                const t1 = e.touches[0];
                const t2 = e.touches[1];
                const currentDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
                const currentMidpoint = {
                    x: (t1.clientX + t2.clientX) / 2,
                    y: (t1.clientY + t2.clientY) / 2
                };

                // Calculate scale change
                const scaleFactor = currentDist / Math.max(initialTouchDist, 1);
                const newScale = Math.min(Math.max(initialViewportOnTouch.scale * scaleFactor, 0.3), 5);

                // Calculate pan offset
                const panX = currentMidpoint.x - initialTouchMidpoint.x;
                const panY = currentMidpoint.y - initialTouchMidpoint.y;

                // Apply zoom centered on midpoint
                const rect = container.getBoundingClientRect();
                const midX = initialTouchMidpoint.x - rect.left;
                const midY = initialTouchMidpoint.y - rect.top;
                const worldX = (midX - initialViewportOnTouch.x) / initialViewportOnTouch.scale;
                const worldY = (midY - initialViewportOnTouch.y) / initialViewportOnTouch.scale;

                setViewport({
                    x: midX - worldX * newScale + panX,
                    y: midY - worldY * newScale + panY,
                    scale: newScale
                });
            } else if (e.touches.length === 1 && isTouchPanning && activeTool === 'hand') {
                e.preventDefault();
                const dx = e.touches[0].clientX - lastTouchPos.x;
                const dy = e.touches[0].clientY - lastTouchPos.y;
                setViewport(prev => ({
                    ...prev,
                    x: prev.x + dx,
                    y: prev.y + dy
                }));
                lastTouchPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
        };

        const onTouchEnd = () => {
            isTouchZooming = false;
            isTouchPanning = false;
        };

        container.addEventListener('touchstart', onTouchStart, { passive: false });
        container.addEventListener('touchmove', onTouchMove, { passive: false });
        container.addEventListener('touchend', onTouchEnd);

        return () => {
            container.removeEventListener('wheel', onWheel);
            container.removeEventListener('touchstart', onTouchStart);
            container.removeEventListener('touchmove', onTouchMove);
            container.removeEventListener('touchend', onTouchEnd);
        };
    }, [activeTool]);


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
        if (now - lastCursorUpdate.current > 16) { // ~60fps cursor sync
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
        // If inline text is active, commit it first
        if (inlineText && inlineText.value.trim()) {
            commitInlineText();
            return;
        } else if (inlineText) {
            setInlineText(null);
        }

        if (activeTool === 'select' || activeTool === 'hand' || isPanning) return;
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldPos = toWorld(mouseX, mouseY);

        // For text tool, use inline editing instead of modal
        if (activeTool === 'text') {
            setInlineText({ x: worldPos.x, y: worldPos.y, value: '', font: selectedFont });
            setTimeout(() => inlineInputRef.current?.focus(), 0);
            return;
        }

        setPendingTool(activeTool);
        setPendingClick(worldPos);
        setInputValue('');
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
        console.log('[Board] Broadcasted new element:', newElement.type, newElement.id);
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
                            {pendingTool === 'image' ? 'Image Link or Upload' : 'Text'}
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
                            <div className="space-y-3">
                                <Input
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    placeholder="https://..."
                                    autoFocus
                                />
                                <div className="relative">
                                    <div className="absolute inset-0 flex items-center">
                                        <span className="w-full border-t border-white/10" />
                                    </div>
                                    <div className="relative flex justify-center text-xs uppercase">
                                        <span className="bg-[#0f0f11] px-2 text-muted-foreground">Or upload</span>
                                    </div>
                                </div>
                                <Input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleFileSelect}
                                    className="cursor-pointer file:cursor-pointer file:text-foreground file:border-0 file:bg-transparent file:text-sm file:font-medium"
                                />
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleModalSubmit}>Add to Board</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Zoom Controls */}
            <div className="absolute bottom-4 sm:bottom-6 right-4 sm:right-6 z-50 flex flex-col gap-2 glass p-2 rounded-xl border border-white/10">
                <button onClick={() => setViewport(v => ({ ...v, scale: Math.min(v.scale + 0.1, 5) }))} className="p-3 sm:p-2 hover:bg-white/10 active:bg-white/20 rounded-lg touch-manipulation"><Plus size={20} /></button>
                <div className="text-center text-xs font-mono opacity-50">{Math.round(viewport.scale * 100)}%</div>
                <button onClick={() => setViewport(v => ({ ...v, scale: Math.max(v.scale - 0.1, 0.1) }))} className="p-3 sm:p-2 hover:bg-white/10 active:bg-white/20 rounded-lg touch-manipulation"><Minus size={20} /></button>
            </div>

            {/* Invite Button */}
            <div className="absolute bottom-4 sm:bottom-6 left-4 sm:left-6 z-50">
                <Button
                    onClick={() => {
                        const inviteUrl = `${window.location.origin}/board/${roomId}`;
                        navigator.clipboard.writeText(inviteUrl);
                        const btn = document.getElementById('invite-text');
                        if (btn) btn.innerText = 'Copied!';
                        setTimeout(() => { if (btn) btn.innerText = 'Invite Friend'; }, 2000);
                    }}
                    className="glass border-white/10 shadow-2xl hover:bg-white/10 active:bg-white/20 text-white gap-2 h-10 sm:h-auto px-3 sm:px-4 text-sm sm:text-base touch-manipulation"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
                    <span id="invite-text" className="hidden sm:inline">Invite Friend</span>
                </Button>
            </div>

            {/* Gesture Toggle */}
            <div className="absolute bottom-16 sm:bottom-20 left-4 sm:left-6 md:bottom-auto md:left-auto md:top-6 md:right-6 z-50">
                <Button
                    size="icon"
                    onClick={() => setGestureMode(!gestureMode)}
                    className={cn("glass border-white/10 transition-all shadow-xl rounded-full w-10 h-10 sm:w-12 sm:h-12 touch-manipulation", gestureMode ? "bg-primary text-white" : "hover:bg-white/10 active:bg-white/20 text-muted-foreground")}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" /><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2" /><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" /><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" /></svg>
                </Button>
            </div>

            <div className="absolute top-4 sm:top-6 left-1/2 -translate-x-1/2 z-50 glass px-1 sm:px-2 py-1 sm:py-2 rounded-xl sm:rounded-2xl flex gap-0.5 sm:gap-1 shadow-2xl border border-white/10 max-w-[calc(100vw-2rem)]">
                <ToolButton active={activeTool === 'select'} onClick={() => setActiveTool('select')} icon={<MousePointer2 size={16} className="sm:w-[18px] sm:h-[18px]" />} label="Select" />
                <ToolButton active={activeTool === 'hand'} onClick={() => setActiveTool('hand')} icon={<Hand size={16} className="sm:w-[18px] sm:h-[18px]" />} label="Pan" />
                <div className="w-px bg-white/10 mx-0.5 sm:mx-1 h-6 sm:h-8 self-center" />
                <ToolButton active={activeTool === 'text'} onClick={() => setActiveTool('text')} icon={<Type size={16} className="sm:w-[18px] sm:h-[18px]" />} label="Text" />
                <ToolButton active={activeTool === 'image'} onClick={() => setActiveTool('image')} icon={<ImageIcon size={16} className="sm:w-[18px] sm:h-[18px]" />} label="Image" />
                <ToolButton active={activeTool === 'sticky'} onClick={() => setActiveTool('sticky')} icon={<StickyNote size={16} className="sm:w-[18px] sm:h-[18px]" />} label="Note" />
                {store.isHost && (
                    <>
                        <div className="w-px bg-destructive/20 mx-1 h-8 self-center" />
                        <button onClick={handleClearBoard} className="p-2 rounded-xl hover:bg-destructive/20 text-destructive/80 hover:text-destructive transition-colors"><Eraser size={18} /></button>
                    </>
                )}
            </div>

            {/* Text Font Options */}
            {activeTool === 'text' && (
                <div className="absolute top-16 sm:top-20 left-1/2 -translate-x-1/2 z-50 glass px-2 py-2 rounded-xl flex gap-1 shadow-xl border border-white/10">
                    {FONT_OPTIONS.map((font) => (
                        <button
                            key={font.name}
                            onClick={() => setSelectedFont(font.name)}
                            className={cn(
                                "px-3 py-1.5 rounded-lg text-sm transition-all",
                                selectedFont === font.name
                                    ? "bg-primary text-white"
                                    : "hover:bg-white/10 text-muted-foreground hover:text-white"
                            )}
                            style={{ fontFamily: font.value, fontWeight: font.weight || 400 }}
                        >
                            {font.name}
                        </button>
                    ))}
                </div>
            )}

            <GestureController
                enabled={gestureMode}
                onConfettiGesture={handleLocalConfettiGesture}
                onHandsUpdate={(hands) => {
                    const newCursors: (HandData & { grabStatus: 'grabbed' | 'miss' | null })[] = [];
                    const activeGrabs: { hand: string, elId: string, wX: number, wY: number, element: HTMLElement }[] = [];

                    hands.forEach(hand => {
                        const refs = getHandRef(hand.handedness);
                        const { landmarks, isPinching, isFist } = hand;

                        // Interaction Point Logic with smoothing
                        let rawX = hand.x;
                        let rawY = hand.y;

                        // Use Midpoint between Thumb (4) and Index (8)
                        if (landmarks && landmarks.length > 8) {
                            const thumb = landmarks[4];
                            const index = landmarks[8];
                            // Mirror X
                            const thumbScreenX = (1 - thumb.x) * window.innerWidth;
                            const indexScreenX = (1 - index.x) * window.innerWidth;
                            const thumbScreenY = thumb.y * window.innerHeight;
                            const indexScreenY = index.y * window.innerHeight;

                            rawX = (thumbScreenX + indexScreenX) / 2;
                            rawY = (thumbScreenY + indexScreenY) / 2;
                        }

                        // Apply smoothing to interaction point
                        // Lower factor = smoother but more delay. 0.15 is very buttery.
                        const SMOOTH_FACTOR = 0.15;
                        const prev = refs.smoothedPos || { x: rawX, y: rawY };
                        const interactionX = prev.x + (rawX - prev.x) * SMOOTH_FACTOR;
                        const interactionY = prev.y + (rawY - prev.y) * SMOOTH_FACTOR;
                        refs.smoothedPos = { x: interactionX, y: interactionY };

                        // Use ref for grab status
                        let currentGrabStatus = refs.grabStatus;

                        // Track interaction point for drag
                        const v = viewportRef.current;
                        const wX = (interactionX - v.x) / v.scale;
                        const wY = (interactionY - v.y) / v.scale;

                        // --- PINCH GRAB LOGIC ---
                        const isHolding = refs.grabbedEl !== null && refs.grabStatus === 'grabbed';

                        if (isPinching) {
                            refs.pinchReleaseCounter = 0;

                            if (!isHolding && !refs.wasPinching) {
                                // PINCH START
                                const candidates = document.querySelectorAll('[data-element-id]');
                                let bestElement: HTMLElement | null = null;
                                let bestElementId: string | null = null;
                                let minDist = Infinity;
                                const SEARCH_RADIUS = 100;

                                candidates.forEach((el) => {
                                    const rect = el.getBoundingClientRect();
                                    const centerX = rect.left + rect.width / 2;
                                    const centerY = rect.top + rect.height / 2;
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
                                    refs.grabStatus = 'grabbed';

                                    // Calc offset - USE FRESH STATE
                                    const freshElements = useBoardStore.getState().elements;
                                    const elementData = freshElements[bestElementId];
                                    const currentX = elementData?.x || 0;
                                    const currentY = elementData?.y || 0;

                                    refs.grabbedEl = {
                                        id: bestElementId,
                                        offsetX: wX - currentX,
                                        offsetY: wY - currentY,
                                        element: bestElement
                                    };
                                } else {
                                    // GRAB MISS
                                    currentGrabStatus = 'miss';
                                    refs.grabStatus = 'miss';
                                    refs.grabbedEl = null;
                                }
                            }
                        } else {
                            // NOT PINCHING
                            if (isHolding) {
                                refs.pinchReleaseCounter++;
                                if (refs.pinchReleaseCounter >= 5) {
                                    // RELEASE
                                    if (refs.grabbedEl) {
                                        // Final update for Single hand logic - ONLY if not dual
                                        if (!dualHandRef.current.active) {
                                            const newX = wX - refs.grabbedEl.offsetX;
                                            const newY = wY - refs.grabbedEl.offsetY;
                                            handleDragUpdate(refs.grabbedEl.id, newX, newY, true);
                                        }
                                    }
                                    refs.grabbedEl = null;
                                    currentGrabStatus = null;
                                    refs.grabStatus = null;
                                    refs.pinchReleaseCounter = 0;
                                }
                            } else {
                                if (refs.grabStatus !== null) {
                                    currentGrabStatus = null;
                                    refs.grabStatus = null;
                                }
                                refs.pinchReleaseCounter = 0;
                            }
                        }

                        refs.wasPinching = isPinching;

                        // Force update currentGrabStatus if it changed during logic
                        currentGrabStatus = refs.grabStatus;

                        // Hand Panning vs Grab
                        const canFistPan = isFist && !isPinching && !refs.grabbedEl && refs.grabStatus === null && refs.pinchReleaseCounter === 0;

                        if (canFistPan) {
                            refs.fistActiveCounter++;
                            if (refs.fistActiveCounter >= 3) {
                                if (refs.lastGesture) {
                                    const dx = interactionX - refs.lastGesture.x;
                                    const dy = interactionY - refs.lastGesture.y;
                                    refs.panVelocity = {
                                        x: refs.panVelocity.x * 0.6 + dx * 0.4,
                                        y: refs.panVelocity.y * 0.6 + dy * 0.4
                                    };
                                    setViewport(prev => ({
                                        ...prev,
                                        x: prev.x + refs.panVelocity.x,
                                        y: prev.y + refs.panVelocity.y
                                    }));
                                }
                                refs.lastGesture = { x: interactionX, y: interactionY };
                            }
                        } else {
                            refs.fistActiveCounter = 0;
                            refs.lastGesture = null;
                            refs.panVelocity = { x: 0, y: 0 };
                        }

                        // Collect Active Grab Info
                        if (refs.grabbedEl && refs.grabStatus === 'grabbed' && refs.grabbedEl.element) {
                            activeGrabs.push({
                                hand: hand.handedness,
                                elId: refs.grabbedEl.id,
                                wX: wX,
                                wY: wY,
                                element: refs.grabbedEl.element
                            });
                        }

                        newCursors.push({
                            ...hand,
                            x: interactionX,
                            y: interactionY,
                            grabStatus: currentGrabStatus
                        });
                    });

                    // --- DUAL HAND LOGIC ---
                    const leftGrab = activeGrabs.find(g => g.hand === 'Left');
                    const rightGrab = activeGrabs.find(g => g.hand === 'Right');
                    const dual = dualHandRef.current;
                    const freshElements = useBoardStore.getState().elements;

                    if (leftGrab && rightGrab && leftGrab.elId === rightGrab.elId) {
                        // BOTH HANDS GRABBING SAME ELEMENT
                        const elId = leftGrab.elId;
                        const el = leftGrab.element;
                        const elData = freshElements[elId];

                        const dx = rightGrab.wX - leftGrab.wX;
                        const dy = rightGrab.wY - leftGrab.wY;
                        const dist = Math.hypot(dx, dy);
                        const angle = Math.atan2(dy, dx); // Radians
                        const mx = (leftGrab.wX + rightGrab.wX) / 2;
                        const my = (leftGrab.wY + rightGrab.wY) / 2;

                        if (!dual.active || dual.elementId !== elId) {
                            // START DUAL GESTURE
                            if (elData) {
                                // Calculate ACTUAL current position from whichever hand was already dragging
                                // This prevents jump when transitioning from single to dual drag
                                const leftRefs = getHandRef('Left');
                                const rightRefs = getHandRef('Right');
                                let currentX = elData.x;
                                let currentY = elData.y;

                                // If left hand was already dragging, use its calculated position
                                if (leftRefs.grabbedEl && leftRefs.grabbedEl.id === elId) {
                                    currentX = leftGrab.wX - leftRefs.grabbedEl.offsetX;
                                    currentY = leftGrab.wY - leftRefs.grabbedEl.offsetY;
                                } else if (rightRefs.grabbedEl && rightRefs.grabbedEl.id === elId) {
                                    currentX = rightGrab.wX - rightRefs.grabbedEl.offsetX;
                                    currentY = rightGrab.wY - rightRefs.grabbedEl.offsetY;
                                }

                                dual.active = true;
                                dual.elementId = elId;
                                dual.initialDist = dist;
                                dual.initialAngle = angle;
                                dual.initialScale = elData.scale || 1;
                                dual.initialRotation = elData.rotation || 0;
                                dual.initialMidpoint = { x: mx, y: my };
                                dual.elementInitialPos = { x: currentX, y: currentY };
                                dual.currentTransform = { x: currentX, y: currentY, scale: elData.scale || 1, rotation: elData.rotation || 0 };
                            }
                        } else {
                            // UPDATE DUAL GESTURE
                            const scaleFactor = dist / Math.max(dual.initialDist, 0.001);
                            const newScale = Math.max(0.1, dual.initialScale * scaleFactor); // No max limit - infinite scaling
                            const angleDiff = angle - dual.initialAngle;
                            const newRotation = dual.initialRotation + (angleDiff * 180 / Math.PI);

                            // Position: follow midpoint of hands with offset from initial grab
                            const panX = mx - dual.initialMidpoint.x;
                            const panY = my - dual.initialMidpoint.y;
                            const newX = dual.elementInitialPos.x + panX;
                            const newY = dual.elementInitialPos.y + panY;

                            // Apply to DOM - use fontSize for text, scale for others
                            if (elData?.type === 'text') {
                                el.style.transform = `translate(${newX}px, ${newY}px) rotate(${newRotation}deg)`;
                                el.style.fontSize = `${18 * newScale}px`;
                            } else {
                                el.style.transform = `translate(${newX}px, ${newY}px) rotate(${newRotation}deg) scale(${newScale})`;
                            }

                            // Update Dual State
                            dual.currentTransform = { x: newX, y: newY, scale: newScale, rotation: newRotation };

                            // Broadcast
                            broadcast({
                                type: 'UPDATE_ELEMENT',
                                payload: {
                                    id: elId,
                                    updates: { x: newX, y: newY, scale: newScale, rotation: newRotation, lastModifiedAt: Date.now() }
                                }
                            });
                        }
                    } else {
                        // NOT DUAL GRABBING (OR LOST ONE HAND)
                        if (dual.active) {
                            // Commit Final State
                            if (dual.currentTransform && dual.elementId) {
                                const finalUpdates = { ...dual.currentTransform, lastModifiedAt: Date.now() };
                                store.updateElement(dual.elementId, finalUpdates);
                                broadcast({
                                    type: 'UPDATE_ELEMENT',
                                    payload: {
                                        id: dual.elementId,
                                        updates: finalUpdates
                                    }
                                });
                            }
                            dual.active = false;
                            dual.elementId = null;
                            dual.currentTransform = null;

                            // Re-sync offsets for active hands to prevent jumping - USE FRESH STATE
                            const updatedElements = useBoardStore.getState().elements;
                            activeGrabs.forEach(g => {
                                const refs = getHandRef(g.hand);
                                if (refs.grabbedEl && refs.grabbedEl.id === g.elId) {
                                    const elementData = updatedElements[g.elId];
                                    if (elementData) {
                                        refs.grabbedEl.offsetX = g.wX - elementData.x;
                                        refs.grabbedEl.offsetY = g.wY - elementData.y;
                                    }
                                }
                            });
                        }

                        // SINGLE HAND DRAG UPDATES
                        activeGrabs.forEach(g => {
                            const refs = getHandRef(g.hand);
                            if (refs.grabbedEl && refs.grabbedEl.id === g.elId) {
                                const newX = g.wX - refs.grabbedEl.offsetX;
                                const newY = g.wY - refs.grabbedEl.offsetY;

                                if (refs.grabbedEl.element) {
                                    // USE FRESH STATE for rotation/scale
                                    const elData = useBoardStore.getState().elements[g.elId];
                                    const rot = elData?.rotation || 0;
                                    const scl = elData?.scale || 1;

                                    // Use fontSize for text, scale for others
                                    if (elData?.type === 'text') {
                                        refs.grabbedEl.element.style.transform = `translate3d(${newX}px, ${newY}px, 0) rotate(${rot}deg)`;
                                        refs.grabbedEl.element.style.fontSize = `${20 * scl}px`;
                                    } else {
                                        refs.grabbedEl.element.style.transform = `translate3d(${newX}px, ${newY}px, 0) rotate(${rot}deg) scale(${scl})`;
                                    }
                                }

                                handleDragUpdate(g.elId, newX, newY, false);
                                const now = Date.now();
                                if (now - refs.lastBroadcastTime > 32) { // ~30fps broadcast
                                    handleDragUpdate(g.elId, newX, newY, false);
                                    refs.lastBroadcastTime = now;
                                }
                            }
                        });
                    }

                    setVirtualCursors(newCursors);
                }}
            />

            {/* Virtual Gesture Overlay */}
            {/* Virtual Gesture Overlay */}
            {gestureMode && virtualCursors.map((cursor, idx) => (
                <div key={idx} className="fixed inset-0 z-[1000] pointer-events-none overflow-hidden">

                    {/* Interaction Midpoint Indicator */}
                    <div
                        className={cn(
                            "absolute w-3 h-3 rounded-full z-50 transition-all duration-75 ease-out will-change-transform",
                            cursor.grabStatus === 'grabbed' ? "bg-green-400/70" :
                                cursor.grabStatus === 'miss' ? "bg-red-400/70" :
                                    "bg-yellow-400/50"
                        )}
                        style={{
                            transform: `translate3d(${cursor.x - 6}px, ${cursor.y - 6}px, 0)`,
                            backfaceVisibility: 'hidden'
                        }}
                    />

                    {/* Hand Landmarks - NO TRANSITIONS for instant tracking */}
                    {cursor.landmarks && cursor.landmarks.map((point: any, i: number) => {
                        const isTip = [4, 8, 12, 16, 20].includes(i);
                        const isActionFinger = (i === 4 || i === 8);

                        const screenX = (1 - point.x) * window.innerWidth;
                        const screenY = point.y * window.innerHeight;

                        if (isTip) {
                            let size = 16; // w-4 = 16px
                            let bgColor = 'rgba(255,255,255,1)';
                            let shadow = '0 0 15px rgba(255,255,255,0.8)';

                            if (isActionFinger && cursor.isPinching) {
                                size = 24; // w-6 = 24px
                                if (cursor.grabStatus === 'grabbed') {
                                    bgColor = '#22c55e';
                                    shadow = '0 0 20px #22c55e';
                                } else if (cursor.grabStatus === 'miss') {
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
                                        width: size,
                                        height: size,
                                        borderRadius: '50%',
                                        backgroundColor: bgColor,
                                        boxShadow: shadow,
                                        transform: `translate3d(${screenX - size / 2}px, ${screenY - size / 2}px, 0)`,
                                        pointerEvents: 'none',
                                        willChange: 'transform',
                                        backfaceVisibility: 'hidden'
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
                                    width: 6,
                                    height: 6,
                                    borderRadius: '50%',
                                    backgroundColor: 'rgba(255,255,255,0.4)',
                                    transform: `translate3d(${screenX - 3}px, ${screenY - 3}px, 0)`,
                                    pointerEvents: 'none',
                                    willChange: 'transform',
                                    backfaceVisibility: 'hidden'
                                }}
                            />
                        )
                    })}
                </div>
            ))}

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
                    className="absolute top-0 left-0 w-full h-full origin-top-left will-change-transform transition-transform duration-[40ms] ease-linear"
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
                                onDelete={() => handleDeleteElement(el.id)}
                                onDragUpdate={(x, y, final) => handleDragUpdate(el.id, x, y, final)}
                            />
                        ))}
                    </AnimatePresence>

                    {/* Inline Text Input */}
                    {inlineText && (
                        <input
                            ref={inlineInputRef}
                            type="text"
                            value={inlineText.value}
                            onChange={(e) => setInlineText({ ...inlineText, value: e.target.value })}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    commitInlineText();
                                } else if (e.key === 'Escape') {
                                    setInlineText(null);
                                    setActiveTool('select');
                                }
                            }}
                            onBlur={() => {
                                if (inlineText.value.trim()) {
                                    commitInlineText();
                                } else {
                                    setInlineText(null);
                                }
                            }}
                            className="absolute bg-transparent border-none outline-none text-white text-lg font-medium caret-primary min-w-[100px]"
                            style={{
                                left: inlineText.x,
                                top: inlineText.y,
                                transform: 'translateY(-50%)'
                            }}
                            placeholder="Type here..."
                            autoFocus
                        />
                    )}

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

// RAF-based throttle for smoother, faster sync
const requestThrottle = (callback: Function, _delay: number) => {
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

const MemoizedDraggableElement = memo(DraggableElement, (prev, next) => {
    return (
        prev.data.x === next.data.x &&
        prev.data.y === next.data.y &&
        prev.data.content === next.data.content &&
        prev.data.rotation === next.data.rotation &&
        prev.data.scale === next.data.scale &&
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

    return (
        <div
            ref={elementRef}
            // Add data-element-id here for Gesture Hit Testing
            data-element-id={data.id}
            className={cn(
                "absolute top-0 left-0 transition-shadow group select-none touch-none will-change-transform origin-top-left",
                activeTool === 'select' ? "cursor-grab active:cursor-grabbing hover:ring-2 ring-primary/50" : "pointer-events-none",
                data.type === 'image' && "p-0",
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
            </div>
        </div>
    )
}

function ToolButton({ active, onClick, icon, label }: any) {
    return (
        <button onClick={onClick} className={cn("p-2 sm:p-2.5 rounded-lg sm:rounded-xl transition-all flex items-center justify-center gap-2 relative group touch-manipulation active:scale-95", active ? "bg-primary text-primary-foreground shadow-[0_0_15px_-3px_rgba(139,92,246,0.6)]" : "hover:bg-white/5 active:bg-white/10 text-muted-foreground hover:text-white")}>
            {icon}
            <span className="absolute top-10 sm:top-12 bg-black/80 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 border border-white/10 backdrop-blur-md">{label}</span>
        </button>
    );
}
