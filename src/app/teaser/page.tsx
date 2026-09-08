'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Board3D } from '../../components/Board3D';
import { Token } from '../../lib/GameEngine';
import { createLocalPosition } from '../../lib/localGame';

function createSequence(): Token[][] {
    const s0 = JSON.parse(JSON.stringify(createLocalPosition().tokens));
    const s1 = JSON.parse(JSON.stringify(s0)); s1.find((t: any) => t.row === 1 && t.col === 3).row = 3;
    const s2 = JSON.parse(JSON.stringify(s1)); s2.find((t: any) => t.row === 6 && t.col === 4).row = 4;
    const s3 = JSON.parse(JSON.stringify(s2)); const wQ = s3.find((t: any) => t.row === 0 && t.col === 3); wQ.row = 2; wQ.col = 5; wQ.possibilities = ['Queen'];
    const s4 = JSON.parse(JSON.stringify(s3)); const bN = s4.find((t: any) => t.row === 7 && t.col === 1); bN.row = 5; bN.col = 2; bN.possibilities = ['Knight'];
    const s5 = JSON.parse(JSON.stringify(s4)); const wQ2 = s5.find((t: any) => t.id === wQ.id); wQ2.row = 4; wQ2.col = 4; const bP = s5.find((t: any) => t.row === 4 && t.col === 4 && t.player === 'black'); if (bP) s5.splice(s5.indexOf(bP), 1);
    const s6 = JSON.parse(JSON.stringify(s5)); const bN2 = s6.find((t: any) => t.id === bN.id); bN2.row = 3; bN2.col = 3; const wP = s6.find((t: any) => t.row === 3 && t.col === 3 && t.player === 'white'); if (wP) s6.splice(s6.indexOf(wP), 1);
    const s7 = JSON.parse(JSON.stringify(s6)); const wK = s7.find((t: any) => t.row === 0 && t.col === 4); wK.row = 0; wK.col = 6; wK.possibilities = ['King']; const wR = s7.find((t: any) => t.row === 0 && t.col === 7); wR.row = 0; wR.col = 5; wR.possibilities = ['Rook'];
    return [s0, s1, s2, s3, s4, s5, s6, s7];
}

export default function TeaserPage() {
    const [tokens, setTokens] = useState<Token[]>([]);
    const [isRecording, setIsRecording] = useState(false);
    const [status, setStatus] = useState('Ready');
    const mediaRecorderRef = useRef<any>(null);
    const chunksRef = useRef<Blob[]>([]);
    const sequenceRef = useRef<Token[][]>([]);
    const stepRef = useRef(0);

    useEffect(() => {
        sequenceRef.current = createSequence();
        setTokens(sequenceRef.current[0]);
        if (window.location.search.includes('autoplay')) {
            setTimeout(startRecording, 1000);
        }
    }, []);

    const startRecording = () => {
        if (!sequenceRef.current.length) return;
        setIsRecording(true);
        setStatus('Recording...');
        chunksRef.current = [];
        stepRef.current = 0;

        const canvas = document.querySelector('canvas');
        if (!canvas) { setStatus('Canvas not found'); setIsRecording(false); return; }

        const stream = (canvas as any).captureStream(60);
        let mediaRecorder;
        try { mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' }); }
        catch (e) { mediaRecorder = new MediaRecorder(stream); }
        
        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.ondataavailable = (e: any) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        mediaRecorder.onstop = () => {
            const blob = new Blob(chunksRef.current, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none'; a.href = url; a.download = 'q-gambit-teaser.webm';
            document.body.appendChild(a); a.click();
            window.URL.revokeObjectURL(url);
            setStatus('Download Complete. Add music using a video editor!');
            setIsRecording(false);
        };
        mediaRecorder.start();

        const interval = setInterval(() => {
            stepRef.current++;
            if (stepRef.current >= sequenceRef.current.length) {
                clearInterval(interval);
                setTimeout(() => { mediaRecorderRef.current?.stop(); }, 3000);
            } else { setTokens(sequenceRef.current[stepRef.current]); }
        }, 1500);
    };

    if (!tokens.length) return null;

    return (
        <div className="w-screen h-screen relative bg-black overflow-hidden">
            <Board3D tokens={tokens} onlineRole="white" selectedTokenId={null} validMoves={[]} moveHistory={[]} onSquareClick={() => {}} showMoveHints={false} currentTurn="white" autoRotate={true} />
            <div className="absolute top-4 left-4 z-50 flex flex-col gap-4">
                <button onClick={startRecording} disabled={isRecording} className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded shadow-lg disabled:opacity-50">
                    {isRecording ? 'Recording...' : 'Record Teaser (WebM)'}
                </button>
                <div className="text-white font-mono bg-black/50 p-2 rounded">Status: {status}</div>
                <div className="text-white text-sm bg-black/50 p-2 rounded max-w-sm">This captures the 3D canvas directly to a high-quality 60fps WebM file. UI buttons are not recorded.</div>
            </div>
        </div>
    );
}
