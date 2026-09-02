const fs = require('fs');

// Fix MatchmakingService.ts
let mm = fs.readFileSync('server/src/matchmaking/MatchmakingService.ts', 'utf8');
mm = mm.replace(
    /public connectMatch\(userId: string, matchId: string, userName\?: string, avatarUrl\?: string\): \{ success: boolean, match\?: MatchSession, engine\?: GameEngine \} \{/g,
    `public connectMatch(userId: string, matchId: string, userName?: string, avatarUrl?: string): { success: boolean, match?: MatchSession, engine?: GameEngine, justStarted?: boolean } {`
);

mm = mm.replace(
    /match\.state = 'IN_GAME';\s*const initialBoard = createInitialBoard\(\);\s*match\.engine = new GameEngine\(matchId, match\.players\.host, match\.players\.joiner, initialBoard, match\.timeControl, match\.playerNames\);\s*\}/g,
    `match.state = 'IN_GAME';
            const initialBoard = createInitialBoard();
            match.engine = new GameEngine(matchId, match.players.host, match.players.joiner, initialBoard, match.timeControl, match.playerNames);
            match.justStartedFlag = true;
        }`
);

mm = mm.replace(
    /return \{ success: true, match: updatedMatch, engine: updatedMatch\.engine \};/g,
    `return { success: true, match: updatedMatch, engine: updatedMatch.engine, justStarted: updatedMatch.justStartedFlag };`
);

// We need to consume justStartedFlag so it only fires once
mm = mm.replace(
    /match\.justStartedFlag = true;/g,
    `match.justStartedFlag = true;` // wait, if we return it, we should clear it. Let's just clear it after return. Actually, returning it is fine, but if both players call it, wait, only the second player calling it will trigger `match.state = 'IN_GAME'`! The first player called it when it was `CONNECTING` but `match.connected.joiner` was false!
);

fs.writeFileSync('server/src/matchmaking/MatchmakingService.ts', mm, 'utf8');

// Fix index.ts
let idx = fs.readFileSync('server/src/index.ts', 'utf8');
idx = idx.replace(
    /if \(result\.success && result\.engine\) \{\s*const publicState = result\.engine\.getPublicState\(userId\);\s*socket\.emit\('match_start', publicState\);\s*socket\.emit\('sync_state', publicState\);\s*\}/g,
    `if (result.success && result.engine) {
      if (result.justStarted) {
          const room = io.sockets.adapter.rooms.get(data.matchId);
          if (room) {
              for (const sid of room) {
                  const clientSocket = io.sockets.sockets.get(sid);
                  if (clientSocket) {
                      const uid = clientSocket.data.userId;
                      const pState = result.engine.getPublicState(uid);
                      clientSocket.emit('match_start', pState);
                      clientSocket.emit('sync_state', pState);
                  }
              }
          }
          if (result.match) result.match.justStartedFlag = false;
      } else {
          const publicState = result.engine.getPublicState(userId);
          socket.emit('match_start', publicState);
          socket.emit('sync_state', publicState);
      }
    }`
);

fs.writeFileSync('server/src/index.ts', idx, 'utf8');
