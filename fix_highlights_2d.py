import sys
import re

with open('src/components/Board2D.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

move_regex = r"\{isMoveCandidate && \(\s*<div className=\{\`absolute inset-0 m-auto w-1/3 h-1/3 rounded-full \$\{isEnemySelected \? 'bg-red-500/70' : 'bg-\[#B39A62\]/60'\} pointer-events-none animate-pulse\`\} />\s*\)\}"
new_move = """{isMoveCandidate && (
                                <div className={`absolute inset-0 border-4 ${isEnemySelected ? 'border-red-500/80 bg-red-500/30' : 'border-[#B39A62]/80 bg-[#B39A62]/30'} pointer-events-none animate-pulse`} />
                            )}"""

text = re.sub(move_regex, new_move, text, flags=re.DOTALL)

with open('src/components/Board2D.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

print("Fixed move highlights in 2D")
