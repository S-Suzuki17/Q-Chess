import sys
import re

with open('src/components/Board3D.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Update BoardSquares to include 'q-gambit' and adjust 'neon'
old_squares = """            let color = isLight ? '#e6cfb3' : '#7a4d2c';
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

new_squares = """            let color = isLight ? '#e6cfb3' : '#7a4d2c';
            let metalness = 0.1;
            let roughness = 0.8;
            let emissive = '#000000';
            let emissiveIntensity = 0;

            if (boardDesign === 'marble') {
                color = isLight ? '#fdfdfd' : '#8aa1b1';
                metalness = 0.3;
                roughness = 0.2;
            } else if (boardDesign === 'neon') {
                color = isLight ? '#00e5ff' : '#4a1c60'; // Much brighter! Cyan and deep purple
                metalness = 0.8;
                roughness = 0.1;
            } else if (boardDesign === 'q-gambit') {
                color = isLight ? '#E8E2D7' : '#2A2621'; // Concept UI colors
                metalness = 0.4;
                roughness = 0.4;
            }
            
            if (isLastMove) {
                if (boardDesign === 'marble') color = isLight ? '#e8f0b1' : '#8d9c5b';
                else if (boardDesign === 'neon') {
                    color = isLight ? '#ff99cc' : '#ff1493';
                    emissive = '#ff1493';
                    emissiveIntensity = 0.5;
                } else if (boardDesign === 'q-gambit') {
                    color = isLight ? '#D4B872' : '#8c7435'; // Gold
                } else color = isLight ? '#e6d38e' : '#8f773b';
            }"""

text = text.replace(old_squares, new_squares)

# 2. Update BackgroundEffects component to include 'q-gambit' and adjust 'neon'
old_bg_sig = "const BackgroundEffects = ({ design }: { design: 'classic' | 'marble' | 'neon' }) => {"
new_bg_sig = "const BackgroundEffects = ({ design }: { design: 'q-gambit' | 'classic' | 'marble' | 'neon' }) => {"

text = text.replace(old_bg_sig, new_bg_sig)

neon_old = """        case 'neon':
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
            );"""

neon_new = """        case 'neon':
            return (
                <>
                    <Environment preset="city" background blur={0.5} /> {/* Use city for brighter ambient reflections */}
                    <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
                    <ambientLight intensity={0.6} /> {/* Increase ambient drastically */}
                    <directionalLight position={[0, 10, 0]} intensity={1.0} color="#ffffff" />
                    
                    {/* Neon Rim Lights for piece contrast */}
                    <pointLight position={[-5, 5, 5]} color="#00e5ff" intensity={50} distance={30} />
                    <pointLight position={[5, 5, -5]} color="#ff3366" intensity={50} distance={30} />
                    
                    <Sparkles count={150} scale={20} size={5} speed={0.4} opacity={0.8} color="#00e5ff" position={[-2, -1, 0]} />
                    <Sparkles count={150} scale={20} size={5} speed={0.4} opacity={0.8} color="#ff3366" position={[2, 4, 0]} />
                    <gridHelper args={[100, 100, '#ff3366', '#00e5ff']} position={[0, -5, 0]} />
                    
                    <mesh position={[0, -1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                        <ringGeometry args={[7, 7.2, 64]} />
                        <meshBasicMaterial color="#ff3366" transparent opacity={0.8} />
                    </mesh>
                </>
            );
        case 'q-gambit':
            return (
                <>
                    <Environment preset="studio" />
                    {/* Dark void background */}
                    <color attach="background" args={['#0a0908']} />
                    <ambientLight intensity={0.4} />
                    <directionalLight position={[5, 10, 5]} intensity={1.2} castShadow shadow-mapSize={[2048, 2048]} />
                    <spotLight position={[0, 15, 0]} angle={0.8} penumbra={0.5} intensity={2} color="#B39A62" castShadow />
                    
                    {/* Floating golden quantum dust */}
                    <Sparkles count={300} scale={15} size={3} speed={0.2} opacity={0.6} color="#B39A62" position={[0, 2, 0]} />
                    
                    {/* Golden rings */}
                    <mesh position={[0, -2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                        <ringGeometry args={[8, 8.1, 64]} />
                        <meshStandardMaterial color="#B39A62" emissive="#B39A62" emissiveIntensity={0.5} />
                    </mesh>
                    <mesh position={[0, -4, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                        <ringGeometry args={[12, 12.05, 64]} />
                        <meshStandardMaterial color="#B39A62" emissive="#B39A62" emissiveIntensity={0.2} />
                    </mesh>
                </>
            );"""

text = text.replace(neon_old, neon_new)

# 3. Update the base board mesh
old_base = """                {/* Dynamic Board Base */}
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

new_base = """                {/* Dynamic Board Base */}
                <mesh position={[0, -0.2, 0]} receiveShadow castShadow>
                    <boxGeometry args={[8.4, 0.2, 8.4]} />
                    <meshStandardMaterial 
                        color={props.boardDesign === 'marble' ? '#f0f0f0' : (props.boardDesign === 'neon' ? '#4a154b' : props.boardDesign === 'q-gambit' ? '#191714' : '#2c1e16')} 
                        roughness={props.boardDesign === 'marble' ? 0.3 : props.boardDesign === 'q-gambit' ? 0.6 : 0.9} 
                        metalness={props.boardDesign === 'neon' ? 0.5 : props.boardDesign === 'q-gambit' ? 0.3 : 0.1} 
                        emissive={props.boardDesign === 'neon' ? '#ff3366' : props.boardDesign === 'q-gambit' ? '#B39A62' : '#000000'}
                        emissiveIntensity={props.boardDesign === 'neon' ? 0.3 : props.boardDesign === 'q-gambit' ? 0.1 : 0}
                    />
                </mesh>"""

text = text.replace(old_base, new_base)

# Ensure type props handles 'q-gambit'
text = text.replace("boardDesign?: 'classic' | 'marble' | 'neon';", "boardDesign?: 'q-gambit' | 'classic' | 'marble' | 'neon';")
text = text.replace("props.boardDesign || 'classic'", "props.boardDesign || 'q-gambit'")

with open('src/components/Board3D.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print("Patched Board3D with q-gambit theme")
