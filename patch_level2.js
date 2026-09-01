const fs = require('fs');
let code = fs.readFileSync('src/components/LevelSelect.tsx', 'utf8');

// replace startRandomMatch call
code = code.replace(
    /startRandomMatch\('random', '10s'\)/g,
    `onStartGlobalMatch?.(10)`
);
code = code.replace(
    /startRandomMatch\('random', '3m'\)/g,
    `onStartGlobalMatch?.(180)`
);
code = code.replace(
    /startRandomMatch\('random', '10m'\)/g,
    `onStartGlobalMatch?.(600)`
);

// remove the isSearching overlay block completely
const searchOverlayRegex = /\{\/\* Matchmaking Overlay \*\/\}\s*\{isSearching && \([\s\S]*?\}\)\}/g;
code = code.replace(searchOverlayRegex, '');

fs.writeFileSync('src/components/LevelSelect.tsx', code, 'utf8');
console.log('Patched LevelSelect overlay');
