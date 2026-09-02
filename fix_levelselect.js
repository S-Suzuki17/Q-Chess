const fs = require('fs');
let code = fs.readFileSync('src/components/LevelSelect.tsx', 'utf8');

// Remove {isSearching && ( ... )} block
const targetPattern = /\{\/\* Matchmaking Overlay \*\/\}\s*\{isSearching && \([\s\S]*?<\/>\s*\)\}\s*<\/div>\s*<\/div>\s*\)\}/;
code = code.replace(targetPattern, '');

fs.writeFileSync('src/components/LevelSelect.tsx', code, 'utf8');
