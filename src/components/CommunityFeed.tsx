import React from "react";
import type { Language } from "../locales/dict";

// No posts are embedded or fabricated here. Real hashtag posts can only be shown
// after integrating a feed provider; until then we link to the live public searches.
const SEARCHES = [
    { id: "x", label: "X", href: "https://x.com/search?q=%23qgambit&f=live" },
    { id: "instagram", label: "Instagram", href: "https://www.instagram.com/explore/tags/qgambit/" },
];

export function CommunityFeed({ lang }: { lang: Language }) {
    const ja = lang === "ja";
    return (
        <section aria-label="#qgambit" className="w-full max-w-4xl mt-12 mb-8 px-4 z-10 relative text-center">
            <div className="flex items-center gap-3 mb-4">
                <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-[#B39A62]/30"></div>
                <h3 className="text-[#D4B872] font-cinzel text-lg tracking-widest">
                    #qgambit <span className="text-[#E8E2D7] text-sm font-sans tracking-normal opacity-80">{ja ? "コミュニティ" : "Community"}</span>
                </h3>
                <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-[#B39A62]/30"></div>
            </div>
            <p className="text-sm text-[#A89C86] mb-4">
                {ja ? "#qgambit を付けて対局や感想を投稿してください。各SNSの最新投稿は下のリンクから見られます。"
                    : "Share your games with #qgambit. See the latest posts on each network below."}
            </p>
            <div className="flex justify-center gap-3">
                {SEARCHES.map(search => (
                    <a key={search.id} href={search.href} target="_blank" rel="noopener noreferrer"
                        className="min-h-11 inline-flex items-center px-5 border border-[#B39A62]/40 rounded text-sm text-[#E8E2D7] hover:bg-[#B39A62]/10 transition-colors">
                        {ja ? `${search.label}で見る` : `View on ${search.label}`}
                    </a>
                ))}
            </div>
        </section>
    );
}
