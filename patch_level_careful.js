const fs = require('fs');
let code = fs.readFileSync('src/components/LevelSelect.tsx', 'utf8');

// 1. Add prop to interface
code = code.replace(
    `onOnlineMatch?: (roomId: string, role: 'white' | 'black' | 'spectator', matchMode: 'random' | 'private' | 'ranked', tc: TimeControl, opponentId?: string) => void;`,
    `onOnlineMatch?: (roomId: string, role: 'white' | 'black' | 'spectator', matchMode: 'random' | 'private' | 'ranked', tc: TimeControl, opponentId?: string) => void;\n    onStartGlobalMatch?: (tcSeconds: number) => void;`
);

// 2. Add prop to function signature
code = code.replace(
    `export function LevelSelect({ lang, user, onSelect, onOnlineMatch, onReplay, onBack }: LevelSelectProps) {`,
    `export function LevelSelect({ lang, user, onSelect, onOnlineMatch, onStartGlobalMatch, onReplay, onBack }: LevelSelectProps) {`
);

// 3. Remove useMatchmaking hook and state
code = code.replace(
    `const { isSearching: hookSearching, matchedRoom, startMatchmaking, cancelMatchmaking: hookCancel } = useMatchmaking(user);`,
    ``
);

// 4. Update startRandomMatch
code = code.replace(
    `const startRandomMatch = React.useCallback((mode: 'random' | 'ranked', tc: TimeControl) => {
        setIsSearching(true);
        const tcSeconds = tc === '3m' ? 180 : tc === '10m' ? 600 : 10;
        startMatchmaking(tcSeconds);
        if (action.type === 'cpu') {`,
    `const startRandomMatch = React.useCallback((mode: 'random' | 'ranked', tc: TimeControl) => {
        const tcSeconds = tc === '3m' ? 180 : tc === '10m' ? 600 : 10;
        onStartGlobalMatch?.(tcSeconds);
        if (action.type === 'cpu') {`
);

// 5. Remove the overlay exactly
const startIdx = code.indexOf('{/* Matchmaking Overlay */}');
if (startIdx > -1) {
    const searchString = `            {/* Matchmaking Overlay */}\n            {isSearching && (`;
    if (code.includes(searchString)) {
        // We will just replace it with a dummy comment so we don't break the JSX tree
        // Wait, removing it is safer if we know exactly where it ends.
        // Let's use regex with a precise end boundary `</button>\n                    </div>\n                </div>\n            )}`
        const overlayRegex = /\{\/\* Matchmaking Overlay \*\/\}\s*\{isSearching && \([\s\S]*?<\/button>\s*<\/div>\s*<\/div>\s*\)\}/;
        code = code.replace(overlayRegex, '');
    }
}

fs.writeFileSync('src/components/LevelSelect.tsx', code, 'utf8');
console.log('Patched carefully');
