const fs = require('fs');

function patchUI(filePath) {
    let code = fs.readFileSync(filePath, 'utf8');
    
    const checkStart = code.indexOf('{showCheckWarning && !winner && (');
    if (checkStart === -1) {
        // Try alternate start for OnlineGameBoard which might not have showCheckWarning
        const altStart = code.indexOf('{winner && (');
        if (altStart === -1) return console.log('Not found in', filePath);
        
        let checkEnd = code.indexOf('            {/* Emote Button & Menu */}', altStart);
        if (checkEnd === -1) checkEnd = code.indexOf('{roomId && onlineRole', altStart);
        if (checkEnd === -1) return console.log('End not found in', filePath);
        
        const newBlock = `            {winner && (
                <div className="absolute inset-0 bg-[#141414]/90 flex flex-col items-center justify-center z-50 backdrop-blur-sm rounded-lg transition-opacity duration-1000">
                    <div className="text-3xl sm:text-4xl md:text-5xl font-serif text-[#E8E2D7] mb-6 tracking-widest md:tracking-[0.4em] text-center px-4 uppercase">
                        {winner === 'draw' ? 'DRAW' : 'CHECKMATE'}
                    </div>
                    <div className="text-lg sm:text-xl font-serif tracking-widest mb-12 px-4 text-[#A89C86]">
                        {winner === 'draw' 
                            ? 'Draw (Stalemate)' 
                            : (winner === 'white_wins' && onlineRole === 'white') || (winner === 'black_wins' && onlineRole === 'black')
                                ? 'YOU WIN' 
                                : 'YOU LOSE'}
                    </div>
                    <div className="flex gap-6 mt-8">
                        <button 
                            onClick={onHome || (() => window.location.reload())}
                            className="px-6 py-3 bg-transparent hover:bg-[#A89C86]/10 border border-[#A89C86]/30 rounded text-sm font-serif tracking-widest transition-colors text-[#E8E2D7]"
                        >
                            {lang === 'ja' ? 'ホーム' : 'HOME'}
                        </button>
                    </div>
                </div>
            )}\n\n`;
        code = code.substring(0, altStart) + newBlock + code.substring(checkEnd);
        fs.writeFileSync(filePath, code, 'utf8');
        return console.log('Patched', filePath);
    }

    const winnerEndToken = '            {/* Emote Button & Menu */}';
    let checkEnd = code.indexOf(winnerEndToken, checkStart);
    if (checkEnd === -1) {
        checkEnd = code.indexOf('{roomId && onlineRole', checkStart);
    }
    
    if (checkEnd === -1) return console.log('End not found in', filePath);

    const newBlock = `            {showCheckWarning && !winner && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none transition-opacity duration-1000">
                    <div className="text-4xl md:text-5xl font-serif text-[#A89C86] whitespace-nowrap tracking-[0.3em] opacity-80">
                        {t.quantumCheck}
                    </div>
                </div>
            )}

            {winner && (
                <div className="absolute inset-0 bg-[#141414]/90 flex flex-col items-center justify-center z-50 backdrop-blur-sm rounded-lg transition-opacity duration-1000">
                    <div className="text-3xl sm:text-4xl md:text-5xl font-serif text-[#E8E2D7] mb-6 tracking-widest md:tracking-[0.4em] text-center px-4 uppercase">
                        {winner === 'draw' ? 'DRAW' : 'CHECKMATE'}
                    </div>
                    <div className="text-lg sm:text-xl font-serif tracking-widest mb-12 px-4 text-[#A89C86]">
                        {winner === 'draw' 
                            ? 'Draw (Stalemate)' 
                            : winner === 'white_wins' 
                                ? \`\${whiteName} (\${t.whiteWon})\` 
                                : \`\${blackName} (\${t.blackWon})\`}
                    </div>
                    <div className="flex gap-6 mt-8">
                        <button 
                            onClick={onHome || (() => window.location.reload())}
                            className="px-6 py-3 bg-transparent hover:bg-[#A89C86]/10 border border-[#A89C86]/30 rounded text-sm font-serif tracking-widest transition-colors text-[#E8E2D7]"
                        >
                            {t.home || 'HOME'}
                        </button>
                        <button 
                            onClick={() => window.location.reload()}
                            className="px-6 py-3 bg-[#191714] hover:bg-[#2a2622] border border-[#A89C86]/50 rounded text-sm font-serif tracking-widest transition-colors text-[#E8E2D7]"
                        >
                            {t.rematch || 'REMATCH'}
                        </button>
                    </div>
                </div>
            )}\n\n`;

    code = code.substring(0, checkStart) + newBlock + code.substring(checkEnd);
    fs.writeFileSync(filePath, code, 'utf8');
    console.log('Patched', filePath);
}

patchUI('src/components/LocalGameBoard.tsx');
patchUI('src/components/OnlineGameBoard.tsx');
