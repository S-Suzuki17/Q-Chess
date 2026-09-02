const fs = require('fs');
let code = fs.readFileSync('src/lib/gameRecordService.ts', 'utf8');

code = code.replace(/\.not\('id', 'like', 'GUEST-%'\)/g, ".not('id', 'like', 'GUEST-%').not('id', 'like', 'anon_%')");

fs.writeFileSync('src/lib/gameRecordService.ts', code, 'utf8');
