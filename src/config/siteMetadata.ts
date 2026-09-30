import type { Metadata, Viewport } from 'next';
import { GAME_DESCRIPTION } from './searchMetadata';

// Text pages may be enlarged without changing the fixed gameplay viewport.
export const informationViewport: Viewport = {
    width: 'device-width', initialScale: 1, maximumScale: 5, userScalable: true,
};
const descriptions: Record<string, string> = {
    '/rules/': 'Q-Gambitの遊び方。駒の移動、候補の絞り込み、駒数の上限、勝敗条件を図と具体例で説明します。',
    '/about/': 'Q-Gambitは駒の正体を推理するチェス変種です。動きと駒数の制約で候補が絞られます。物理的な量子シミュレーションではありません。',
    '/contact/': 'Q-Gambitの問い合わせ窓口、不具合報告に必要な情報、アカウントとデータの案内。',
    '/privacy/': 'Q-Gambitのプライバシーポリシー。データの利用、保存、アカウント削除について。',
    '/terms/': 'Q-Gambitの利用規約。アカウント、利用上のルール、サービスの提供条件について。',
    '/updates/': 'Q-Gambitの開発ノート。開発キャラクターQUBEの投稿をまとめています。',
};
export const informationMetadata = (title: string, canonical: string): Metadata => {
    const pageTitle = `${title} | Q-Gambit`;
    const description = descriptions[canonical] ?? GAME_DESCRIPTION;
    return {
        title: pageTitle, description, alternates: { canonical },
        openGraph: { title: pageTitle, description, url: canonical, siteName: 'Q-Gambit', type: 'website' },
        twitter: { card: 'summary', title: pageTitle, description },
    };
};
