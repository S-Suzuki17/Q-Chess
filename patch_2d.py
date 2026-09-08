import sys

# 1. Update Board3D.tsx
with open('src/components/Board3D.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Add import
if 'import { QuantumPieceUI }' not in text:
    text = text.replace("import { Token } from '../lib/GameEngine';", "import { Token } from '../lib/GameEngine';\nimport { QuantumPieceUI } from './QuantumPieceUI';")

# Update Piece3D props
text = text.replace(
    "const Piece3D = ({ token, isSelected, candidates, onSquareClick, isDead = false }: { token: Token, isSelected: boolean, candidates?: ReadonlySet<PieceType>, onSquareClick: (r:number, c:number) => void, isDead?: boolean }) => {",
    "const Piece3D = ({ token, isSelected, candidates, onSquareClick, isDead = false, is2DView = false, isFlipped = false }: { token: Token, isSelected: boolean, candidates?: ReadonlySet<PieceType>, onSquareClick: (r:number, c:number) => void, isDead?: boolean, is2DView?: boolean, isFlipped?: boolean }) => {"
)

# Update Piece3D render
old_render = """        <group ref={groupRef} onClick={(e) => { e.stopPropagation(); onSquareClick(token.row, token.col); }}>
            {confirmedType ? (
                <RealisticPiece type={confirmedType} isWhite={isWhite} />
            ) : (
                <group>
                    <RealisticPiece type="Pawn" isWhite={isWhite} isHologram />
                    {/* Add a subtle question mark or glow for unknown identity */}
                </group>
            )}
        </group>"""

new_render = """        <group ref={groupRef} onClick={(e) => { e.stopPropagation(); onSquareClick(token.row, token.col); }}>
            {is2DView ? (
                <Billboard follow={true} lockX={false} lockY={false} lockZ={false} position={[0, 0.1, 0]}>
                    <group scale={isFlipped ? [-0.035, -0.035, 0.035] : [0.035, 0.035, 0.035]}>
                        <Html transform distanceFactor={10} zIndexRange={[100, 0]} pointerEvents="none">
                            <div style={{ pointerEvents: 'none' }}>
                                <QuantumPieceUI 
                                    id={token.id} 
                                    player={token.player} 
                                    probabilities={token.probabilities} 
                                    candidates={candidates} 
                                    isSelected={isSelected} 
                                    onClick={() => {}} 
                                    promotedTo={token.promotedTo} 
                                />
                            </div>
                        </Html>
                    </group>
                </Billboard>
            ) : (
                <>
                {confirmedType ? (
                    <RealisticPiece type={confirmedType} isWhite={isWhite} />
                ) : (
                    <group>
                        <RealisticPiece type="Pawn" isWhite={isWhite} isHologram />
                    </group>
                )}
                </>
            )}
        </group>"""
text = text.replace(old_render, new_render)

# Update the render of pieces in Board3D component
old_piece_call = "<Piece3D key={token.id} token={token} isSelected={token.id === props.selectedTokenId} candidates={props.candidatesMap?.get(token.id)} onSquareClick={props.onSquareClick} isDead={isDead} />"
new_piece_call = "<Piece3D key={token.id} token={token} isSelected={token.id === props.selectedTokenId} candidates={props.candidatesMap?.get(token.id)} onSquareClick={props.onSquareClick} isDead={isDead} is2DView={!!props.is2DView} isFlipped={!!props.isFlipped} />"
text = text.replace(old_piece_call, new_piece_call)

# Update Hint colors in BoardSquares
hint_visual_old = """                    {(isHintTo || isHintFrom) && (
                        <mesh position={[0, 0.07, 0]} rotation={[-Math.PI/2, 0, 0]}>
                            <ringGeometry args={[0.35, 0.45, 32]} />
                            <meshBasicMaterial color="#00ff00" transparent opacity={0.8} />
                        </mesh>
                    )}"""
hint_visual_new = """                    {isHintFrom && (
                        <mesh position={[0, 0.07, 0]} rotation={[-Math.PI/2, 0, 0]}>
                            <ringGeometry args={[0.35, 0.45, 32]} />
                            <meshBasicMaterial color="#3b82f6" transparent opacity={0.8} />
                        </mesh>
                    )}
                    {isHintTo && (
                        <mesh position={[0, 0.07, 0]} rotation={[-Math.PI/2, 0, 0]}>
                            <ringGeometry args={[0.35, 0.45, 32]} />
                            <meshBasicMaterial color="#22c55e" transparent opacity={0.8} />
                        </mesh>
                    )}"""
text = text.replace(hint_visual_old, hint_visual_new)

with open('src/components/Board3D.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

# 2. Update LocalGameBoard.tsx for Hint button restriction
with open('src/components/LocalGameBoard.tsx', 'r', encoding='utf-8') as f:
    tlocal = f.read()

# Change condition from !roomId to !roomId && cpuLevel && cpuLevel > 0
btn_old = "{!roomId && ("
btn_new = "{!roomId && cpuLevel !== undefined && cpuLevel > 0 && ("

# Find the specific one for Hint (it's the 3rd right sidebar button)
# Wait, let's just do a specific replace
target_hint = """                {!roomId && (
                    <button onClick={requestHint}"""
new_hint = """                {!roomId && cpuLevel !== undefined && cpuLevel > 0 && (
                    <button onClick={requestHint}"""
tlocal = tlocal.replace(target_hint, new_hint)

with open('src/components/LocalGameBoard.tsx', 'w', encoding='utf-8') as f:
    f.write(tlocal)

print("Updated 2D pieces and hint constraints.")
