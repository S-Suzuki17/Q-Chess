const fs = require('fs');
let code = fs.readFileSync('src/lib/SocketContext.tsx', 'utf8');

if (!code.includes('server_stats')) {
    code = code.replace(
        `        newSocket.on('disconnect', (reason) => {
            console.log('Disconnected from Game Server:', reason);
            setIsConnected(false);
        });`,
        `        newSocket.on('disconnect', (reason) => {
            console.log('Disconnected from Game Server:', reason);
            setIsConnected(false);
        });

        newSocket.on('server_stats', (stats) => {
            if (stats && stats.queue) {
                // We'll augment queueStats with online count as a special key '-1' to easily pass it without changing interface
                setQueueStats({ ...stats.queue, [-1]: stats.online || 0 });
            }
        });`
    );
    fs.writeFileSync('src/lib/SocketContext.tsx', code, 'utf8');
    console.log('Patched src/lib/SocketContext.tsx');
}
