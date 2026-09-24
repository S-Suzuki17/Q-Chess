const fs = require('fs');

let onlineCode = fs.readFileSync('src/components/OnlineGameBoard.tsx', 'utf8');

onlineCode = onlineCode.replace(/const onSyncState = \\(state: any\\) => \\{\r?\n\\s*setGameState\\(state\\);/g, \const onSyncState = (state: any) => {
            setGameState({...state, receivedAt: performance.now()});\);

onlineCode = onlineCode.replace(/const wait=Number\\.isFinite\\(gameState\\.startsAt\\)\\?Math\\.max\\(0,gameState\\.startsAt-\\(Date\\.now\\(\\)\\+serverOffset\\.current\\)\\):0;/g, \const assumedDelivery = latency ? latency / 2 : 150;
        const timeSinceReceipt = performance.now() - (gameState.receivedAt ?? performance.now());
        const estimatedServerTime = (gameState.serverNow ?? Date.now()) + assumedDelivery + timeSinceReceipt;
        const wait = Number.isFinite(gameState.startsAt) ? Math.max(0, gameState.startsAt - estimatedServerTime) : 0;\);

onlineCode = onlineCode.replace(/const elapsed = gameState\\.introPending\\?0:Number\\.isFinite\\(gameState\\.serverNow\\)\\?Math\\.max\\(0,Date\\.now\\(\\)\\+serverOffset\\.current-Math\\.max\\(gameState\\.serverNow,gameState\\.startsAt\\?\\?0\\)\\):Math\\.max\\(0,performance\\.now\\(\\) - localStartTime-startDelay\\);/g, \const assumedDelivery = latency ? latency / 2 : 150;
            const timeSinceReceipt = performance.now() - localStartTime;
            const estimatedServerTime = (gameState.serverNow ?? Date.now()) + assumedDelivery + timeSinceReceipt;
            const elapsed = gameState.introPending ? 0 : Number.isFinite(gameState.serverNow) ? Math.max(0, estimatedServerTime - Math.max(gameState.serverNow, gameState.startsAt ?? 0)) : Math.max(0, timeSinceReceipt - startDelay);\);

onlineCode = onlineCode.replace(/},\\s*\\[gameState,roomId,initialOnlineRole,socket,introDuration\\]\\);/g, \},[gameState,roomId,initialOnlineRole,socket,introDuration,latency]);\);

onlineCode = onlineCode.replace(/},\\s*\\[gameState\\]\\);/g, \}, [gameState, latency]);\);

fs.writeFileSync('src/components/OnlineGameBoard.tsx', onlineCode);

let boardCode = fs.readFileSync('src/components/Board3D.tsx', 'utf8');
boardCode = boardCode.replace(/roughness=\\{.72\\}/g, \oughness={glass ? .72 : .8}\);
fs.writeFileSync('src/components/Board3D.tsx', boardCode);

console.log('Patched files successfully!');
