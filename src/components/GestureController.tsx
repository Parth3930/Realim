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
    enabled: boolean;
}

export function GestureController({ onHandsUpdate, enabled }: GestureControllerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null); // Kept for resizing logic if needed, but drawing removed
    const [loaded, setLoaded] = useState(false);

    // Refs for animation loop
    const handLandmarkerRef = useRef<HandLandmarker | null>(null);
    const requestRef = useRef<number>(0);

    // Ref to always have latest callback - fixes stale closure in animation loop
    const onHandsUpdateRef = useRef(onHandsUpdate);
    onHandsUpdateRef.current = onHandsUpdate;

    // ... (Init and cleanup same as before) ...
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

    const predict = () => {
        const video = videoRef.current;
        const landmarker = handLandmarkerRef.current;

        if (!video || !landmarker) return;

        const startTimeMs = performance.now();
        const results = landmarker.detectForVideo(video, startTimeMs);

        if (results.landmarks && results.landmarks.length > 0) {
            const hands: any[] = [];

            results.landmarks.forEach((landmarks, index) => {
                // Interaction Logic
                const indexTip = landmarks[8];
                const thumbTip = landmarks[4];
                const handedness = results.handedness[index][0].categoryName; // Left or Right logic

                // Cursor Position (Mirror X)
                const cursorX = (1 - indexTip.x) * window.innerWidth;
                const cursorY = indexTip.y * window.innerHeight;

                // Pinch Detection
                const distance = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
                const isPinching = distance < 0.05;

                // Fist Detection
                const indexDown = isFingerDown(landmarks, 8, 6);
                const middleDown = isFingerDown(landmarks, 12, 10);
                const ringDown = isFingerDown(landmarks, 16, 14);
                const pinkyDown = isFingerDown(landmarks, 20, 18);
                const isFist = indexDown && middleDown && ringDown && pinkyDown;

                hands.push({
                    x: cursorX,
                    y: cursorY,
                    isPinching,
                    isFist,
                    landmarks,
                    handedness
                });
            });

            onHandsUpdateRef.current(hands);
        } else {
            onHandsUpdateRef.current([]);
        }

        requestRef.current = requestAnimationFrame(predict);
    };

    if (!enabled) return null;

    return (
        <div className="fixed bottom-4 right-4 z-[9999] pointer-events-none opacity-0">
            {/* Hidden Video Feed */}
            <video ref={videoRef} autoPlay playsInline className="hidden" />
        </div>
    );
}
