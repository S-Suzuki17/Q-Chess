const fs = require('fs');
let code = fs.readFileSync('src/components/TitleScreen.tsx', 'utf8');

const target = `<p className="text-xs md:text-sm tracking-[0.4em] text-[#A89C86] font-light uppercase">{(t as any)?.subtitle2 || "A game of hidden identity"}</p>`;
const replacement = `<p className="text-xs md:text-sm tracking-[0.4em] text-[#A89C86] font-light uppercase">{(t as any)?.subtitle2 || "A game of hidden identity"}</p>
                
                <div className="mt-8 flex justify-center hover:opacity-80 transition-opacity">
                    <a href="https://pixelpicked.com/game/7TmlOxj21Ub/q-gambit/" target="_blank" rel="noopener noreferrer">
                        <img src="https://api.pixelpicked.com/api/badges/7TmlOxj21Ub/live.png?theme=dark"
                            width="200" alt="Approved on PixelPicked" className="h-auto" />
                    </a>
                </div>`;

if (code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync('src/components/TitleScreen.tsx', code, 'utf8');
    console.log('Badge added successfully');
} else {
    console.log('Target string not found');
}
