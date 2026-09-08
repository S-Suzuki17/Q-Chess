import sys

with open('src/components/OnlineGameBoard.tsx', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

# 1. Allow selecting any piece in the lse block
old_selection = """        } else {
            const clickedPiece = gameState.pieces.find((p: any) => !p.captured && p.y === targetRow && p.x === targetCol);
            if (clickedPiece) {
                const expectedTeam = onlineRole === 'white' ? 0 : 1;
                if (clickedPiece.team !== expectedTeam) {
                    setErrorMsg(expectedTeam === 0 ? t.errNotYourTurnBlue : t.errNotYourTurnRed);
                    return;
                }
                setSelectedTokenId(	oken_);
            }
        }"""
new_selection = """        } else {
            const clickedPiece = gameState.pieces.find((p: any) => !p.captured && p.y === targetRow && p.x === targetCol);
            if (clickedPiece) {
                setSelectedTokenId(	oken_);
            }
        }"""
text = text.replace(old_selection, new_selection)

# 2. Update selection switching logic
old_move = """            if (clickedOtherPiece && clickedOtherPiece.team === expectedTeam) {
                setSelectedTokenId(	oken_);
                return;
            }

            // Client optimistic action (will be intercepted if ambiguous)
            const token = gameState.pieces.find((p: any) => p.id === numId);
            if (!token || token.team !== expectedTeam || gameState.turn !== expectedTeam) {
                setErrorMsg(lang === 'ja' ? '自分の順番に自分の駒を動かしてね。' : 'Move your own piece on your turn.');
                return;
            }"""
new_move = """            if (clickedOtherPiece) {
                setSelectedTokenId(	oken_);
                return;
            }

            // Client optimistic action (will be intercepted if ambiguous)
            const token = gameState.pieces.find((p: any) => p.id === numId);
            if (!token || token.team !== expectedTeam || gameState.turn !== expectedTeam) {
                setSelectedTokenId(null);
                return;
            }"""
text = text.replace(old_move, new_move)

with open('src/components/OnlineGameBoard.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print("OnlineGameBoard patched.")
