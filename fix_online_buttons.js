const fs = require('fs');
let code = fs.readFileSync('src/components/OnlineGameBoard.tsx', 'utf8');

const regex = /\{winner === 'draw'\s*\?\s*\(lang === 'ja' \? '引き分け \(DRAW\)' : 'DRAW'\)\s*:\s*\(winner === 'white_wins' && onlineRole === 'white'\) \|\| \(winner === 'black_wins' && onlineRole === 'black'\)\s*\?\s*\(lang === 'ja' \? '勝利 \(YOU WIN\)' : 'YOU WIN!'\)\s*:\s*\(lang === 'ja' \? '敗北 \(YOU LOSE\)' : 'YOU LOSE\.\.\.'\)\s*\}/;

// Just inject the buttons after the text div inside the flex-col container
const targetDiv = /<div className=\{`text-base sm:text-lg md:text-xl font-serif tracking-widest text-center \$\{winner === 'draw' \? 'text-\[#A89C86\]' : \(winner === 'white_wins' && onlineRole === 'white'\) \|\| \(winner === 'black_wins' && onlineRole === 'black'\) \? 'text-\[#E8E2D7\]' : 'text-\[#A89C86\]'\}\`\}>\s*\{winner === 'draw'\s*\?\s*'Draw \(Stalemate\)'\s*:\s*\(winner === 'white_wins' && onlineRole === 'white'\) \|\| \(winner === 'black_wins' && onlineRole === 'black'\)\s*\?\s*\(lang === 'ja' \? '勝利 \(YOU WIN\)' : 'YOU WIN!'\)\s*:\s*\(lang === 'ja' \? '敗北 \(YOU LOSE\)' : 'YOU LOSE\.\.\.'\)\}\s*<\/div>/;

if (targetDiv.test(code)) {
    code = code.replace(targetDiv, `$&
                        <div className="flex flex-wrap gap-3 mt-4 justify-center">
                            <button 
                                onClick={() => window.location.reload()}
                                className="px-5 py-3 bg-[#191714] hover:bg-[#2A2621] border border-[#A89C86]/30 rounded text-sm font-serif tracking-widest transition-colors text-[#A89C86] hover:text-[#E8E2D7]"
                            >
                                {t.home || 'HOME'}
                            </button>
                        </div>`);
    fs.writeFileSync('src/components/OnlineGameBoard.tsx', code, 'utf8');
}
