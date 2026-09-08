import sys
import re

with open('src/components/Board3D.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Make sure Sparkles is imported
if "Sparkles" not in text:
    text = text.replace("import { Backdrop", "import { Backdrop, Sparkles")

bg_regex = r"const BackgroundEffects = .*?};\n"
new_bg = """const BackgroundEffects = ({ design }: { design: 'classic' | 'marble' | 'neon' }) => {
    switch (design) {
        case 'marble':
            return (
                <group>
                    <fog attach="fog" args={['#f8fafc', 20, 80]} />
                    <color attach="background" args={['#f8fafc']} />
                    
                    {/* Bright marble floor */}
                    <mesh position={[0, -2, 0]} rotation={[-Math.PI/2, 0, 0]} receiveShadow>
                        <planeGeometry args={[150, 150]} />
                        <meshStandardMaterial color="#e2e8f0" roughness={0.1} metalness={0.1} />
                    </mesh>
                    
                    {/* Museum Architectural Pillars */}
                    {Array.from({ length: 12 }).map((_, i) => (
                        <mesh key={i} position={[Math.sin(i * Math.PI / 6) * 30, 15, Math.cos(i * Math.PI / 6) * 30]} castShadow receiveShadow>
                            <cylinderGeometry args={[1.5, 1.5, 40, 32]} />
                            <meshStandardMaterial color="#ffffff" roughness={0.2} />
                        </mesh>
                    ))}
                    
                    {/* Architectural ceiling beams */}
                    {Array.from({ length: 8 }).map((_, i) => (
                        <mesh key={i} position={[0, 25, (i - 3.5) * 12]} castShadow>
                            <boxGeometry args={[80, 2, 4]} />
                            <meshStandardMaterial color="#f1f5f9" roughness={0.5} />
                        </mesh>
                    ))}
                    
                    {/* Display Pedestal */}
                    <mesh position={[0, -1, 0]} receiveShadow>
                        <boxGeometry args={[18, 2, 18]} />
                        <meshStandardMaterial color="#ffffff" roughness={0.1} metalness={0.1} />
                    </mesh>

                    {/* Lighting */}
                    <ambientLight intensity={1.2} />
                    <directionalLight position={[15, 30, 20]} intensity={1.8} color="#ffffff" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0001} />
                    <directionalLight position={[-15, 20, -15]} intensity={0.6} color="#e0f2fe" />
                </group>
            );
        case 'neon':
            return (
                <group>
                    <fog attach="fog" args={['#050010', 10, 60]} />
                    <color attach="background" args={['#050010']} />
                    
                    {/* Endless reflective glassy floor */}
                    <mesh position={[0, -2, 0]} rotation={[-Math.PI/2, 0, 0]} receiveShadow>
                        <planeGeometry args={[200, 200]} />
                        <meshStandardMaterial color="#020005" roughness={0.05} metalness={0.9} />
                    </mesh>
                    
                    {/* Cyberpunk Grid */}
                    <gridHelper args={[200, 100, '#ff00ff', '#00ffff']} position={[0, -1.99, 0]} />
                    
                    {/* Giant glowing monoliths (Servers/Skyscrapers) */}
                    {Array.from({ length: 20 }).map((_, i) => {
                        const x = Math.sin(i * 2.1) * (35 + Math.random() * 25);
                        const z = Math.cos(i * 2.1) * (35 + Math.random() * 25);
                        const height = 15 + Math.random() * 40;
                        const isCyan = i % 2 === 0;
                        return (
                            <group key={i} position={[x, height/2 - 2, z]}>
                                <mesh castShadow receiveShadow>
                                    <boxGeometry args={[5, height, 5]} />
                                    <meshStandardMaterial color="#0a0014" roughness={0.2} metalness={0.8} />
                                </mesh>
                                {/* Glowing accent lines on monoliths */}
                                <mesh position={[0, 0, 2.51]}>
                                    <planeGeometry args={[0.2, height]} />
                                    <meshBasicMaterial color={isCyan ? '#00ffff' : '#ff00ff'} />
                                </mesh>
                            </group>
                        );
                    })}
                    
                    {/* Floating Data particles */}
                    <Sparkles count={500} scale={50} size={1.5} speed={0.4} opacity={0.8} color="#00ffff" />
                    
                    {/* Floating Neon Rings around the table */}
                    <mesh position={[0, -1, 0]} rotation={[-Math.PI/2, 0, 0]}>
                        <ringGeometry args={[14, 14.3, 64]} />
                        <meshBasicMaterial color="#ff00ff" transparent opacity={0.8} />
                    </mesh>
                    <mesh position={[0, -1.5, 0]} rotation={[-Math.PI/2, 0, 0]}>
                        <ringGeometry args={[16, 16.3, 64]} />
                        <meshBasicMaterial color="#00ffff" transparent opacity={0.8} />
                    </mesh>

                    {/* Central Pillar */}
                    <mesh position={[0, -2, 0]} receiveShadow>
                        <cylinderGeometry args={[10, 12, 4, 32]} />
                        <meshStandardMaterial color="#050010" roughness={0.1} metalness={0.9} />
                    </mesh>

                    {/* Lighting */}
                    <ambientLight intensity={1.5} />
                    <spotLight position={[0, 25, 0]} intensity={3.5} color="#ffffff" angle={0.7} penumbra={0.5} castShadow shadow-mapSize={[2048, 2048]} />
                    <pointLight position={[15, 10, 15]} intensity={5.0} color="#00ffff" distance={60} />
                    <pointLight position={[-15, 10, -15]} intensity={5.0} color="#ff00ff" distance={60} />
                </group>
            );
        case 'classic':
        default:
            return (
                <group>
                    <fog attach="fog" args={['#140b07', 15, 50]} />
                    <color attach="background" args={['#140b07']} />
                    
                    {/* Dark Wooden Floor */}
                    <mesh position={[0, -2, 0]} rotation={[-Math.PI/2, 0, 0]} receiveShadow>
                        <planeGeometry args={[150, 150]} />
                        <meshStandardMaterial color="#0a0502" roughness={0.7} metalness={0.1} />
                    </mesh>
                    
                    {/* Antique Library Wall Panels */}
                    {Array.from({ length: 16 }).map((_, i) => (
                        <mesh key={i} position={[Math.sin(i * Math.PI / 8) * 25, 8, Math.cos(i * Math.PI / 8) * 25]} castShadow receiveShadow rotation={[0, i * Math.PI / 8, 0]}>
                            <boxGeometry args={[8, 20, 1]} />
                            <meshStandardMaterial color="#1a0c06" roughness={0.8} />
                        </mesh>
                    ))}
                    
                    {/* Grandmaster Table */}
                    <mesh position={[0, -1, 0]} receiveShadow>
                        <cylinderGeometry args={[14, 12, 2, 64]} />
                        <meshStandardMaterial color="#2d160c" roughness={0.3} metalness={0.1} />
                    </mesh>
                    
                    {/* Atmosphere Dust Motes */}
                    <Sparkles count={300} scale={30} size={2} speed={0.2} opacity={0.15} color="#ffe8d6" />
                    
                    {/* Lighting */}
                    <ambientLight intensity={0.5} />
                    <spotLight position={[0, 25, 0]} intensity={3.5} color="#ffedd5" penumbra={0.8} angle={0.6} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0001} />
                    <spotLight position={[15, 15, 15]} intensity={1.5} color="#d4a373" angle={0.8} penumbra={1} />
                </group>
            );
    }
};
"""
text = re.sub(bg_regex, new_bg, text, flags=re.DOTALL)

with open('src/components/Board3D.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

print("Applied architectural 3D spaces")
