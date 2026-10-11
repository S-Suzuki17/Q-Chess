import Link from 'next/link';
import {TermsDocument} from '../../components/TermsDocument';
import {SiteLinks} from '../../components/SiteInformation';
import {informationMetadata,informationViewport} from '../../config/siteMetadata';
export const metadata=informationMetadata('利用規約 / Terms of Use','/terms/');
export const viewport=informationViewport;
export default function TermsPage(){return <main className="game-page"><div className="game-page-content"><header className="game-page-header"><Link href="/" className="text-[#D4B872]">← Q-Gambit</Link></header><h1 className="my-8 text-3xl">利用規約 / Terms of Use</h1><TermsDocument/><Link href="/privacy" className="mt-8 inline-block underline">プライバシーポリシー / Privacy Policy</Link><SiteLinks lang="ja"/></div></main>;}
