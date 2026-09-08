import sys
import re

with open('src/components/LocalGameBoard.tsx', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

# 1. Add states
state_injection = """    const [showRules, setShowRules] = useState(false);"""
state_injection_new = """    const [showRules, setShowRules] = useState(false);
    const [is2DView, setIs2DView] = useState(false);
    const [boardDesign, setBoardDesign] = useState<'classic' | 'marble' | 'neon'>('classic');
    const [hintMove, setHintMove] = useState<{fromRow: number, fromCol: number, toRow: number, toCol: number} | null>(null);
    const [isRequestingHint, setIsRequestingHint] = useState(false);
    
    // Clear hint when turn changes
    useEffect(() => { setHintMove(null); }, [currentTurn]);
    
    const requestHint = () => {
        if (winner || isRequestingHint || currentTurn !== myRole || !tokens.length) return;
        setIsRequestingHint(true);
        const state = legacyToQuantumState(tokens, pool, myRole, moveHistory.length, moveHistory.at(-1) ?? null);
        requestCPUSearch(state, new AbortController().signal, 5).then(stats => {
            setIsRequestingHint(false);
            if (stats.move) {
                const legacy = quantumToLegacyMove(stats.move, state);
                const fromToken = tokens.find(t => t.id === legacy.tokenId);
                if (fromToken) {
                    setHintMove({ fromRow: fromToken.row, fromCol: fromToken.col, toRow: legacy.toRow, toCol: legacy.toCol });
                }
            }
        }).catch(() => setIsRequestingHint(false));
    };"""
text = text.replace(state_injection, state_injection_new)

# 2. Add buttons to JSX
# Find the return ( ...
return_pos = text.find("return (\n        <div className=\"flex flex-col items-center")
if return_pos == -1:
    return_pos = text.find("return (\n")

# We will inject the sidebars just inside the top level wrapper.
wrapper_div = text.find('relative select-none touch-none overflow-hidden pb-4">', return_pos) + len('relative select-none touch-none overflow-hidden pb-4">')

sidebars = """
            {/* LEFT SIDEBAR BUTTONS */}
            <div className="absolute left-2 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-30">
                <button onClick={() => window.dispatchEvent(new CustomEvent('show-settings'))} className="w-10 h-10 md:w-12 md:h-12 bg-black/60 rounded-lg flex items-center justify-center border border-[#B39A62]/50 hover:bg-black/80 transition-all text-gray-300">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                </button>
                <button onClick={onHome} className="w-10 h-10 md:w-12 md:h-12 bg-black/60 rounded-lg flex items-center justify-center border border-[#B39A62]/50 hover:bg-black/80 transition-all text-gray-300">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                </button>
                <button onClick={() => setIs2DView(!is2DView)} className={w-10 h-10 md:w-12 md:h-12 rounded-lg flex items-center justify-center border transition-all text-gray-300 font-bold }>
                    2D
                </button>
            </div>

            {/* RIGHT SIDEBAR BUTTONS */}
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-30">
                {!roomId && (
                    <button onClick={() => {
                            if (moveHistory.length > 0 && !winner) {
                                // Undo not strictly safe without tracking previous states fully, but could reload page or just not support it easily.
                                // The image has it so let's put it. But wait, undo in Q-Gambit is super complex. Let's make it alert for now or implement full undo if easy.
                                alert("Undo not implemented yet for Quantum Chess");
                            }
                        }} className="w-10 h-10 md:w-12 md:h-12 bg-black/60 rounded-lg flex items-center justify-center border border-[#B39A62]/50 hover:bg-black/80 transition-all text-gray-300">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7v6h6"></path><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path></svg>
                    </button>
                )}
                <button onClick={() => {
                    const themes: ('classic'|'marble'|'neon')[] = ['classic', 'marble', 'neon'];
                    const next = themes[(themes.indexOf(boardDesign) + 1) % themes.length];
                    setBoardDesign(next);
                }} className="w-10 h-10 md:w-12 md:h-12 bg-black/60 rounded-lg flex items-center justify-center border border-[#B39A62]/50 hover:bg-black/80 transition-all text-gray-300">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle></svg>
                </button>
                {!roomId && (
                    <button onClick={requestHint} disabled={isRequestingHint || currentTurn !== myRole || !!winner} className={w-10 h-10 md:w-12 md:h-12 rounded-lg flex items-center justify-center border transition-all text-gray-300  }>
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill={hintMove ? "#eab308" : "none"} stroke={hintMove ? "#eab308" : "currentColor"} strokeWidth="2"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="M4 12H2"></path><path d="M22 12h-2"></path><path d="M19.07 4.93l-1.41 1.41"></path><path d="M6.34 17.66l-1.41 1.41"></path><path d="M19.07 19.07l-1.41-1.41"></path><path d="M6.34 6.34l-1.41 1.41"></path></svg>
                    </button>
                )}
            </div>
"""
text = text[:wrapper_div] + sidebars + text[wrapper_div:]

# Now update the Board3D props in LocalGameBoard
# We need to find <Board3D
board3d_pos = text.find("<Board3D")
board3d_end = text.find("/>", board3d_pos) + 2

# We will inject the new props into Board3D
# <Board3D tokens={tokens} selectedTokenId={selectedTokenId} ... /> -> <Board3D is2DView={is2DView} boardDesign={boardDesign} hintMove={hintMove} ... />
import re
new_board3d = text[board3d_pos:board3d_end].replace("<Board3D", "<Board3D is2DView={is2DView} boardDesign={boardDesign} hintMove={hintMove}")
text = text[:board3d_pos] + new_board3d + text[board3d_end:]

# And we should hide the default back button at top-left?
# The user's image doesn't have the back button at top-left, instead it's on the sidebar as "Home".
# But maybe we keep it for now. I'll just remove the top-left "Surrender/Back" button or hide it if we have the sidebar.
# Wait, "Surrender" is important in online match. Let's keep existing buttons alone, they are not hurting.

with open('src/components/LocalGameBoard.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print("Patched LocalGameBoard.tsx")
