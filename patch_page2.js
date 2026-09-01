const fs = require('fs');
let pageCode = fs.readFileSync('src/app/page.tsx', 'utf8');

pageCode = pageCode.replace(
    `onOnlineMatch={handleOnlineMatch}`,
    `onOnlineMatch={handleOnlineMatch}\n                        onStartGlobalMatch={(tcSeconds) => { setIsSearchingGlobally(true); setTimeControlTarget(tcSeconds); handleSelectLevel(3, tcSeconds === 10 ? '10s' : tcSeconds === 180 ? '3m' : '10m'); }}`
);

fs.writeFileSync('src/app/page.tsx', pageCode, 'utf8');
console.log('Added onStartGlobalMatch to page.tsx');
