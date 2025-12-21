import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

interface GestureControllerProps {
    onCursorUpdate: (x: number, y: number, isPinching: boolean, isFist: boolean, landmarks: any[]) => void;
    enabled: boolean;
}

export function GestureController({ onCursorUpdate, enabled }: GestureControllerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null); // Kept for resizing logic if needed, but drawing removed
    const [loaded, setLoaded] = useState(false);

    // Refs for animation loop
    const handLandmarkerRef = useRef<HandLandmarker | null>(null);
    const requestRef = useRef<number>(0);

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
                numHands: 1
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
        // Simple check: Is tip below PIP? (Y increases downwards in screen space?)
        // MediaPipe coords: Y is 0 at top, 1 at bottom.
        // If holding hand up: Tip Y should be smaller than PIP Y.
        // If fist: Tip Y > PIP Y ? (Folded down)
        // This assumes hand is upright.
        // Better: Distance to wrist (0)?
        const wrist = landmarks[0];
        const tip = landmarks[tipIdx];
        const pip = landmarks[pipIdx]; // Proximal Joint

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
            const landmarks = results.landmarks[0];

            // Interaction Logic
            const indexTip = landmarks[8];
            const thumbTip = landmarks[4];

            // Cursor Position (Mirror X)
            const cursorX = (1 - indexTip.x) * window.innerWidth;
            const cursorY = indexTip.y * window.innerHeight;

            // Pinch Detection
            const distance = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
            const isPinching = distance < 0.05;

            // Fist Detection (Check Index, Middle, Ring, Pinky)
            const indexDown = isFingerDown(landmarks, 8, 6);
            const middleDown = isFingerDown(landmarks, 12, 10);
            const ringDown = isFingerDown(landmarks, 16, 14);
            const pinkyDown = isFingerDown(landmarks, 20, 18);

            const isFist = indexDown && middleDown && ringDown && pinkyDown;

            onCursorUpdate(cursorX, cursorY, isPinching, isFist, landmarks);
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
