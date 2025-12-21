import { useEffect, useRef } from 'react';
import { joinRoom, selfId } from 'trystero';
import { useBoardStore, type BoardElement, type UserCursor } from './store';
import { nanoid } from 'nanoid';

// Action Types for P2P Messages
type Action =
    | { type: 'SYNC_REQ'; payload?: { password?: string } } // New peer asking for data, optionally with password
    | { type: 'SYNC_RESP'; payload: { elements: Record<string, BoardElement> } }
    | { type: 'ACCESS_DENIED'; payload: { reason: string } }
    | { type: 'ADD_ELEMENT'; payload: BoardElement }
    | { type: 'UPDATE_ELEMENT'; payload: { id: string; updates: Partial<BoardElement> } }
    | { type: 'DELETE_ELEMENT'; payload: { id: string } }
    | { type: 'CURSOR_MOVE'; payload: UserCursor };

export function useP2P(roomId: string | null) {
    const store = useBoardStore();
    const roomRef = useRef<any>(null);

    useEffect(() => {
        if (!roomId) return;

        const config = { appId: 'realim-board-v1' };
        const room = joinRoom(config, roomId);
        roomRef.current = room;

        const [sendAction, getAction] = room.makeAction<Action>('board_action');

        // Check for locally stored passwords
        const hostPassword = localStorage.getItem(`room_pass_${roomId}`);
        const joinPassword = sessionStorage.getItem(`join_pass_${roomId}`);

        // --- Event Handlers ---

        room.onPeerJoin((peerId) => {
            console.log(`Peer ${peerId} joined`);
            store.addPeer(peerId);

            // For ephemeral data (cursor), broadcast immediately
            sendAction({
                type: 'CURSOR_MOVE',
                payload: { x: 0, y: 0, userId: store.userId, username: store.username, color: '#8b5cf6' }
            });

            // Proactively share state ONLY if NO password is set.
            // If password is set, wait for explicit SYNC_REQ with password.
            if (!hostPassword && Object.keys(store.elements).length > 0) {
                sendAction({ type: 'SYNC_RESP', payload: { elements: store.elements } }, peerId);
            }
        });

        room.onPeerLeave((peerId) => {
            console.log(`Peer ${peerId} left`);
            store.removePeer(peerId);
            store.removeCursor(peerId);
        });

        getAction((data, peerId) => {
            switch (data.type) {
                case 'SYNC_REQ':
                    // Check Password Logic
                    if (hostPassword) {
                        if (data.payload?.password === hostPassword) {
                            if (Object.keys(store.elements).length > 0) {
                                sendAction({ type: 'SYNC_RESP', payload: { elements: store.elements } }, peerId);
                            }
                        } else {
                            sendAction({ type: 'ACCESS_DENIED', payload: { reason: 'Incorrect Password' } }, peerId);
                        }
                    } else {
                        // Open Board
                        if (Object.keys(store.elements).length > 0) {
                            sendAction({ type: 'SYNC_RESP', payload: { elements: store.elements } }, peerId);
                        }
                    }
                    break;

                case 'SYNC_RESP':
                    store.setElements(data.payload.elements);
                    break;

                case 'ACCESS_DENIED':
                    alert(`Access Denied: ${data.payload.reason}`);
                    // Maybe redirect home?
                    window.location.href = '/';
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

        // --- Initial Sync ---
        // Ask for data upon joining, sending password if we have one
        sendAction({ type: 'SYNC_REQ', payload: { password: joinPassword || undefined } });

        return () => {
            room.leave();
        };
    }, [roomId]);

    const broadcast = (action: Action) => {
        if (roomRef.current) {
            const [send] = roomRef.current.makeAction('board_action');
            send(action);
        }
    };

    return { broadcast, selfId };
}
