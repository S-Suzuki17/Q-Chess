import sys

with open('src/components/LocalGameBoard.tsx', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

# 1. Allow selecting any piece in the lse block
old_selection = """        } else {
            const clickedToken = tokens.find(t => t.row === targetRow && t.col === targetCol);
            if (clickedToken) {
                if (clickedToken.player !== currentTurn || (roomId && currentTurn !== onlineRole)) {
                    setErrorMsg(currentTurn === 'white' ? t.errNotYourTurnBlue : t.errNotYourTurnRed);
                    return;
                }
                setSelectedTokenId(clickedToken.id);
            }
        }"""
new_selection = """        } else {
            const clickedToken = tokens.find(t => t.row === targetRow && t.col === targetCol);
            if (clickedToken) {
                setSelectedTokenId(clickedToken.id);
            }
        }"""
text = text.replace(old_selection, new_selection)

# 2. Prevent moving if the selected piece doesn't belong to the player
old_move = """            if (token.row === targetRow && token.col === targetCol) {
                setSelectedTokenId(null);
                return;
            }"""
new_move = """            if (token.row === targetRow && token.col === targetCol) {
                setSelectedTokenId(null);
                return;
            }

            if (token.player !== currentTurn || (roomId && currentTurn !== onlineRole)) {
                const clickedOtherPiece = tokens.find(t => t.row === targetRow && t.col === targetCol);
                setSelectedTokenId(clickedOtherPiece ? clickedOtherPiece.id : null);
                return;
            }"""
text = text.replace(old_move, new_move)

with open('src/components/LocalGameBoard.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print("LocalGameBoard patched.")
