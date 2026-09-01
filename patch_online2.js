const fs = require('fs');

const path = 'src/components/LevelSelect.tsx';
let code = fs.readFileSync(path, 'utf8');

const targetRegex = /<span className="text-xl md:text-2xl tracking-\[0\.2em\] font-serif text-\[\#E8E2D7\]">Q-GAMBIT<\/span>\s*<div className="flex items-center gap-2">\s*<span className="font-mono text-\[\#B39A62\] text-sm">/g;

const replacement = `<span className="text-xl md:text-2xl tracking-[0.2em] font-serif text-[#E8E2D7]">Q-GAMBIT</span>
                <div className="flex items-center gap-4">
                    {queueStats && queueStats[-1] !== undefined && (
                        <div className="flex items-center gap-1.5 opacity-80" title="Online Players">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#A89C86] animate-pulse"></span>
                            <span className="text-[10px] tracking-widest text-[#A89C86] font-mono">{queueStats[-1]} ONLINE</span>
                        </div>
                    )}
                    <span className="font-mono text-[#B39A62] text-sm">`;

code = code.replace(targetRegex, replacement);
fs.writeFileSync(path, code, 'utf8');
console.log('Patched LevelSelect.tsx with Online count');
