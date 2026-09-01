const fs = require('fs');
let code = fs.readFileSync('src/components/LevelSelect.tsx', 'utf8');

code = code.replace(
    /const startRandomMatch = React\.useCallback\(\(mode: 'random' \| 'ranked', tc: TimeControl\) => \{[\s\S]*?\}\, \[startMatchmaking\]\);/g,
    `const startRandomMatch = React.useCallback((mode: 'random' | 'ranked', tc: TimeControl) => {
        const tcSeconds = tc === '3m' ? 180 : tc === '10m' ? 600 : 10;
        onStartGlobalMatch?.(tcSeconds);
    }, [onStartGlobalMatch]);`
);

// Fallback in case regex doesn't match the exact format:
code = code.replace(
    `const startRandomMatch = React.useCallback((mode: 'random' | 'ranked', tc: TimeControl) => {
        setIsSearching(true);
        const tcSeconds = tc === '3m' ? 180 : tc === '10m' ? 600 : 10;
        startMatchmaking(tcSeconds);
    }, [startMatchmaking]);`,
    `const startRandomMatch = React.useCallback((mode: 'random' | 'ranked', tc: TimeControl) => {
        const tcSeconds = tc === '3m' ? 180 : tc === '10m' ? 600 : 10;
        onStartGlobalMatch?.(tcSeconds);
    }, [onStartGlobalMatch]);`
);

fs.writeFileSync('src/components/LevelSelect.tsx', code, 'utf8');
console.log('Fixed startRandomMatch');
