const fs = require('fs');
let code = fs.readFileSync('src/components/OnlineGameBoard.tsx', 'utf8');
code = code.replace(/\[isConnected, socket, roomId, gameState\]/, '[isConnected, socket, roomId]');
fs.writeFileSync('src/components/OnlineGameBoard.tsx', code);
