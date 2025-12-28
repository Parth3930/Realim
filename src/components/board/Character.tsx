
import React from 'react';
import { motion } from 'framer-motion';

// Pixel Art Definitions (8x8 Grid)
// 0: Empty, 1: Primary Color, 2: Secondary Color, 3: Eye/Highlight
const CHAR_MAPS = [
    // 0: Red Knight
    [
        [0, 0, 1, 1, 1, 1, 0, 0],
        [0, 1, 1, 1, 1, 1, 1, 0],
        [0, 1, 3, 1, 1, 3, 1, 0],
        [0, 1, 1, 1, 1, 1, 1, 0],
        [0, 0, 2, 2, 2, 2, 0, 0],
        [0, 1, 2, 2, 2, 2, 1, 0],
        [0, 1, 0, 0, 0, 0, 1, 0],
        [1, 1, 0, 0, 0, 0, 1, 1]
    ],
    // 1: Blue Mage
    [
        [0, 0, 1, 1, 1, 1, 0, 0],
        [0, 1, 1, 1, 1, 1, 1, 0],
        [0, 1, 3, 1, 1, 3, 1, 0],
        [1, 1, 1, 1, 1, 1, 1, 1],
        [1, 0, 2, 2, 2, 2, 0, 1],
        [1, 0, 2, 2, 2, 2, 0, 1],
        [0, 0, 2, 0, 0, 2, 0, 0],
        [0, 0, 2, 0, 0, 2, 0, 0]
    ],
    // 2: Green Archer
    [
        [0, 0, 1, 1, 1, 0, 0, 0],
        [0, 1, 1, 1, 1, 1, 0, 0],
        [1, 1, 3, 1, 3, 1, 1, 0],
        [0, 1, 1, 1, 1, 1, 0, 0],
        [0, 0, 2, 2, 2, 0, 0, 0],
        [0, 1, 2, 2, 2, 1, 0, 0],
        [0, 1, 0, 2, 0, 1, 0, 0],
        [0, 1, 0, 2, 0, 1, 0, 0]
    ],
    // 3: Yellow Rogue
    [
        [0, 0, 1, 1, 1, 1, 0, 0],
        [0, 1, 1, 1, 1, 1, 1, 0],
        [1, 2, 2, 2, 2, 2, 2, 1],
        [1, 1, 3, 1, 1, 3, 1, 1],
        [0, 0, 1, 1, 1, 1, 0, 0],
        [0, 0, 1, 2, 2, 1, 0, 0],
        [0, 1, 1, 0, 0, 1, 1, 0],
        [0, 1, 0, 0, 0, 0, 1, 0]
    ],
    // 4: Purple Ninja
    [
        [0, 0, 1, 1, 1, 1, 0, 0],
        [0, 1, 1, 1, 1, 1, 1, 0],
        [1, 1, 3, 1, 1, 3, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1],
        [0, 0, 2, 2, 2, 2, 0, 0],
        [0, 1, 2, 2, 2, 2, 1, 0],
        [0, 2, 0, 0, 0, 0, 2, 0],
        [2, 2, 0, 0, 0, 0, 2, 2]
    ],
    // 5: Orange Robot
    [
        [0, 0, 1, 1, 1, 1, 0, 0],
        [0, 1, 3, 1, 1, 3, 1, 0],
        [1, 1, 1, 2, 2, 1, 1, 1],
        [0, 1, 2, 2, 2, 2, 1, 0],
        [0, 0, 1, 1, 1, 1, 0, 0],
        [0, 1, 1, 2, 2, 1, 1, 0],
        [0, 1, 0, 1, 1, 0, 1, 0],
        [1, 1, 0, 1, 1, 0, 1, 1]
    ],
    // 6: Cyan Ghost
    [
        [0, 0, 1, 1, 1, 1, 0, 0],
        [0, 1, 1, 1, 1, 1, 1, 0],
        [1, 1, 3, 1, 1, 3, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1],
        [1, 0, 1, 0, 0, 1, 0, 1],
        [1, 0, 1, 0, 0, 1, 0, 1]
    ],
    // 7: Pink Slime
    [
        [0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 1, 1, 1, 1, 0, 0],
        [0, 1, 1, 1, 1, 1, 1, 0],
        [1, 1, 3, 1, 1, 3, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1],
        [1, 0, 0, 1, 1, 0, 0, 1],
        [1, 1, 1, 1, 1, 1, 1, 1]
    ],
    // 8: Grey Golem
    [
        [0, 0, 1, 1, 1, 1, 0, 0],
        [0, 1, 1, 1, 1, 1, 1, 0],
        [1, 1, 3, 1, 1, 3, 1, 1],
        [0, 1, 1, 2, 2, 1, 1, 0],
        [0, 1, 2, 2, 2, 2, 1, 0],
        [1, 2, 2, 0, 0, 2, 2, 1],
        [1, 2, 0, 0, 0, 0, 2, 1],
        [2, 2, 0, 0, 0, 0, 2, 2]
    ],
    // 9: White Skeleton
    [
        [0, 0, 1, 1, 1, 1, 0, 0],
        [0, 1, 1, 1, 1, 1, 1, 0],
        [0, 1, 3, 1, 1, 3, 1, 0],
        [0, 0, 1, 1, 1, 1, 0, 0],
        [0, 0, 0, 2, 2, 0, 0, 0],
        [0, 0, 2, 2, 2, 2, 0, 0],
        [0, 0, 2, 0, 0, 2, 0, 0],
        [0, 0, 2, 0, 0, 2, 0, 0]
    ]
];

const PALETTES = [
    { p: '#EF4444', s: '#991B1B' }, // Red
    { p: '#3B82F6', s: '#1E40AF' }, // Blue
    { p: '#22C55E', s: '#166534' }, // Green
    { p: '#EAB308', s: '#A16207' }, // Yellow
    { p: '#A855F7', s: '#6B21A8' }, // Purple
    { p: '#F97316', s: '#C2410C' }, // Orange
    { p: '#06B6D4', s: '#155E75' }, // Cyan
    { p: '#EC4899', s: '#9D174D' }, // Pink
    { p: '#64748B', s: '#334155' }, // Grey
    { p: '#F8FAFC', s: '#94A3B8' }, // White
];

interface CharacterProps {
    type: number;
    facing: 'left' | 'right';
    isGrounded: boolean;
    isMoving: boolean;
}

export function Character({ type, facing, isGrounded, isMoving }: CharacterProps) {
    const grid = CHAR_MAPS[type % CHAR_MAPS.length];
    const colors = PALETTES[type % PALETTES.length];

    return (
        <div style={{
            width: 40,
            height: 40,
            transform: `scaleX(${facing === 'left' ? -1 : 1})`,
            position: 'relative'

        }}>
            <svg viewBox="0 0 8 8" className="w-full h-full drop-shadow-lg" style={{ imageRendering: 'pixelated' }}>
                {grid.map((row, y) => row.map((cell, x) => {
                    if (cell === 0) return null;
                    let fill = colors.p;
                    if (cell === 2) fill = colors.s;
                    if (cell === 3) fill = 'white'; // Eye
                    if (type === 9 && cell === 3) fill = 'black'; // Skelly eyes

                    return (
                        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />
                    );
                }))}
            </svg>

            {/* Simple Shadow */}
            <div className="absolute -bottom-1 left-1 w-8 h-1 bg-black/30 rounded-full blur-[2px]" />
        </div>
    );
}
