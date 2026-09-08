import sys

with open('src/components/Board3D.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

old_render = """        <group ref={groupRef} onClick={(e) => { e.stopPropagation(); onSquareClick(token.row, token.col); }}>
            {isSelected && !isDead && (
                <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.3, 0.45, 32]} />
                    <meshBasicMaterial color="#D4B872" transparent opacity={0.8} />
                </mesh>
            )}
            
            {confirmedType ? (
                <RealisticPiece type={confirmedType} isWhite={isWhite} />
            ) : (
                <QuantumBlock isWhite={isWhite} probabilities={token.probabilities} candidates={candidates} />
            )}
        </group>"""

new_render = """        <group ref={groupRef} onClick={(e) => { e.stopPropagation(); onSquareClick(token.row, token.col); }}>
            {isSelected && !isDead && (
                <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.3, 0.45, 32]} />
                    <meshBasicMaterial color="#D4B872" transparent opacity={0.8} />
                </mesh>
            )}
            
            {is2DView ? (
                <Billboard follow={true} lockX={false} lockY={false} lockZ={false} position={[0, 0.1, 0]}>
                    <group scale={[0.035, 0.035, 0.035]}>
                        <Html transform distanceFactor={10} zIndexRange={[100, 0]} pointerEvents="none" center>
                            <div style={{ pointerEvents: 'none', transform: isFlipped ? 'rotate(180deg)' : 'none' }}>
                                <QuantumPieceUI 
                                    id={token.id} 
                                    player={token.player} 
                                    probabilities={token.probabilities} 
                                    candidates={candidates} 
                                    isSelected={false} 
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
                    <QuantumBlock isWhite={isWhite} probabilities={token.probabilities} candidates={candidates} />
                )}
                </>
            )}
        </group>"""

text = text.replace(old_render, new_render)
with open('src/components/Board3D.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print("Patched Piece3D")
