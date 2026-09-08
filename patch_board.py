import sys
import re

with open('src/components/Board3D.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Update BoardSquares
old_squares = """            let color = isLight ? '#d4c0a5' : '#5c3e29';
            if (boardDesign === 'marble') color = isLight ? '#f2f2f2' : '#708090';
            if (boardDesign === 'neon') color = isLight ? '#2a2a35' : '#0a0a10';
            
            if (isLastMove) {
                if (boardDesign === 'marble') color = isLight ? '#e8f0b1' : '#8d9c5b';
                else if (boardDesign === 'neon') color = isLight ? '#401530' : '#2b0b20';
                else color = isLight ? '#e6d38e' : '#8f773b';
            }"""

new_squares = """            let color = isLight ? '#e6cfb3' : '#7a4d2c';
            let metalness = 0.1;
            let roughness = 0.8;
            let emissive = '#000000';
            let emissiveIntensity = 0;

            if (boardDesign === 'marble') {
                color = isLight ? '#fdfdfd' : '#8aa1b1';
                metalness = 0.3;
                roughness = 0.2; // Shiny marble
            } else if (boardDesign === 'neon') {
                color = isLight ? '#42245c' : '#231236'; // Brighter purple/blue so black pieces contrast
                metalness = 0.8;
                roughness = 0.2;
            }
            
            if (isLastMove) {
                if (boardDesign === 'marble') color = isLight ? '#e8f0b1' : '#8d9c5b';
                else if (boardDesign === 'neon') {
                    color = isLight ? '#ff1493' : '#8a0a4f';
                    emissive = '#ff1493';
                    emissiveIntensity = 0.5;
                }
                else color = isLight ? '#e6d38e' : '#8f773b';
            }"""

text = text.replace(old_squares, new_squares)

old_mat = "<meshStandardMaterial color={color} roughness={0.8} />"
new_mat = "<meshStandardMaterial color={color} roughness={roughness} metalness={metalness} emissive={emissive} emissiveIntensity={emissiveIntensity} />"
text = text.replace(old_mat, new_mat)


# 2. Update BackgroundEffects
new_bg = """const BackgroundEffects = ({ design }: { design: 'classic' | 'marble' | 'neon' }) => {
    switch (design) {
        case 'marble':
            return (
                <>
                    <Environment preset="dawn" background blur={0.2} />
                    <Sky distance={450000} sunPosition={[0, 1, 0]} inclination={0} azimuth={0.25} />
                    <ambientLight intensity={0.6} />
                    <directionalLight position={[10, 15, 10]} intensity={1.5} castShadow shadow-mapSize={[2048, 2048]} />
                    <Cloud position={[0, -5, -10]} speed={0.2} opacity={0.3} scale={2} />
                    <Cloud position={[10, -5, 5]} speed={0.2} opacity={0.3} scale={2} />
                    <Cloud position={[-10, -5, 5]} speed={0.2} opacity={0.3} scale={2} />
                    <Sparkles count={100} scale={15} size={6} speed={0.2} opacity={0.8} color="#ffd700" position={[0, 2, 0]} />
                    
                    {/* Floating temple pillars */}
                    {[[-6, -4, -6], [6, -4, -6], [-6, -4, 6], [6, -4, 6]].map((pos, i) => (
                        <mesh key={i} position={pos as any} receiveShadow castShadow>
                            <cylinderGeometry args={[0.5, 0.5, 8, 16]} />
                            <meshStandardMaterial color="#f0f0f0" roughness={0.3} metalness={0.1} />
                        </mesh>
                    ))}
                </>
            );
        case 'neon':
            return (
                <>
                    <Environment preset="night" background blur={0.8} />
                    <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
                    <ambientLight intensity={0.2} />
                    
                    {/* Neon Rim Lights for piece contrast */}
                    <pointLight position={[-5, 2, 5]} color="#00e5ff" intensity={15} distance={20} />
                    <pointLight position={[5, 2, -5]} color="#ff3366" intensity={15} distance={20} />
                    
                    <Sparkles count={150} scale={20} size={5} speed={0.4} opacity={0.8} color="#00e5ff" position={[-2, -1, 0]} />
                    <Sparkles count={150} scale={20} size={5} speed={0.4} opacity={0.8} color="#ff3366" position={[2, 4, 0]} />
                    <gridHelper args={[100, 100, '#ff3366', '#00e5ff']} position={[0, -5, 0]} />
                    
                    {/* Glowing ring under the board */}
                    <mesh position={[0, -1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                        <ringGeometry args={[7, 7.2, 64]} />
                        <meshBasicMaterial color="#00e5ff" transparent opacity={0.5} />
                    </mesh>
                </>
            );
        case 'classic':
        default:
            return (
                <>
                    <Environment preset="studio" background blur={0.5} />
                    <ambientLight intensity={0.4} />
                    <directionalLight position={[5, 10, 5]} intensity={1.5} castShadow shadow-mapSize={[2048, 2048]} />
                    
                    {/* Elegant table */}
                    <mesh position={[0, -0.4, 0]} receiveShadow>
                        <cylinderGeometry args={[12, 12, 0.2, 64]} />
                        <meshStandardMaterial color="#1a0b02" roughness={0.5} metalness={0.1} />
                    </mesh>
                    <mesh position={[0, -10, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                        <planeGeometry args={[200, 200]} />
                        <meshStandardMaterial color="#0a0502" roughness={0.9} />
                    </mesh>
                    <spotLight position={[0, 15, 0]} angle={0.6} penumbra={0.8} intensity={2} castShadow />
                    <Sparkles count={50} scale={10} size={2} speed={0.1} opacity={0.2} color="#ffffff" position={[0, 2, 0]} />
                </>
            );
    }
};"""

text = re.sub(r"const BackgroundEffects =.*?};\n", new_bg + "\n", text, flags=re.DOTALL)


# 3. Update Canvas base board and lights
old_canvas = """                <BackgroundEffects design={props.boardDesign || 'classic'} />
                <directionalLight position={[5, 10, 5]} intensity={1.2} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
                <mesh position={[0, -0.2, 0]} receiveShadow>
                    <boxGeometry args={[8.4, 0.2, 8.4]} />
                    <meshStandardMaterial color="#2c1e16" roughness={0.9} />
                </mesh>"""

new_canvas = """                <BackgroundEffects design={props.boardDesign || 'classic'} />
                
                {/* Dynamic Board Base */}
                <mesh position={[0, -0.2, 0]} receiveShadow castShadow>
                    <boxGeometry args={[8.4, 0.2, 8.4]} />
                    <meshStandardMaterial 
                        color={props.boardDesign === 'marble' ? '#f0f0f0' : (props.boardDesign === 'neon' ? '#11081a' : '#2c1e16')} 
                        roughness={props.boardDesign === 'marble' ? 0.3 : 0.9} 
                        metalness={props.boardDesign === 'neon' ? 0.5 : 0.1} 
                        emissive={props.boardDesign === 'neon' ? '#ff3366' : '#000000'}
                        emissiveIntensity={props.boardDesign === 'neon' ? 0.1 : 0}
                    />
                </mesh>"""

text = text.replace(old_canvas, new_canvas)

# Also remove old ambientLight since BackgroundEffects handles it
text = text.replace("<ambientLight intensity={0.5} />", "")

with open('src/components/Board3D.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print("Patched thoroughly")
