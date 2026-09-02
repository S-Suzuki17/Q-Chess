const fs = require('fs');
let content = fs.readFileSync('src/components/OnlineGameBoard.tsx', 'utf8');

// Fix 1: targetId guest check
content = content.replace(
    /const cleanId = targetId\.replace\('GUEST-', ''\);\s*if \(cleanId\.startsWith\('GUEST-'\)\) \{/g,
    `const isGuest = targetId.startsWith('GUEST-');\n        if (isGuest) {`
);

// Fix 2: id guest check
content = content.replace(
    /const clean = id\.replace\('GUEST-', ''\);\s*if \(clean\.startsWith\('GUEST-'\)\) return guestLabel;/g,
    `if (id.startsWith('GUEST-')) return guestLabel;`
);

fs.writeFileSync('src/components/OnlineGameBoard.tsx', content, 'utf8');
