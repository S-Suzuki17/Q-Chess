import { LearningPage } from '../../components/LearningPage';
import { informationMetadata, informationViewport } from '../../config/siteMetadata';

export const metadata = {
    ...informationMetadata('はじめての対局ガイド / First game guide', '/guide/'),
    description: 'Q-Gambitのゲスト開始手順、候補の読み方、答え付き推理練習と盤全体へ連鎖する候補の実例。Learn the controls and how one move can reveal other pieces.',
};
export const viewport = informationViewport;
export default function GuidePage() { return <LearningPage kind="guide"/>; }
