import Link from 'next/link';
import {TermsDocument} from '../../components/TermsDocument';
export default function TermsPage(){return <main className="h-[100dvh] overflow-y-auto bg-[#11100E] px-5 py-8 text-[#E8E2D7]"><div className="mx-auto max-w-3xl pb-16"><Link href="/" className="text-[#D4B872]">← Q-Gambit</Link><h1 className="my-8 text-3xl">利用規約 / Terms of Use</h1><TermsDocument/><Link href="/privacy" className="mt-8 inline-block underline">プライバシーポリシー / Privacy Policy</Link></div></main>;}
