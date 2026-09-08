import sys
import re

def patch_preferences():
    with open('src/hooks/useBoardPreferences.ts', 'r', encoding='utf-8') as f:
        text = f.read()
    
    text = text.replace("'classic'|'marble'|'neon'", "'q-gambit'|'classic'|'marble'|'neon'")
    text = text.replace("('classic')", "('q-gambit')")
    text = text.replace("savedDesign === 'classic' || savedDesign === 'marble' || savedDesign === 'neon'",
                        "savedDesign === 'q-gambit' || savedDesign === 'classic' || savedDesign === 'marble' || savedDesign === 'neon'")
    
    with open('src/hooks/useBoardPreferences.ts', 'w', encoding='utf-8') as f:
        f.write(text)

def patch_game_boards():
    for filepath in ['src/components/LocalGameBoard.tsx', 'src/components/OnlineGameBoard.tsx']:
        with open(filepath, 'r', encoding='utf-8') as f:
            text = f.read()
        
        text = text.replace("const themes: ('classic'|'marble'|'neon')[] = ['classic', 'marble', 'neon'];",
                            "const themes: ('q-gambit'|'classic'|'marble'|'neon')[] = ['q-gambit', 'classic', 'marble', 'neon'];")
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(text)

def patch_board2d():
    with open('src/components/Board2D.tsx', 'r', encoding='utf-8') as f:
        text = f.read()
    
    text = text.replace("boardDesign?: 'classic' | 'marble' | 'neon';", "boardDesign?: 'q-gambit' | 'classic' | 'marble' | 'neon';")
    text = text.replace("boardDesign = 'classic'", "boardDesign = 'q-gambit'")
    
    old_bg = "background: boardDesign === 'marble' ? '#a0a0a0' : boardDesign === 'neon' ? '#1a0b2e' : '#11100E',"
    new_bg = "background: boardDesign === 'marble' ? '#a0a0a0' : boardDesign === 'neon' ? '#4a154b' : boardDesign === 'q-gambit' ? '#11100E' : '#2c1e16',"
    text = text.replace(old_bg, new_bg)
    
    old_colors = """                    let bgClass = isDark ? 'bg-[#7a4d2c]' : 'bg-[#e6cfb3]';
                    if (boardDesign === 'marble') bgClass = isDark ? 'bg-[#8aa1b1]' : 'bg-[#fdfdfd]';
                    if (boardDesign === 'neon') bgClass = isDark ? 'bg-[#231236]' : 'bg-[#42245c]';

                    if (isLastMove) {
                        if (boardDesign === 'marble') bgClass = isDark ? 'bg-[#8d9c5b]' : 'bg-[#e8f0b1]';
                        else if (boardDesign === 'neon') bgClass = isDark ? 'bg-[#8a0a4f]' : 'bg-[#ff1493]';
                        else bgClass = isDark ? 'bg-[#8f773b]' : 'bg-[#e6d38e]';
                    }"""
    
    new_colors = """                    let bgClass = isDark ? 'bg-[#7a4d2c]' : 'bg-[#e6cfb3]'; // classic
                    if (boardDesign === 'marble') bgClass = isDark ? 'bg-[#8aa1b1]' : 'bg-[#fdfdfd]';
                    if (boardDesign === 'neon') bgClass = isDark ? 'bg-[#4a1c60]' : 'bg-[#00e5ff]'; // Much brighter neon
                    if (boardDesign === 'q-gambit') bgClass = isDark ? 'bg-[#2A2621]' : 'bg-[#E8E2D7]';

                    if (isLastMove) {
                        if (boardDesign === 'marble') bgClass = isDark ? 'bg-[#8d9c5b]' : 'bg-[#e8f0b1]';
                        else if (boardDesign === 'neon') bgClass = isDark ? 'bg-[#ff1493]' : 'bg-[#ff99cc]';
                        else if (boardDesign === 'q-gambit') bgClass = isDark ? 'bg-[#8c7435]' : 'bg-[#D4B872]';
                        else bgClass = isDark ? 'bg-[#8f773b]' : 'bg-[#e6d38e]';
                    }"""
    text = text.replace(old_colors, new_colors)
    
    with open('src/components/Board2D.tsx', 'w', encoding='utf-8') as f:
        f.write(text)

patch_preferences()
patch_game_boards()
patch_board2d()
print("Patched settings and 2D board")
