const fs = require('fs');
let code = fs.readFileSync('server/src/services/SupabaseService.ts', 'utf8');

const regex = /if \(whiteId === 'ai' \|\| blackId === 'ai' \|\| whiteId.startsWith\('anon_'\) \|\| blackId.startsWith\('anon_'\)\) \{[\s\S]*?return true;\s*\}/;

const replacement = `let realWhite = whiteId.startsWith('anon_') ? whiteId.replace('anon_', '') : whiteId;
            let realBlack = blackId.startsWith('anon_') ? blackId.replace('anon_', '') : blackId;

            if (realWhite === 'ai' || realBlack === 'ai' || realWhite.startsWith('GUEST-') || realBlack.startsWith('GUEST-') || realWhite === '' || realBlack === '') {
                console.log(\`[DB] Skipping DB write for AI/Guest match \${matchId}\`);
                return true;
            }`;

code = code.replace(regex, replacement);

// Replace the RPC call arguments too!
const rpcRegex = /p_white_id: whiteId,\s*p_black_id: blackId,/;
const rpcReplacement = `p_white_id: realWhite,\n                p_black_id: realBlack,`;
code = code.replace(rpcRegex, rpcReplacement);

fs.writeFileSync('server/src/services/SupabaseService.ts', code);
