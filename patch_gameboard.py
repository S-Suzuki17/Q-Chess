import sys

with open('src/components/LocalGameBoard.tsx', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

injection = """
    const anyModalOpen = showGameOver || showRules || promotionPending !== null || castlingPending !== null;
    useEffect(() => {
        window.dispatchEvent(new CustomEvent('hide-settings', { detail: anyModalOpen }));
    }, [anyModalOpen]);
"""

text = text.replace("const [moveHistory, setMoveHistory] = useState<MoveRecord[]>([]);", "const [moveHistory, setMoveHistory] = useState<MoveRecord[]>([]);" + injection)

with open('src/components/LocalGameBoard.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print("LocalGameBoard patched.")
