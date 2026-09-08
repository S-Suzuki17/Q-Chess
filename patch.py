import sys
import re

with open('src/components/InteractiveTutorial.tsx', 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

replacement = '''    let instructions = "";
    let validMoves: {row: number, col: number}[] = [];

    if (step === 0 || step === 1) {
        instructions = lang === 'ja' 
            ? "1. 正体がわからない駒！\\n\\nこのチェスでは、動かすまで駒の「本当の姿」がわかりません！\\nまずは白い駒をクリックして、光っているマスへ動かしてみてください。\\n（大きく斜めに動いたので、この駒は「ビショップ」か「クイーン」のどちらかだと絞り込まれました！）" 
            : "1. Hidden Identities\\n\\nIn this chess game, you don't know what a piece is until it moves!\\nClick the White piece and move it to the highlighted square. Because it moved diagonally, it MUST be a Bishop or a Queen.";
        if (step === 0) validMoves = [{ row: 6, col: 4 }];
        if (step === 1) validMoves = [{ row: 3, col: 7 }];
    } else if (step === 2) {
        instructions = lang === 'ja' 
            ? "素晴らしい！動かし方によって、少しずつ駒の正体がバレていくのがこのゲームのルールです。"
            : "Great! Based on how it moved, the game narrowed down what piece it could be.";
    } else if (step === 3 || step === 4) {
        instructions = lang === 'ja' 
            ? "2. 相手の駒を取る\\n\\n次は黒い駒をクリックして、さっきの白い駒を取ってみましょう。\\n（まっすぐ２マス動いたので、この黒い駒は「ルーク」か「クイーン」だとわかりました！）"
            : "2. Capturing Pieces\\n\\nNow, click the Black piece and move it to capture the White piece. Because it moved straight forward 2 squares, it MUST be a Rook or a Queen.";
        if (step === 3) validMoves = [{ row: 1, col: 7 }];
        if (step === 4) validMoves = [{ row: 3, col: 7 }];
    } else if (step === 5) {
        instructions = lang === 'ja' 
            ? "相手の駒を倒しました！\\n駒は、本当の正体がバレる前に盤面から退場することもあります。"
            : "Piece captured! A piece can be captured and removed from the board even before its true identity is fully revealed.";
    } else if (step === 6 || step === 7) {
        instructions = lang === 'ja' 
            ? "3. 正体が確定する瞬間\\n\\n新しい白い駒が現れました。光っているマスへ動かしてください。\\n（L字型に動けるのは「ナイト」だけです！）"
            : "3. Revealing the True Identity\\n\\nA new White piece appeared. Move it to the highlighted square. Only a Knight can make an L-shape move!";
        if (step === 6) validMoves = [{ row: 7, col: 4 }];
        if (step === 7) validMoves = [{ row: 5, col: 5 }];
    } else if (step === 8) {
        instructions = lang === 'ja'
            ? "ナイトの正体が現れました！\\n「これしかありえない！」という状況になると、駒がめくれて本当の姿を見せます。"
            : "The Knight is revealed! When there's only one possibility left, the piece flips over and shows its true face.";
    } else if (step === 9 || step === 10) {
        instructions = lang === 'ja'
            ? "4. 連鎖して正体がバレる！？\\n\\nもう一つ黒い駒が現れました（これもルークかクイーンのどちらかです）。\\nさっきの黒い駒を斜めに動かして、白いナイトを取ってください。"
            : "4. Chain Reactions\\n\\nAnother Black piece appeared. Move the first Black piece diagonally to capture the White Knight.";
        if (step === 9) validMoves = [{ row: 3, col: 7 }];
        if (step === 10) validMoves = [{ row: 5, col: 5 }];
    } else if (step === 11) {
        instructions = lang === 'ja'
            ? "お見事です！\\nこの黒い駒は「まっすぐ」にも「斜め」にも動きました。両方できるのは『クイーン』だけなので、クイーンに確定しました！\\n\\nさらに！クイーンは1人しかいないため、もう一つの黒い駒は自動的に『ルーク』だと確定しました。このように、推理パズルのように正体が連鎖して暴かれていくのがこのゲームの面白いところです！"
            : "Brilliant! The Black piece moved both straight and diagonally. Only a Queen can do both, so it's a Queen!\\n\\nAlso, since there's only one Queen, the other Black piece is instantly forced to be a Rook without even moving! This deduction puzzle is the heart of the game.";
    }
'''

new_content = re.sub(r'    let instructions = "";.*?    const nextScenario = \(\) => \{', replacement + '\n    const nextScenario = () => {', content, flags=re.DOTALL)

with open('src/components/InteractiveTutorial.tsx', 'w', encoding='utf-8') as f:
    f.write(new_content)
print("Patched successfully.")
