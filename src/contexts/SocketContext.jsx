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

        // Ideally, we'd get a JWT token from Firebase here
        // user.getIdToken().then(token => ... )
        // For now, we simulate sending the userId as token to match Node 1 setup
        const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
        const newSocket = io(SERVER_URL, {
            auth: {
                token: user.uid // Passing UID directly for simplicity, in prod use JWT
            },
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

        setSocket(newSocket);

        return () => {
            newSocket.disconnect();
        };
    }, [user?.uid]); // Reconnect only if user changes

    return (
        <SocketContext.Provider value={{ socket, isConnected }}>
            {children}
        </SocketContext.Provider>
    );
}
