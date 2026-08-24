'use client';

import { useEffect, useRef } from 'react';
import { GameConfig } from '../config/gameConfig';

export default function GameCanvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // 解像度調整
        canvas.width = 800;
        canvas.height = 800;

        // ここに既存のVanilla JSの描画ループ（game.js）をマウントしていく予定
        // 今回はプレースホルダーとして盤面の背景を描画
        const drawBoard = () => {
            const tileSize = canvas.width / GameConfig.boardSize.cols;
            for (let r = 0; r < GameConfig.boardSize.rows; r++) {
                for (let c = 0; c < GameConfig.boardSize.cols; c++) {
                    ctx.fillStyle = (r + c) % 2 === 0 ? '#0b0c10' : '#1f2833';
                    ctx.fillRect(c * tileSize, r * tileSize, tileSize, tileSize);
                }
            }
        };

        drawBoard();

        // クリーンアップ関数
        return () => {
            // アニメーションループなどの停止処理
        };
    }, []);

    return (
        <div className="relative w-full max-w-[800px] aspect-square shadow-2xl border-2 border-[#00ff41] rounded-sm overflow-hidden bg-black">
            <canvas
                ref={canvasRef}
                className="w-full h-full block pixel-ui-canvas"
                style={{ imageRendering: 'pixelated' }}
            />
            {/* 今後ここにReactベースのHUD（スコア、ボタン、広告枠）をオーバーレイとして追加 */}
            <div className="absolute top-2 left-2 text-[#00ff41] font-mono text-sm pointer-events-none drop-shadow-md">
                Q-GAMBIT ENGINE (CANVAS MOUNTED)
            </div>
        </div>
    );
}
