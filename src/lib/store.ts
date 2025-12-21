import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { nanoid } from 'nanoid';

// --- Types ---

export type ElementType = 'text' | 'image' | 'code' | 'sticky';

export interface BoardElement {
    id: string;
    type: ElementType;
    x: number;
    y: number;
    content: string;
    width?: number;
    height?: number;
    rotation?: number;
    createdBy: string;
}

export interface UserCursor {
    x: number;
    y: number;
    userId: string;
    username: string;
    color: string;
}

export interface SavedRoom {
    id: string;
    lastVisited: number;
}

interface BoardState {
    roomId: string | null;
    username: string;
    userId: string;
    isHost: boolean;

    // Board Data
    elements: Record<string, BoardElement>;

    // Ephemeral Data
    cursors: Record<string, UserCursor>;
    peers: string[];

    // Saved Rooms (Recent 5)
    savedRooms: SavedRoom[];

    // Actions
    setRoomId: (id: string) => void;
    setUserInfo: (username: string) => void;
    setIsHost: (isHost: boolean) => void;

    addElement: (element: BoardElement) => void;
    updateElement: (id: string, updates: Partial<BoardElement>) => void;
    deleteElement: (id: string) => void;

    updateCursor: (userId: string, cursor: Partial<UserCursor>) => void;
    removeCursor: (userId: string) => void;

    setElements: (elements: Record<string, BoardElement>) => void;
    addPeer: (peerId: string) => void;
    removePeer: (peerId: string) => void;

    saveRoom: (id: string) => void;
}

const ADJECTIVES = ['Happy', 'Bright', 'Glow', 'Neon', 'Swift', 'Silent', 'Cosmic', 'Solar', 'Lunar', 'Vivid'];
const ANIMALS = ['Fox', 'Cat', 'Bear', 'Rabbit', 'Tiger', 'Wolf', 'Panda', 'Hawk', 'Eagle', 'Owl'];

const generateName = () => {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
    return `${adj} ${animal}`;
}

// --- Store ---

export const useBoardStore = create<BoardState>()(
    persist(
        (set) => ({
            roomId: null,
            username: generateName(),
            userId: nanoid(10),
            isHost: false,

            elements: {},
            cursors: {},
            peers: [],
            savedRooms: [],

            setRoomId: (roomId) => set({ roomId }),
            setUserInfo: (username) => set({ username }),
            setIsHost: (isHost) => set({ isHost }),

            addElement: (element) =>
                set((state) => ({
                    elements: { ...state.elements, [element.id]: element },
                })),

            updateElement: (id, updates) =>
                set((state) => {
                    if (!state.elements[id]) return state;
                    return {
                        elements: {
                            ...state.elements,
                            [id]: { ...state.elements[id], ...updates },
                        },
                    };
                }),

            deleteElement: (id) =>
                set((state) => {
                    const { [id]: _, ...rest } = state.elements;
                    return { elements: rest };
                }),

            updateCursor: (userId, cursor) =>
                set((state) => ({
                    cursors: {
                        ...state.cursors,
                        [userId]: { ...(state.cursors[userId] || {}), ...cursor } as UserCursor,
                    },
                })),

            removeCursor: (userId) =>
                set((state) => {
                    const { [userId]: _, ...rest } = state.cursors;
                    return { cursors: rest };
                }),

            setElements: (elements) => set({ elements }),

            addPeer: (peerId) => set((state) => ({ peers: [...state.peers, peerId] })),
            removePeer: (peerId) => set((state) => ({ peers: state.peers.filter((p) => p !== peerId) })),

            saveRoom: (id) => set((state) => {
                // Add or move to top, limit to 5
                const existing = state.savedRooms.filter(r => r.id !== id);
                const updated = [{ id, lastVisited: Date.now() }, ...existing].slice(0, 5);
                return { savedRooms: updated };
            }),
        }),
        {
            name: 'realim-storage',
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                userId: state.userId,
                // We persist username so it doesn't randomise on reload
                username: state.username,
                elements: state.elements,
                savedRooms: state.savedRooms
            }),
        }
    )
);
