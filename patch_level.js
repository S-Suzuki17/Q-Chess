const fs = require('fs');
let code = fs.readFileSync('src/components/LevelSelect.tsx', 'utf8');

// 1. Add hook import
code = "import { useMatchmaking } from '../hooks/useMatchmaking';\n" + code;

// 2. Inject hook call
code = code.replace(
    /const \[matchFound, setMatchFound\] = React.useState\(false\);/,
    `const [matchFound, setMatchFound] = React.useState(false);\n    const { isSearching: hookSearching, matchedRoom, startMatchmaking, cancelMatchmaking: hookCancel } = useMatchmaking(user);`
);

// 3. Add effect to handle matchedRoom
const matchedRoomEffect = `
    React.useEffect(() => {
        if (matchedRoom) {
            setMatchFound(true);
            setIsSearching(false);
            setTimeout(() => {
                const tcStr = matchedRoom.timeControl === 180 ? '3m' : matchedRoom.timeControl === 600 ? '10m' : '15m';
                onOnlineMatch?.(matchedRoom.id, matchedRoom.myColor, 'random', tcStr, matchedRoom.myColor === 'white' ? matchedRoom.joinerId : matchedRoom.hostId);
                setMatchFound(false);
            }, 1500);
        }
    }, [matchedRoom, onOnlineMatch]);
`;
code = code.replace(/const cancelSearch = React.useCallback/g, matchedRoomEffect + '\n    const cancelSearch = React.useCallback');

// 4. Modify cancelSearch
code = code.replace(
    /const cancelSearch = React\.useCallback\(\(\) => \{[\s\S]*?\}, \[\]\);/m,
    `const cancelSearch = React.useCallback(() => {
        if (channelRef.current) {
            supabase.removeChannel(channelRef.current);
            channelRef.current = null;
        }
        setIsSearching(false);
        hookCancel();
    }, [hookCancel]);`
);

// 5. Modify startRandomMatch
code = code.replace(
    /const startRandomMatch = React\.useCallback\(\(mode: 'random' \| 'ranked', tc: TimeControl\) => \{[\s\S]*?\}, \[user, onOnlineMatch, cancelSearch, lang\]\);/m,
    `const startRandomMatch = React.useCallback((mode: 'random' | 'ranked', tc: TimeControl) => {
        setIsSearching(true);
        const tcSeconds = tc === '3m' ? 180 : tc === '10m' ? 600 : 900;
        startMatchmaking(tcSeconds);
    }, [startMatchmaking]);`
);

fs.writeFileSync('src/components/LevelSelect.tsx', code);
console.log('LevelSelect.tsx patched!');
