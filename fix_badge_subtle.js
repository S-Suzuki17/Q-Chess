const fs = require('fs');
let code = fs.readFileSync('src/components/TitleScreen.tsx', 'utf8');

// Remove from center
code = code.replace(/<div className="mt-8 flex justify-center hover:opacity-80 transition-opacity">[\s\S]*?<\/div>/, '');

// Place at the bottom, very subtly
const bottomTarget = /<div className="absolute bottom-0 w-full z-20">\s*<AdBanner \/>\s*<\/div>/;
const bottomReplacement = `<div className="absolute bottom-0 w-full z-20 flex flex-col items-center">
                <div className="mb-2 opacity-20 hover:opacity-100 grayscale hover:grayscale-0 transition-all duration-300">
                    <a href="https://pixelpicked.com/game/7TmlOxj21Ub/q-gambit/" target="_blank" rel="noopener noreferrer">
                        <img src="https://api.pixelpicked.com/api/badges/7TmlOxj21Ub/live.png?theme=dark"
                            width="100" alt="Approved on PixelPicked" className="h-auto" />
                    </a>
                </div>
                <AdBanner />
            </div>`;

if (bottomTarget.test(code)) {
    code = code.replace(bottomTarget, bottomReplacement);
    fs.writeFileSync('src/components/TitleScreen.tsx', code, 'utf8');
    console.log('Badge moved successfully');
} else {
    console.log('Target not found');
}
