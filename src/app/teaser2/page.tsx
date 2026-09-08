"use client";
import dynamic from "next/dynamic";
import React, { useEffect, useState } from "react";

const LocalGameBoard = dynamic(() => import("@/components/LocalGameBoard"), { ssr: false });

export default function TeaserPage() {
    const [isPlaying, setIsPlaying] = useState(false);

    useEffect(() => {
        (window as any).teaserMode = true;
    }, []);

    const startRecordingSequence = async () => {
        setIsPlaying(true);
        
        // Hide UI
        document.querySelectorAll(".absolute, .fixed").forEach((ui: any) => {
            if (!ui.textContent.includes("Checkmate") && !ui.classList.contains("demo-btn")) {
                ui.style.opacity = "0";
            }
        });

        // Start BGM
        const bgm = new Audio("/sounds/music.mp3");
        bgm.volume = 0.5;
        bgm.play().catch(e => console.log("Audio failed to play", e));

        const moves = [
            [1, 4, 3, 4], // 1. e4
            [6, 4, 4, 4], // 1... e5
            [0, 5, 3, 2], // 2. Bc4
            [7, 1, 5, 2], // 2... Nc6
            [0, 3, 4, 7], // 3. Qh5
            [7, 6, 5, 5], // 3... Nf6
            [4, 7, 6, 5]  // 4. Qxf7#
        ];

        // Wait a moment for recording to stabilize
        await new Promise(r => setTimeout(r, 2000));

        for (let i = 0; i < moves.length; i++) {
            const [r1, c1, r2, c2] = moves[i];
            const playMove = (window as any).playMove;
            if (playMove) {
                // Select
                playMove(r1, c1);
                await new Promise(r => setTimeout(r, 400));
                // Move
                playMove(r2, c2);
                
                // Fast forward middle, slow dramatic ending
                const delay = i === moves.length - 1 ? 5000 : (i >= 2 ? 800 : 1200);
                await new Promise(r => setTimeout(r, delay));
            }
        }
        
        // Fade out BGM
        let vol = 0.5;
        const fadeInt = setInterval(() => {
            vol -= 0.05;
            if (vol <= 0) {
                bgm.pause();
                clearInterval(fadeInt);
            } else {
                bgm.volume = vol;
            }
        }, 200);
    };

    return (
        <main className="w-screen h-screen overflow-hidden bg-[#11100E]">
            {!isPlaying && (
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 flex flex-col items-center gap-4 bg-black/80 p-8 rounded-xl border border-blue-500/30 backdrop-blur-md demo-btn">
                    <h2 className="text-white text-2xl font-bold font-mono">Teaser Video Recorder</h2>
                    <p className="text-gray-400 text-center max-w-md">
                        Start your screen recorder (OBS, Game Bar, etc.) now. When you are ready, click Start. The UI will disappear, the music will start, and the Scholar's Mate sequence will play automatically.
                    </p>
                    <button 
                        onClick={startRecordingSequence}
                        className="px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-[0_0_20px_rgba(37,99,235,0.5)] transition-all"
                    >
                        START SEQUENCE
                    </button>
                </div>
            )}
            <LocalGameBoard cpuLevel={undefined} lang="en" />
        </main>
    );
}
