import sys
import re

# ------------- Board3D.tsx -------------
with open('src/components/Board3D.tsx', 'r', encoding='utf-8') as f:
    t3d = f.read()

props_old = "export interface Board3DProps {"
props_new = """export interface Board3DProps {
    is2DView?: boolean;
    boardDesign?: 'classic' | 'marble' | 'neon';
    hintMove?: { fromRow: number, fromCol: number, toRow: number, toCol: number } | null;"""
t3d = t3d.replace(props_old, props_new)

cam_old = """const ResponsiveCamera = () => {
    const { camera, size } = useThree();"""
cam_new = """const ResponsiveCamera = ({ isFlipped, is2DView }: { isFlipped: boolean, is2DView: boolean }) => {
    const { camera, size } = useThree();"""
t3d = t3d.replace(cam_old, cam_new)

cam_inner_old = """        // Force the camera distance and FOV so it ALWAYS fits
        const pCam = camera as THREE.PerspectiveCamera;
        if (Math.abs(pCam.fov - targetFov) > 0.1) {
            pCam.fov = targetFov;
            pCam.updateProjectionMatrix();
        }"""
cam_inner_new = """        // Force the camera distance and FOV so it ALWAYS fits
        const pCam = camera as THREE.PerspectiveCamera;
        let needsUpdate = false;
        if (Math.abs(pCam.fov - targetFov) > 0.1) {
            pCam.fov = targetFov;
            needsUpdate = true;
        }

        // Handle 2D / 3D position transitions
        const targetPos = is2DView 
            ? new THREE.Vector3(0, 15, isFlipped ? -0.1 : 0.1) // 0.1 offset to define 'up' direction easily
            : new THREE.Vector3(0, 8, isFlipped ? -6 : 6);
            
        if (pCam.position.distanceTo(targetPos) > 0.1) {
            pCam.position.lerp(targetPos, 0.1);
            pCam.lookAt(0, 0, 0);
            needsUpdate = true;
        }

        if (needsUpdate) {
            pCam.updateProjectionMatrix();
        }"""
t3d = t3d.replace(cam_inner_old, cam_inner_new)

squares_old = "const BoardSquares = ({ validMoves, moveHistory, onSquareClick, isEnemySelected }: any) => {"
squares_new = "const BoardSquares = ({ validMoves, moveHistory, onSquareClick, isEnemySelected, boardDesign, hintMove }: any) => {"
t3d = t3d.replace(squares_old, squares_new)

color_logic_old = """            let color = isLight ? '#d4c0a5' : '#5c3e29';
            if (isLastMove) color = isLight ? '#e6d38e' : '#8f773b';"""
color_logic_new = """            let color = isLight ? '#d4c0a5' : '#5c3e29';
            if (boardDesign === 'marble') color = isLight ? '#f2f2f2' : '#708090';
            if (boardDesign === 'neon') color = isLight ? '#2a2a35' : '#0a0a10';
            
            if (isLastMove) {
                if (boardDesign === 'marble') color = isLight ? '#e8f0b1' : '#8d9c5b';
                else if (boardDesign === 'neon') color = isLight ? '#401530' : '#2b0b20';
                else color = isLight ? '#e6d38e' : '#8f773b';
            }
            
            const isHintTo = hintMove && hintMove.toRow === r && hintMove.toCol === c;
            const isHintFrom = hintMove && hintMove.fromRow === r && hintMove.fromCol === c;
            """
t3d = t3d.replace(color_logic_old, color_logic_new)

hint_visual = """                    {isMoveCandidate && (
                        <mesh position={[0, 0.06, 0]} rotation={[-Math.PI/2, 0, 0]}>
                            <circleGeometry args={[0.3, 32]} />
                            <meshBasicMaterial color={isEnemySelected ? "#ff4444" : "#D4B872"} transparent opacity={isEnemySelected ? 0.7 : 0.5} />
                        </mesh>
                    )}"""
hint_visual_new = hint_visual + """
                    {(isHintTo || isHintFrom) && (
                        <mesh position={[0, 0.07, 0]} rotation={[-Math.PI/2, 0, 0]}>
                            <ringGeometry args={[0.35, 0.45, 32]} />
                            <meshBasicMaterial color="#00ff00" transparent opacity={0.8} />
                        </mesh>
                    )}"""
t3d = t3d.replace(hint_visual, hint_visual_new)

render_old = "<ResponsiveCamera />"
render_new = "<ResponsiveCamera isFlipped={!!props.isFlipped} is2DView={!!props.is2DView} />"
t3d = t3d.replace(render_old, render_new)

board_comp_old = "<BoardSquares validMoves={props.showMoveHints ? props.validMoves : []} moveHistory={props.moveHistory} onSquareClick={props.onSquareClick} isEnemySelected={isEnemySelected} />"
board_comp_new = "<BoardSquares validMoves={props.showMoveHints ? props.validMoves : []} moveHistory={props.moveHistory} onSquareClick={props.onSquareClick} isEnemySelected={isEnemySelected} boardDesign={props.boardDesign} hintMove={props.hintMove} />"
t3d = t3d.replace(board_comp_old, board_comp_new)

old_bg = "style={{ background: 'radial-gradient(circle at 50% 50%, #4a3424 0%, #1a100b 100%)', touchAction: 'none' }}"
new_bg = "style={{ background: props.boardDesign === 'marble' ? 'radial-gradient(circle at 50% 50%, #e0e0e0 0%, #a0a0a0 100%)' : props.boardDesign === 'neon' ? 'radial-gradient(circle at 50% 50%, #1a0b2e 0%, #000000 100%)' : 'radial-gradient(circle at 50% 50%, #4a3424 0%, #1a100b 100%)', touchAction: 'none' }}"
t3d = t3d.replace(old_bg, new_bg)

with open('src/components/Board3D.tsx', 'w', encoding='utf-8') as f:
    f.write(t3d)


# ------------- LocalGameBoard.tsx -------------
with open('src/components/LocalGameBoard.tsx', 'r', encoding='utf-8') as f:
    tlocal = f.read()

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
tlocal = tlocal.replace(state_injection, state_injection_new)

return_pos = tlocal.find("return (\n        <div className=\"flex flex-col items-center")
if return_pos == -1: return_pos = tlocal.find("return (\n")
wrapper_div = tlocal.find('relative select-none touch-none overflow-hidden pb-4">', return_pos) + len('relative select-none touch-none overflow-hidden pb-4">')

sidebars = """
            {/* LEFT SIDEBAR BUTTONS */}
            <div className="absolute left-2 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-30">
                <button onClick={() => window.dispatchEvent(new CustomEvent('show-settings'))} className="w-10 h-10 md:w-12 md:h-12 bg-black/60 rounded-lg flex items-center justify-center border border-[#B39A62]/50 hover:bg-black/80 transition-all text-gray-300">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                </button>
                <button onClick={onHome} className="w-10 h-10 md:w-12 md:h-12 bg-black/60 rounded-lg flex items-center justify-center border border-[#B39A62]/50 hover:bg-black/80 transition-all text-gray-300">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                </button>
                <button onClick={() => setIs2DView(!is2DView)} className={`w-10 h-10 md:w-12 md:h-12 rounded-lg flex items-center justify-center border transition-all text-gray-300 font-bold ${is2DView ? 'bg-[#B39A62]/80 border-white text-white' : 'bg-black/60 border-[#B39A62]/50 hover:bg-black/80'}`}>
                    2D
                </button>
            </div>

            {/* RIGHT SIDEBAR BUTTONS */}
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-30">
                <button onClick={() => {
                    const themes: ('classic'|'marble'|'neon')[] = ['classic', 'marble', 'neon'];
                    const next = themes[(themes.indexOf(boardDesign) + 1) % themes.length];
                    setBoardDesign(next);
                }} className="w-10 h-10 md:w-12 md:h-12 bg-black/60 rounded-lg flex items-center justify-center border border-[#B39A62]/50 hover:bg-black/80 transition-all text-gray-300">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle></svg>
                </button>
                {!roomId && (
                    <button onClick={requestHint} disabled={isRequestingHint || currentTurn !== myRole || !!winner} className={`w-10 h-10 md:w-12 md:h-12 rounded-lg flex items-center justify-center border transition-all text-gray-300 ${isRequestingHint ? 'bg-yellow-900/80 animate-pulse border-yellow-500' : 'bg-black/60 border-[#B39A62]/50 hover:bg-black/80'} ${(isRequestingHint || currentTurn !== myRole || !!winner) ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill={hintMove ? "#eab308" : "none"} stroke={hintMove ? "#eab308" : "currentColor"} strokeWidth="2"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="M4 12H2"></path><path d="M22 12h-2"></path><path d="M19.07 4.93l-1.41 1.41"></path><path d="M6.34 17.66l-1.41 1.41"></path><path d="M19.07 19.07l-1.41-1.41"></path><path d="M6.34 6.34l-1.41 1.41"></path></svg>
                    </button>
                )}
            </div>
"""
tlocal = tlocal[:wrapper_div] + sidebars + tlocal[wrapper_div:]

board3d_pos = tlocal.find("<Board3D")
board3d_end = tlocal.find("/>", board3d_pos) + 2
new_board3d = tlocal[board3d_pos:board3d_end].replace("<Board3D", "<Board3D is2DView={is2DView} boardDesign={boardDesign} hintMove={hintMove}")
tlocal = tlocal[:board3d_pos] + new_board3d + tlocal[board3d_end:]

with open('src/components/LocalGameBoard.tsx', 'w', encoding='utf-8') as f:
    f.write(tlocal)

# ------------- OnlineGameBoard.tsx -------------
with open('src/components/OnlineGameBoard.tsx', 'r', encoding='utf-8') as f:
    tonline = f.read()

state_injection = """    const [showRules, setShowRules] = useState(false);"""
state_injection_new = """    const [showRules, setShowRules] = useState(false);
    const [is2DView, setIs2DView] = useState(false);
    const [boardDesign, setBoardDesign] = useState<'classic' | 'marble' | 'neon'>('classic');"""
tonline = tonline.replace(state_injection, state_injection_new)

return_pos = tonline.find("return (\n        <div className=\"flex flex-col items-center")
if return_pos == -1: return_pos = tonline.find("return (\n")
wrapper_div = tonline.find('relative select-none touch-none overflow-hidden pb-4">', return_pos) + len('relative select-none touch-none overflow-hidden pb-4">')

sidebars = """
            {/* LEFT SIDEBAR BUTTONS */}
            <div className="absolute left-2 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-30">
                <button onClick={() => window.dispatchEvent(new CustomEvent('show-settings'))} className="w-10 h-10 md:w-12 md:h-12 bg-black/60 rounded-lg flex items-center justify-center border border-[#B39A62]/50 hover:bg-black/80 transition-all text-gray-300">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                </button>
                <button onClick={onHome} className="w-10 h-10 md:w-12 md:h-12 bg-black/60 rounded-lg flex items-center justify-center border border-[#B39A62]/50 hover:bg-black/80 transition-all text-gray-300">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                </button>
                <button onClick={() => setIs2DView(!is2DView)} className={`w-10 h-10 md:w-12 md:h-12 rounded-lg flex items-center justify-center border transition-all text-gray-300 font-bold ${is2DView ? 'bg-[#B39A62]/80 border-white text-white' : 'bg-black/60 border-[#B39A62]/50 hover:bg-black/80'}`}>
                    2D
                </button>
            </div>

            {/* RIGHT SIDEBAR BUTTONS */}
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-30">
                <button onClick={() => {
                    const themes: ('classic'|'marble'|'neon')[] = ['classic', 'marble', 'neon'];
                    const next = themes[(themes.indexOf(boardDesign) + 1) % themes.length];
                    setBoardDesign(next);
                }} className="w-10 h-10 md:w-12 md:h-12 bg-black/60 rounded-lg flex items-center justify-center border border-[#B39A62]/50 hover:bg-black/80 transition-all text-gray-300">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle></svg>
                </button>
            </div>
"""
tonline = tonline[:wrapper_div] + sidebars + tonline[wrapper_div:]

board3d_pos = tonline.find("<Board3D")
board3d_end = tonline.find("/>", board3d_pos) + 2
new_board3d = tonline[board3d_pos:board3d_end].replace("<Board3D", "<Board3D is2DView={is2DView} boardDesign={boardDesign}")
tonline = tonline[:board3d_pos] + new_board3d + tonline[board3d_end:]

with open('src/components/OnlineGameBoard.tsx', 'w', encoding='utf-8') as f:
    f.write(tonline)
print("Finished patching all files safely.")
