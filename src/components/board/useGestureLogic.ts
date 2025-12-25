import { useRef, useEffect } from 'react';
import type { HandData } from '../GestureController';
import { useBoardStore } from '../../lib/store';

export function useGestureLogic({
    viewportRef,
    setViewport,
    broadcast,
    handleDragUpdate,
    setVirtualCursors
}: any) {
    const handRefs = useRef<Record<string, any>>({});

    // Physics State for Smooth Panning
    const physicsRef = useRef({
        vx: 0,
        vy: 0,
        isPanning: false,
        lastFrameTime: 0
    });

    const dualHandRef = useRef<any>({
        active: false,
        elementId: null,
        // Object Manipulation
        initialDist: 0,
        initialAngle: 0,
        initialScale: 1,
        initialRotation: 0,
        initialMidpoint: { x: 0, y: 0 },
        elementInitialPos: { x: 0, y: 0 },
        currentTransform: null
    });

    // Viewport Zoom State
    const zoomGestureRef = useRef<any>({
        active: false,
        initialDist: 0,
        initialScale: 1,
        initialViewport: { x: 0, y: 0 },
        midpoint: { x: 0, y: 0 }
    });

    // RAF Loop for Physics (60FPS Panning)
    useEffect(() => {
        let rafId: number;
        const FRICTION = 0.92; // Glides to stop
        const STOP_THRESHOLD = 0.1;

        const loop = (timestamp: number) => {
            const p = physicsRef.current;

            // Only update if there is velocity AND not zooming (zoom overrides drift)
            if (!zoomGestureRef.current.active && (Math.abs(p.vx) > STOP_THRESHOLD || Math.abs(p.vy) > STOP_THRESHOLD)) {
                // Apply Velocity
                setViewport((prev: any) => ({
                    ...prev,
                    x: prev.x + p.vx,
                    y: prev.y + p.vy
                }));

                // Decay / Friction
                p.vx *= FRICTION;
                p.vy *= FRICTION;
            } else {
                p.vx = 0;
                p.vy = 0;
            }

            rafId = requestAnimationFrame(loop);
        };

        rafId = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(rafId);
    }, [setViewport]);

    const getHandRef = (handedness: string) => {
        if (!handRefs.current[handedness]) {
            handRefs.current[handedness] = {
                lastGesture: null,
                grabbedEl: null,
                wasPinching: false,
                grabStatus: null,
                pinchReleaseCounter: 0,
                fistActiveCounter: 0,
                smoothedPos: null,
                lastBroadcastTime: 0
            };
        }
        return handRefs.current[handedness];
    };

    const handleHandsUpdate = (hands: HandData[]) => {
        const newCursors: any[] = [];
        const activeGrabs: any[] = [];
        // Track *active* hands for zoom logic, not just grabs
        const activeHands = {
            Left: null as any,
            Right: null as any
        };

        hands.forEach(hand => {
            const refs = getHandRef(hand.handedness);
            const { landmarks, isPinching, isFist } = hand;

            // Interaction Point Logic with smoothing
            let rawX = hand.x;
            let rawY = hand.y;

            if (landmarks && landmarks.length > 8) {
                const thumb = landmarks[4];
                const index = landmarks[8];
                const thumbScreenX = (1 - thumb.x) * window.innerWidth;
                const indexScreenX = (1 - index.x) * window.innerWidth;
                const thumbScreenY = thumb.y * window.innerHeight;
                const indexScreenY = index.y * window.innerHeight;

                rawX = (thumbScreenX + indexScreenX) / 2;
                rawY = (thumbScreenY + indexScreenY) / 2;
            }

            // Apply smoothing
            const SMOOTH_FACTOR = 0.3;
            const prev = refs.smoothedPos || { x: rawX, y: rawY };
            const interactionX = prev.x + (rawX - prev.x) * SMOOTH_FACTOR;
            const interactionY = prev.y + (rawY - prev.y) * SMOOTH_FACTOR;
            refs.smoothedPos = { x: interactionX, y: interactionY };

            // Store for zoom logic
            if (hand.handedness === 'Left') activeHands.Left = { x: interactionX, y: interactionY, isPinching };
            if (hand.handedness === 'Right') activeHands.Right = { x: interactionX, y: interactionY, isPinching };

            let currentGrabStatus = refs.grabStatus;
            const v = viewportRef.current;
            const wX = (interactionX - v.x) / v.scale;
            const wY = (interactionY - v.y) / v.scale;

            const isHolding = refs.grabbedEl !== null && refs.grabStatus === 'grabbed';

            if (isPinching) {
                refs.pinchReleaseCounter = 0;

                if (!isHolding && !refs.wasPinching) {
                    // Try to grab something
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
                        currentGrabStatus = 'grabbed';
                        refs.grabStatus = 'grabbed';
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
                        currentGrabStatus = 'miss';
                        refs.grabStatus = 'miss';
                        refs.grabbedEl = null;
                    }
                }
            } else {
                if (isHolding) {
                    refs.pinchReleaseCounter++;
                    if (refs.pinchReleaseCounter >= 5) {
                        if (refs.grabbedEl) {
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
            currentGrabStatus = refs.grabStatus;

            // Fist Panning
            const canFistPan = isFist && !isPinching && !refs.grabbedEl && refs.grabStatus === null && refs.pinchReleaseCounter === 0 && !zoomGestureRef.current.active;

            if (canFistPan) {
                refs.fistActiveCounter++;
                if (refs.fistActiveCounter >= 3) {
                    if (refs.lastGesture) {
                        const dx = interactionX - refs.lastGesture.x;
                        const dy = interactionY - refs.lastGesture.y;
                        physicsRef.current.vx = dx;
                        physicsRef.current.vy = dy;
                    }
                    refs.lastGesture = { x: interactionX, y: interactionY };
                }
            } else {
                refs.fistActiveCounter = 0;
                refs.lastGesture = null;
            }

            if (refs.grabbedEl && refs.grabStatus === 'grabbed' && refs.grabbedEl.element) {
                activeGrabs.push({
                    hand: hand.handedness,
                    elId: refs.grabbedEl.id,
                    wX: wX,
                    wY: wY,
                    element: refs.grabbedEl.element
                });
            }

            newCursors.push({ ...hand, x: interactionX, y: interactionY, grabStatus: currentGrabStatus });
        });

        // --- 1. DUAL HAND OBJECT MANIPULATION ---
        const leftGrab = activeGrabs.find(g => g.hand === 'Left');
        const rightGrab = activeGrabs.find(g => g.hand === 'Right');
        const dual = dualHandRef.current;
        const freshElements = useBoardStore.getState().elements;

        if (leftGrab && rightGrab && leftGrab.elId === rightGrab.elId) {
            const elId = leftGrab.elId;
            const el = leftGrab.element;
            const elData = freshElements[elId];

            const dx = rightGrab.wX - leftGrab.wX;
            const dy = rightGrab.wY - leftGrab.wY;
            const dist = Math.hypot(dx, dy);
            const angle = Math.atan2(dy, dx);
            const mx = (leftGrab.wX + rightGrab.wX) / 2;
            const my = (leftGrab.wY + rightGrab.wY) / 2;

            if (!dual.active || dual.elementId !== elId) {
                if (elData) {
                    const leftRefs = getHandRef('Left');
                    const rightRefs = getHandRef('Right');
                    let currentX = elData.x;
                    let currentY = elData.y;
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
                const scaleFactor = dist / Math.max(dual.initialDist, 0.001);
                const newScale = Math.max(0.1, dual.initialScale * scaleFactor);
                const angleDiff = angle - dual.initialAngle;
                const newRotation = dual.initialRotation + (angleDiff * 180 / Math.PI);
                const panX = mx - dual.initialMidpoint.x;
                const panY = my - dual.initialMidpoint.y;
                const newX = dual.elementInitialPos.x + panX;
                const newY = dual.elementInitialPos.y + panY;

                if (elData?.type === 'text') {
                    el.style.transform = `translate(${newX}px, ${newY}px) rotate(${newRotation}deg)`;
                    el.style.fontSize = `${18 * newScale}px`;
                } else {
                    el.style.transform = `translate(${newX}px, ${newY}px) rotate(${newRotation}deg) scale(${newScale})`;
                }

                dual.currentTransform = { x: newX, y: newY, scale: newScale, rotation: newRotation };

                broadcast({
                    type: 'UPDATE_ELEMENT',
                    payload: {
                        id: elId,
                        updates: { x: newX, y: newY, scale: newScale, rotation: newRotation, lastModifiedAt: Date.now() }
                    }
                });
            }
        } else {
            // Reset Dual
            if (dual.active) {
                if (dual.currentTransform && dual.elementId) {
                    const finalUpdates = { ...dual.currentTransform, lastModifiedAt: Date.now() };
                    useBoardStore.getState().updateElement(dual.elementId, finalUpdates);
                    broadcast({ type: 'UPDATE_ELEMENT', payload: { id: dual.elementId, updates: finalUpdates } });
                }
                dual.active = false;
                dual.elementId = null;
                dual.currentTransform = null;
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

            // --- 2. CANVAS ZOOM LOGIC (EMPTY SPACE DUAL PINCH) ---
            const zoom = zoomGestureRef.current;
            const leftH = activeHands.Left;
            const rightH = activeHands.Right;

            // Check if BOTH hands are pinching AND NOT holding anything
            const isZooming = leftH?.isPinching && rightH?.isPinching && activeGrabs.length === 0;

            if (isZooming) {
                const dist = Math.hypot(rightH.x - leftH.x, rightH.y - leftH.y);
                const cx = (leftH.x + rightH.x) / 2;
                const cy = (leftH.y + rightH.y) / 2;

                if (!zoom.active) {
                    // START ZOOM
                    zoom.active = true;
                    zoom.initialDist = dist;
                    zoom.initialScale = viewportRef.current.scale;
                    zoom.initialViewport = { ...viewportRef.current };
                    zoom.midpoint = { x: cx, y: cy };
                    // Kill physics velocity
                    physicsRef.current.vx = 0;
                    physicsRef.current.vy = 0;
                } else {
                    // UPDATE ZOOM
                    // Calculate scale ratio
                    const scaleRatio = dist / Math.max(zoom.initialDist, 1);
                    const newScale = Math.min(Math.max(zoom.initialScale * scaleRatio, 0.1), 5); // Limit 0.1x to 5x

                    // Pinch Zoom Formula:
                    // Use initial anchor to prevent drifting if you wobble hands:
                    // The world point at 'zoom.midpoint' should roughly stay at 'cx, cy' (if panning allowed)
                    // If we only zoom:
                    const v = zoom.initialViewport;

                    // Center of zoom in world coordinates (at start)
                    const worldFocusX = (zoom.midpoint.x - v.x) / zoom.initialScale;
                    const worldFocusY = (zoom.midpoint.y - v.y) / zoom.initialScale;

                    // New viewport pos:

                    // Add Panning support: average movement of hands moves the viewport too
                    const panDx = cx - zoom.midpoint.x;
                    const panDy = cy - zoom.midpoint.y;

                    // Apply
                    const newVx = (cx - panDx) - worldFocusX * newScale + panDx; // The pan adds to it
                    const newVy = (cy - panDy) - worldFocusY * newScale + panDy; // Simplified: cx - worldFocusX * newScale

                    setViewport({
                        x: cx - worldFocusX * newScale,
                        y: cy - worldFocusY * newScale,
                        scale: newScale
                    });
                }
            } else {
                // END ZOOM
                if (zoom.active) {
                    zoom.active = false;
                }
            }

            // SINGLE HAND DRAG (Existing)
            activeGrabs.forEach(g => {
                const refs = getHandRef(g.hand);
                if (refs.grabbedEl && refs.grabbedEl.id === g.elId) {
                    const newX = g.wX - refs.grabbedEl.offsetX;
                    const newY = g.wY - refs.grabbedEl.offsetY;
                    if (refs.grabbedEl.element) {
                        const elData = useBoardStore.getState().elements[g.elId];
                        const rot = elData?.rotation || 0;
                        const scl = elData?.scale || 1;
                        if (elData?.type === 'text') {
                            refs.grabbedEl.element.style.transform = `translate3d(${newX}px, ${newY}px, 0) rotate(${rot}deg)`;
                            refs.grabbedEl.element.style.fontSize = `${20 * scl}px`;
                        } else {
                            refs.grabbedEl.element.style.transform = `translate3d(${newX}px, ${newY}px, 0) rotate(${rot}deg) scale(${scl})`;
                        }
                    }
                    handleDragUpdate(g.elId, newX, newY, false);
                }
            });
        }

        setVirtualCursors(newCursors);
    };

    return { handleHandsUpdate };
}
