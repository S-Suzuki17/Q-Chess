import sys

with open('src/components/LocalGameBoard.tsx', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

my_code = """    const [is2DView, setIs2DView] = useState(false);
    const [boardDesign, setBoardDesign] = useState<'classic' | 'marble' | 'neon'>('classic');
    const [hintMove, setHintMove] = useState<{fromRow: number, fromCol: number, toRow: number, toCol: number} | null>(null);
    const [isRequestingHint, setIsRequestingHint] = useState(false);
    
    // Clear hint when turn changes
    useEffect(() => { setHintMove(null); }, [currentTurn]);
    
    const requestHint = () => {
        if (winner || isRequestingHint || currentTurn !== myRole || !tokens.length) return;
        setIsRequestingHint(true);
        const state = legacyToQuantumState(tokens, pool, myRole, moveHistory.length, moveHistory.at(-1) ?? null);
        requestCPUSearch(state, new AbortController().signal, 5).then(stats => {
            setIsRequestingHint(false);
            if (stats.move) {
                const legacy = quantumToLegacyMove(stats.move, state);
                const fromToken = tokens.find(t => t.id === legacy.tokenId);
                if (fromToken) {
                    setHintMove({ fromRow: fromToken.row, fromCol: fromToken.col, toRow: legacy.toRow, toCol: legacy.toCol });
                }
            }
        }).catch(() => setIsRequestingHint(false));
    };"""

text = text.replace(my_code, "")
current_turn_line = "const [currentTurn, setCurrentTurn] = useState<'white' | 'black'>('white');"
text = text.replace(current_turn_line, current_turn_line + "\n" + my_code)

with open('src/components/LocalGameBoard.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print("Fixed order in Local")
