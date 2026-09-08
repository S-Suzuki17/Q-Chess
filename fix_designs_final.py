import sys
import re

def patch_board2d():
    with open('src/components/Board2D.tsx', 'r', encoding='utf-8') as f:
        text = f.read()

    # 1. Remove isLastMove line
    text = re.sub(r"const isLastMove = lastMove && \(\(lastMove\.from\[0\] === row && lastMove\.from\[1\] === col\) \|\| \(lastMove\.to\[0\] === row && lastMove\.to\[1\] === col\)\);\n\s*", "", text)
    
    # 2. Remove isLastMove if-block
    text = re.sub(r"if \(isLastMove\) \{[\s\S]*?\}\n", "", text)
    
    # 3. Enhance Neon colors in 2D
    text = text.replace("if (boardDesign === 'neon') bgClass = isDark ? 'bg-[#221633]' : 'bg-[#49316b]';",
                        "if (boardDesign === 'neon') bgClass = isDark ? 'bg-[#6a00ff]' : 'bg-[#00e5ff]';")

    with open('src/components/Board2D.tsx', 'w', encoding='utf-8') as f:
        f.write(text)

def patch_board3d():
    with open('src/components/Board3D.tsx', 'r', encoding='utf-8') as f:
        text = f.read()

    # 1. Add Backdrop to imports
    if "Backdrop" not in text:
        text = text.replace("import { OrbitControls", "import { Backdrop, OrbitControls")

    # 2. Replace BackgroundEffects entirely
    bg_regex = r"const BackgroundEffects = .*?};\n"
    new_bg = """const BackgroundEffects = ({ design }: { design: 'classic' | 'marble' | 'neon' }) => {
    switch (design) {
        case 'marble':
            return (
                <>
                    <color attach="background" args={['#e2e8f0']} />
                    <ambientLight intensity={0.8} />
                    <directionalLight position={[5, 15, 5]} intensity={1.5} castShadow shadow-mapSize={[2048, 2048]} />
                    <Backdrop floor={15} segments={20} receiveShadow position={[0, -0.5, -10]} scale={[50, 20, 10]}>
                        <meshStandardMaterial color="#f1f5f9" roughness={0.5} />
                    </Backdrop>
                </>
            );
        case 'neon':
            return (
                <>
                    <fog attach="fog" args={['#090014', 10, 40]} />
                    <color attach="background" args={['#090014']} />
                    <ambientLight intensity={1.5} />
                    <directionalLight position={[0, 10, 10]} intensity={2.0} color="#00ffff" />
                    <spotLight position={[10, 10, -10]} intensity={2.5} color="#ff00ff" penumbra={0.5} />
                    <spotLight position={[-10, 10, 10]} intensity={2.5} color="#00ffff" penumbra={0.5} />
                    
                    <mesh position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                        <planeGeometry args={[200, 200]} />
                        <meshStandardMaterial color="#090014" roughness={0.2} metalness={0.8} />
                    </mesh>
                    <gridHelper args={[200, 100, '#ff00ff', '#00ffff']} position={[0, -0.49, 0]} />
                </>
            );
        case 'classic':
        default:
            return (
                <>
                    <color attach="background" args={['#161412']} />
                    <ambientLight intensity={0.7} />
                    <directionalLight position={[5, 10, 5]} intensity={1.5} castShadow shadow-mapSize={[2048, 2048]} />
                    <spotLight position={[-10, 20, 0]} intensity={1.5} color="#ffedd5" penumbra={1} castShadow />
                    
                    <Backdrop floor={15} segments={20} receiveShadow position={[0, -0.5, -10]} scale={[50, 20, 10]}>
                        <meshStandardMaterial color="#2a1f1a" roughness={1} />
                    </Backdrop>
                    
                    <mesh position={[0, -0.5, 0]} receiveShadow>
                        <cylinderGeometry args={[12, 12, 0.2, 64]} />
                        <meshStandardMaterial color="#1f1812" roughness={0.7} metalness={0.1} />
                    </mesh>
                </>
            );
    }
};
"""
    text = re.sub(bg_regex, new_bg, text, flags=re.DOTALL)

    # 3. Remove isLastMove logic entirely from BoardSquares
    text = re.sub(r"const isLastMove = lastMove && \(\(lastMove\.from\[0\] === r && lastMove\.from\[1\] === c\) \|\| \(lastMove\.to\[0\] === r && lastMove\.to\[1\] === c\)\);\n\s*", "", text)
    text = re.sub(r"if \(isLastMove\) \{[\s\S]*?\}\n\s*(if \(isMoveCandidate\))", r"\1", text)

    # 4. Enhance Neon colors in 3D
    neon_old = """            if (boardDesign === 'marble') {
                color = isLight ? '#c7cfd1' : '#54636e';
                metalness = 0.2;
                roughness = 0.4;
            } else if (boardDesign === 'neon') {
                color = isLight ? '#49316b' : '#221633';
                metalness = 0.5;
                roughness = 0.4;
            }"""
    neon_new = """            if (boardDesign === 'marble') {
                color = isLight ? '#c7cfd1' : '#54636e';
                metalness = 0.2;
                roughness = 0.4;
            } else if (boardDesign === 'neon') {
                color = isLight ? '#00e5ff' : '#6a00ff';
                metalness = 0.8;
                roughness = 0.1;
                emissive = isLight ? '#00e5ff' : '#6a00ff';
                emissiveIntensity = 0.3;
            }"""
    text = text.replace(neon_old, neon_new)

    with open('src/components/Board3D.tsx', 'w', encoding='utf-8') as f:
        f.write(text)

patch_board2d()
patch_board3d()
print("Patched backgrounds, removed last move highlight, enhanced neon")
