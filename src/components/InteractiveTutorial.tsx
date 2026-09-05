import React, { useState, useEffect } from 'react';
import { Language, dict } from '../locales/dict';
import { AnimatedDemoBoard, DemoPiece } from './AnimatedDemoBoard';

interface Props {
    lang: Language;
    onClose: () => void;
}

const START_PROBS = { King: 1/16, Queen: 1/16, Rook: 2/16, Bishop: 2/16, Knight: 2/16, Pawn: 8/16 };
const DIAG_PROBS = { King: 0, Queen: 0.5, Rook: 0, Bishop: 0.5, Knight: 0, Pawn: 0 };
const ROOK_QUEEN_PROBS = { King: 0, Queen: 0.5, Rook: 0.5, Bishop: 0, Knight: 0, Pawn: 0 };
const KNIGHT_PROBS = { King: 0, Queen: 0, Rook: 0, Bishop: 0, Knight: 1, Pawn: 0 };

export function InteractiveTutorial({ lang, onClose }: Props) {
    const t = { ...dict['en'], ...(dict[lang] || {}) } as any;
    
    const [step, setStep] = useState(0);
    const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);

    // Board State
    // b1 is at [1, 7] so that moving to [3, 7] to capture is a vertical move of length 2
    const [pieces, setPieces] = useState<DemoPiece[]>([
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
        } else {
            // Invalid click, deselect
            setSelectedPieceId(null);
            if (step === 1) setStep(0);
            if (step === 4) setStep(3);
            if (step === 7) setStep(6);
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
            ? "1. 量子的な重ね合わせ\n\n白い駒をクリックして選択し、光っているマスへ移動させてください。斜めに長距離移動すると、ビショップかクイーンの可能性に絞り込まれます。" 
            : "1. Quantum Superposition\n\nClick the White piece and move it to the highlighted square. Moving diagonally over a distance eliminates everything except Bishop and Queen.";
        if (step === 0) validMoves = [{ row: 6, col: 4 }];
        if (step === 1) validMoves = [{ row: 3, col: 7 }];
    } else if (step === 2) {
        instructions = lang === 'ja' 
            ? "見事です！軌跡から正体が推論され、「波束の収縮」が起きました。"
            : "Excellent! The identity was deduced from the path, triggering a 'Wavefunction Collapse'.";
    } else if (step === 3 || step === 4) {
        instructions = lang === 'ja' 
            ? "2. 駒取り\n\n次に、黒い駒をクリックして、先ほどの白い駒を取ってみましょう。縦に2マス動いたため、ルークかクイーンに絞り込まれます。"
            : "2. Capturing\n\nNow, click the Black piece and move it to capture the White piece. Moving vertically 2 squares eliminates everything except Rook and Queen.";
        if (step === 3) validMoves = [{ row: 1, col: 7 }];
        if (step === 4) validMoves = [{ row: 3, col: 7 }];
    } else if (step === 5) {
        instructions = lang === 'ja' 
            ? "駒を取りました！取られた駒は正体が完全に判明する前に盤面から消滅します。"
            : "Piece captured! Captured pieces are removed before their true identity is ever fully revealed.";
    } else if (step === 6 || step === 7) {
        instructions = lang === 'ja' 
            ? "3. 完全な確定\n\n新しい白駒が現れました。これを光っているマスへ動かしてください。このL字型の動きは「ナイト」にしかできません。"
            : "3. Absolute Collapse\n\nA new White piece appeared. Move it to the highlighted square. This L-shape move is ONLY possible for a Knight.";
        if (step === 6) validMoves = [{ row: 7, col: 4 }];
        if (step === 7) validMoves = [{ row: 5, col: 5 }];
    } else if (step === 8) {
        instructions = lang === 'ja'
            ? "ナイトが確定しました！可能性が1つに絞られると、正体が全員に公開されます。このように相手のキングをあぶり出し、追い詰めるのがゲームの目的です。"
            : "The Knight is revealed! When probability drops to exactly one type, the piece is fully revealed. Forcing the enemy King to reveal itself is key to victory.";
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
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-[#11100E]/95 z-[200] flex flex-col items-center justify-center p-4 backdrop-blur-md">
            <div className="w-full max-w-4xl bg-[#191714] border-2 border-[#B39A62]/30 rounded-xl flex flex-col md:flex-row shadow-2xl relative overflow-hidden">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white text-2xl font-bold z-50">×</button>
                
                {/* Left: Board Demo */}
                <div className="w-full md:w-1/2 p-8 bg-[#0b0c10] flex items-center justify-center relative min-h-[300px]">
                    <AnimatedDemoBoard 
                        pieces={pieces} 
                        sizeClass="w-full max-w-[320px]" 
                        selectedPieceId={selectedPieceId}
                        validMoves={validMoves}
                        onPieceClick={handlePieceClick}
                        onSquareClick={handleSquareClick}
                    />
                </div>

                {/* Right: Explanations */}
                <div className="w-full md:w-1/2 p-8 md:p-10 flex flex-col justify-center">
                    <h2 className="text-3xl font-serif text-[#D4B872] mb-6 tracking-widest">
                        {lang === 'ja' ? 'インタラクティブ・チュートリアル' : 'Interactive Tutorial'}
                    </h2>

                    <div className="text-gray-300 leading-relaxed text-lg flex-1 min-h-[120px] whitespace-pre-wrap">
                        {instructions}
                    </div>

                    <div className="flex justify-end mt-8 pt-6 border-t border-gray-800">
                        {(step === 2 || step === 5 || step === 8) && (
                            <button 
                                onClick={nextScenario}
                                className="px-8 py-3 bg-[#B39A62]/20 border border-[#B39A62] text-[#D4B872] hover:bg-[#B39A62] hover:text-[#11100E] transition-colors font-bold tracking-widest"
                            >
                                {step === 8 ? (lang === 'ja' ? 'プレイ開始！' : 'START PLAYING!') : (lang === 'ja' ? '次へ' : 'NEXT')}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
