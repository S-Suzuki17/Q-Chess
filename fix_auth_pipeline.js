const fs = require('fs');

// 1. Fix SocketContext.tsx to use SUPABASE- for real users, and keep GUEST- for guests
let socketContext = fs.readFileSync('src/lib/SocketContext.tsx', 'utf8');
socketContext = socketContext.replace(/const token = userId\.startsWith\('GUEST-'\) \? userId : `GUEST-\$\{userId\}`;/g, "const token = userId.startsWith('GUEST-') ? userId : `SUPABASE-${userId}`;");
fs.writeFileSync('src/lib/SocketContext.tsx', socketContext, 'utf8');

// 2. Fix FirebaseAuthService.ts to strip SUPABASE-
let authService = fs.readFileSync('server/src/services/FirebaseAuthService.ts', 'utf8');
const target = "if (token.startsWith('GUEST-')) return token;";
if (authService.includes(target)) {
    authService = authService.replace(target, "if (token.startsWith('GUEST-')) return token;\n        if (token.startsWith('SUPABASE-')) return token.replace('SUPABASE-', '');");
    fs.writeFileSync('server/src/services/FirebaseAuthService.ts', authService, 'utf8');
} else {
    console.log("Could not find target in FirebaseAuthService");
}
