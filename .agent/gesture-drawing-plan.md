# Gesture Drawing & Interaction Features - Implementation Plan

## Overview
Adding advanced gesture-based interactions to the Realim board:
1. Drawing element type with freehand sketching
2. Index finger "air tap" for toolbar selection
3. Index finger drawing on canvas
4. Auto-center on latest element

## Feature 1: Drawing Element Type ✓ (COMPLETED)
- [x] Add 'draw' to ElementType union
- [x] Add createdAt timestamp to BoardElement
- [ ] Render draw elements as SVG paths
  
## Feature 2: Auto-Center on Latest Element
Implementation in Board.tsx:
- On component mount, find newest element by createdAt
- Calculate viewport transform to center on it
- Smooth animation to that position

```typescript
useEffect(() => {
    if (Object.keys(store.elements).length > 0) {
        // Find latest element
        const latest = Object.values(store.elements)
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
        
        if (latest) {
            // Center viewport on element
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;
            setViewport({
                x: centerX - latest.x * viewport.scale,
                y: centerY - latest.y * viewport.scale,
                scale: 1
            });
        }
    }
}, [roomId]); // Run on room load
```

## Feature 3: Index Finger "Air Tap" Gesture
New gesture detection in GestureController:
- Detect extended index finger (other fingers curled)
- Track Z-axis depth change (push forward motion)
- When over toolbar button + push detected → select tool

MediaPipe landmarks needed:
- Index finger tip (landmark 8)
- Index finger MCP (landmark 5) for depth delta
- Other fingertips to detect if curled

## Feature 4: Freehand Drawing with Index Finger
Drawing state machine:
- When tool = 'draw' and index extended → start path
- Track index finger movement → add points to path
- On finger curl or gesture end → finalize drawing element

Path data format:
```typescript
// Store as SVG path commands
content: "M 10,10 L 20,20 L 30,15 ..."
```

## Implementation Steps

### Step 1: Add Draw Element Rendering (Next)
In DraggableElement component:
```tsx
{data.type === 'draw' && (
    <svg className="pointer-events-none" style={{ width: data.width, height: data.height }}>
        <path 
            d={data.content} 
            stroke="#fff" 
            strokeWidth="3" 
            fill="none" 
            strokeLinecap="round" 
            strokeLinejoin="round"
        />
    </svg>
)}
```

### Step 2: Detect Index Finger Gesture
Extend GestureController to detect:
- `isIndexPointing`: index extended, others curled
- `isIndexPushing`: Z-depth change indicates forward push

### Step 3: Drawing State
Add refs for active drawing:
```typescript
const activeDrawingRef = useRef<{
    id: string,
    startX: number,
    startY: number,
    path: string
} | null>(null);
```

### Step 4: Toolbar Air-Tap Selection
Ray-cast from index finger to toolbar buttons
- Check if index finger position overlaps button bounds
- Detect forward push motion
- Trigger button click

## Gesture Priority (to avoid conflicts)
1. Pinch-grab (highest - already holding)
2. Fist pan
3. Index drawing (when draw tool active)
4. Index air-tap
5. Default cursor

## Timeline
- Draw element rendering: 5min
- Auto-center feature: 10min  
- Index detection: 15min
- Drawing implementation: 20min
- Air-tap toolbar: 25min

Total: ~75 minutes of focused work

## Notes
- Drawing paths should be simplified/smoothed for performance
- Consider adding stroke color picker for draw elements
- Air-tap needs haptic-like visual feedback
- Drawing needs undo/redo support eventually
