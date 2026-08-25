'use client';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface SocketContextProps {
    socket: Socket | null;
    isConnected: boolean;
}

const SocketContext = createContext<SocketContextProps>({ socket: null, isConnected: false });

export function useSocket() {
    return useContext(SocketContext);
}

export function SocketProvider({ children, userId }: { children: React.ReactNode, userId: string | undefined }) {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        if (!userId) return;

        // Use anon_ prefix so the backend accepts our mock token
        const token = userId.startsWith('anon_') ? userId : `anon_${userId}`;
        const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'https://q-chess.onrender.com';
        
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

        setSocket(newSocket);

        return () => {
            newSocket.disconnect();
        };
    }, [userId]);

    return (
        <SocketContext.Provider value={{ socket, isConnected }}>
            {children}
        </SocketContext.Provider>
    );
}
