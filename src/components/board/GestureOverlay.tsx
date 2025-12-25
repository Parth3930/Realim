import React, { forwardRef, useImperativeHandle, useRef, useEffect } from 'react';
import type { HandData } from '../GestureController';

interface GestureOverlayProps {
    enabled: boolean;
}

export interface GestureOverlayRef {
    updateCursors: (cursors: (HandData & { grabStatus: 'grabbed' | 'miss' | null })[]) => void;
}

// Data structure for our smooth state
interface HandVisualState {
    active: boolean;
    x: number;
    y: number;
    landmarks: { x: number, y: number }[];
    grabStatus: 'grabbed' | 'miss' | null;
    isPinching: boolean;
}

export const GestureOverlay = forwardRef<GestureOverlayRef, GestureOverlayProps>(({ enabled }, ref) => {
    // Refs for the container elements
    const leftHandRef = useRef<HTMLDivElement>(null);
    const rightHandRef = useRef<HTMLDivElement>(null);
    const leftInteractionRef = useRef<HTMLDivElement>(null);
    const rightInteractionRef = useRef<HTMLDivElement>(null);
    const leftLandmarksRef = useRef<HTMLDivElement[]>([]);
    const rightLandmarksRef = useRef<HTMLDivElement[]>([]);

    // State Refs (Double buffered: Target vs Current)
    const targets = useRef<{ Left: HandVisualState, Right: HandVisualState }>({
        Left: { active: false, x: 0, y: 0, landmarks: [], grabStatus: null, isPinching: false },
        Right: { active: false, x: 0, y: 0, landmarks: [], grabStatus: null, isPinching: false }
    });

    const current = useRef<{ Left: HandVisualState, Right: HandVisualState }>({
        Left: { active: false, x: 0, y: 0, landmarks: Array(21).fill(0).map(() => ({ x: 0, y: 0 })), grabStatus: null, isPinching: false },
        Right: { active: false, x: 0, y: 0, landmarks: Array(21).fill(0).map(() => ({ x: 0, y: 0 })), grabStatus: null, isPinching: false }
    });

    const rafRef = useRef<number>(0);

    useImperativeHandle(ref, () => ({
        updateCursors: (cursors) => {
            if (!enabled) return;

            // Reset active flags in targets for this update frame
            targets.current.Left.active = false;
            targets.current.Right.active = false;

            cursors.forEach(c => {
                const target = targets.current[c.handedness as 'Left' | 'Right'];
                if (target) {
                    target.active = true;
                    target.x = c.x;
                    target.y = c.y;
                    target.grabStatus = c.grabStatus;
                    target.isPinching = c.isPinching;

                    // Update target landmarks
                    if (c.landmarks) {
                        // Ensure active array size
                        if (target.landmarks.length !== c.landmarks.length) {
                            target.landmarks = c.landmarks.map((l: any) => ({
                                x: (1 - l.x) * window.innerWidth,
                                y: l.y * window.innerHeight
                            }));
                        } else {
                            c.landmarks.forEach((l: any, i: number) => {
                                target.landmarks[i].x = (1 - l.x) * window.innerWidth;
                                target.landmarks[i].y = l.y * window.innerHeight;
                            });
                        }
                    }
                }
            });
        }
    }));

    useEffect(() => {
        if (!enabled) return;

        const lerp = (start: number, end: number, factor: number) => {
            return start + (end - start) * factor;
        };

        const updateHandVisuals = (
            handName: 'Left' | 'Right',
            container: HTMLDivElement | null,
            interaction: HTMLDivElement | null,
            landmarkEls: HTMLDivElement[]
        ) => {
            if (!container || !interaction) return;

            const target = targets.current[handName];
            const curr = current.current[handName];

            // Toggle Visibility
            // If target is inactive, we can hide immediately or fade. For now, hide.
            if (!target.active) {
                if (container.style.display !== 'none') container.style.display = 'none';
                return;
            }
            if (container.style.display === 'none') {
                container.style.display = 'block';
                // Snap current to target on appear to prevent flying in
                curr.x = target.x;
                curr.y = target.y;
                target.landmarks.forEach((tl, i) => {
                    if (curr.landmarks[i]) {
                        curr.landmarks[i].x = tl.x;
                        curr.landmarks[i].y = tl.y;
                    }
                });
            }

            // --- LERPING ---
            const LERP_FACTOR = 0.35; // Adjust for smoothness vs lag. 0.35 is snappy but smooth.

            curr.x = lerp(curr.x, target.x, LERP_FACTOR);
            curr.y = lerp(curr.y, target.y, LERP_FACTOR);

            // 1. Update Interaction Point
            interaction.style.transform = `translate3d(${curr.x - 6}px, ${curr.y - 6}px, 0)`;

            // Color/Status (Discrete, no lerp)
            const status = target.grabStatus;
            if (status === 'grabbed') interaction.className = "absolute w-3 h-3 rounded-full z-50 bg-green-400/70";
            else if (status === 'miss') interaction.className = "absolute w-3 h-3 rounded-full z-50 bg-red-400/70";
            else interaction.className = "absolute w-3 h-3 rounded-full z-50 bg-yellow-400/50";

            // 2. Update Landmarks
            target.landmarks.forEach((tl, i) => {
                if (!curr.landmarks[i]) curr.landmarks[i] = { x: tl.x, y: tl.y };
                const cl = curr.landmarks[i];

                cl.x = lerp(cl.x, tl.x, LERP_FACTOR);
                cl.y = lerp(cl.y, tl.y, LERP_FACTOR);

                const el = landmarkEls[i];
                if (!el) return;

                // Visual Logic
                const isTip = [4, 8, 12, 16, 20].includes(i);
                const isActionFinger = (i === 4 || i === 8);

                let size = isTip ? 16 : 6;
                const offset = size / 2;

                if (isTip && isActionFinger && target.isPinching) {
                    size = 24;
                    const tOffset = size / 2;
                    el.style.width = '24px';
                    el.style.height = '24px';
                    el.style.transform = `translate3d(${cl.x - tOffset}px, ${cl.y - tOffset}px, 0)`;

                    if (status === 'grabbed') {
                        el.style.backgroundColor = '#22c55e';
                        el.style.boxShadow = '0 0 20px #22c55e';
                    } else if (status === 'miss') {
                        el.style.backgroundColor = '#ef4444';
                        el.style.boxShadow = '0 0 20px #ef4444';
                    } else {
                        el.style.backgroundColor = '#fb923c';
                        el.style.boxShadow = '0 0 15px #fb923c';
                    }
                } else {
                    el.style.width = isTip ? '16px' : '6px';
                    el.style.height = isTip ? '16px' : '6px';
                    el.style.transform = `translate3d(${cl.x - offset}px, ${cl.y - offset}px, 0)`;
                    el.style.backgroundColor = isTip ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.4)';
                    el.style.boxShadow = isTip ? '0 0 15px rgba(255,255,255,0.8)' : 'none';
                }
            });
        };

        const loop = () => {
            updateHandVisuals('Left', leftHandRef.current, leftInteractionRef.current, leftLandmarksRef.current);
            updateHandVisuals('Right', rightHandRef.current, rightInteractionRef.current, rightLandmarksRef.current);
            rafRef.current = requestAnimationFrame(loop);
        };

        rafRef.current = requestAnimationFrame(loop);

        return () => cancelAnimationFrame(rafRef.current);
    }, [enabled]);

    if (!enabled) return null;

    // Helper to generic static landmarks
    const renderstaticLandmarks = (refArray: React.MutableRefObject<HTMLDivElement[]>) => {
        return Array.from({ length: 21 }).map((_, i) => (
            <div
                key={i}
                ref={el => { if (el) refArray.current[i] = el; }}
                className="absolute rounded-full pointer-events-none will-change-transform backface-hidden"
                style={{
                    width: 6,
                    height: 6,
                    top: 0,
                    left: 0,
                    // Initial off-screen
                    transform: 'translate3d(-100px, -100px, 0)'
                }}
            />
        ));
    };

    return (
        <div className="fixed inset-0 z-[1000] pointer-events-none overflow-hidden">
            {/* Left Hand Container */}
            <div ref={leftHandRef} style={{ display: 'none' }}>
                <div ref={leftInteractionRef} className="absolute w-3 h-3 rounded-full z-50 bg-yellow-400/50" />
                {renderstaticLandmarks(leftLandmarksRef)}
            </div>

            {/* Right Hand Container */}
            <div ref={rightHandRef} style={{ display: 'none' }}>
                <div ref={rightInteractionRef} className="absolute w-3 h-3 rounded-full z-50 bg-yellow-400/50" />
                {renderstaticLandmarks(rightLandmarksRef)}
            </div>
        </div>
    );
});
