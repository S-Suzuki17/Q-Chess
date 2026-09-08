import React, { useState, useEffect } from 'react';
import { Language, dict } from '../locales/dict';
import { Board3D } from './Board3D';
import { Token } from '../lib/GameEngine';

interface Props {
    lang: Language;
    onClose: () => void;
}

const START_PROBS = { King: 1/16, Queen: 1/16, Rook: 2/16, Bishop: 2/16, Knight: 2/16, Pawn: 8/16 };
const DIAG_PROBS = { King: 0, Queen: 0.5, Rook: 0, Bishop: 0.5, Knight: 0, Pawn: 0 };
const ROOK_QUEEN_PROBS = { King: 0, Queen: 0.5, Rook: 0.5, Bishop: 0, Knight: 0, Pawn: 0 };
const KNIGHT_PROBS = { King: 0, Queen: 0, Rook: 0, Bishop: 0, Knight: 1, Pawn: 0 };
const QUEEN_PROBS = { King: 0, Queen: 1, Rook: 0, Bishop: 0, Knight: 0, Pawn: 0 };
const ROOK_PROBS = { King: 0, Queen: 0, Rook: 1, Bishop: 0, Knight: 0, Pawn: 0 };

export function InteractiveTutorial({ lang, onClose }: Props) {
    const t = { ...dict['en'], ...(dict[lang] || {}) } as any;
    
    const [step, setStep] = useState(0);
    const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);

    // Board State
    const [pieces, setPieces] = useState<any[]>([
        { id: 'w1', player: 'white', row: 6, col: 4, probabilities: START_PROBS },
        { id: 'b1', player: 'black', row: 1, col: 7, probabilities: START_PROBS },
    ]);

    // Handle Clicks
    const handlePieceClick = (id: string) => {
        if (step === 0 && id === 'w1') {
            setSelectedPieceId('w1');
            setStep(1);
        } else if (step === 3 && id === 'b1') {
            setSelectedPieceId('b1');
            setStep(4);
        } else if (step === 6 && id === 'w2') {
            setSelectedPieceId('w2');
            setStep(7);
        } else if (step === 9 && id === 'b1') {
            setSelectedPieceId('b1');
            setStep(10);
        } else if (selectedPieceId) {
            // Clicked another piece while having one selected. Is it a capture?
            const targetPiece = pieces.find(p => p.id === id);
            if (targetPiece) {
                handleSquareClick(targetPiece.row, targetPiece.col);
            }
        }
    };

    const handleSquareClick = (row: number, col: number) => {
        if (step === 1 && selectedPieceId === 'w1' && row === 3 && col === 7) {
            // Valid move diagonally
            movePiece('w1', 3, 7, DIAG_PROBS);
            setSelectedPieceId(null);
            setStep(2);
        } else if (step === 4 && selectedPieceId === 'b1' && row === 3 && col === 7) {
            // Valid capture (vertical 2 squares: Rook or Queen)
            capturePiece('w1');
            movePiece('b1', 3, 7, ROOK_QUEEN_PROBS);
            setSelectedPieceId(null);
            setStep(5);
        } else if (step === 7 && selectedPieceId === 'w2' && row === 5 && col === 5) {
            // Valid collapse move (L-shape move for Knight)
            movePiece('w2', 5, 5, KNIGHT_PROBS);
            setSelectedPieceId(null);
            setStep(8);
        } else if (step === 10 && selectedPieceId === 'b1' && row === 5 && col === 5) {
            // Valid multi-step collapse move (Diagonal move for piece that is Rook or Queen -> Queen)
            capturePiece('w2'); // capture the knight just for fun
            
            setPieces(prev => prev.map(p => {
                if (p.id === 'b1') {
                    return { ...p, row: 5, col: 5, probabilities: QUEEN_PROBS };
                }
                if (p.id === 'b2') {
                    // Constraint collapse: b1 is Queen, so b2 must be Rook
                    return { ...p, probabilities: ROOK_PROBS };
                }
                return p;
            }));
            
            setSelectedPieceId(null);
            setStep(11);
        } else {
            // Invalid click, deselect
            setSelectedPieceId(null);
            if (step === 1) setStep(0);
            if (step === 4) setStep(3);
            if (step === 7) setStep(6);
            if (step === 10) setStep(9);
        }
    };

    const movePiece = (id: string, toRow: number, toCol: number, newProbs: any) => {
        setPieces(prev => prev.map(p => 
            p.id === id ? { ...p, row: toRow, col: toCol, probabilities: newProbs } : p
        ));
    };

    const capturePiece = (id: string) => {
        setPieces(prev => prev.map(p => 
            p.id === id ? { ...p, isCaptured: true } : p
        ));
    };

    // Derived state for UI
    let instructions = "";
    let validMoves: {row: number, col: number}[] = [];

    if (step === 0 || step === 1) {
        instructions = lang === 'ja' 
            ? "1. 正体がわからない駒！\n\nこのチェスでは、動かすまで駒の「本当の姿」がわかりません！\nまずは白い駒をクリックして、光っているマスへ動かしてみてください。\n（大きく斜めに動いたので、この駒は「ビショップ」か「クイーン」のどちらかだと絞り込まれました！）" 
            : "1. Hidden Identities\n\nIn this chess game, you don't know what a piece is until it moves!\nClick the White piece and move it to the highlighted square. Because it moved diagonally, it MUST be a Bishop or a Queen.";
        if (step === 0) validMoves = [{ row: 6, col: 4 }];
        if (step === 1) validMoves = [{ row: 3, col: 7 }];
    } else if (step === 2) {
        instructions = lang === 'ja' 
            ? "素晴らしい！動かし方によって、少しずつ駒の正体がバレていくのがこのゲームのルールです。"
            : "Great! Based on how it moved, the game narrowed down what piece it could be.";
    } else if (step === 3 || step === 4) {
        instructions = lang === 'ja' 
            ? "2. 相手の駒を取る\n\n次は黒い駒をクリックして、さっきの白い駒を取ってみましょう。\n（まっすぐ２マス動いたので、この黒い駒は「ルーク」か「クイーン」だとわかりました！）"
            : "2. Capturing Pieces\n\nNow, click the Black piece and move it to capture the White piece. Because it moved straight forward 2 squares, it MUST be a Rook or a Queen.";
        if (step === 3) validMoves = [{ row: 1, col: 7 }];
        if (step === 4) validMoves = [{ row: 3, col: 7 }];
    } else if (step === 5) {
        instructions = lang === 'ja' 
            ? "相手の駒を倒しました！\n駒は、本当の正体がバレる前に盤面から退場することもあります。"
            : "Piece captured! A piece can be captured and removed from the board even before its true identity is fully revealed.";
    } else if (step === 6 || step === 7) {
        instructions = lang === 'ja' 
            ? "3. 正体が確定する瞬間\n\n新しい白い駒が現れました。光っているマスへ動かしてください。\n（L字型に動けるのは「ナイト」だけです！）"
            : "3. Revealing the True Identity\n\nA new White piece appeared. Move it to the highlighted square. Only a Knight can make an L-shape move!";
        if (step === 6) validMoves = [{ row: 7, col: 4 }];
        if (step === 7) validMoves = [{ row: 5, col: 5 }];
    } else if (step === 8) {
        instructions = lang === 'ja'
            ? "ナイトの正体が現れました！\n「これしかありえない！」という状況になると、駒がめくれて本当の姿を見せます。"
            : "The Knight is revealed! When there's only one possibility left, the piece flips over and shows its true face.";
    } else if (step === 9 || step === 10) {
        instructions = lang === 'ja'
            ? "4. 連鎖して正体がバレる！？\n\nもう一つ黒い駒が現れました（これもルークかクイーンのどちらかです）。\nさっきの黒い駒を斜めに動かして、白いナイトを取ってください。"
            : "4. Chain Reactions\n\nAnother Black piece appeared. Move the first Black piece diagonally to capture the White Knight.";
        if (step === 9) validMoves = [{ row: 3, col: 7 }];
        if (step === 10) validMoves = [{ row: 5, col: 5 }];
    } else if (step === 11) {
        instructions = lang === 'ja'
            ? "お見事です！\nこの黒い駒は「まっすぐ」にも「斜め」にも動きました。両方できるのは『クイーン』だけなので、クイーンに確定しました！\n\nさらに！クイーンは1人しかいないため、もう一つの黒い駒は自動的に『ルーク』だと確定しました。このように、推理パズルのように正体が連鎖して暴かれていくのがこのゲームの面白いところです！"
            : "Brilliant! The Black piece moved both straight and diagonally. Only a Queen can do both, so it's a Queen!\n\nAlso, since there's only one Queen, the other Black piece is instantly forced to be a Rook without even moving! This deduction puzzle is the heart of the game.";
    }
    const nextScenario = () => {
        if (step === 2) {
            setStep(3);
        } else if (step === 5) {
            // Add a new white piece for the final scenario
            setPieces(prev => [
                ...prev,
                { id: 'w2', player: 'white', row: 7, col: 4, probabilities: START_PROBS }
            ]);
            setStep(6);
        } else if (step === 8) {
            // Spawn b2 at [1, 0] with ROOK_QUEEN_PROBS
            setPieces(prev => [
                ...prev,
                { id: 'b2', player: 'black', row: 1, col: 0, probabilities: ROOK_QUEEN_PROBS }
            ]);
            setStep(9);
        } else if (step === 11) {
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-[#11100E]/95 z-[200] flex flex-col items-center justify-center p-4 backdrop-blur-md">
            <div className="w-full max-w-4xl max-h-[95dvh] overflow-y-auto bg-[#191714] border-2 border-[#B39A62]/30 rounded-xl flex flex-col md:flex-row shadow-2xl relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white text-2xl font-bold z-50">×</button>
                
                {/* Left: Board Demo */}
                <div className="w-full flex-shrink-0 md:w-1/2 p-0 bg-[#0b0c10] flex items-center justify-center relative aspect-square md:aspect-auto md:min-h-full">
                    <div className="w-full h-full md:min-h-full">
                        <Board3D 
                            tokens={pieces.filter(p => !p.isCaptured).map(p => ({
                                id: p.id,
                                player: p.player,
                                row: p.row,
                                col: p.col,
                                probabilities: p.probabilities,
                                promotedTo: p.promotedTo,
                                selected: p.id === selectedPieceId
                            })) as Token[]}
                            selectedTokenId={selectedPieceId}
                            validMoves={validMoves.map(m => ({ r: m.row, c: m.col }))}
                            moveHistory={[]}
                            onSquareClick={(r, c) => {
                                const clickedPiece = pieces.find(p => p.row === r && p.col === c && !p.isCaptured);
                                if (!selectedPieceId && clickedPiece) {
                                    handlePieceClick(clickedPiece.id);
                                } else if (selectedPieceId && clickedPiece && clickedPiece.player === pieces.find(p => p.id === selectedPieceId)?.player) {
                                    handleSquareClick(r, c);
                                } else {
                                    handleSquareClick(r, c);
                                }
                            }}
                            showMoveHints={true}
                            currentTurn="white"
                        />
                    </div>
                </div>

                {/* Right: Explanations */}
                <div className="w-full md:w-1/2 p-8 md:p-10 flex flex-col justify-center">
                    <h2 className="text-3xl font-serif text-[#D4B872] mb-6 tracking-widest">
                        {lang === 'ja' ? 'ルールの説明' : 'How to Play'}
                    </h2>

                    <div className="text-gray-300 leading-relaxed text-lg flex-1 min-h-[160px] whitespace-pre-wrap">
                        {instructions}
                    </div>

                    <div className="flex justify-end mt-8 pt-6 border-t border-gray-800">
                        {(step === 2 || step === 5 || step === 8 || step === 11) && (
                            <button 
                                onClick={nextScenario}
                                className="px-8 py-3 bg-[#B39A62]/20 border border-[#B39A62] text-[#D4B872] hover:bg-[#B39A62] hover:text-[#11100E] transition-colors font-bold tracking-widest"
                            >
                                {step === 11 ? (lang === 'ja' ? 'ゲームを始める！' : 'START PLAYING!') : (lang === 'ja' ? '次へ' : 'NEXT')}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
