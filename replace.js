const fs = require('fs');
const content = fs.readFileSync('src/components/LocalGameBoard.tsx', 'utf8');
const lines = content.split('\n');
const start = lines.findIndex(l => l.includes('// CPU'));
const end = lines.findIndex((l, i) => i > start && l.includes('}, [currentTurn, winner, tokens, pool, cpuLevel]);'));

const replacement = `    // CPU
    useEffect(() => {
        if (currentTurn === 'black' && !winner && !roomId) {
            const timer = setTimeout(async () => {
                try {
                    const { calculateCPUMove } = await import('../lib/AIEngine');
                    const move = calculateCPUMove(cpuLevel || 1, tokens, pool, 'black');
                    
                    if (move) {
                        const aiToken = tokens.find(t => t.id === move.tokenId);
                        if (aiToken) {
                            const targetToken = tokens.find(t => t.row === move.targetRow && t.col === move.targetCol);
                            executeMove(aiToken, move.targetRow, move.targetCol, move.possibleTypes, targetToken, true, move.promotedTo);
                        } else {
                            setCurrentTurn('white');
                        }
                    } else {
                        setCurrentTurn('white');
                    }
                } catch (err) {
                    console.error("AI execution failed:", err);
                    setCurrentTurn('white');
                }
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [currentTurn, winner, tokens, pool, cpuLevel]);`;

lines.splice(start, end - start + 1, replacement);
fs.writeFileSync('src/components/LocalGameBoard.tsx', lines.join('\n'), 'utf8');
