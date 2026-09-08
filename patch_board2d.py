import sys

with open('src/components/Board2D.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

old_colors = """                    let bgClass = isDark ? 'bg-[#5c3e29]' : 'bg-[#d4c0a5]';
                    if (boardDesign === 'marble') bgClass = isDark ? 'bg-[#708090]' : 'bg-[#f2f2f2]';
                    if (boardDesign === 'neon') bgClass = isDark ? 'bg-[#0a0a10]' : 'bg-[#2a2a35]';

                    if (isLastMove) {
                        if (boardDesign === 'marble') bgClass = isDark ? 'bg-[#8d9c5b]' : 'bg-[#e8f0b1]';
                        else if (boardDesign === 'neon') bgClass = isDark ? 'bg-[#2b0b20]' : 'bg-[#401530]';
                        else bgClass = isDark ? 'bg-[#8f773b]' : 'bg-[#e6d38e]';
                    }"""

new_colors = """                    let bgClass = isDark ? 'bg-[#7a4d2c]' : 'bg-[#e6cfb3]';
                    if (boardDesign === 'marble') bgClass = isDark ? 'bg-[#8aa1b1]' : 'bg-[#fdfdfd]';
                    if (boardDesign === 'neon') bgClass = isDark ? 'bg-[#231236]' : 'bg-[#42245c]';

                    if (isLastMove) {
                        if (boardDesign === 'marble') bgClass = isDark ? 'bg-[#8d9c5b]' : 'bg-[#e8f0b1]';
                        else if (boardDesign === 'neon') bgClass = isDark ? 'bg-[#8a0a4f]' : 'bg-[#ff1493]';
                        else bgClass = isDark ? 'bg-[#8f773b]' : 'bg-[#e6d38e]';
                    }"""

text = text.replace(old_colors, new_colors)

with open('src/components/Board2D.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print("Patched Board2D colors")
