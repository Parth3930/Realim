import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

export interface HandData {
    x: number;
    y: number;
    isPinching: boolean;
    isFist: boolean;
    landmarks: any[];
    handedness: string;
}

interface GestureControllerProps {
    onHandsUpdate: (hands: HandData[]) => void;
    onConfettiGesture?: (x: number, y: number) => void;
    enabled: boolean;
}

export function GestureController({ onHandsUpdate, onConfettiGesture, enabled }: GestureControllerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [loaded, setLoaded] = useState(false);

    const handLandmarkerRef = useRef<HandLandmarker | null>(null);
    const requestRef = useRef<number>(0);

    const onHandsUpdateRef = useRef(onHandsUpdate);
    onHandsUpdateRef.current = onHandsUpdate;

    const onConfettiGestureRef = useRef(onConfettiGesture);
    onConfettiGestureRef.current = onConfettiGesture;

    const wasConfettiRef = useRef(false);

    useEffect(() => {
        const init = async () => {
            const vision = await FilesetResolver.forVisionTasks(
                "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
            );

            const handLandmarker = await HandLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
                    delegate: "GPU"
                },
                runningMode: "VIDEO",
                numHands: 2
            });
            handLandmarkerRef.current = handLandmarker;
            setLoaded(true);
        };
        init();
    }, []);

    useEffect(() => {
        if (!enabled || !loaded) return;
        const startWebcam = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.addEventListener('loadeddata', predict);
                }
            } catch (err) { console.error("Error accessing webcam", err); }
        };
        startWebcam();
        return () => {
            if (videoRef.current && videoRef.current.srcObject) {
                (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
            }
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [enabled, loaded]);

    const isFingerDown = (landmarks: any[], tipIdx: number, pipIdx: number) => {
        const wrist = landmarks[0];
        const tip = landmarks[tipIdx];
        const pip = landmarks[pipIdx];

        const distTip = Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
        const distPip = Math.hypot(pip.x - wrist.x, pip.y - wrist.y);

        return distTip < distPip;
    };

    const lastConfettiTimeRef = useRef(0);
    const pinchStateRef = useRef<Record<string, boolean>>({});
    const cursorSmoothRef = useRef<Record<string, { x: number, y: number }>>({});

    const predict = () => {
        const video = videoRef.current;
        const landmarker = handLandmarkerRef.current;

        if (!video || !landmarker) return;

        const startTimeMs = performance.now();
        const results = landmarker.detectForVideo(video, startTimeMs);

        if (results.landmarks && results.landmarks.length > 0) {
            const hands: any[] = [];
            let leftHand: any = null;
            let rightHand: any = null;

            results.landmarks.forEach((landmarks, index) => {
                const indexTip = landmarks[8];
                const thumbTip = landmarks[4];
                const handedness = results.handedness[index][0].categoryName;

                // --- 1. Pinch Hysteresis ---
                // Calculate raw pinch distance
                const distance = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
                const wasPinching = pinchStateRef.current[handedness] || false;

                // Hysteresis thresholds
                const PINCH_ENTER = 0.04;
                const PINCH_EXIT = 0.08;

                let isPinching = wasPinching;
                if (distance < PINCH_ENTER) isPinching = true;
                else if (distance > PINCH_EXIT) isPinching = false;

                pinchStateRef.current[handedness] = isPinching;

                // --- 2. Cursor Position Smoothing ---
                // Raw target position (Tip of Index)
                const targetX = (1 - indexTip.x) * window.innerWidth;
                const targetY = indexTip.y * window.innerHeight;

                const prevPos = cursorSmoothRef.current[handedness] || { x: targetX, y: targetY };

                // Smoothing factor: Lower = smoother but more lag (0.2 is a good balance)
                const smoothX = prevPos.x * 0.7 + targetX * 0.3;
                const smoothY = prevPos.y * 0.7 + targetY * 0.3;

                cursorSmoothRef.current[handedness] = { x: smoothX, y: smoothY };

                const indexDown = isFingerDown(landmarks, 8, 6);
                const middleDown = isFingerDown(landmarks, 12, 10);
                const ringDown = isFingerDown(landmarks, 16, 14);
                const pinkyDown = isFingerDown(landmarks, 20, 18);
                const isFist = indexDown && middleDown && ringDown && pinkyDown;

                const handData = {
                    x: smoothX,
                    y: smoothY,
                    isPinching,
                    isFist,
                    landmarks,
                    handedness
                };
                hands.push(handData);

                if (handedness === 'Left') leftHand = handData;
                if (handedness === 'Right') rightHand = handData;
            });

            onHandsUpdateRef.current(hands);

            // Confetti Gesture: Left Thumb+Right Thumb touching
            if (leftHand && rightHand && onConfettiGestureRef.current) {
                const lThumb = leftHand.landmarks[4];
                const rThumb = rightHand.landmarks[4];

                // Calculate distances (using normalized coords)
                const thumbDist = Math.hypot(lThumb.x - rThumb.x, lThumb.y - rThumb.y);

                const THRESHOLD = 0.08;

                if (thumbDist < THRESHOLD) {
                    const now = Date.now();
                    // 3-second Rate Limit
                    if (now - lastConfettiTimeRef.current > 3000) {
                        // Trigger
                        const mx = (lThumb.x + rThumb.x) / 2;
                        const my = (lThumb.y + rThumb.y) / 2;
                        // Mirror X for screen pos
                        const sx = (1 - mx) * window.innerWidth;
                        const sy = my * window.innerHeight;

                        onConfettiGestureRef.current(sx, sy);
                        lastConfettiTimeRef.current = now;
                    }
                }
            }

        } else {
            onHandsUpdateRef.current([]);
            // Clear smooth state if hands lost
            cursorSmoothRef.current = {};
            pinchStateRef.current = {};
        }

        requestRef.current = requestAnimationFrame(predict);
    };

    if (!enabled) return null;

    return (
        <div className="fixed bottom-4 right-4 z-[9999] pointer-events-none opacity-0">
            <video ref={videoRef} autoPlay playsInline className="hidden" />
        </div>
    );
}
