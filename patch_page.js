const fs = require('fs');
let pageCode = fs.readFileSync('src/app/page.tsx', 'utf8');

const managerCode = `
import { useMatchmaking } from '../hooks/useMatchmaking';

function MatchmakingManager({ user, onMatchFound, isSearchingGlobally, cancelSearchGlobally, timeControlTarget }: { user: any, onMatchFound: (room: any) => void, isSearchingGlobally: boolean, cancelSearchGlobally: () => void, timeControlTarget: number }) {
    const { isSearching, matchedRoom, startMatchmaking, cancelMatchmaking } = useMatchmaking(user);
    
    React.useEffect(() => {
        if (isSearchingGlobally && !isSearching) {
            startMatchmaking(timeControlTarget);
        } else if (!isSearchingGlobally && isSearching) {
            cancelMatchmaking();
        }
    }, [isSearchingGlobally, startMatchmaking, cancelMatchmaking, timeControlTarget, isSearching]);

    React.useEffect(() => {
        if (matchedRoom) {
            onMatchFound(matchedRoom);
        }
    }, [matchedRoom, onMatchFound]);

    if (!isSearchingGlobally) return null;
    return (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-blue-900/80 border border-blue-500 rounded-full px-6 py-2 shadow-2xl backdrop-blur-sm flex items-center gap-4 cursor-pointer hover:bg-red-900/80 transition-colors group" onClick={cancelSearchGlobally} title="Click to cancel matchmaking">
            <span className="w-2 h-2 bg-blue-400 rounded-full animate-ping"></span>
            <span className="text-blue-100 text-xs tracking-widest font-bold group-hover:hidden">SEARCHING FOR OPPONENT...</span>
            <span className="text-red-100 text-xs tracking-widest font-bold hidden group-hover:block">CANCEL SEARCH</span>
        </div>
    );
}
`;

if (!pageCode.includes('MatchmakingManager')) {
    pageCode = pageCode.replace(
        `import { GameRecord } from '../lib/gameRecordService';`,
        `import { GameRecord } from '../lib/gameRecordService';\n${managerCode}`
    );

    pageCode = pageCode.replace(
        `const [showSettings, setShowSettings] = useState(false);`,
        `const [showSettings, setShowSettings] = useState(false);\n    const [isSearchingGlobally, setIsSearchingGlobally] = useState(false);\n    const [timeControlTarget, setTimeControlTarget] = useState(600);`
    );

    pageCode = pageCode.replace(
        `const handleOnlineMatch = (roomId: string, role: 'white' | 'black' | 'spectator', matchMode: 'random' | 'private' | 'ranked', tc: TimeControl, opponentId?: string) => {`,
        `const handleOnlineMatch = (roomId: string, role: 'white' | 'black' | 'spectator', matchMode: 'random' | 'private' | 'ranked', tc: TimeControl, opponentId?: string) => {\n        setIsSearchingGlobally(false);`
    );

    const targetProvider = `<SystemStatusBanner lang={lang} />`;
    pageCode = pageCode.replace(
        targetProvider,
        `${targetProvider}\n            <MatchmakingManager 
                user={user} 
                isSearchingGlobally={isSearchingGlobally} 
                cancelSearchGlobally={() => setIsSearchingGlobally(false)} 
                timeControlTarget={timeControlTarget}
                onMatchFound={(room) => {
                    handleOnlineMatch(room.id, room.myColor, 'random', (room.timeControl === 10 ? '10s' : room.timeControl === 180 ? '3m' : '10m') as TimeControl, room.joinerId === user?.id ? room.hostId : room.joinerId);
                }} 
            />`
    );

    fs.writeFileSync('src/app/page.tsx', pageCode, 'utf8');
    console.log('Patched page.tsx');
}
