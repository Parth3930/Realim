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
        const isHostMarker = localStorage.getItem(`realim_is_host_${roomId}`);
        const initialJoinPass = sessionStorage.getItem(`join_pass_${roomId}`);

        // Determine if we're the host based on:
        // 1. We have a host password stored (created with password)
        // 2. We have the explicit host marker (created without password)
        // 3. We have elements in IndexedDB (re-joining a board we contributed to - optional heuristics)
        const isCreator = !!hostPassword || isHostMarker === 'true';

        // Only set if true, otherwise leave default or allow overlap
        if (isCreator) store.setIsHost(true);

        // --- Event Handlers ---

        room.onPeerJoin((peerId) => {
            console.log(`[P2P] Peer ${peerId} joined`);
            store.addPeer(peerId);
            setIsConnected(true);

            // Get Fresh State
            const state = useBoardStore.getState();
            console.log(`[P2P] Current state - isHost: ${state.isHost}, elements count: ${Object.keys(state.elements).length}`);

            // Send our cursor position to the new peer
            sendAction({
                type: 'CURSOR_MOVE',
                payload: { x: 0, y: 0, userId: state.userId, username: state.username, color: '#8b5cf6' }
            }, peerId);
            console.log('[P2P] Sent initial cursor position to peer');

            // Mesh Sync: If we have data, share it!
            // We don't need to be "The Host", just have data.
            if (Object.keys(state.elements).length > 0) {
                console.log(`[P2P] Have ${Object.keys(state.elements).length} elements to share`);
                // Check if protected
                if (hostPassword) {
                    // If protected, check if we are host
                    if (state.isHost) {
                        console.log('[P2P] Protected board, sharing as host');
                        sendAction({ type: 'SYNC_RESP', payload: { elements: state.elements } }, peerId);
                    } else {
                        console.log('[P2P] Protected board, not host, not sharing');
                    }
                } else {
                    // Public board: Share freely
                    console.log('[P2P] Public board, sharing elements');
                    sendAction({ type: 'SYNC_RESP', payload: { elements: state.elements } }, peerId);
                }
            } else if (state.isHost) {
                // We are host but empty board - share emptiness to confirm state
                console.log('[P2P] Host with empty board, confirming empty state');
                sendAction({ type: 'SYNC_RESP', payload: { elements: {} } }, peerId);
            } else {
                console.log('[P2P] Not host and no elements, not sharing anything');
            }
        });

        room.onPeerLeave((peerId) => {
            console.log(`Peer ${peerId} left`);
            store.removePeer(peerId);
            store.removeCursor(peerId);
        });

        getAction((data: Action, peerId) => {
            const state = useBoardStore.getState();
            console.log(`[P2P] Received action from ${peerId}:`, data.type);

            switch (data.type) {
                case 'SYNC_REQ':
                    console.log('[P2P] Received SYNC_REQ');
                    // Someone is requesting sync
                    if (hostPassword) {
                        if (data.payload?.password === hostPassword) {
                            console.log('[P2P] Password correct, sending elements');
                            sendAction({ type: 'SYNC_RESP', payload: { elements: state.elements } }, peerId);
                            store.setIsHost(true); // Re-affirm host status
                            localStorage.setItem(`realim_is_host_${roomId}`, 'true');
                        } else {
                            console.log('[P2P] Password incorrect, denying access');
                            sendAction({ type: 'ACCESS_DENIED', payload: { reason: 'Incorrect Password' } }, peerId);
                        }
                    } else {
                        // Public Board - Anyone with data acts as seed
                        if (Object.keys(state.elements).length > 0 || state.isHost) {
                            console.log(`[P2P] Responding to SYNC_REQ with ${Object.keys(state.elements).length} elements`);
                            sendAction({ type: 'SYNC_RESP', payload: { elements: state.elements } }, peerId);
                            if (state.elements && Object.keys(state.elements).length === 0 && state.isHost) {
                                // If we are host of empty board, ensure we claim it
                                store.setIsHost(true);
                                localStorage.setItem(`realim_is_host_${roomId}`, 'true');
                            }
                        } else {
                            console.log('[P2P] Not responding to SYNC_REQ - no data and not host');
                        }
                    }
                    break;

                case 'SYNC_RESP':
                    console.log(`[P2P] Received SYNC_RESP with ${Object.keys(data.payload.elements).length} elements`);
                    // We received data. Merge it!
                    // If we receive data, we are consuming, so we generally aren't the "Authoritative Host" in the traditional sense,
                    // BUT in mesh, everyone is equal.
                    // However, for "Clear Board" privs, we usually want the original creator.
                    // So we DON'T set isHost(false) blindly if we already think we are host.
                    // Only set isHost(false) if we definitely shouldn't be (e.g. we failed auth).
                    // Actually, if we accept data, it just means we are syncing.

                    store.mergeElements(data.payload.elements);
                    setAccessDenied(false);
                    break;

                case 'ACCESS_DENIED':
                    console.warn(`[P2P] Access Denied: ${data.payload.reason}`);
                    setAccessDenied(true);
                    break;

                case 'ADD_ELEMENT':
                    console.log('[P2P] Received ADD_ELEMENT:', data.payload.id);
                    store.addElement(data.payload);
                    break;

                case 'UPDATE_ELEMENT':
                    console.log('[P2P] Received UPDATE_ELEMENT:', data.payload.id);
                    store.updateElement(data.payload.id, data.payload.updates);
                    break;

                case 'DELETE_ELEMENT':
                    console.log('[P2P] Received DELETE_ELEMENT:', data.payload.id);
                    store.deleteElement(data.payload.id);
                    break;

                case 'CURSOR_MOVE':
                    // Don't log cursor moves - too spammy
                    store.updateCursor(data.payload.userId, data.payload);
                    break;
            }
        });

        // Initial Sync Request
        console.log('[P2P] Sending initial SYNC_REQ');
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
