import React, { useState, useEffect, useRef } from 'react';
import { Language } from '../locales/dict';
import { Board3D } from './Board3D';
import { tutorialDict } from '@/locales/rulesDict';
import { Token } from '../lib/GameEngine';
import { recordTutorialCompleted, recordTutorialStarted } from '../lib/engagementMetrics';
import { QubeTeacher } from './QubeTeacher';
import { useReducedMotion } from '../hooks/useReducedMotion';

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
    const reducedMotion = useReducedMotion();
    const returnFocusRef = useRef<HTMLElement | null>(null);

    // Save previous active element for focus restoration on close
    useEffect(() => {
        returnFocusRef.current = document.activeElement as HTMLElement | null;
        recordTutorialStarted();
        return () => {
            if (returnFocusRef.current && typeof returnFocusRef.current.focus === 'function') {
                returnFocusRef.current.focus();
            }
        };
    }, []);

    const [step, setStep] = useState(0);
    const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
    const [isDemoPlaying, setIsDemoPlaying] = useState(false);
    const [statusHint, setStatusHint] = useState<string | null>(null);

    // Board State
    const [pieces, setPieces] = useState<any[]>([
        { id: 'w1', player: 'white', row: 6, col: 4, probabilities: START_PROBS },
        { id: 'b1', player: 'black', row: 1, col: 7, probabilities: START_PROBS },
    ]);

    // Handle Clicks
    const handlePieceClick = (id: string) => {
        setStatusHint(null);
        if (isDemoPlaying) return;

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
        if (isDemoPlaying) return;

        if (step === 1 && selectedPieceId === 'w1' && row === 3 && col === 7) {
            // Valid move diagonally (Practice completed)
            movePiece('w1', 3, 7, DIAG_PROBS);
            setSelectedPieceId(null);
            setStatusHint(null);
            setStep(2);
        } else if (step === 4 && selectedPieceId === 'b1' && row === 3 && col === 7) {
            // Valid capture (vertical 2 squares: Rook or Queen)
            capturePiece('w1');
            movePiece('b1', 3, 7, ROOK_QUEEN_PROBS);
            setSelectedPieceId(null);
            setStatusHint(null);
            setStep(5);
        } else if (step === 7 && selectedPieceId === 'w2' && row === 5 && col === 5) {
            // Valid collapse move (L-shape move for Knight)
            movePiece('w2', 5, 5, KNIGHT_PROBS);
            setSelectedPieceId(null);
            setStatusHint(null);
            setStep(8);
        } else if (step === 10 && selectedPieceId === 'b1' && row === 5 && col === 5) {
            // Valid multi-step collapse move (Diagonal move for piece that is Rook or Queen -> Queen)
            capturePiece('w2');
            
            setPieces(prev => prev.map(p => {
                if (p.id === 'b1') {
                    return { ...p, row: 5, col: 5, probabilities: QUEEN_PROBS };
                }
                if (p.id === 'b2') {
                    // Constraint collapse: b1 is Queen, so b2 must be Rook (Piece count constraint)
                    return { ...p, probabilities: ROOK_PROBS };
                }
                return p;
            }));
            
            setSelectedPieceId(null);
            setStatusHint(null);
            setStep(11);
        } else {
            // Invalid click, deselect and offer safe recovery without advancing
            setSelectedPieceId(null);
            if (step === 1) {
                setStep(0);
                setStatusHint(lang === 'ja' ? '光っているマス（h5）を選択してください。やり直せます。' : 'Please tap the highlighted target square (h5). You can retry safely.');
            } else if (step === 4) {
                setStep(3);
                setStatusHint(lang === 'ja' ? '白の駒がいる光っているマス（h5）を選択してください。' : 'Please tap the highlighted square with White piece (h5).');
            } else if (step === 7) {
                setStep(6);
                setStatusHint(lang === 'ja' ? '光っているマス（f3）を選択してください。' : 'Please tap the highlighted target square (f3).');
            } else if (step === 10) {
                setStep(9);
                setStatusHint(lang === 'ja' ? '光っている白ナイトのマス（f3）を選択してください。' : 'Please tap the highlighted White Knight square (f3).');
            }
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

    // Review Demo action: visually demonstrate diagonal deduction
    const handlePlayDemo = () => {
        if (isDemoPlaying) return;
        setIsDemoPlaying(true);
        setSelectedPieceId('w1');
        setStatusHint(lang === 'ja' ? '【見本実演中】斜めに動くことで、ビショップまたはクイーンに候補が絞り込まれます！' : '[Demo Playing] Moving diagonally narrows down candidates to Bishop or Queen!');

        const duration = reducedMotion ? 200 : 900;
        setTimeout(() => {
            movePiece('w1', 3, 7, DIAG_PROBS);
            setSelectedPieceId(null);
            setTimeout(() => {
                // Revert to initial practice state so user can practice
                setPieces([
                    { id: 'w1', player: 'white', row: 6, col: 4, probabilities: START_PROBS },
                    { id: 'b1', player: 'black', row: 1, col: 7, probabilities: START_PROBS },
                ]);
                setIsDemoPlaying(false);
                setStatusHint(lang === 'ja' ? '【類題に挑戦】場所を変えた白の駒（e2）を、斜め（h5）へ動かしてみましょう！' : '[Try Practice] Now tap the White piece (e2) and move it diagonally to h5!');
                setStep(0);
            }, reducedMotion ? 400 : 1500);
        }, duration);
    };

    // Reset current scenario to retry safely
    const handleResetScenario = () => {
        setSelectedPieceId(null);
        setStatusHint(null);
        if (step <= 2) {
            setPieces([
                { id: 'w1', player: 'white', row: 6, col: 4, probabilities: START_PROBS },
                { id: 'b1', player: 'black', row: 1, col: 7, probabilities: START_PROBS },
            ]);
            setStep(0);
        } else if (step <= 5) {
            setPieces([
                { id: 'w1', player: 'white', row: 3, col: 7, probabilities: DIAG_PROBS },
                { id: 'b1', player: 'black', row: 1, col: 7, probabilities: START_PROBS },
            ]);
            setStep(3);
        } else if (step <= 8) {
            setPieces([
                { id: 'w1', player: 'white', row: 3, col: 7, probabilities: DIAG_PROBS, isCaptured: true },
                { id: 'b1', player: 'black', row: 3, col: 7, probabilities: ROOK_QUEEN_PROBS },
                { id: 'w2', player: 'white', row: 7, col: 4, probabilities: START_PROBS },
            ]);
            setStep(6);
        } else {
            setPieces([
                { id: 'w1', player: 'white', row: 3, col: 7, probabilities: DIAG_PROBS, isCaptured: true },
                { id: 'b1', player: 'black', row: 3, col: 7, probabilities: ROOK_QUEEN_PROBS },
                { id: 'w2', player: 'white', row: 5, col: 5, probabilities: KNIGHT_PROBS },
                { id: 'b2', player: 'black', row: 1, col: 0, probabilities: ROOK_QUEEN_PROBS },
            ]);
            setStep(9);
        }
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
        const onKeyDown = (event: KeyboardEvent) => { 
            if (event.key === 'Escape') onClose(); 
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    const nextScenario = () => {
        setStatusHint(null);
        if (step === 2) {
            setStep(3);
        } else if (step === 5) {
            // Add a new white piece for the knight scenario
            setPieces(prev => [
                ...prev,
                { id: 'w2', player: 'white', row: 7, col: 4, probabilities: START_PROBS }
            ]);
            setStep(6);
        } else if (step === 8) {
            // Spawn b2 at [1, 0] with ROOK_QUEEN_PROBS for piece-count constraint demo
            setPieces(prev => [
                ...prev,
                { id: 'b2', player: 'black', row: 1, col: 0, probabilities: ROOK_QUEEN_PROBS }
            ]);
            setStep(9);
        } else if (step === 11) {
            recordTutorialCompleted();
            onClose();
        }
    };

    // In step 11, highlight both b1 (confirmed Queen) and b2 (unmoved piece constrained to Rook)
    const constraintHighlightOpponent = step === 11 ? 'b2' : undefined;

    return (
        <div className="interactive-tutorial fixed inset-0 bg-[#11100E]/95 z-[200] flex flex-col items-center justify-center p-3 sm:p-4 backdrop-blur-md">
            <div role="dialog" aria-modal="true" aria-label={content.title} className="w-full max-w-4xl max-h-[96dvh] overflow-y-auto bg-[#191714] border-2 border-[#B39A62]/30 rounded-xl flex flex-col md:flex-row shadow-2xl relative">
                <button onClick={onClose} aria-label={content.close} className="fixed top-4 right-4 w-11 h-11 rounded-full bg-[#191714] border border-[#B39A62] text-white text-2xl font-bold z-50 flex items-center justify-center hover:bg-[#B39A62]/20 transition-colors">×</button>
                
                {/* Left: Board Demo */}
                <div className="w-full flex-shrink-0 md:w-1/2 p-0 bg-[#0b0c10] flex flex-col items-center justify-center relative aspect-square md:aspect-auto md:min-h-full">
                    <div className="w-full h-full md:min-h-full">
                        <Board3D lang={lang}
                            tokens={pieces.filter(p => !p.isCaptured).map(p => ({
                                id: p.id,
                                player: p.player,
                                row: p.row,
                                col: p.col,
                                probabilities: p.probabilities,
                                promotedTo: p.promotedTo,
                                selected: p.id === selectedPieceId || (step === 11 && (p.id === 'b1' || p.id === 'b2'))
                            })) as Token[]}
                            selectedTokenId={selectedPieceId || (step === 11 ? 'b1' : null)}
                            opponentSelectedTokenId={constraintHighlightOpponent}
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
                            currentTurn={((step >= 3 && step <= 5) || step >= 9) ? 'black' : 'white'}
                        />
                    </div>
                </div>

                {/* Right: Explanations & Controls */}
                <div className="w-full md:w-1/2 p-5 sm:p-8 md:p-10 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-2xl sm:text-3xl font-serif text-[#D4B872] tracking-widest">
                                {content.title}
                            </h2>
                            <div className="text-xs font-mono text-[#B39A62]/80 uppercase px-2 py-1 rounded bg-[#B39A62]/10 border border-[#B39A62]/20">
                                {step <= 2 ? (lang === 'ja' ? '第1章: 斜め移動' : 'Part 1: Diagonals') :
                                 step <= 5 ? (lang === 'ja' ? '第2章: 直線捕獲' : 'Part 2: Capture') :
                                 step <= 8 ? (lang === 'ja' ? '第3章: ナイト確定' : 'Part 3: Knight') :
                                 (lang === 'ja' ? '第4章: 駒数制約' : 'Part 4: Constraints')}
                            </div>
                        </div>

                        <QubeTeacher lang={lang} className="flex-1 mb-4">
                            <div data-tutorial-step={step} aria-live="polite" aria-atomic="true" className="text-gray-300 leading-relaxed text-sm sm:text-base min-h-[140px] whitespace-pre-wrap">
                                {instructions}
                            </div>
                        </QubeTeacher>

                        {/* Status / feedback message */}
                        {statusHint && (
                            <div data-tutorial-status className="mb-4 p-3 rounded-lg bg-[#B39A62]/15 border border-[#B39A62]/40 text-[#E8E2D7] text-xs sm:text-sm animate-fadeIn" role="status">
                                {statusHint}
                            </div>
                        )}

                        {/* Step 11 Piece Count Constraint Highlight */}
                        {step === 11 && (
                            <div data-tutorial-constraint-banner className="mb-4 p-3 rounded-lg bg-[#2A241A] border-2 border-[#D4B872] text-[#F5EAD4] text-xs sm:text-sm">
                                <div className="font-bold text-[#D4B872] mb-1">
                                    {lang === 'ja' ? '★ クイーン枠の制約（1体のみ）' : '★ Queen Slot Constraint (Max 1)'}
                                </div>
                                <div>
                                    {lang === 'ja'
                                        ? '盤面上のクイーンは1体のみです。b1がクイーンと確定したため、未移動駒（b2 / a7）のクイーン可能性が消滅し、残ったルークに確定しました。'
                                        : 'Only 1 Queen is allowed per side. Because b1 is verified as Queen, the unmoved piece (b2 / a7) loses its Queen candidate and is confirmed as a Rook.'}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Bottom Action Buttons */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-gray-800 mt-2">
                        <div className="flex items-center gap-2">
                            {/* Review Demo button (available in step 0, 1, 2) */}
                            {step <= 2 && (
                                <button
                                    data-tutorial-review-demo
                                    onClick={handlePlayDemo}
                                    disabled={isDemoPlaying}
                                    className="px-3 sm:px-4 py-2 bg-[#B39A62]/15 border border-[#B39A62]/40 text-[#D4B872] hover:bg-[#B39A62]/30 text-xs sm:text-sm font-semibold rounded transition-colors disabled:opacity-50"
                                    aria-label={content.reviewDemo}
                                >
                                    ▶ {content.reviewDemo}
                                </button>
                            )}

                            {/* Reset button to retry current scenario */}
                            <button
                                data-tutorial-reset
                                onClick={handleResetScenario}
                                disabled={isDemoPlaying}
                                className="px-3 sm:px-4 py-2 bg-gray-800/60 border border-gray-700 text-gray-300 hover:text-white hover:bg-gray-700/60 text-xs sm:text-sm font-medium rounded transition-colors disabled:opacity-50"
                                aria-label={content.resetStep}
                            >
                                ↺ {content.resetStep}
                            </button>
                        </div>

                        {/* Next or Finish button */}
                        {(step === 2 || step === 5 || step === 8 || step === 11) && (
                            <button
                                data-tutorial-next
                                onClick={nextScenario}
                                className="px-6 sm:px-8 py-2.5 sm:py-3 bg-[#B39A62]/20 border border-[#B39A62] text-[#D4B872] hover:bg-[#B39A62] hover:text-[#11100E] transition-colors font-bold tracking-widest text-sm sm:text-base rounded shadow-lg"
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
