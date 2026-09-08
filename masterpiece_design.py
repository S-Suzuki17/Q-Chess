import sys
import re

with open('src/components/Board3D.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Make sure ContactShadows is imported
if "ContactShadows" not in text:
    text = text.replace("import { OrbitControls", "import { OrbitControls, ContactShadows")

# 1. Replace BackgroundEffects for masterpiece look
bg_regex = r"const BackgroundEffects = .*?};\n"
new_bg = """const BackgroundEffects = ({ design }: { design: 'classic' | 'marble' | 'neon' }) => {
    switch (design) {
        case 'marble':
            return (
                <>
                    <color attach="background" args={['#f4f4f5']} />
                    <Environment preset="city" />
                    <ambientLight intensity={1.0} />
                    <directionalLight position={[10, 20, 10]} intensity={1.5} color="#ffffff" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0001} />
                    <ContactShadows position={[0, -0.51, 0]} opacity={0.3} scale={30} blur={2.5} far={4} color="#000000" />
                </>
            );
        case 'neon':
            return (
                <>
                    <color attach="background" args={['#030008']} />
                    <Environment preset="night" />
                    <ambientLight intensity={1.2} />
                    <directionalLight position={[0, 15, 10]} intensity={1.5} color="#00ffff" />
                    <spotLight position={[15, 15, -15]} intensity={3.0} color="#ff00ff" penumbra={0.8} angle={0.5} />
                    <spotLight position={[-15, 15, 15]} intensity={3.0} color="#00ffff" penumbra={0.8} angle={0.5} />
                    <ContactShadows position={[0, -0.51, 0]} opacity={0.6} scale={30} blur={2.5} far={4} color="#ff00ff" />
                </>
            );
        case 'classic':
        default:
            return (
                <>
                    <color attach="background" args={['#110d0a']} />
                    <Environment preset="apartment" />
                    <ambientLight intensity={0.6} />
                    <spotLight position={[0, 20, 5]} intensity={2.5} color="#ffe8d6" penumbra={1} angle={0.6} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0001} />
                    <ContactShadows position={[0, -0.51, 0]} opacity={0.8} scale={30} blur={2.5} far={4} color="#000000" />
                </>
            );
    }
};
"""
text = re.sub(bg_regex, new_bg, text, flags=re.DOTALL)

# 2. Replace the dynamic Board Base
base_regex = r"\{/\* Dynamic Board Base \*/\}.*?</mesh>"
new_base = """{/* Masterpiece Dynamic Board Base */}
                {props.boardDesign === 'neon' ? (
                    <group position={[0, -0.25, 0]}>
                        {/* Glowing Rim */}
                        <mesh position={[0, -0.1, 0]}>
                            <boxGeometry args={[8.6, 0.3, 8.6]} />
                            <meshStandardMaterial color="#00e5ff" emissive="#00e5ff" emissiveIntensity={0.8} />
                        </mesh>
                        {/* Glossy Dark Acrylic Top */}
                        <mesh position={[0, 0.1, 0]} receiveShadow>
                            <boxGeometry args={[8.4, 0.1, 8.4]} />
                            <meshPhysicalMaterial color="#050010" roughness={0.05} metalness={0.9} clearcoat={1} clearcoatRoughness={0.05} />
                        </mesh>
                    </group>
                ) : props.boardDesign === 'marble' ? (
                    <mesh position={[0, -0.25, 0]} receiveShadow>
                        <boxGeometry args={[8.6, 0.4, 8.6]} />
                        <meshPhysicalMaterial color="#f8fafc" roughness={0.15} metalness={0.05} transmission={0.6} thickness={2} clearcoat={1} clearcoatRoughness={0.1} />
                    </mesh>
                ) : (
                    <mesh position={[0, -0.25, 0]} receiveShadow>
                        <boxGeometry args={[8.6, 0.4, 8.6]} />
                        <meshPhysicalMaterial color="#1a0f0a" roughness={0.2} metalness={0.1} clearcoat={0.8} clearcoatRoughness={0.2} />
                    </mesh>
                )}"""
text = re.sub(base_regex, new_base, text, flags=re.DOTALL)

# 3. Replace BoardSquares to use physical materials and glowing neon
squares_regex = r"let color = isLight \? '#d4c0a5' : '#5c3e29';[\s\S]*?if \(isMoveCandidate\)"
new_squares = """let color = isLight ? '#d4c0a5' : '#5c3e29';
            let metalness = 0.1;
            let roughness = 0.4;
            let emissive = '#000000';
            let emissiveIntensity = 0;
            let clearcoat = 0.5;

            if (boardDesign === 'marble') {
                color = isLight ? '#f8fafc' : '#64748b';
                metalness = 0.1;
                roughness = 0.2;
                clearcoat = 0.8;
            } else if (boardDesign === 'neon') {
                // Extremely bright emissive panels so black pieces contrast beautifully
                color = isLight ? '#00e5ff' : '#d400ff';
                metalness = 0.2;
                roughness = 0.2;
                emissive = isLight ? '#00e5ff' : '#d400ff';
                emissiveIntensity = 0.6;
                clearcoat = 1.0;
            }
            
            if (isMoveCandidate)"""
text = re.sub(squares_regex, new_squares, text, flags=re.DOTALL)

# Also fix the square material to use meshPhysicalMaterial
text = text.replace("<meshStandardMaterial color={color} roughness={roughness} metalness={metalness} emissive={emissive} emissiveIntensity={emissiveIntensity} />",
                    "<meshPhysicalMaterial color={color} roughness={roughness} metalness={metalness} emissive={emissive} emissiveIntensity={emissiveIntensity} clearcoat={clearcoat} clearcoatRoughness={0.1} />")

with open('src/components/Board3D.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

# Fix 2D Neon colors to match
with open('src/components/Board2D.tsx', 'r', encoding='utf-8') as f:
    text2 = f.read()

# Make 2D neon extremely bright cyan and magenta so black pieces show
text2 = text2.replace("if (boardDesign === 'neon') bgClass = isDark ? 'bg-[#221633]' : 'bg-[#49316b]';",
                      "if (boardDesign === 'neon') bgClass = isDark ? 'bg-[#d400ff]' : 'bg-[#00e5ff]';")

with open('src/components/Board2D.tsx', 'w', encoding='utf-8') as f:
    f.write(text2)

print("Masterpiece rewrite complete")
