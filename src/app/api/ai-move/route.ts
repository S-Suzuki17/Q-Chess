import { NextResponse } from 'next/server';
import { calculateDeepMove } from '../../../lib/ServerAIEngine';
import { IdentityPool } from '../../../lib/IdentityPool';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        if (!body || !body.tokens || !body.poolData || !body.cpuPlayer) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }
        if (typeof body.level !== 'number' || body.level < 1 || body.level > 5) {
            return NextResponse.json({ error: 'Invalid level' }, { status: 400 });
        }
        const { level, tokens, poolData, cpuPlayer, timeControl } = body;

        // IdentityPoolを復元
        const pool = new IdentityPool();
        const mapData = poolData.piecePossibilities;
        if (mapData) {
            Object.entries(mapData).forEach(([key, value]) => {
                pool.piecePossibilities.set(key, new Set(value as any[]));
            });
        }

        // 深い計算を実行（サーバーサイドなのでUIをブロックしない）
        const move = calculateDeepMove(level, tokens, pool, cpuPlayer, timeControl);

        return NextResponse.json({ move });
    } catch (error) {
        console.error("AI API Error:", error);
        return NextResponse.json({ error: "AI calculation failed" }, { status: 500 });
    }
}
