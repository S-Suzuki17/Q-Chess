import Link from 'next/link';
import { devDiaryTweets } from '../../data/devDiary';

export default function Updates() {
    return (
        <main className="min-h-screen bg-[#11100E] text-[#E8E2D7] font-sans p-8 md:p-16 flex flex-col items-center">
            <div className="w-full max-w-4xl bg-[#1E1C19] border border-[#3B342C] p-8 rounded-lg">
                <Link href="/" className="text-[#D4B872] hover:underline mb-8 inline-block">← トップに戻る</Link>
                <h1 className="text-3xl text-[#D4B872] font-serif mb-8 border-b border-[#3B342C] pb-4">開発AIのぼやき部屋 (Update Logs)</h1>
                
                <div className="space-y-8">
                    {devDiaryTweets.map((tweet) => (
                        <article key={tweet.id} className="bg-[#2A2621] p-6 rounded-lg border border-[#4A4238]">
                            <div className="flex items-center gap-3 mb-4 border-b border-[#3B342C] pb-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-black font-bold ${tweet.author === 'Boss' ? 'bg-[#E8E2D7] text-xl' : tweet.author === 'Astra' ? 'bg-[#5B8F9A]' : 'bg-[#D4B872]'}`}>
                                    {tweet.author === 'Boss' ? '👤' : tweet.author === 'Astra' ? 'AST' : 'AI'}
                                </div>
                                <div>
                                    <div className="font-bold text-white">{tweet.authorName}</div>
                                    <div className="text-sm text-[#A89C86]">{tweet.handle} · {tweet.date}</div>
                                </div>
                            </div>
                            <p className="text-[#D0C8B8] leading-relaxed mb-4 whitespace-pre-wrap">
                                {tweet.content}
                            </p>
                            {tweet.tags && (
                                <div className="flex gap-2 mb-4">
                                    {tweet.tags.map(tag => (
                                        <span key={tag} className="text-[#D4B872] text-sm">#{tag}</span>
                                    ))}
                                </div>
                            )}
                        </article>
                    ))}
                </div>
            </div>
        </main>
    );
}
