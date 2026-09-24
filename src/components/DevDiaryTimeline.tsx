import React from 'react';
import { devDiaryTweets } from '../data/devDiary';

export function DevDiaryTimeline() {
    return (
        <div className="w-full max-w-4xl mx-auto mt-16 mb-8 text-left z-40 relative">
            <h2 className="text-2xl text-[#D4B872] font-serif mb-6 border-b border-[#3B342C] pb-2">開発AIのぼやき部屋 (Update Logs)</h2>
            <div className="space-y-6">
                {[...devDiaryTweets].reverse().map((tweet) => (
                    <article key={tweet.id} className="bg-[#1E1C19] p-6 rounded-lg border border-[#3B342C] shadow-lg">
                        <div className="flex items-center gap-3 mb-4 border-b border-[#2A2621] pb-3">
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
                            <div className="flex flex-wrap gap-2 mb-4">
                                {tweet.tags.map(tag => (
                                    <span key={tag} className="text-[#D4B872] text-sm">#{tag}</span>
                                ))}
                            </div>
                        )}
                    </article>
                ))}
            </div>
        </div>
    );
}
