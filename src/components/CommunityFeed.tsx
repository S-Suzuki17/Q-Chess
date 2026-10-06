import React from "react";
import type { Language } from "../locales/dict";

const MOCK_POSTS = [
    {
        id: 1,
        platform: "twitter",
        author: "@chess_quantum",
        content: "Just reached Rank A in #qgambit! The new Plus membership is amazing.",
        date: "2h ago",
        likes: 12
    },
    {
        id: 2,
        platform: "instagram",
        author: "@boardgamer_jp",
        content: "クラウンサーキット全クリ！ #qgambit めちゃくちゃ頭使うけど最高😆",
        date: "5h ago",
        likes: 45
    },
    {
        id: 3,
        platform: "twitter",
        author: "@qgambit_fan",
        content: "Q-GAMBIT Store is finally live!! Just grabbed 166 hint tickets lol. Let's go! #qgambit",
        date: "8h ago",
        likes: 104
    }
];

export function CommunityFeed({ lang }: { lang: Language }) {
    // In a real production environment, you would use a service like Curator.io, Elfsight, 
    // or a custom backend to fetch cross-platform hashtag posts.
    // For now, we display a beautifully styled placeholder / mock feed.
    return (
        <div className="w-full max-w-4xl mt-12 mb-8 px-4 z-10 relative">
            <div className="flex items-center gap-3 mb-6">
                <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-[#B39A62]/30"></div>
                <h3 className="text-[#D4B872] font-cinzel text-lg tracking-widest text-center">
                    #qgambit <span className="text-[#E8E2D7] text-sm font-sans tracking-normal opacity-80">{lang === "ja" ? "コミュニティ" : "Community"}</span>
                </h3>
                <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-[#B39A62]/30"></div>
            </div>

            {/* If using an external widget, you can replace the grid below with: */}
            {/* <div className="elfsight-app-YOUR-WIDGET-ID"></div> */}
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {MOCK_POSTS.map(post => (
                    <div key={post.id} className="bg-[#1A1814]/80 backdrop-blur-sm border border-[#B39A62]/20 rounded-lg p-4 flex flex-col hover:border-[#D4B872]/50 transition-colors">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-[#D4B872] font-semibold text-sm">{post.author}</span>
                            <span className="text-xs text-[#A89C86] opacity-70">
                                {post.platform === "twitter" ? "𝕏" : "📷"}
                            </span>
                        </div>
                        <p className="text-[#E8E2D7] text-sm mb-3 flex-1">{post.content}</p>
                        <div className="flex justify-between items-center text-xs text-[#A89C86]">
                            <span>{post.date}</span>
                            <span className="flex items-center gap-1">
                                <span className="text-[#D4B872]">♥</span> {post.likes}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
            
            <div className="text-center mt-4">
                <a href={`https://twitter.com/search?q=%23qgambit`} target="_blank" rel="noopener noreferrer" className="text-xs text-[#A89C86] hover:text-[#D4B872] underline underline-offset-4 transition-colors">
                    {lang === "ja" ? "もっと見る" : "See more posts"}
                </a>
            </div>
        </div>
    );
}
