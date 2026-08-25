const fs = require('fs');
let code = fs.readFileSync('src/components/OnlineGameBoard.tsx', 'utf8');

const hookToInject = `
    useEffect(() => {
        if (isConnected && socket && roomId && gameState) {
            console.log('[OnlineGameBoard] Reconnected, requesting sync_state');
            socket.emit('request_sync', { matchId: roomId });
        }
    }, [isConnected, socket, roomId, gameState]);
`;

code = code.replace(/useEffect\(\(\) => \{\s*if \(\!socket \|\| \!roomId\) return;/m, hookToInject + '\n    useEffect(() => {\n        if (!socket || !roomId) return;');

fs.writeFileSync('src/components/OnlineGameBoard.tsx', code);
