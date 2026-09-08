import sys

def patch_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        text = f.read()

    settings_btn = """<button onClick={() => window.dispatchEvent(new CustomEvent('show-settings'))} className="w-10 h-10 md:w-12 md:h-12 bg-black/60 rounded-lg flex items-center justify-center border border-[#B39A62]/50 hover:bg-black/80 transition-all text-gray-300">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                </button>"""
    text = text.replace(settings_btn, "")

    hint_btn = """{!roomId && cpuLevel !== undefined && cpuLevel > 0 && (
                    <button onClick={requestHint} disabled={isRequestingHint || currentTurn !== myRole || !!winner} className={w-10 h-10 md:w-12 md:h-12 rounded-lg flex items-center justify-center border transition-all text-gray-300  }>
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill={hintMove ? "#eab308" : "none"} stroke={hintMove ? "#eab308" : "currentColor"} strokeWidth="2"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="M4 12H2"></path><path d="M22 12h-2"></path><path d="M19.07 4.93l-1.41 1.41"></path><path d="M6.34 17.66l-1.41 1.41"></path><path d="M19.07 19.07l-1.41-1.41"></path><path d="M6.34 6.34l-1.41 1.41"></path></svg>
                    </button>
                )}"""
    text = text.replace(hint_btn, "")
    
    # Check if we missed the old hint btn format just in case
    hint_btn_old = """{!roomId && (
                    <button onClick={requestHint} disabled={isRequestingHint || currentTurn !== myRole || !!winner} className={w-10 h-10 md:w-12 md:h-12 rounded-lg flex items-center justify-center border transition-all text-gray-300  }>
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill={hintMove ? "#eab308" : "none"} stroke={hintMove ? "#eab308" : "currentColor"} strokeWidth="2"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="M4 12H2"></path><path d="M22 12h-2"></path><path d="M19.07 4.93l-1.41 1.41"></path><path d="M6.34 17.66l-1.41 1.41"></path><path d="M19.07 19.07l-1.41-1.41"></path><path d="M6.34 6.34l-1.41 1.41"></path></svg>
                    </button>
                )}"""
    text = text.replace(hint_btn_old, "")

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(text)

patch_file('src/components/LocalGameBoard.tsx')
patch_file('src/components/OnlineGameBoard.tsx')
print("Patched GameBoards safely")
