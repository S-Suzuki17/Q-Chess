import React, { useState } from 'react';
import { Language, dict } from '../locales/dict';
import { QuantumPieceUI } from './QuantumPieceUI';

interface Props {
    lang: Language;
    onClose: () => void;
}

export function InteractiveTutorial({ lang, onClose }: Props) {
    const t = { ...dict['en'], ...(dict[lang] || {}) } as any;
    const [step, setStep] = useState(0);

    const steps = [
        {
            title: lang === 'ja' ? '量子チェスへようこそ' : 'Welcome to Q-GAMBIT',
            desc: lang === 'ja' ? 'すべての駒は裏返った状態（重ね合わせ）でスタートします。最初はどれがキングでどれがポーンなのか、誰にもわかりません。' : 'All pieces start face-down in a quantum superposition. No one knows which piece is the King or a Pawn.',
            board: (
                <div className="grid grid-cols-3 grid-rows-3 gap-1 w-48 h-48 bg-[#B39A62]/10 p-2 border border-[#B39A62]/30">
                    <div className="col-start-2 row-start-2 relative">
                        <QuantumPieceUI id="tut1" player="white" probabilities={{ King: 1/16, Queen: 1/16, Rook: 2/16, Bishop: 2/16, Knight: 2/16, Pawn: 8/16 }} isSelected={false} onClick={() => {}} />
                    </div>
                </div>
            )
        },
        {
            title: lang === 'ja' ? '移動＝観測（正体の推論）' : 'Movement = Observation',
            desc: lang === 'ja' ? '駒を「斜め」に移動させてみましょう。チェスのルール上、斜めに長距離移動できるのは「ビショップ」か「クイーン」だけです。' : 'Let\'s move a piece diagonally. In chess, only a Bishop or Queen can move diagonally from a distance.',
            board: (
                <div className="grid grid-cols-3 grid-rows-3 gap-1 w-48 h-48 bg-[#B39A62]/10 p-2 border border-[#B39A62]/30 relative">
                    <div className="col-start-1 row-start-3 relative opacity-30">
                        <QuantumPieceUI id="tut2a" player="white" probabilities={{ King: 1/16, Queen: 1/16, Rook: 2/16, Bishop: 2/16, Knight: 2/16, Pawn: 8/16 }} isSelected={false} onClick={() => {}} />
                    </div>
                    <div className="col-start-3 row-start-1 relative">
                        <QuantumPieceUI id="tut2b" player="white" probabilities={{ King: 0, Rook: 0, Knight: 0, Pawn: 0, Bishop: 0.5, Queen: 0.5 }} isSelected={true} onClick={() => {}} />
                    </div>
                    {/* Arrow */}
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                        <svg className="w-full h-full text-[#D4B872] opacity-50" fill="none" stroke="currentColor" viewBox="0 0 100 100">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M 20 80 L 75 25 M 75 25 L 55 25 M 75 25 L 75 45" />
                        </svg>
                    </div>
                </div>
            )
        },
        {
            title: lang === 'ja' ? '確率の収縮' : 'Wavefunction Collapse',
            desc: lang === 'ja' ? 'このように、移動した軌跡から「あり得ない駒」の可能性が排除（収縮）されます。移動するたびに正体が絞られていきます。' : 'By moving, impossible identities are eliminated (collapsed). Every move narrows down what the piece could be.',
            board: (
                <div className="grid grid-cols-3 grid-rows-3 gap-1 w-48 h-48 bg-[#B39A62]/10 p-2 border border-[#B39A62]/30 relative">
                    <div className="col-start-2 row-start-2 relative">
                        <QuantumPieceUI id="tut3" player="white" probabilities={{ King: 0, Queen: 0, Rook: 0, Bishop: 0, Pawn: 0, Knight: 1.0 }} isSelected={false} onClick={() => {}} />
                    </div>
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                        <svg className="w-full h-full text-[#D4B872] opacity-50" fill="none" stroke="currentColor" viewBox="0 0 100 100">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M 20 80 L 20 20 L 50 20" />
                        </svg>
                    </div>
                </div>
            )
        },
        {
            title: lang === 'ja' ? 'グローバル推論' : 'Global Deduction',
            desc: lang === 'ja' ? '盤上にはキングとクイーンは1つずつしか存在しません。ある駒が「クイーン」として確定すると、他のすべての味方の駒からはクイーンの可能性が消滅します。' : 'There is only 1 King and 1 Queen per side. If a piece is revealed as the Queen, the probability of Queen is removed from all other friendly pieces.',
            board: (
                <div className="flex gap-4 items-center">
                    <div className="w-24 h-24 relative">
                        <QuantumPieceUI id="tut4a" player="black" probabilities={{ King: 0, Rook: 0, Bishop: 0, Knight: 0, Pawn: 0, Queen: 1.0 }} isSelected={true} onClick={() => {}} />
                        <div className="absolute -bottom-6 w-full text-center text-[10px] text-red-400">QUEEN (100%)</div>
                    </div>
                    <div className="w-24 h-24 relative">
                        <QuantumPieceUI id="tut4b" player="black" probabilities={{ King: 1/15, Queen: 0, Rook: 2/15, Bishop: 2/15, Knight: 2/15, Pawn: 8/15 }} isSelected={false} onClick={() => {}} />
                        <div className="absolute -bottom-6 w-full text-center text-[10px] text-gray-400">QUEEN (0%)</div>
                    </div>
                </div>
            )
        },
        {
            title: lang === 'ja' ? '勝利条件' : 'Victory Condition',
            desc: lang === 'ja' ? '相手の「キング」を捕獲するか、チェックメイトすれば勝利です。未確定の駒の中にキングが潜んでいるかもしれない緊張感を楽しんでください！' : 'Capture the enemy King or Checkmate them to win. Enjoy the tension of knowing the enemy King could be hiding anywhere!',
            board: (
                <div className="flex flex-col items-center gap-4">
                    <div className="text-4xl sm:text-5xl font-black text-[#E8E2D7] drop-shadow-[0_0_15px_rgba(255,255,255,1)] animate-stamp">
                        CHECKMATE
                    </div>
                    <button onClick={onClose} className="mt-8 px-12 py-4 bg-[#B39A62] text-[#11100E] font-bold tracking-widest hover:bg-[#D0C8B6] transition-colors rounded">
                        {lang === 'ja' ? 'プレイ開始！' : 'START PLAYING!'}
                    </button>
                </div>
            )
        }
    ];

    const current = steps[step];

    return (
        <div className="fixed inset-0 bg-[#11100E]/95 z-[200] flex flex-col items-center justify-center p-4 backdrop-blur-md">
            <div className="w-full max-w-2xl bg-[#191714] border-2 border-[#B39A62]/30 rounded-xl p-8 flex flex-col items-center shadow-2xl relative min-h-[500px]">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white text-2xl font-bold">×</button>
                
                <div className="flex gap-2 mb-8">
                    {steps.map((_, i) => (
                        <div key={i} className={`w-12 h-1 ${i === step ? 'bg-[#B39A62]' : 'bg-gray-700'} transition-colors cursor-pointer`} onClick={() => setStep(i)} />
                    ))}
                </div>

                <h2 className="text-2xl md:text-3xl font-serif text-[#D4B872] mb-6 text-center tracking-widest">{current.title}</h2>
                
                <div className="flex-1 w-full flex items-center justify-center mb-8">
                    {current.board}
                </div>

                <p className="text-sm md:text-base text-[#E8E2D7] text-center leading-relaxed tracking-wide min-h-[80px]">
                    {current.desc}
                </p>

                <div className="flex w-full justify-between mt-8">
                    <button 
                        onClick={() => setStep(s => Math.max(0, s - 1))}
                        className={`px-6 py-2 border border-[#A89C86]/30 text-[#A89C86] hover:bg-[#A89C86]/10 transition-colors ${step === 0 ? 'opacity-0 pointer-events-none' : ''}`}
                    >
                        {t.prev || 'PREV'}
                    </button>
                    {step < steps.length - 1 && (
                        <button 
                            onClick={() => setStep(s => Math.min(steps.length - 1, s + 1))}
                            className="px-8 py-2 bg-[#B39A62]/20 border border-[#B39A62] text-[#D4B872] hover:bg-[#B39A62] hover:text-[#11100E] transition-colors font-bold tracking-widest"
                        >
                            {t.next || 'NEXT'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
