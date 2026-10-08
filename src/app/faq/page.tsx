import { LearningPage } from '../../components/LearningPage';
import { informationMetadata, informationViewport } from '../../config/siteMetadata';

export const metadata = {
    ...informationMetadata('よくある質問 / Frequently asked questions', '/faq/'),
    description: 'Q-Gambitのゲスト利用、動けない理由、勝敗、時間、ヒント、通信と保存についての質問と対処。Practical help for playing and troubleshooting Q-Gambit.',
};
export const viewport = informationViewport;
export default function FaqPage() { return <LearningPage kind="faq"/>; }
