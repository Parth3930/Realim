import { useEffect, useRef, useState } from 'react';
import { joinRoom, selfId } from 'trystero';
import { useBoardStore, type BoardElement, type UserCursor } from './store';
import { nanoid } from 'nanoid';

// Action Types for P2P Messages
type Action =
    | { type: 'SYNC_REQ'; payload?: { password?: string } }
    | { type: 'SYNC_RESP'; payload: { elements: Record<string, BoardElement> } }
    | { type: 'ACCESS_DENIED'; payload: { reason: string } }
    | { type: 'ADD_ELEMENT'; payload: BoardElement }
    | { type: 'UPDATE_ELEMENT'; payload: { id: string; updates: Partial<BoardElement> } }
    | { type: 'DELETE_ELEMENT'; payload: { id: string } }
    | { type: 'CURSOR_MOVE'; payload: UserCursor };

export function useP2P(roomId: string | null) {
    const store = useBoardStore();
    const roomRef = useRef<any>(null);
    const [accessDenied, setAccessDenied] = useState(false);
    const [isConnected, setIsConnected] = useState(false);

    // Persist sendAction reference to call it outside
    const sendActionRef = useRef<any>(null);

    useEffect(() => {
        if (!roomId) return;

        const config = { appId: 'realim-board-v1' };
        const room = joinRoom(config, roomId);
        roomRef.current = room;

        // Use 'any' to bypass strict JSON constraints on Union types
        const [sendAction, getAction] = room.makeAction<any>('board_action');
        sendActionRef.current = sendAction;

        const hostPassword = localStorage.getItem(`room_pass_${roomId}`);
        const initialJoinPass = sessionStorage.getItem(`join_pass_${roomId}`);

        // Assume we're the host until proven otherwise
        // If we receive SYNC_RESP, we're joining someone else's room (guest)
        // If we don't receive it, we're creating the room (host)
        store.setIsHost(true);

        // --- Event Handlers ---

        room.onPeerJoin((peerId) => {
            console.log(`Peer ${peerId} joined`);
            store.addPeer(peerId);
            setIsConnected(true);

            sendAction({
                type: 'CURSOR_MOVE',
                payload: { x: 0, y: 0, userId: store.userId, username: store.username, color: '#8b5cf6' }
            }, peerId);

            // Host logic: Check if we have password protection
            if (!hostPassword && Object.keys(store.elements).length > 0) {
                sendAction({ type: 'SYNC_RESP', payload: { elements: store.elements } }, peerId);
            }
        });

        room.onPeerLeave((peerId) => {
            console.log(`Peer ${peerId} left`);
            store.removePeer(peerId);
            store.removeCursor(peerId);
        });

        getAction((data: Action, peerId) => {
            switch (data.type) {
                case 'SYNC_REQ':
                    if (hostPassword) {
                        if (data.payload?.password === hostPassword) {
                            if (Object.keys(store.elements).length > 0) {
                                sendAction({ type: 'SYNC_RESP', payload: { elements: store.elements } }, peerId);
                            }
                        } else {
                            sendAction({ type: 'ACCESS_DENIED', payload: { reason: 'Incorrect Password' } }, peerId);
                        }
                    } else {
                        // Open Board - share freely
                        if (Object.keys(store.elements).length > 0) {
                            sendAction({ type: 'SYNC_RESP', payload: { elements: store.elements } }, peerId);
                        }
                    }
                    break;

                case 'SYNC_RESP':
                    // We received data from host, so we're a guest
                    store.setIsHost(false);
                    store.setElements(data.payload.elements);
                    setAccessDenied(false); // Success!
                    break;

                case 'ACCESS_DENIED':
                    console.warn(`Access Denied: ${data.payload.reason}`);
                    setAccessDenied(true);
                    break;

                case 'ADD_ELEMENT':
                    store.addElement(data.payload);
                    break;

                case 'UPDATE_ELEMENT':
                    store.updateElement(data.payload.id, data.payload.updates);
                    break;

                case 'DELETE_ELEMENT':
                    store.deleteElement(data.payload.id);
                    break;

                case 'CURSOR_MOVE':
                    store.updateCursor(data.payload.userId, data.payload);
                    break;
            }
        });

        // Initial Sync Request
        sendAction({ type: 'SYNC_REQ', payload: { password: initialJoinPass || undefined } });

        return () => {
            room.leave();
        };
    }, [roomId]);

    const broadcast = (action: Action) => {
        if (sendActionRef.current) {
            sendActionRef.current(action);
        }
    };

    const retryJoin = (password: string) => {
        setAccessDenied(false); // Reset UI state while checking
        if (sendActionRef.current) {
            sendActionRef.current({ type: 'SYNC_REQ', payload: { password } });
        }
    };

    return { broadcast, selfId, accessDenied, retryJoin, isConnected };
}
