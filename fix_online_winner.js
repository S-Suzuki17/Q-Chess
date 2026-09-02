const fs = require('fs');
let code = fs.readFileSync('src/components/OnlineGameBoard.tsx', 'utf8');

const regex = /\{winner && \(\s*<div className="absolute inset-0 bg-black\/80 flex flex-col items-center justify-center z-50 backdrop-blur-md rounded-lg border-2 border-gray-700 animate-shake">[\s\S]*?<\/div>\s*<\/div>\s*\)\}/;

const replacement = `{winner && (
                <div className="absolute inset-0 bg-[#11100E]/90 flex flex-col items-center justify-center z-50 backdrop-blur-sm rounded-lg border border-[#B39A62]/20">
                    <div className="flex flex-col items-center gap-6 px-6 max-w-full">
                        <div className="text-3xl sm:text-4xl md:text-5xl font-serif font-bold text-[#E8E2D7] tracking-[0.2em] text-center animate-stamp">
                            {winner === 'draw' ? 'DRAW' : 'CHECKMATE'}
                        </div>
                        <div className="w-16 h-px bg-[#B39A62]/50"></div>
                        <div className={\`text-base sm:text-lg md:text-xl font-serif tracking-widest text-center \${winner === 'draw' ? 'text-[#A89C86]' : (winner === 'white_wins' && onlineRole === 'white') || (winner === 'black_wins' && onlineRole === 'black') ? 'text-[#E8E2D7]' : 'text-[#A89C86]'}\`}>
                            {winner === 'draw' 
                                ? 'Draw (Stalemate)' 
                                : (winner === 'white_wins' && onlineRole === 'white') || (winner === 'black_wins' && onlineRole === 'black')
                                    ? (lang === 'ja' ? '勝利 (YOU WIN)' : 'YOU WIN!')
                                    : (lang === 'ja' ? '敗北 (YOU LOSE)' : 'YOU LOSE...')}
                        </div>
                    </div>
                </div>
            )}`;

if (regex.test(code)) {
    code = code.replace(regex, replacement);
    fs.writeFileSync('src/components/OnlineGameBoard.tsx', code, 'utf8');
    console.log('OnlineGameBoard winner updated');
} else {
    console.log('Regex not matched in OnlineGameBoard');
}
