const fs = require('fs');
let code = fs.readFileSync('src/app/page.tsx', 'utf8');

// 1. Remove handleSelectLevel from onStartGlobalMatch
code = code.replace(/onStartGlobalMatch=\{\(tcSeconds\) => \{ setIsSearchingGlobally\(true\); setTimeControlTarget\(tcSeconds\); handleSelectLevel\(3, tcSeconds === 10 \? '10s' : tcSeconds === 180 \? '3m' : '10m'\); \}\}/, "onStartGlobalMatch={(tcSeconds) => { setIsSearchingGlobally(true); setTimeControlTarget(tcSeconds); }}");

// 2. Change MatchmakingManager to full screen
const oldMM = `    if (!isSearchingGlobally) return null;
    return (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-blue-900/80 border border-blue-500 rounded-full px-6 py-2 shadow-2xl backdrop-blur-sm flex items-center gap-4 cursor-pointer hover:bg-red-900/80 transition-colors group" onClick={cancelSearchGlobally} title="Click to cancel matchmaking">
            <span className="w-2 h-2 bg-blue-400 rounded-full animate-ping"></span>
            <span className="text-blue-100 text-xs tracking-widest font-bold group-hover:hidden">SEARCHING FOR OPPONENT...</span>
            <span className="text-red-100 text-xs tracking-widest font-bold hidden group-hover:block">CANCEL SEARCH</span>
        </div>
    );`;

const newMM = `    if (!isSearchingGlobally) return null;
    return (
        <div className="fixed inset-0 bg-[#11100E]/95 z-[100] flex flex-col items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-[#161513] border border-[#B39A62]/30 p-8 w-full max-w-sm text-center shadow-[0_0_40px_rgba(179,154,98,0.1)] rounded-xl">
                {matchedRoom ? (
                    <>
                        <h3 className="text-2xl tracking-[0.2em] text-[#B39A62] mb-4 animate-pulse font-serif uppercase">
                            MATCH FOUND
                        </h3>
                        <p className="text-[#A89C86] text-xs tracking-[0.3em] uppercase">
                            PREPARING...
                        </p>
                    </>
                ) : (
                    <>
                        <h3 className="text-xl tracking-[0.2em] text-[#E8E2D7] mb-6 font-serif uppercase drop-shadow-[0_0_8px_rgba(232,226,215,0.4)]">
                            SEARCHING OPPONENT
                        </h3>
                        <div className="flex justify-center mb-10 gap-3">
                            <div className="w-2 h-2 rounded-full bg-[#B39A62] animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-2 h-2 rounded-full bg-[#B39A62] animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-2 h-2 rounded-full bg-[#B39A62] animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                        <button
                            onClick={cancelSearchGlobally}
                            className="px-8 py-3 border border-[#A89C86]/30 hover:bg-[#2A2621] hover:border-[#A89C86] transition-colors rounded text-[#A89C86] hover:text-[#E8E2D7] text-xs font-serif tracking-widest w-full"
                        >
                            CANCEL SEARCH
                        </button>
                    </>
                )}
            </div>
        </div>
    );`;

code = code.replace(oldMM, newMM);
fs.writeFileSync('src/app/page.tsx', code, 'utf8');
