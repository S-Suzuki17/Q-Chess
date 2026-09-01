const fs = require('fs');
let code = fs.readFileSync('src/components/LevelSelect.tsx', 'utf8');

// 1. Remove matchedRoom useEffect
code = code.replace(
    /React\.useEffect\(\(\) => \{\s*if \(matchedRoom\) \{[\s\S]*?\}, \[matchedRoom, onOnlineMatch\]\);/g,
    ''
);

// 2. Remove hookCancel from cancelSearch
code = code.replace(
    /hookCancel\(\);\s*\}, \[hookCancel\]\);/g,
    `}, []);`
);

// 3. Fix startRandomMatch
code = code.replace(
    /const startRandomMatch = React\.useCallback\(\(mode: 'random' \| 'ranked', tc: TimeControl\) => \{\s*setIsSearching\(true\);\s*const tcSeconds = tc === '3m' \? 180 : tc === '10m' \? 600 : 10;\s*startMatchmaking\(tcSeconds\);\s*\}, \[startMatchmaking\]\);/g,
    `const startRandomMatch = React.useCallback((mode: 'random' | 'ranked', tc: TimeControl) => {
        const tcSeconds = tc === '3m' ? 180 : tc === '10m' ? 600 : 10;
        onStartGlobalMatch?.(tcSeconds);
    }, [onStartGlobalMatch]);`
);

fs.writeFileSync('src/components/LevelSelect.tsx', code, 'utf8');
console.log('Fixed hook leftovers');
