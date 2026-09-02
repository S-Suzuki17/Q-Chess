const fs = require('fs');
let mm = fs.readFileSync('server/src/matchmaking/MatchmakingService.ts', 'utf8');
mm = mm.replace(
    /export interface MatchSession \{/g,
    `export interface MatchSession {\n    justStartedFlag?: boolean;`
);
fs.writeFileSync('server/src/matchmaking/MatchmakingService.ts', mm, 'utf8');
