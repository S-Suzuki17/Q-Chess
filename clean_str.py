import sys

with open('src/components/Board3D.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

target = """            if (isLastMove) {
                if (boardDesign === 'marble') color = isLight ? '#d2db9e' : '#7a8a66';
                else if (boardDesign === 'neon') {
                    color = isLight ? '#8a428a' : '#4d1f4d';
                    emissive = '#ff3366';
                    emissiveIntensity = 0.2;
                } else color = isLight ? '#e6d38e' : '#8f773b';
            }"""

if target in text:
    text = text.replace(target, "")

with open('src/components/Board3D.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

with open('src/components/Board2D.tsx', 'r', encoding='utf-8') as f:
    text2 = f.read()

target2 = """                    if (isLastMove) {
                        if (boardDesign === 'marble') bgClass = isDark ? 'bg-[#7a8a66]' : 'bg-[#d2db9e]';
                        else if (boardDesign === 'neon') bgClass = isDark ? 'bg-[#4d1f4d]' : 'bg-[#8a428a]';
                        else bgClass = isDark ? 'bg-[#8f773b]' : 'bg-[#e6d38e]';
                    }"""
if target2 in text2:
    text2 = text2.replace(target2, "")

with open('src/components/Board2D.tsx', 'w', encoding='utf-8') as f:
    f.write(text2)

print("Fixed with string replacement")
