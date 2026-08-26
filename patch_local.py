import re

with open('src/components/LocalGameBoard.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace('const [isCheck, setIsCheck] = useState<boolean>(false);', 'const [isCheck, setIsCheck] = useState<boolean>(false);\n    const [showMoveHints, setShowMoveHints] = useState<boolean>(true);')

text = text.replace('const isMoveCandidate = validMoves.some(m => m.r === row && m.c === col);', 'const isMoveCandidate = showMoveHints && validMoves.some(m => m.r === row && m.c === col);')

tips_div = '''<div className="mt-4 text-[#00ff41] text-sm opacity-80 text-center px-4">
                {t.tips}
            </div>'''
            
toggle_html = '''<div className="mt-4 text-[#00ff41] text-sm opacity-80 text-center px-4">
                {t.tips}
            </div>

            {/* Show Move Hints Toggle */}
            <div className="w-full flex justify-center px-2 mt-4">
                <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer hover:text-gray-200 transition-colors select-none">
                    <input 
                        type="checkbox" 
                        checked={showMoveHints} 
                        onChange={(e) => setShowMoveHints(e.target.checked)} 
                        className="rounded border-gray-700 bg-gray-800 text-cyan-500 focus:ring-cyan-500/50 w-4 h-4 cursor-pointer" 
                    />
                    {lang === 'ja' ? 'コマの動ける範囲を表示する' : 'Show movable range'}
                </label>
            </div>'''

text = text.replace(tips_div, toggle_html)

with open('src/components/LocalGameBoard.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
