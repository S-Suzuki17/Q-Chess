import React, { useState, useEffect } from 'react';
import { Language } from '../locales/dict';
import { Board3D } from './Board3D';
import { tutorialDict } from '@/locales/rulesDict';
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
    const content = tutorialDict[lang] || tutorialDict.en;
    
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
    const instructions = content.steps[step];
    const targets: Record<number, {row: number, col: number}[]> = {
        0: [{row: 6, col: 4}], 1: [{row: 3, col: 7}],
        3: [{row: 1, col: 7}], 4: [{row: 3, col: 7}],
        6: [{row: 7, col: 4}], 7: [{row: 5, col: 5}],
        9: [{row: 3, col: 7}], 10: [{row: 5, col: 5}],
    };
    const validMoves = targets[step] || [];
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

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
            <div role="dialog" aria-modal="true" aria-label={content.title} className="w-full max-w-4xl max-h-[95dvh] overflow-y-auto bg-[#191714] border-2 border-[#B39A62]/30 rounded-xl flex flex-col md:flex-row shadow-2xl relative">
                <button onClick={onClose} aria-label={content.close} className="fixed top-4 right-4 w-11 h-11 rounded-full bg-[#191714] border border-[#B39A62] text-white text-2xl font-bold z-50">×</button>
                
                {/* Left: Board Demo */}
                <div className="w-full flex-shrink-0 md:w-1/2 p-0 bg-[#0b0c10] flex items-center justify-center relative aspect-square md:aspect-auto md:min-h-full">
                    <div className="w-full h-full md:min-h-full">
                        <Board3D lang={lang}
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
                            currentTurn={step >= 3 && step <= 5 || step >= 9 ? 'black' : 'white'}
                        />
                    </div>
                </div>

                {/* Right: Explanations */}
                <div className="w-full md:w-1/2 p-8 md:p-10 flex flex-col justify-center">
                    <h2 className="text-3xl font-serif text-[#D4B872] mb-6 tracking-widest">
                        {content.title}
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
                                {step === 11 ? content.play : content.next}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
