'use client';
import React, { useState, useEffect, useRef } from 'react';
import { AnimatedDemoBoard, DemoPiece } from './AnimatedDemoBoard';
import { Play, Pause, RotateCcw, ChevronRight, ChevronLeft } from 'lucide-react';

interface Frame {
    pieces: DemoPiece[];
    text: { en: string, ja: string };
    duration: number; // how long to wait before next frame (ms)
}

interface Scene {
    id: string;
    title: { en: string, ja: string };
    frames: Frame[];
}

const START_PROBS = { King: 1/16, Queen: 1/16, Rook: 2/16, Bishop: 2/16, Knight: 2/16, Pawn: 8/16 };
const DIAG_PROBS = { King: 0, Queen: 0.5, Rook: 0, Bishop: 0.5, Knight: 0, Pawn: 0 };
const KING_PROBS = { King: 1, Queen: 0, Rook: 0, Bishop: 0, Knight: 0, Pawn: 0 };

const SCENES: Scene[] = [
    {
        id: 'superposition',
        title: { en: '1. Quantum Superposition', ja: '1. 量子的な重ね合わせ' },
        frames: [
            {
                text: { 
                    en: 'All pieces start face-down as a superposition of all possible piece types.', 
                    ja: 'すべての駒は裏返った状態（重ね合わせ）でスタートします。最初はどれがキングでどれがポーンなのか、誰にもわかりません。'
                },
                duration: 4000,
                pieces: [
                    { id: 'w1', player: 'white', row: 6, col: 4, probabilities: START_PROBS },
                    { id: 'b1', player: 'black', row: 1, col: 4, probabilities: START_PROBS },
                ]
            }
        ]
    },
    {
        id: 'movement',
        title: { en: '2. Movement & Observation', ja: '2. 移動と波束の収縮' },
        frames: [
            {
                text: { 
                    en: 'Commanding a piece to move acts as an Observation. Let\'s move diagonally.', 
                    ja: '駒を移動させると、その軌跡から正体が推論（観測）されます。斜めに動かしてみましょう。' 
                },
                duration: 2500,
                pieces: [
                    { id: 'w1', player: 'white', row: 6, col: 4, probabilities: START_PROBS, isMoving: true },
                    { id: 'b1', player: 'black', row: 1, col: 4, probabilities: START_PROBS },
                ]
            },
            {
                text: { 
                    en: 'The piece moves. Since only Bishops and Queens can move long distances diagonally, its superposition collapses to just those two possibilities.', 
                    ja: '斜めに長距離移動できるのはビショップかクイーンだけです。そのため、他の駒である可能性は排除されます。' 
                },
                duration: 5000,
                pieces: [
                    { id: 'w1', player: 'white', row: 3, col: 7, probabilities: DIAG_PROBS },
                    { id: 'b1', player: 'black', row: 1, col: 4, probabilities: START_PROBS },
                ]
            }
        ]
    },
    {
        id: 'capture',
        title: { en: '3. Capturing', ja: '3. 駒取り' },
        frames: [
            {
                text: { 
                    en: 'Black decides to capture the white piece.', 
                    ja: '黒が白の駒を取りに行きます。' 
                },
                duration: 2000,
                pieces: [
                    { id: 'w1', player: 'white', row: 3, col: 7, probabilities: DIAG_PROBS },
                    { id: 'b1', player: 'black', row: 1, col: 4, probabilities: START_PROBS, isMoving: true },
                ]
            },
            {
                text: { 
                    en: 'The captured piece is removed from the board. You never learn what it truly was, unless it was the King (which ends the game).', 
                    ja: '取られた駒は盤上から取り除かれます。それが何だったのかは（キングでゲーム終了にならない限り）永遠に分かりません。' 
                },
                duration: 5000,
                pieces: [
                    { id: 'w1', player: 'white', row: 3, col: 7, probabilities: DIAG_PROBS, isCaptured: true },
                    { id: 'b1', player: 'black', row: 3, col: 7, probabilities: START_PROBS },
                ]
            }
        ]
    },
    {
        id: 'collapse',
        title: { en: '4. Absolute Collapse (Revealing)', ja: '4. 確定（コラプス）' },
        frames: [
            {
                text: { 
                    en: 'Now let\'s say another white piece makes a move that ONLY a King could make.', 
                    ja: '別の白駒が、「キングにしかできない移動」をしたとします。' 
                },
                duration: 2000,
                pieces: [
                    { id: 'w2', player: 'white', row: 7, col: 4, probabilities: START_PROBS, isMoving: true },
                    { id: 'b1', player: 'black', row: 3, col: 7, probabilities: START_PROBS },
                ]
            },
            {
                text: { 
                    en: 'When a piece\'s probability reaches 100%, it collapses completely and its true identity is revealed to everyone!', 
                    ja: '可能性が100%に絞り込まれると、その駒は完全にコラプス（確定）し、正体が全員に公開されます！' 
                },
                duration: 5000,
                pieces: [
                    { id: 'w2', player: 'white', row: 6, col: 3, probabilities: KING_PROBS },
                    { id: 'b1', player: 'black', row: 3, col: 7, probabilities: START_PROBS },
                ]
            }
        ]
    }
];

export function InteractiveRulesDemo({ lang }: { lang: 'en' | 'ja' }) {
    const [sceneIndex, setSceneIndex] = useState(0);
    const [frameIndex, setFrameIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(true);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    const currentScene = SCENES[sceneIndex];
    const currentFrame = currentScene.frames[frameIndex];

    useEffect(() => {
        if (!isPlaying) {
            if (timerRef.current) clearTimeout(timerRef.current);
            return;
        }

        timerRef.current = setTimeout(() => {
            if (frameIndex < currentScene.frames.length - 1) {
                setFrameIndex(prev => prev + 1);
            } else {
                // Wait a bit at the end of a scene, then don't auto-advance to next scene to let user read
                setIsPlaying(false);
            }
        }, currentFrame.duration);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [frameIndex, sceneIndex, isPlaying, currentFrame.duration]);

    const handleNextScene = () => {
        if (sceneIndex < SCENES.length - 1) {
            setSceneIndex(prev => prev + 1);
            setFrameIndex(0);
            setIsPlaying(true);
        }
    };

    const handlePrevScene = () => {
        if (sceneIndex > 0) {
            setSceneIndex(prev => prev - 1);
            setFrameIndex(0);
            setIsPlaying(true);
        }
    };

    const handleReplay = () => {
        setFrameIndex(0);
        setIsPlaying(true);
    };

    return (
        <div className="w-full bg-[#191714] border border-[#B39A62]/30 rounded-xl overflow-hidden shadow-2xl flex flex-col md:flex-row">
            {/* Left: Board Demo */}
            <div className="w-full md:w-1/2 p-6 bg-[#0b0c10] flex items-center justify-center relative min-h-[300px]">
                <AnimatedDemoBoard pieces={currentFrame.pieces} sizeClass="w-full max-w-[320px]" />
                
                {/* Controls overlay */}
                <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
                    <button 
                        onClick={handleReplay}
                        className="w-10 h-10 rounded-full bg-gray-800/80 hover:bg-gray-700 flex items-center justify-center text-gray-300 transition-colors"
                        title={lang === 'ja' ? 'リプレイ' : 'Replay'}
                    >
                        <RotateCcw size={18} />
                    </button>
                    <button 
                        onClick={() => setIsPlaying(!isPlaying)}
                        className="w-10 h-10 rounded-full bg-[#B39A62]/80 hover:bg-[#B39A62] flex items-center justify-center text-[#11100E] transition-colors"
                    >
                        {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                    </button>
                </div>
            </div>

            {/* Right: Explanations */}
            <div className="w-full md:w-1/2 p-6 md:p-8 flex flex-col">
                <div className="flex justify-between items-center mb-6 text-sm text-gray-500 font-bold tracking-widest uppercase">
                    <span>{lang === 'ja' ? 'チュートリアル' : 'Tutorial'} {sceneIndex + 1} / {SCENES.length}</span>
                </div>
                
                <h3 className="text-2xl font-serif text-[#D4B872] mb-6 tracking-wide">
                    {currentScene.title[lang]}
                </h3>

                <p className="text-gray-300 leading-relaxed text-lg flex-1">
                    {currentFrame.text[lang]}
                </p>

                <div className="flex justify-between mt-8 pt-6 border-t border-gray-800">
                    <button 
                        onClick={handlePrevScene}
                        disabled={sceneIndex === 0}
                        className="flex items-center gap-2 text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
                    >
                        <ChevronLeft size={20} />
                        {lang === 'ja' ? '前へ' : 'Prev'}
                    </button>
                    <button 
                        onClick={handleNextScene}
                        disabled={sceneIndex === SCENES.length - 1}
                        className="flex items-center gap-2 text-[#D4B872] hover:text-white disabled:opacity-30 transition-colors font-bold tracking-widest"
                    >
                        {lang === 'ja' ? '次へ' : 'Next'}
                        <ChevronRight size={20} />
                    </button>
                </div>
            </div>
        </div>
    );
}
