/**
 * useMatchmaking Hook - Rating-Based Matchmaking
 * Matches players with similar Elo ratings
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
    db,
    isFirebaseConfigured,
    appId
} from '../config/firebase';
import {
    collection,
    doc,
    setDoc,
    getDoc,
    getDocs,
    deleteDoc,
    onSnapshot,
    query,
    where,
    serverTimestamp,
    updateDoc,
} from 'firebase/firestore';
import { createInitialBoard } from '../utils/quantumChess';
import {
    DEFAULT_RATING,
    getMatchmakingRange,
    isWithinRange
} from '../utils/rating';

export function useMatchmaking(user, userRating = DEFAULT_RATING) {
    const [isSearching, setIsSearching] = useState(false);
    const [matchedRoom, setMatchedRoom] = useState(null);
    const [error, setError] = useState(null);
    const [waitTime, setWaitTime] = useState(0);
    const [currentRange, setCurrentRange] = useState(100);
    const unsubscribeRef = useRef(null);
    const matchDocRef = useRef(null);
    const waitTimerRef = useRef(null);
    const searchStartRef = useRef(null);
    const aiTimeoutRef = useRef(null);
    const AI_TIMEOUT_MS = 15000; // 15 seconds before falling back to AI

    // Cleanup matchmaking entry
    const cleanup = useCallback(async () => {
        if (waitTimerRef.current) {
            clearInterval(waitTimerRef.current);
            waitTimerRef.current = null;
        }
        if (unsubscribeRef.current) {
            unsubscribeRef.current();
            unsubscribeRef.current = null;
        }
        if (matchDocRef.current && isFirebaseConfigured) {
            try {
                await deleteDoc(matchDocRef.current);
            } catch (e) {
                console.warn('[Matchmaking] Cleanup error:', e);
            }
            matchDocRef.current = null;
        }
        if (aiTimeoutRef.current) {
            clearTimeout(aiTimeoutRef.current);
            aiTimeoutRef.current = null;
        }
        setWaitTime(0);
    }, []);

    // Find best match from waiting players
    const findBestMatch = useCallback((waitingDocs, myRating, range, mode) => {
        let bestMatch = null;
        let smallestDiff = Infinity;

        for (const doc of waitingDocs) {
            const data = doc.data();
            if (data.documentId === user?.uid) continue; // Skip self

            const theirMode = data.mode || 'rapid';
            if (theirMode !== mode) continue; // Skip different modes



            const theirRating = data.rating || DEFAULT_RATING;
            const diff = Math.abs(myRating - theirRating);

            if (isWithinRange(myRating, theirRating, range) && diff < smallestDiff) {
                bestMatch = { doc, data, diff };
                smallestDiff = diff;
            }
        }

        return bestMatch;
    }, [user]);

    // Start searching for a match
    const startMatchmaking = useCallback(async (mode = 'rapid', currentRating = DEFAULT_RATING) => {
        if (!user) {
            setError('Not authenticated');
            return;
        }

        setIsSearching(true);
        setError(null);
        setWaitTime(0);
        searchStartRef.current = Date.now();

        // Offline mode - create local AI match
        if (!isFirebaseConfigured) {
            // console.log('[Matchmaking] Offline mode - creating local game');
            setTimeout(() => {
                const { board, pieces } = createInitialBoard();
                setMatchedRoom({
                    id: 'local-' + Date.now(),
                    turn: 0,
                    players: {
                        white: user.uid,
                        black: 'AI',
                    },
                    ratings: {
                        white: currentRating,
                        black: currentRating,
                    },
                    mode: mode,
                    timeControl: mode === 'blitz' ? 180 : mode === 'speed' ? 10 : 600, // seconds
                    board,
                    pieces,
                    history: [],
                    status: 'active',
                    gameOver: null,
                    isLocal: true,
                });
                setIsSearching(false);
            }, 1500);
            return;
        }

        try {
            const matchmakingRef = collection(db, 'artifacts', appId, 'public', 'data', 'matchmaking');
            const roomsRef = collection(db, 'artifacts', appId, 'public', 'data', 'rooms');

            // Start timer for expand range and AI fallback
            waitTimerRef.current = setInterval(() => {
                const elapsed = Date.now() - searchStartRef.current;
                setWaitTime(elapsed);

                // Expand range every 5 seconds
                if (elapsed > 5000 && elapsed < 10000) setCurrentRange(200);
                else if (elapsed > 10000) setCurrentRange(400);

                // Fallback to AI if no match found
                if (elapsed > AI_TIMEOUT_MS) {
                    // console.log('[Matchmaking] Timeout - starting AI match');
                    cleanup();
                    setIsSearching(false);

                    // Matches the structure expected by App.jsx/useGame
                    setMatchedRoom({
                        id: 'ai_' + Date.now(),
                        isAiMatch: true,
                        myColor: 'white', // Player is white
                        players: {
                            white: { uid: user.uid, displayName: user.displayName || 'Player', rating: currentRating },
                            black: { uid: 'ai', displayName: 'AI Level 1', rating: currentRating, isAi: true }
                        },
                        mode: mode,
                        timeControl: mode === 'blitz' ? 180 : mode === 'speed' ? 10 : 600
                    });
                }
            }, 1000);

            // Search function with expanding range
            const searchForMatch = async () => {
                const elapsed = Date.now() - searchStartRef.current;
                const range = getMatchmakingRange(elapsed);

                // Get all waiting players
                const waitingQuery = query(
                    matchmakingRef,
                    where('status', '==', 'waiting')
                );
                const waitingSnap = await getDocs(waitingQuery);

                if (!waitingSnap.empty) {
                    const bestMatch = findBestMatch(waitingSnap.docs, userRating, range, mode);

                    if (bestMatch) {
                        const { doc: waitingDoc, data: waitingData } = bestMatch;

                        // Create room with both players
                        const { board, pieces } = createInitialBoard();
                        const roomId = waitingDoc.id;

                        // Randomly assign colors (50/50)
                        const iAmWhite = Math.random() < 0.5;

                        await setDoc(doc(roomsRef, roomId), {
                            id: roomId,
                            turn: 0,
                            players: {
                                white: iAmWhite ? user.uid : waitingData.documentId,
                                black: iAmWhite ? waitingData.documentId : user.uid,
                            },
                            ratings: {
                                white: iAmWhite ? currentRating : (waitingData.rating || DEFAULT_RATING),
                                black: iAmWhite ? (waitingData.rating || DEFAULT_RATING) : currentRating,
                            },
                            mode: mode,
                            timeControl: mode === 'blitz' ? 180 : mode === 'speed' ? 10 : 600,
                            board,
                            pieces,
                            history: [],
                            status: 'active',
                            gameOver: null,
                            createdAt: serverTimestamp(),
                        });

                        // Update matchmaking entry
                        await updateDoc(waitingDoc.ref, {
                            status: 'matched',
                            roomId,
                            opponentId: user.uid,
                            myColor: iAmWhite ? 'black' : 'white',
                        });

                        // Cleanup and set matched room
                        await cleanup();
                        setMatchedRoom({
                            id: roomId,
                            myColor: iAmWhite ? 'white' : 'black',
                        });
                        setIsSearching(false);

                        console.log('[Matchmaking] Joined room:', roomId);
                        return true;
                    }
                }
                return false;
            };

            // Try immediate match first
            const found = await searchForMatch();
            if (found) return;

            // No match - add ourselves to queue
            const myMatchId = user.uid + '-' + Date.now();
            matchDocRef.current = doc(matchmakingRef, myMatchId);

            await setDoc(matchDocRef.current, {
                documentId: user.uid,
                rating: currentRating,
                status: 'waiting',
                mode: mode,
                createdAt: serverTimestamp(),
            });

            // console.log('[Matchmaking] Added to queue:', currentRating, mode);

            // Listen for match
            unsubscribeRef.current = onSnapshot(matchDocRef.current, async (snap) => {
                const data = snap.data();
                if (data?.status === 'matched' && data.roomId) {
                    setMatchedRoom({
                        id: data.roomId,
                        myColor: data.myColor || 'white',
                    });
                    setIsSearching(false);
                    cleanup();
                    // console.log('[Matchmaking] Matched to room:', data.roomId);
                }
            });

            // Periodic search for expanding range
            const searchInterval = setInterval(async () => {
                if (!isSearching) {
                    clearInterval(searchInterval);
                    return;
                }
                const found = await searchForMatch();
                if (found) {
                    clearInterval(searchInterval);
                }
            }, 5000);

        } catch (e) {
            console.error('[Matchmaking] Error:', e);
            setError(e.message);

            // Fallback to offline AI game on error
            cleanup();
            setIsSearching(false);

            setMatchedRoom({
                id: 'fallback-ai-' + Date.now(),
                isAiMatch: true,
                myColor: 'white',
                players: {
                    white: { uid: user?.uid || 'guest', displayName: user?.displayName || 'Player', rating: currentRating },
                    black: { uid: 'ai', displayName: 'AI (Offline)', rating: currentRating, isAi: true }
                },
                mode: mode,
                timeControl: mode === 'blitz' ? 180 : mode === 'speed' ? 10 : 600
            });
        }
    }, [user, cleanup, findBestMatch]);

    // Cancel matchmaking
    const cancelMatchmaking = useCallback(async () => {
        await cleanup();
        setIsSearching(false);
        setMatchedRoom(null);
    }, [cleanup]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            cleanup();
        };
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
