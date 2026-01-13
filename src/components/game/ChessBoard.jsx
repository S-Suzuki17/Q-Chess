/**
 * ChessBoard Component
 * Renders the 8x8 chess board with pieces
 */
import React from 'react';
import PieceComponent from './PieceComponent';
import FXCanvas from './FXCanvas';
import { SYMBOLS } from '../../utils/quantumChess';
function ChessBoard({ gameState, selectedPiece, validMoves, lastMove, onSelectPiece, onClickSquare, myColor }) {
    // White is at bottom (rows 0-1 visually at bottom), black at top
    // When playing as white, we DON'T flip (white at bottom)
    // When playing as black, we flip (black at bottom)
    const isFlipped = myColor === 'black';

    const renderSquare = (index) => {
        // Display index maps visual position to board position
        // Without flip: visual row 0 = board row 7 (top shows black's back row)
        // With flip: visual row 0 = board row 0 (top shows white's back row)
        const displayIndex = isFlipped ? index : 63 - index;
        const x = displayIndex % 8;
        const y = Math.floor(displayIndex / 8);

        const isLight = (x + y) % 2 === 0;
        const pieceId = gameState?.board[y * 8 + x];
        const piece = pieceId !== null ? gameState?.pieces.find(p => p.id === pieceId) : null;

        const isSelected = selectedPiece?.id === piece?.id;
        const isValidMove = validMoves.some(m => m.x === x && m.y === y && !m.isCapture);
        const isValidCapture = validMoves.some(m => m.x === x && m.y === y && m.isCapture);
        const isLastMoveFrom = lastMove && lastMove.from.x === x && lastMove.from.y === y;
        const isLastMoveTo = lastMove && lastMove.to.x === x && lastMove.to.y === y;

        const squareClasses = [
            'chess-square',
            isLight ? 'light' : 'dark',
            isSelected && 'selected',
            isValidMove && 'valid-move',
            isValidCapture && 'valid-capture',
            (isLastMoveFrom || isLastMoveTo) && 'last-move',
        ].filter(Boolean).join(' ');

        const handleClick = (e) => {
            e.stopPropagation(); // Prevent bubbling
            if (piece && !piece.captured && (piece.team === (myColor === 'white' ? 0 : 1))) {
                // Select my piece
                onSelectPiece(piece);
            } else if (isValidMove || isValidCapture) {
                // Move to square
                onClickSquare(x, y);
            } else {
                // Click elsewhere (deselect)
                onClickSquare(x, y); // This usually handles deselect in useGame
            }
        };

        return (
            <div
                key={index}
                className={squareClasses}
                onClick={handleClick}
                style={{ cursor: (piece?.team === (myColor === 'white' ? 0 : 1) || isValidMove) ? 'pointer' : 'default' }}
            >
                {piece && !piece.captured && (
                    <PieceComponent piece={piece} />
                )}
            </div>
        );
    };

    const boardSquares = React.useMemo(() => {
        return Array.from({ length: 64 }, (_, i) => renderSquare(i));
    }, [gameState, selectedPiece, validMoves, lastMove, myColor, isFlipped]); // Dependencies for re-rendering board

    return (
        <div className="chess-board" style={{ position: 'relative' }}>
            <FXCanvas />
            {boardSquares}
        </div>
    );
}

export default React.memo(ChessBoard);
