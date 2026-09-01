const fs = require('fs');
let code = fs.readFileSync('src/components/LevelSelect.tsx', 'utf8');

code = code.replace(
    `onOnlineMatch?: (roomId: string, role: 'white' | 'black' | 'spectator', matchMode: 'random' | 'private' | 'ranked', tc: TimeControl, opponentId?: string) => void;`,
    `onOnlineMatch?: (roomId: string, role: 'white' | 'black' | 'spectator', matchMode: 'random' | 'private' | 'ranked', tc: TimeControl, opponentId?: string) => void;\n    onStartGlobalMatch?: (tcSeconds: number) => void;`
);

code = code.replace(
    `export function LevelSelect({ lang, user, onSelect, onOnlineMatch, onReplay, onBack }: LevelSelectProps) {`,
    `export function LevelSelect({ lang, user, onSelect, onOnlineMatch, onStartGlobalMatch, onReplay, onBack }: LevelSelectProps) {`
);

code = code.replace(
    `const { isSearching: hookSearching, matchedRoom, startMatchmaking, cancelMatchmaking: hookCancel } = useMatchmaking(user);`,
    ``
);

code = code.replace(
    `onClick={() => startMatchmaking(10)}`,
    `onClick={() => onStartGlobalMatch?.(10)}`
);
code = code.replace(
    `onClick={() => startMatchmaking(180)}`,
    `onClick={() => onStartGlobalMatch?.(180)}`
);
code = code.replace(
    `onClick={() => startMatchmaking(600)}`,
    `onClick={() => onStartGlobalMatch?.(600)}`
);

// Remove the isSearching overlay
code = code.replace(
    `            {isSearching && (
                <div className="fixed inset-0 bg-[#161513]/95 z-50 flex flex-col items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-[#161513] border border-[#B39A62]/40 p-8 w-full max-w-sm text-center shadow-2xl relative overflow-hidden">
                        <div className="absolute inset-0 bg-[#B39A62]/5 animate-pulse"></div>
                        <h2 className="text-[#B39A62] text-xl font-serif tracking-[0.2em] mb-4 relative z-10">{(t as any).searching}</h2>
                        <div className="flex justify-center gap-2 mb-8 relative z-10">
                            <div className="w-2 h-2 bg-[#D4B872] rounded-full animate-bounce"></div>
                            <div className="w-2 h-2 bg-[#D4B872] rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                            <div className="w-2 h-2 bg-[#D4B872] rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                        </div>
                        <button onClick={cancelMatchmaking} className="py-3 px-6 bg-transparent border border-[#A89C86]/30 hover:bg-[#A89C86]/10 text-[#E8E2D7] text-xs tracking-widest transition-colors relative z-10">{(t as any).cancel}</button>
                    </div>
                </div>
            )}`,
    ``
);

fs.writeFileSync('src/components/LevelSelect.tsx', code, 'utf8');
console.log('Patched LevelSelect.tsx');
