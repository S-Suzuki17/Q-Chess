'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSocket } from '../lib/SocketContext';
import { User } from '../types/game';

export function useMatchmaking(user: User | null) {
    const [isSearching, setIsSearching] = useState(false);
    const [matchedRoom, setMatchedRoom] = useState<{ id: string, myColor: 'white' | 'black', timeControl: number, hostId: string, joinerId: string } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [waitTime, setWaitTime] = useState(0);
    const waitTimerRef = useRef<NodeJS.Timeout | null>(null);
    const searchStartRef = useRef(0);

    const { socket, isConnected } = useSocket();

    const cleanup = useCallback(() => {
        if (waitTimerRef.current) {
            clearInterval(waitTimerRef.current);
            waitTimerRef.current = null;
        }
        if (socket) {
            socket.emit('cancel_queue');
        }
    }, [socket]);

    // Handle incoming socket events
    useEffect(() => {
        if (!socket) return;

        const handleMatchFound = (data: any) => {
            console.log('[Matchmaking] Match found!', data);
            
            // Inform the server we are connecting with our username
            socket.emit('connect_match', { matchId: data.matchId, userName: user?.name });

            setMatchedRoom({
                id: data.matchId,
                myColor: data.hostId === (user?.id?.startsWith('GUEST-') ? user.id : 'GUEST-' + user?.id) ? 'white' : 'black',
                timeControl: data.timeControl,
                hostId: data.hostId,
                joinerId: data.joinerId
            });
            setIsSearching(false);
            cleanup();
        };

        const handleMatchCancelled = (data: any) => {
            console.log('[Matchmaking] Match cancelled:', data.reason);
            setMatchedRoom(null);
            setError('Match cancelled: ' + data.reason);
        };

        socket.on('match_found', handleMatchFound);
        socket.on('match_cancelled', handleMatchCancelled);

        return () => {
            socket.off('match_found', handleMatchFound);
            socket.off('match_cancelled', handleMatchCancelled);
        };
    }, [socket, user?.id, user?.name, cleanup]);

    const startMatchmaking = useCallback((timeControlSeconds: number = 600) => {
        if (!user) {
            setError('Must be logged in to play online');
            return;
        }
        if (!isConnected) {
            setError('Not connected to game server');
            return;
        }

        cleanup();
        setIsSearching(true);
        setWaitTime(0);
        setError(null);
        searchStartRef.current = Date.now();

        // Emit to Server with username
        socket!.emit('join_queue', { timeControl: timeControlSeconds, userName: user?.name });

        waitTimerRef.current = setInterval(() => {
            const elapsed = Date.now() - searchStartRef.current;
            setWaitTime(elapsed);
        }, 1000);

    }, [user, isConnected, socket, cleanup]);

    const cancelMatchmaking = useCallback(() => {
        cleanup();
        setIsSearching(false);
        setMatchedRoom(null);
    }, [cleanup]);

    const resetMatch = useCallback(() => {
        setMatchedRoom(null);
    }, []);

    return {
        isSearching,
        matchedRoom,
        error,
        waitTime,
        startMatchmaking,
        cancelMatchmaking,
        resetMatch
    };
}
