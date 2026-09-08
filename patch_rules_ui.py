import sys
import re

# Patch rules/page.tsx
with open('src/app/rules/page.tsx', 'r', encoding='utf-8', errors='ignore') as f:
    rules_text = f.read()

# Remove the content dictionary
rules_text = re.sub(r'const content = \{.*?(?=  const t = content\[lang\] || content\[\'en\'\];)', '', rules_text, flags=re.DOTALL)
# Import the dict
rules_text = rules_text.replace("import { LANGUAGES } from '@/locales/dict';", "import { LANGUAGES } from '@/locales/dict';\nimport { rulesDict } from '@/locales/rulesDict';")
# Change const t = content[lang] || content['en']; to const t = rulesDict[lang] || rulesDict['en'];
rules_text = rules_text.replace("const t = content[lang] || content['en'];", "const t = rulesDict[lang as keyof typeof rulesDict] || rulesDict['en'];")
rules_text = rules_text.replace("const t = content[lang] || content[\"en\"];", "const t = rulesDict[lang as keyof typeof rulesDict] || rulesDict['en'];")

with open('src/app/rules/page.tsx', 'w', encoding='utf-8') as f:
    f.write(rules_text)

# Patch InteractiveTutorial.tsx
with open('src/components/InteractiveTutorial.tsx', 'r', encoding='utf-8', errors='ignore') as f:
    tut_text = f.read()

tut_text = tut_text.replace("import Board3D from './Board3D';", "import Board3D from './Board3D';\nimport { tutorialDict } from '@/locales/rulesDict';")

old_text = """    let instructions = '';
    let validMoves: {row: number, col: number}[] = [];

    if (step === 0 || step === 1) {
        instructions = lang === 'ja' 
            ? "1. 正体はわからない！\\n\\nこのチェスでは、動くまで駒の正体がわかりません！\\nまずは白の駒をタップして、光っているマスへ動かしてみましょう。\\n（斜めに動いたので、この駒は「ビショップ」か「クイーン」のどちらかだと絞り込まれます！）" 
            : "1. Hidden Identities\\n\\nIn this chess game, you don't know what a piece is until it moves!\\nClick the White piece and move it to the highlighted square. Because it moved diagonally, it MUST be a Bishop or a Queen.";
        if (step === 0) validMoves = [{ row: 6, col: 4 }];
        if (step === 1) validMoves = [{ row: 3, col: 7 }];
    } else if (step === 2) {
        instructions = lang === 'ja' 
            ? "素晴らしい！動かし方によって、ゲームが自動的に駒の正体を絞り込んでくれます。"
            : "Great! Based on how it moved, the game narrowed down what piece it could be.";
    } else if (step === 3 || step === 4) {
        instructions = lang === 'ja' 
            ? "2. 駒を取る\\n\\n次は黒の駒をタップして、白の駒を取ってみましょう。\\n（まっすぐ２マス動いたので、この駒は「ルーク」か「クイーン」だとわかります！）"
            : "2. Capturing Pieces\\n\\nNow, click the Black piece and move it to capture the White piece. Because it moved straight forward 2 squares, it MUST be a Rook or a Queen.";
        if (step === 3) validMoves = [{ row: 1, col: 7 }];
        if (step === 4) validMoves = [{ row: 3, col: 7 }];
    } else if (step === 5) {
        instructions = lang === 'ja' 
            ? "駒を取りました！\\nこのように、正体が完全に暴かれる前でも駒を取ることができます。"
            : "Piece captured! A piece can be captured and removed from the board even before its true identity is fully revealed.";
    } else if (step === 6 || step === 7) {
        instructions = lang === 'ja' 
            ? "3. 正体を特定する（フリップ）\\n\\n新しい白の駒が現れました。光っているマスへ動かしてみましょう。\\n（Ｌ字に動けるのは「ナイト」だけです！）"
            : "3. Revealing the True Identity\\n\\nA new White piece appeared. Move it to the highlighted square. Only a Knight can make an L-shape move!";
        if (step === 6) validMoves = [{ row: 7, col: 4 }];
        if (step === 7) validMoves = [{ row: 5, col: 5 }];
    } else if (step === 8) {
        instructions = lang === 'ja'
            ? "ナイトの正体が現れました！\\n「これしかあり得ない！」という状況になると、駒がひっくり返って本当の姿を見せます。"
            : "The Knight is revealed! When there's only one possibility left, the piece flips over and shows its true face.";
    } else if (step === 9 || step === 10) {
        instructions = lang === 'ja'
            ? "4. 連鎖的に正体が暴かれる！？\\n\\nもう一つの黒の駒が現れました（ルークかクイーンのどちらかです）。\\n最初の黒の駒を斜めに動かして、白のナイトを取ってみましょう。"
            : "4. Chain Reactions\\n\\nAnother Black piece appeared. Move the first Black piece diagonally to capture the White Knight.";
        if (step === 9) validMoves = [{ row: 3, col: 7 }];
        if (step === 10) validMoves = [{ row: 5, col: 5 }];
    } else if (step === 11) {
        instructions = lang === 'ja'
            ? "見事です！\\n最初の黒の駒は「まっすぐ」にも「斜め」にも動きました。両方できるのは「クイーン」だけなので、クイーンに確定しました！\\n\\nさらに！クイーンは１人しかいないため、もう一つの黒の駒は自動的に「ルーク」だと確定しました！\\nこのように、パズルのように正体を推理していくのがこのゲームの醍醐味です！"
            : "Brilliant! The Black piece moved both straight and diagonally. Only a Queen can do both, so it's a Queen!\\n\\nAlso, since there's only one Queen, the other Black piece is instantly forced to be a Rook without even moving! This deduction puzzle is the heart of the game.";
    }"""
new_text = """    const t = tutorialDict[lang as keyof typeof tutorialDict] || tutorialDict['en'];
    let instructions = t.steps[step] || '';
    let validMoves: {row: number, col: number}[] = [];

    if (step === 0) validMoves = [{ row: 6, col: 4 }];
    if (step === 1) validMoves = [{ row: 3, col: 7 }];
    if (step === 3) validMoves = [{ row: 1, col: 7 }];
    if (step === 4) validMoves = [{ row: 3, col: 7 }];
    if (step === 6) validMoves = [{ row: 7, col: 4 }];
    if (step === 7) validMoves = [{ row: 5, col: 5 }];
    if (step === 9) validMoves = [{ row: 3, col: 7 }];
    if (step === 10) validMoves = [{ row: 5, col: 5 }];
"""
tut_text = tut_text.replace(old_text, new_text)

tut_text = tut_text.replace("{lang === 'ja' ? '遊び方' : 'How to Play'}", "{t.title}")
tut_text = tut_text.replace("{step === 11 ? (lang === 'ja' ? 'ゲームをはじめる！' : 'START PLAYING!') : (lang === 'ja' ? '次へ' : 'NEXT')}", "{step === 11 ? t.play : t.next}")
tut_text = tut_text.replace("{lang === 'ja' ? '閉じる' : 'Close'}", "{t.close}")

with open('src/components/InteractiveTutorial.tsx', 'w', encoding='utf-8') as f:
    f.write(tut_text)
print("Patched UI strings")
