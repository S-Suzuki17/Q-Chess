const fs = require('fs');
let code = fs.readFileSync('server/src/index.ts', 'utf8');

const statsInterval = `
setInterval(() => {
    try {
        const queueStats = matchmaking.getQueueStats();
        io.emit('server_stats', {
            online: io.engine.clientsCount,
            queue: queueStats
        });
    } catch(e) {}
}, 3000);
`;

if (!code.includes('server_stats')) {
    code = code.replace(
        'supabaseService.cleanupOldRecords(30);\n}, 24 * 60 * 60 * 1000);',
        'supabaseService.cleanupOldRecords(30);\n}, 24 * 60 * 60 * 1000);\n' + statsInterval
    );
    fs.writeFileSync('server/src/index.ts', code, 'utf8');
    console.log('Patched server/src/index.ts');
} else {
    console.log('server_stats already exists');
}
