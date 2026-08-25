const fs = require('fs');
let code = fs.readFileSync('src/app/page.tsx', 'utf8');
code = "import { SocketProvider } from '../lib/SocketContext';\n" + code;
code = code.replace(/return \(\s*<main/g, 'return (\n        <SocketProvider userId={user?.id}>\n        <main');
code = code.replace(/<\/main>\n\s*\);\n}/g, '</main>\n        </SocketProvider>\n    );\n}');
fs.writeFileSync('src/app/page.tsx', code);
