import sys

with open('src/components/OnlineGameBoard.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Add state
old_state = "const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);"
new_state = """const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
    const [opponentSelectedId, setOpponentSelectedId] = useState<string | null>(null);

    // Emit selection when it changes
    useEffect(() => {
        if (!socket || !roomId) return;
        socket.emit('piece_selection', { matchId: roomId, pieceId: selectedTokenId });
    }, [selectedTokenId, socket, roomId]);

    // Listen for opponent selection
    useEffect(() => {
        if (!socket) return;
        const handler = (data: { pieceId: string | null }) => {
            setOpponentSelectedId(data.pieceId);
        };
        socket.on('opponent_selection', handler);
        return () => { socket.off('opponent_selection', handler); };
    }, [socket]);"""

if old_state in text:
    text = text.replace(old_state, new_state)
else:
    print("Cannot find old_state")

# Add to Board2D
old_b2 = "selectedTokenId={selectedTokenId}"
new_b2 = "selectedTokenId={selectedTokenId}\n                    opponentSelectedTokenId={opponentSelectedId}"
if old_b2 in text:
    text = text.replace(old_b2, new_b2)
else:
    print("Cannot find old_b2")

with open('src/components/OnlineGameBoard.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print("Patched OnlineGameBoard")
