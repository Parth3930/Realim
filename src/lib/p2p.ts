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

        // Determine if we're the host based on:
        // 1. We have a host password stored (we created the room with password)
        // 2. OR we have elements in IndexedDB (we created content before)
        // If neither, we'll determine based on who connects first
        const isCreator = !!hostPassword;
        store.setIsHost(isCreator);

        // --- Event Handlers ---

        room.onPeerJoin((peerId) => {
            console.log(`Peer ${peerId} joined`);
            store.addPeer(peerId);
            setIsConnected(true);

            // Send our cursor position to the new peer
            sendAction({
                type: 'CURSOR_MOVE',
                payload: { x: 0, y: 0, userId: store.userId, username: store.username, color: '#8b5cf6' }
            }, peerId);

            // If we're the host (have content or password), send sync immediately
            if (store.isHost || Object.keys(store.elements).length > 0) {
                if (!hostPassword) {
                    // No password, share freely
                    sendAction({ type: 'SYNC_RESP', payload: { elements: store.elements } }, peerId);
                    store.setIsHost(true); // We're sharing, so we're the host
                }
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
                    // Someone is requesting sync - we must be the host if we respond
                    if (hostPassword) {
                        if (data.payload?.password === hostPassword) {
                            sendAction({ type: 'SYNC_RESP', payload: { elements: store.elements } }, peerId);
                            store.setIsHost(true);
                        } else {
                            sendAction({ type: 'ACCESS_DENIED', payload: { reason: 'Incorrect Password' } }, peerId);
                        }
                    } else {
                        // Open Board - share freely (even if empty)
                        // Only respond if we actually have content (meaning we're the host)
                        if (Object.keys(store.elements).length > 0 || store.isHost) {
                            sendAction({ type: 'SYNC_RESP', payload: { elements: store.elements } }, peerId);
                            store.setIsHost(true);
                        }
                    }
                    break;

                case 'SYNC_RESP':
                    // We received data from host, so we're definitely a guest
                    store.setIsHost(false);
                    store.setElements(data.payload.elements);
                    setAccessDenied(false);
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
