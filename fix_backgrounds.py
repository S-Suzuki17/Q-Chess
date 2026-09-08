import sys
import re

with open('src/components/Board3D.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Fix BackgroundEffects
bg_regex = r"const BackgroundEffects = .*?};\n"
new_bg = """const BackgroundEffects = ({ design }: { design: 'classic' | 'marble' | 'neon' }) => {
    switch (design) {
        case 'marble':
            return (
                <>
                    <Environment preset="city" /> {/* Lighting only, no background */}
                    <color attach="background" args={['#dce1e8']} />
                    <ambientLight intensity={0.6} />
                    <directionalLight position={[10, 15, 10]} intensity={1.2} castShadow shadow-mapSize={[2048, 2048]} />
                    <mesh position={[0, -1, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                        <planeGeometry args={[100, 100]} />
                        <meshStandardMaterial color="#f0f2f5" roughness={0.8} />
                    </mesh>
                </>
            );
        case 'neon':
            return (
                <>
                    <color attach="background" args={['#0a0410']} />
                    <ambientLight intensity={0.4} />
                    <pointLight position={[-5, 5, 5]} color="#00e5ff" intensity={50} distance={30} />
                    <pointLight position={[5, 5, -5]} color="#ff3366" intensity={50} distance={30} />
                    <gridHelper args={[100, 100, '#ff3366', '#00e5ff']} position={[0, -1, 0]} />
                </>
            );
        case 'classic':
        default:
            return (
                <>
                    <Environment preset="studio" /> {/* Lighting only, no background image */}
                    <color attach="background" args={['#161412']} />
                    <ambientLight intensity={0.5} />
                    <directionalLight position={[5, 10, 5]} intensity={1.2} castShadow shadow-mapSize={[2048, 2048]} />
                    <mesh position={[0, -0.4, 0]} receiveShadow>
                        <cylinderGeometry args={[14, 14, 0.2, 64]} />
                        <meshStandardMaterial color="#1f1812" roughness={0.9} />
                    </mesh>
                </>
            );
    }
};
"""
text = re.sub(bg_regex, new_bg, text, flags=re.DOTALL)

# 2. Fix the transparent move highlight colors in Board3D
# From #D4B872 and #ff4444 to a clean bright blue/green or white
overlay_regex = r"<meshBasicMaterial color=\{isEnemySelected \? \"#ff4444\" : \"#D4B872\"\} transparent opacity=\{0\.4\} depthWrite=\{false\} />"
new_overlay = """<meshBasicMaterial color={isEnemySelected ? "#ff4444" : "#4ade80"} transparent opacity={0.3} depthWrite={false} />"""
text = re.sub(overlay_regex, new_overlay, text)

with open('src/components/Board3D.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

with open('src/components/Board2D.tsx', 'r', encoding='utf-8') as f:
    text2 = f.read()

# Fix colors in Board2D
overlay_2d_regex = r"className=\{\`absolute inset-0 \$\{isEnemySelected \? 'bg-red-500/40' : 'bg-\[#B39A62\]/40'\} pointer-events-none animate-pulse\`\}"
new_overlay_2d = """className={`absolute inset-0 ${isEnemySelected ? 'bg-red-500/30' : 'bg-green-500/30'} pointer-events-none`}"""
text2 = re.sub(overlay_2d_regex, new_overlay_2d, text2)

# Also fix the fallback string just in case animate-pulse is still there somewhere else in that line
text2 = text2.replace("animate-pulse", "")

with open('src/components/Board2D.tsx', 'w', encoding='utf-8') as f:
    f.write(text2)

print("Fixed backgrounds and highlight colors")
