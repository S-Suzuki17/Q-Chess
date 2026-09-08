import sys
import re

def clean_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        text = f.read()

    # Board2D cleanup
    if 'Board2D' in filepath:
        text = re.sub(r"const isLastMove =.*?\n", "", text)
        text = re.sub(r"if \(isLastMove\) \{[\s\S]*?\}\n", "", text)

    # Board3D cleanup
    if 'Board3D' in filepath:
        text = re.sub(r"const lastMove =.*?\n", "", text)
        text = re.sub(r"const isLastMove =.*?\n", "", text)
        # Find 'if (isLastMove) {' and remove everything until 'if (isMoveCandidate)'
        text = re.sub(r"if \(isLastMove\) \{[\s\S]*?if \(isMoveCandidate\)", "if (isMoveCandidate)", text)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(text)

clean_file('src/components/Board2D.tsx')
clean_file('src/components/Board3D.tsx')
print("Cleaned up last move highlight")
