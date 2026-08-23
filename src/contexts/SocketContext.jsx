import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../hooks/useAuth'; // Assuming useAuth provides the Firebase user

const SocketContext = createContext();

export function useSocket() {
    return useContext(SocketContext);
}

export function SocketProvider({ children }) {
    const { user } = useAuth();
    const [socket, setSocket] = useState(null);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        if (!user) {
            if (socket) {
                socket.disconnect();
                setSocket(null);
            }
            return;
        }

        let activeSocket = null;
        let isCancelled = false;

        async function initSocket() {
            let token = user.uid;
            if (typeof user.getIdToken === 'function') {
                try {
                    token = await user.getIdToken();
                } catch (e) {
                    console.warn('[Socket] Failed to get ID token, fallback to uid:', e);
                }
            }

            if (isCancelled) return;

            const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'https://q-chess.onrender.com';
            const newSocket = io(SERVER_URL, {
                auth: { token },
                reconnection: true,
                reconnectionAttempts: Infinity,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
            });

            newSocket.on('connect', () => {
                console.log('Connected to Game Server:', newSocket.id);
                setIsConnected(true);
            });

            newSocket.on('disconnect', (reason) => {
                console.log('Disconnected from Game Server:', reason);
                setIsConnected(false);
            });

            activeSocket = newSocket;
            setSocket(newSocket);
        }

        initSocket();

        return () => {
            isCancelled = true;
            if (activeSocket) {
                activeSocket.disconnect();
            }
        };
    }, [user?.uid]); // Reconnect only if user changes

    return (
        <SocketContext.Provider value={{ socket, isConnected }}>
            {children}
        </SocketContext.Provider>
    );
}
