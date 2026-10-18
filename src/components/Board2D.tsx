import React, { useRef, useState } from 'react';
import { QuantumPieceUI } from './QuantumPieceUI';
import { Token } from '../lib/GameEngine';
import { PieceType } from '../config/gameConfig';
import type { MoveRecord } from '../lib/gameRecordService';
import { HintArrow2D } from './HintArrow2D';
import { rewardBoard, type BoardFinish } from '../config/campaign';
import { nextBoardFocus } from './boardKeyboard';
import { matchText } from '../locales/matchText';

const PIECE_NAMES: Record<PieceType, string> = {King:'キング', Queen:'クイーン', Rook:'ルーク', Bishop:'ビショップ', Knight:'ナイト', Pawn:'ポーン'};

export interface Board2DProps {
    lang?: string;
    boardFinish?:BoardFinish;
    quietLayout?: boolean;
    autoRotate?: boolean;
    onlineRole?: 'white' | 'black' | 'spectator';
    showCheckWarning?: boolean;
    currentTurn?: 'white' | 'black';
    isFlipped?: boolean;
    tokens: Token[];
    selectedTokenId: string | null;
    opponentSelectedTokenId?: string | null;
    validMoves: {r: number, c: number}[];
    moveHistory: MoveRecord[];
    onSquareClick: (row: number, col: number) => void;
    showMoveHints: boolean;
    candidatesMap?: Map<string, ReadonlySet<PieceType>>;
    boardDesign?: 'classic' | 'marble' | 'neon';
    hintMove?: { fromRow: number, fromCol: number, toRow: number, toCol: number } | null;
}

export function Board2D({ 
    lang = 'en',
    quietLayout = false,
    isFlipped: flipped,
    onlineRole,
    currentTurn,
    tokens,
    selectedTokenId,
    opponentSelectedTokenId,
    validMoves,
    moveHistory,
    onSquareClick,
    showMoveHints,
    candidatesMap,
    boardDesign = 'classic',
    boardFinish = 'standard',
    hintMove
}: Board2DProps) {
    const isFlipped = flipped ?? (onlineRole === 'black');
    const [focusedSquare, setFocusedSquare] = useState(() => isFlipped ? 7 : 56);
    const squares = useRef<Array<HTMLDivElement | null>>([]);
    const selectedToken = tokens.find(t => !t.isCaptured && t.id === selectedTokenId);
    const isEnemySelected = selectedToken ? selectedToken.player !== (onlineRole && onlineRole !== 'spectator' ? onlineRole : currentTurn) : false;
    const renderMoves = showMoveHints ? validMoves : [];
    const lastMove = moveHistory.length > 0 ? moveHistory[moveHistory.length - 1] : null;
    const finish=rewardBoard(boardFinish);

    return (
        <div className="board-2d w-full h-full flex items-center justify-center" style={{ containerType: 'size' }}>
        <div
            className="aspect-square w-full relative shadow-2xl mx-auto rounded-md overflow-hidden border-4 border-[#B39A62]/30"
            style={{ 
                width: 'min(100cqw, 100cqh, 900px)',
                flexShrink: 0,
                background: finish?.frameColor ?? (boardDesign === 'marble' ? '#a0a0a0' : boardDesign === 'neon' ? '#180a24' : '#11100E'),
                borderColor: finish?.rim,
                transform: isFlipped ? 'rotate(180deg)' : 'none'
            }}
        >
            {/* 8x8 Grid */}
            <div className="absolute inset-0 grid grid-cols-8 grid-rows-8">
                {Array.from({ length: 64 }).map((_, i) => {
                    const row = Math.floor(i / 8);
                    const col = i % 8;
                    const isDark = (row + col) % 2 === 1;
                    const isMoveCandidate = renderMoves.some(m => m.r === row && m.c === col);
                    const isHintTo = hintMove && hintMove.toRow === row && hintMove.toCol === col;
                    const isHintFrom = hintMove && hintMove.fromRow === row && hintMove.fromCol === col;
                    const isLastMove = lastMove && ((lastMove.from[0] === row && lastMove.from[1] === col) || (lastMove.to[0] === row && lastMove.to[1] === col));
                    const isSelectedSquare = selectedToken?.row === row && selectedToken?.col === col;
                    const occupant = tokens.find(token => !token.isCaptured && token.row === row && token.col === col);
                    const possibleTypes = occupant?.promotedTo ? [occupant.promotedTo] : occupant
                        ? (Object.keys(occupant.probabilities) as PieceType[]).filter(type => candidatesMap?.get(occupant.id)?.has(type) ?? occupant.probabilities[type] > 0) : [];
                    const squareLabel = [
                        `${String.fromCharCode(97 + col)}${8 - row}`,
                        occupant && matchText(lang, occupant.player === 'white' ? '白' : '黒', occupant.player === 'white' ? 'White' : 'Black'),
                        possibleTypes.map(type => matchText(lang, PIECE_NAMES[type], type)).join(' / '),
                        isMoveCandidate && matchText(lang, '移動先', 'Move to'),
                    ].filter(Boolean).join(' · ');

                    let bgClass = quietLayout
                        ? (isDark ? 'bg-[#343c30]' : 'bg-[#737c65]')
                        : (isDark ? 'bg-[#b58863]' : 'bg-[#f0d9b5]');
                    if (boardDesign === 'marble') bgClass = isDark ? 'bg-[#54636e]' : 'bg-[#c7cfd1]';
                    if (boardDesign === 'marble') bgClass = isDark ? 'bg-[#54636e]' : 'bg-[#c7cfd1]';
                    if (boardDesign === 'neon') bgClass = isDark ? 'bg-[#6a00ff]' : 'bg-[#00e5ff]'; // visible contrast

                    
                    return (
                        <div 
                            key={i} 
                            ref={element => { squares.current[i] = element; }}
                            style={finish ? {backgroundColor:isDark ? finish.dark : finish.light} : undefined}
                            role="button"
                            tabIndex={focusedSquare === i ? 0 : -1}
                            aria-label={squareLabel}
                            aria-pressed={isSelectedSquare}
                            data-square={`${String.fromCharCode(97 + col)}${8 - row}`}
                            data-move-target={isMoveCandidate}
                            data-hint-owner={isMoveCandidate ? (isEnemySelected ? 'opponent' : 'self') : undefined}
                            data-last-move={!!isLastMove}
                            onFocus={() => setFocusedSquare(i)}
                            onKeyDown={event => {
                                if (event.altKey || event.metaKey) return;
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault(); onSquareClick(row, col); return;
                                }
                                const next = nextBoardFocus(i, event.key, isFlipped, event.ctrlKey);
                                if (next !== null) {
                                    event.preventDefault(); setFocusedSquare(next);
                                    squares.current[next]?.focus({preventScroll:true});
                                    squares.current[next]?.scrollIntoView({block:'nearest', inline:'nearest', behavior:'instant'});
                                }
                            }}
                            onClick={() => onSquareClick(row, col)}
                            className={`w-full h-full relative cursor-pointer transition-colors ${bgClass} ${isMoveCandidate ? 'hover:brightness-110' : ''}`} 
                        >
                            {isLastMove && <div className="absolute inset-0 bg-[#dfc782]/25 border-2 border-[#dfc782]/50 pointer-events-none" />}
                            {isSelectedSquare && <div className="absolute inset-0 border-[3px] border-[#f3d48b] bg-[#e2bf69]/20 pointer-events-none" />}
                            {(col === 0 || row === 7) && <span className="absolute left-0.5 bottom-0 text-[9px] text-[#f4efdb] pointer-events-none z-[1]" style={{color:finish?(isDark?finish.light:finish.dark):undefined,transform:isFlipped ? 'rotate(180deg)' : 'none'}}>{col === 0 && row !== 7 ? 8 - row : String.fromCharCode(97 + col)}</span>}
                            {isMoveCandidate && (
                                <div className="absolute inset-0 grid place-items-center pointer-events-none">
                                    <span className={occupant ? 'absolute inset-[3%] rounded-full border-[3px] border-[#f2ad83]' : `w-[22%] h-[22%] rounded-full border ${isEnemySelected ? 'bg-[#efa183]/80 border-[#f6c5ad]' : 'bg-[#f3db9c]/75 border-[#fff1c5]'}`} />
                                </div>
                            )}
                            {isHintFrom && (
                                <div className="absolute inset-0 border-4 border-blue-500 shadow-[inset_0_0_15px_rgba(59,130,246,0.5)] pointer-events-none " />
                            )}
                            {isHintTo && (
                                <div className="absolute inset-0 border-4 border-green-500 shadow-[inset_0_0_15px_rgba(34,197,94,0.5)] pointer-events-none " />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Pieces */}
            {tokens.filter(token => !token.isCaptured).map(token => {
                const isSelected = selectedTokenId === token.id;
                const candidates = candidatesMap?.get(token.id);
                
                return (
                    <div 
                        key={token.id}
                        data-piece-overlay={token.id} aria-hidden="true"
                        className="absolute flex items-center justify-center cursor-pointer pointer-events-none"
                        style={{
                            width: '12.5%',
                            height: '12.5%',
                            left: `${token.col * 12.5}%`,
                            top: `${token.row * 12.5}%`,
                            zIndex: isSelected ? 50 : 20,
                            transition: 'left 0.3s ease, top 0.3s ease, transform 0.2s ease',
                            transform: isSelected ? 'translateY(-5px) scale(1.1)' : 'scale(1)'
                        }}
                    >
                        <div 
                            className="w-full h-full scale-[0.94] flex items-center justify-center pointer-events-none"
                            style={{ transform: isFlipped ? 'rotate(180deg)' : 'none' }}
                        >
                            <QuantumPieceUI 
                                id={token.id}
                                player={token.player}
                                probabilities={token.probabilities}
                                candidates={candidates}
                                isSelected={isSelected}
                                isOpponentSelected={opponentSelectedTokenId === token.id}
                                responsive
                                onClick={() => {}}
                                promotedTo={token.promotedTo}
                            />
                        </div>
                    </div>
                );
            })}
            {hintMove && <HintArrow2D move={hintMove} flipped={isFlipped}/>}
        </div>
        </div>
    );
}
