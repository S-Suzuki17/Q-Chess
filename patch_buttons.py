import sys
import re

def patch_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        text = f.read()

    # 1. Add showHomeConfirm state
    state_str = "const { is2DView, setIs2DView, boardDesign, setBoardDesign } = useBoardPreferences();"
    new_state = state_str + "\n    const [showHomeConfirm, setShowHomeConfirm] = useState(false);"
    if "setShowHomeConfirm" not in text:
        text = text.replace(state_str, new_state)

    # 2. Extract Palette button and remove it from RIGHT SIDEBAR
    # The palette button SVG path starts with "M12 19l7-7 3 3-7 7-3-3z"
    palette_match = re.search(r'(<button[^>]*onClick=\{\(\) => \{\s*const themes.*?</button>)', text, re.DOTALL)
    if not palette_match:
        print("Could not find palette button in", filepath)
        return
        
    palette_btn_code = palette_match.group(1)
    
    # Remove it from the text
    text = text.replace(palette_btn_code, "")
    
    # Also remove the empty RIGHT SIDEBAR div if it exists
    text = text.replace('<!-- RIGHT SIDEBAR BUTTONS -->\n            <div className="flex items-center gap-2">\n                \n            </div>', '')
    text = text.replace('{/* RIGHT SIDEBAR BUTTONS */}\n            <div className="flex items-center gap-2">\n                \n\n            </div>', '')
    text = text.replace('<div className="flex items-center gap-2">\n                \n\n            </div>', '')

    # 3. Modify Home button to trigger showHomeConfirm
    old_home = "onClick={onHome}"
    new_home = "onClick={() => setShowHomeConfirm(true)}"
    text = text.replace(old_home, new_home)

    # 4. Insert Palette button right after 2D/3D button
    view_btn_match = re.search(r'(<button aria-label=\{is2DView \? \'3D\' : \'2D\'\}.*?</button>)', text, re.DOTALL)
    if view_btn_match:
        view_btn_code = view_btn_match.group(1)
        text = text.replace(view_btn_code, view_btn_code + "\n" + palette_btn_code)
    else:
        print("Could not find 2D/3D button in", filepath)

    # 5. Add Home Confirm Modal just before the closing </div> of the main wrapper
    # It's usually the very last </div>.
    # Actually, we can just insert it at the end of the return statement.
    modal_code = """
            {showHomeConfirm && (
                <div className="absolute inset-0 bg-black/80 z-50 flex flex-col items-center justify-center p-6">
                    <div className="bg-[#2A2621] border-2 border-[#D4B872]/30 rounded-xl p-8 max-w-md w-full text-center relative shadow-2xl animate-stamp">
                        <h2 className="text-[#B39A62] text-xl font-bold mb-4">
                            {lang === 'ja' ? 'ホームに戻りますか？' : 'Return to Home?'}
                        </h2>
                        <p className="text-[#E8E2D7]/80 mb-8 text-sm">
                            {lang === 'ja' ? '進行中のゲームデータは失われる可能性があります。' : 'Any unsaved progress may be lost.'}
                        </p>
                        <div className="flex gap-4">
                            <button
                                onClick={() => setShowHomeConfirm(false)}
                                className="flex-1 px-4 py-3 bg-[#11100E] hover:bg-[#191714] border border-[#D4B872]/50 text-[#E8E2D7] font-bold rounded-lg transition-colors"
                            >
                                {lang === 'ja' ? 'キャンセル' : 'Cancel'}
                            </button>
                            <button
                                onClick={onHome}
                                className="flex-1 px-4 py-3 bg-red-900/60 hover:bg-red-800/80 border border-red-500/50 text-white font-bold rounded-lg transition-colors"
                            >
                                {lang === 'ja' ? '戻る' : 'Exit'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
    """
    
    # Let's insert it right after {winner && (...)} or similar modals, or just before the final </div>
    # The safest way is to insert it before the final </div>
    # In both files, the main container is a flex col items-center.
    # Let's just find `</div` at the very end of the file.
    last_div_idx = text.rfind("</div>")
    if last_div_idx != -1:
        text = text[:last_div_idx] + modal_code + text[last_div_idx:]

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(text)
    print("Patched", filepath)

patch_file('src/components/LocalGameBoard.tsx')
patch_file('src/components/OnlineGameBoard.tsx')
