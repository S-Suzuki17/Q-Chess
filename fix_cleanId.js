const fs = require('fs');
let code = fs.readFileSync('src/components/OnlineGameBoard.tsx', 'utf8');
code = code.replace(/\.eq\('id', cleanId\)/g, ".eq('id', targetId)");
fs.writeFileSync('src/components/OnlineGameBoard.tsx', code, 'utf8');
