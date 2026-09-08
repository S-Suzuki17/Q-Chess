import sys
import re

with open('src/components/Board3D.tsx', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

# 1. Update Board3DProps
props_old = "export interface Board3DProps {"
props_new = """export interface Board3DProps {
    is2DView?: boolean;
    boardDesign?: 'classic' | 'marble' | 'neon';
    hintMove?: { fromRow: number, fromCol: number, toRow: number, toCol: number } | null;"""
text = text.replace(props_old, props_new)

# 2. Update ResponsiveCamera to handle is2DView and camera pos
cam_old = """const ResponsiveCamera = () => {
    const { camera, size } = useThree();"""
cam_new = """const ResponsiveCamera = ({ isFlipped, is2DView }: { isFlipped: boolean, is2DView: boolean }) => {
    const { camera, size } = useThree();"""
text = text.replace(cam_old, cam_new)

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
            ? new THREE.Vector3(0, 10, isFlipped ? -0.1 : 0.1) // 0.1 offset to define 'up' direction easily
            : new THREE.Vector3(0, 8, isFlipped ? -6 : 6);
            
        if (pCam.position.distanceTo(targetPos) > 0.1) {
            pCam.position.lerp(targetPos, 0.1);
            pCam.lookAt(0, 0, 0);
            needsUpdate = true;
        }

        if (needsUpdate) {
            pCam.updateProjectionMatrix();
        }"""
text = text.replace(cam_inner_old, cam_inner_new)

# 3. Update BoardSquares to handle boardDesign and hintMove
squares_old = "const BoardSquares = ({ validMoves, moveHistory, onSquareClick, isEnemySelected }: any) => {"
squares_new = "const BoardSquares = ({ validMoves, moveHistory, onSquareClick, isEnemySelected, boardDesign, hintMove }: any) => {"
text = text.replace(squares_old, squares_new)

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
text = text.replace(color_logic_old, color_logic_new)

# Add hint visual
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
text = text.replace(hint_visual, hint_visual_new)

# 4. Pass props inside Board3D
render_old = "<ResponsiveCamera />"
render_new = "<ResponsiveCamera isFlipped={!!props.isFlipped} is2DView={!!props.is2DView} />"
text = text.replace(render_old, render_new)

board_comp_old = "<BoardSquares validMoves={props.showMoveHints ? props.validMoves : []} moveHistory={props.moveHistory} onSquareClick={props.onSquareClick} isEnemySelected={isEnemySelected} />"
board_comp_new = "<BoardSquares validMoves={props.showMoveHints ? props.validMoves : []} moveHistory={props.moveHistory} onSquareClick={props.onSquareClick} isEnemySelected={isEnemySelected} boardDesign={props.boardDesign} hintMove={props.hintMove} />"
text = text.replace(board_comp_old, board_comp_new)

with open('src/components/Board3D.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print("Patched Board3D.tsx")
