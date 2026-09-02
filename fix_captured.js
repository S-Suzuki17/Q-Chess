const fs = require('fs');

function fixCaptured(file) {
    let code = fs.readFileSync(file, 'utf8');
    
    // Replace the mapping of captured tokens
    const targetPattern = /<div key=\{token\.id\} className="scale-75 origin-left opacity-80">\s*<QuantumPieceUI([^>]+)\/>\s*<\/div>/g;
    const replacement = `<div key={token.id} className="w-9 h-9 relative flex items-center justify-center opacity-80">
                            <div className="absolute scale-[0.75] origin-center">
                                <QuantumPieceUI$1/>
                            </div>
                        </div>`;
                        
    code = code.replace(targetPattern, replacement);
    fs.writeFileSync(file, code, 'utf8');
}

fixCaptured('src/components/LocalGameBoard.tsx');
fixCaptured('src/components/OnlineGameBoard.tsx');
fixCaptured('src/components/ReplayBoard.tsx');
