import { useState, useEffect, useCallback, useRef } from 'react';
import { useSocket } from '../contexts/SocketContext';

export function useMatchmaking(user, rating) {
    const [isSearching, setIsSearching] = useState(false);
    const [matchedRoom, setMatchedRoom] = useState(null);
    const [error, setError] = useState(null);
    const [waitTime, setWaitTime] = useState(0);
    const [currentRange, setCurrentRange] = useState(100);
    const waitTimerRef = useRef(null);
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

        const handleMatchFound = (data) => {
            console.log('[Matchmaking] Match found!', data);
            
            // Inform the server we are connecting
            socket.emit('connect_match', { matchId: data.matchId });

            setMatchedRoom({
                id: data.matchId,
                myColor: data.hostId === user?.uid ? 'white' : 'black',
                timeControl: data.timeControl,
                hostId: data.hostId,
                joinerId: data.joinerId
            });
            setIsSearching(false);
            cleanup();
        };

        const handleMatchCancelled = (data) => {
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
    }, [socket, user?.uid, cleanup]);


    const startMatchmaking = useCallback((mode = 'rapid', currentRating = 1500) => {
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
        setCurrentRange(100);
        setError(null);
        searchStartRef.current = Date.now();

        const timeControl = mode === 'blitz' ? 180 : mode === 'speed' ? 10 : 600;

        // Emit to Server
        socket.emit('join_queue', { timeControl });

        waitTimerRef.current = setInterval(() => {
            const elapsed = Date.now() - searchStartRef.current;
            setWaitTime(elapsed);
            if (elapsed > 5000 && elapsed < 10000) setCurrentRange(200);
            else if (elapsed > 10000) setCurrentRange(400);

            // Optional: AI Fallback after X seconds
            // if (elapsed > 30000) { ... }
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
        currentRange,
        startMatchmaking,
        cancelMatchmaking,
        resetMatch
    };
}
