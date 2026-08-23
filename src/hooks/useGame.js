import { useState, useEffect, useCallback, useRef } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { getValidMoves } from '../utils/quantumChess';
import { audioSys } from '../utils/audioSys';
import { fxSys } from '../utils/fxSys';
import { v4 as uuidv4 } from 'uuid';

export function useGame(roomInfo, user) {
    const [gameState, setGameState] = useState(null);
    const [selectedPiece, setSelectedPiece] = useState(null);
    const [validMoves, setValidMoves] = useState([]);
    const [myColor, setMyColor] = useState('white');
    const [isMyTurn, setIsMyTurn] = useState(false);
    const [error, setError] = useState(null);
    const [lastMove, setLastMove] = useState(null);
    
    // UI optimistic state
    const [isSubmittingAction, setIsSubmittingAction] = useState(false);

    // Node 5 connection state prep
    const [connectionState, setConnectionState] = useState('CONNECTED'); // CONNECTED, RECONNECTING, WAITING_SYNC

    const { socket, isConnected } = useSocket();

    // Initialize audio
    useEffect(() => {
        const initAudio = () => audioSys.init();
        window.addEventListener('click', initAudio, { once: true });
        return () => window.removeEventListener('click', initAudio);
    }, []);

    // Handle connection state changes
    useEffect(() => {
        if (!isConnected && gameState && !gameState.gameOver) {
            setConnectionState('RECONNECTING');
        } else if (isConnected && connectionState === 'RECONNECTING') {
            setConnectionState('WAITING_SYNC');
            if (roomInfo?.id) {
                socket.emit('request_sync', { matchId: roomInfo.id });
            }
        }
    }, [isConnected, gameState, connectionState, roomInfo?.id, socket]);

    // Socket Event Listeners
    useEffect(() => {
        if (!socket || !roomInfo) return;

        const handleSyncState = (data) => {
            console.log('[Game] sync_state received', data);
            setGameState(data);
            setIsSubmittingAction(false);
            setConnectionState('CONNECTED');
            
            // Determine turn based on color
            const amIWhite = roomInfo.myColor === 'white';
            const expectedTurn = amIWhite ? 0 : 1;
            setIsMyTurn(data.turn === expectedTurn);
            
            // Update lastMove if history exists
            if (data.lastAction && data.lastAction.action.type === 'MOVE') {
                setLastMove(data.lastAction.action.payload);
            }
        };

        const handleMatchStart = (data) => {
            console.log('[Game] match_start received', data);
            setMyColor(roomInfo.myColor);
            handleSyncState(data);
        };

        const handleActionError = (data) => {
            console.error('[Game] action_error', data);
            setError(data.message);
            // Recover state by requesting sync
            socket.emit('request_sync', { matchId: roomInfo.id });
        };

        const handleOpponentDisconnected = (data) => {
            console.log('[Game] Opponent disconnected', data);
            // Node 5 will handle 2-min timeout. For now just show a visual indicator.
            // setError('Opponent disconnected. Waiting for reconnection...');
        };

        socket.on('match_start', handleMatchStart);
        socket.on('sync_state', handleSyncState);
        socket.on('action_error', handleActionError);
        socket.on('opponent_disconnected', handleOpponentDisconnected);

        return () => {
            socket.off('match_start', handleMatchStart);
            socket.off('sync_state', handleSyncState);
            socket.off('action_error', handleActionError);
            socket.off('opponent_disconnected', handleOpponentDisconnected);
        };
    }, [socket, roomInfo]);


    // Action: Select Piece (Purely UI)
    const selectPiece = useCallback((pieceIndex) => {
        if (!isMyTurn || isSubmittingAction || gameState?.gameOver) return;
        
        const pieceId = gameState.board[pieceIndex];
        if (pieceId === null) return;
        
        const piece = gameState.pieces.find(p => p.id === pieceId);
        const myTeamIndex = myColor === 'white' ? 0 : 1;
        
        if (piece && piece.team === myTeamIndex) {
            setSelectedPiece(piece);
            const moves = getValidMoves(piece, gameState.board, gameState.pieces);
            setValidMoves(moves);
            audioSys.play('select');
        }
    }, [isMyTurn, isSubmittingAction, gameState, myColor]);

    // Action: Click Square (Send MOVE)
    const clickSquare = useCallback((index) => {
        if (!isMyTurn || isSubmittingAction || !selectedPiece || gameState?.gameOver) return;

        const targetX = index % 8;
        const targetY = Math.floor(index / 8);

        const move = validMoves.find(m => m.x === targetX && m.y === targetY);
        
        if (move) {
            setIsSubmittingAction(true);
            setValidMoves([]);
            setSelectedPiece(null);

            const actionId = uuidv4();
            
            socket.emit('player_action', {
                actionId,
                version: gameState.version,
                action: {
                    type: 'MOVE',
                    payload: {
                        pieceId: selectedPiece.id,
                        toX: targetX,
                        toY: targetY
                    }
                }
            });

            audioSys.play(move.isCapture ? 'capture' : 'move');
        } else {
            // Clicked elsewhere, just deselect
            setSelectedPiece(null);
            setValidMoves([]);
        }
    }, [isMyTurn, isSubmittingAction, selectedPiece, validMoves, gameState, socket]);

    // Action: Resign
    const resign = useCallback(() => {
        if (gameState?.gameOver || isSubmittingAction) return;

        socket.emit('player_action', {
            actionId: uuidv4(),
            version: gameState.version,
            action: { type: 'RESIGN', payload: {} }
        });
        setIsSubmittingAction(true);
    }, [gameState, isSubmittingAction, socket]);

    // Sync clock from state
    useEffect(() => {
        if (gameState?.clock && !gameState.gameOver) {
            // we have authoritative ms
            const interval = setInterval(() => {
                const now = Date.now();
                const elapsed = now - gameState.clock.lastMoveAt;
                
                let newWhite = gameState.clock.white;
                let newBlack = gameState.clock.black;

                if (gameState.turn === 0) {
                    newWhite = Math.max(0, newWhite - elapsed);
                } else {
                    newBlack = Math.max(0, newBlack - elapsed);
                }
                
                // We don't want to trigger full re-renders 60 times a sec for the whole board,
                // but since GameScreen expects time in seconds, updating every sec is fine.
            }, 1000);
            return () => clearInterval(interval);
        }
    }, [gameState]);

    // Compute display times dynamically without state variable to reduce re-renders
    // Actually, `useGame` returns them, so we just calculate them on the fly based on current time
    // If it's static, it won't re-render GameScreen. 
    // We should use a local state for the visual timer.
    const [displayTime, setDisplayTime] = useState({ white: 600, black: 600 });
    
    useEffect(() => {
        if (!gameState?.clock) return;
        if (gameState.gameOver) {
            setDisplayTime({ 
                white: Math.ceil(gameState.clock.white / 1000), 
                black: Math.ceil(gameState.clock.black / 1000) 
            });
            return;
        }

        const interval = setInterval(() => {
            const now = Date.now();
            const elapsed = now - gameState.clock.lastMoveAt;
            let w = gameState.clock.white;
            let b = gameState.clock.black;
            if (gameState.turn === 0) w -= elapsed;
            else b -= elapsed;

            setDisplayTime({
                white: Math.max(0, Math.ceil(w / 1000)),
                black: Math.max(0, Math.ceil(b / 1000))
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [gameState]);

    return {
        gameState,
        selectedPiece,
        validMoves,
        myColor,
        isMyTurn,
        lastMove,
        selectPiece,
        clickSquare,
        resign,
        error,
        connectionState,
        whiteTime: displayTime.white,
        blackTime: displayTime.black
    };
}
