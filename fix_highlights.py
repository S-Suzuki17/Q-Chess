import sys
import re

with open('src/components/Board3D.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

squares_regex = r"if \(isLastMove\) \{.*?else color = isLight \? '#e6d38e' : '#8f773b';\s*\}"
new_squares = """if (isLastMove) {
                if (boardDesign === 'marble') color = isLight ? '#d2db9e' : '#7a8a66';
                else if (boardDesign === 'neon') {
                    color = isLight ? '#8a428a' : '#4d1f4d';
                    emissive = '#ff3366';
                    emissiveIntensity = 0.2;
                } else color = isLight ? '#e6d38e' : '#8f773b';
            }
            
            if (isMoveCandidate) {
                color = isEnemySelected ? '#ff6b6b' : '#D4B872';
                emissive = isEnemySelected ? '#ff0000' : '#D4B872';
                emissiveIntensity = 0.5;
            }"""

text = re.sub(squares_regex, new_squares, text, flags=re.DOTALL)

# Remove the old circle geometry
circle_regex = r"\{isMoveCandidate && \(\s*<mesh position=\{\[0, 0\.06, 0\]\}.*?</mesh>\s*\)\}"
text = re.sub(circle_regex, "", text, flags=re.DOTALL)

with open('src/components/Board3D.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

print("Fixed move highlights in 3D")
