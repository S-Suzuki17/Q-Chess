import sys
import re

def fix_preferences():
    with open('src/hooks/useBoardPreferences.ts', 'r', encoding='utf-8') as f:
        text = f.read()
    
    text = text.replace("'q-gambit'|'classic'|'marble'|'neon'", "'classic'|'marble'|'neon'")
    text = text.replace("('q-gambit')", "('classic')")
    text = text.replace("savedDesign === 'q-gambit' || savedDesign === 'classic' || savedDesign === 'marble' || savedDesign === 'neon'",
                        "savedDesign === 'classic' || savedDesign === 'marble' || savedDesign === 'neon'")
    
    with open('src/hooks/useBoardPreferences.ts', 'w', encoding='utf-8') as f:
        f.write(text)

def fix_game_boards():
    for filepath in ['src/components/LocalGameBoard.tsx', 'src/components/OnlineGameBoard.tsx']:
        with open(filepath, 'r', encoding='utf-8') as f:
            text = f.read()
        
        text = text.replace("const themes: ('q-gambit'|'classic'|'marble'|'neon')[] = ['q-gambit', 'classic', 'marble', 'neon'];",
                            "const themes: ('classic'|'marble'|'neon')[] = ['classic', 'marble', 'neon'];")
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(text)

def fix_board2d():
    with open('src/components/Board2D.tsx', 'r', encoding='utf-8') as f:
        text = f.read()
    
    text = text.replace("boardDesign?: 'q-gambit' | 'classic' | 'marble' | 'neon';", "boardDesign?: 'classic' | 'marble' | 'neon';")
    text = text.replace("boardDesign = 'q-gambit'", "boardDesign = 'classic'")
    
    old_bg = "background: boardDesign === 'marble' ? '#a0a0a0' : boardDesign === 'neon' ? '#4a154b' : boardDesign === 'q-gambit' ? '#11100E' : '#2c1e16',"
    new_bg = "background: boardDesign === 'marble' ? '#a0a0a0' : boardDesign === 'neon' ? '#180a24' : '#11100E',"
    text = text.replace(old_bg, new_bg)
    
    # We will just replace the whole color assignment block in Board2D
    # Let's find it with regex
    color_block_regex = r"let bgClass = isDark \? 'bg-\[#7a4d2c\]' : 'bg-\[#e6cfb3\]';.*?else bgClass = isDark \? 'bg-\[#8f773b\]' : 'bg-\[#e6d38e\]';\s*\}"
    new_colors = """let bgClass = isDark ? 'bg-[#5c3e29]' : 'bg-[#d4c0a5]'; // chic classic
                    if (boardDesign === 'marble') bgClass = isDark ? 'bg-[#54636e]' : 'bg-[#c7cfd1]';
                    if (boardDesign === 'neon') bgClass = isDark ? 'bg-[#221633]' : 'bg-[#49316b]'; // visible contrast

                    if (isLastMove) {
                        if (boardDesign === 'marble') bgClass = isDark ? 'bg-[#7a8a66]' : 'bg-[#d2db9e]';
                        else if (boardDesign === 'neon') bgClass = isDark ? 'bg-[#4d1f4d]' : 'bg-[#8a428a]';
                        else bgClass = isDark ? 'bg-[#8f773b]' : 'bg-[#e6d38e]';
                    }"""
    text = re.sub(color_block_regex, new_colors, text, flags=re.DOTALL)
    
    with open('src/components/Board2D.tsx', 'w', encoding='utf-8') as f:
        f.write(text)

def fix_board3d():
    with open('src/components/Board3D.tsx', 'r', encoding='utf-8') as f:
        text = f.read()

    text = text.replace("boardDesign?: 'q-gambit' | 'classic' | 'marble' | 'neon';", "boardDesign?: 'classic' | 'marble' | 'neon';")
    text = text.replace("props.boardDesign || 'q-gambit'", "props.boardDesign || 'classic'")

    squares_regex = r"let color = isLight \? '#e6cfb3' : '#7a4d2c';.*?else color = isLight \? '#e6d38e' : '#8f773b';\s*\}"
    new_squares = """let color = isLight ? '#d4c0a5' : '#5c3e29';
            let metalness = 0.1;
            let roughness = 0.8;
            let emissive = '#000000';
            let emissiveIntensity = 0;

            if (boardDesign === 'marble') {
                color = isLight ? '#c7cfd1' : '#54636e';
                metalness = 0.2;
                roughness = 0.3;
            } else if (boardDesign === 'neon') {
                color = isLight ? '#49316b' : '#221633';
                metalness = 0.5;
                roughness = 0.4;
            }
            
            if (isLastMove) {
                if (boardDesign === 'marble') color = isLight ? '#d2db9e' : '#7a8a66';
                else if (boardDesign === 'neon') {
                    color = isLight ? '#8a428a' : '#4d1f4d';
                    emissive = '#ff3366';
                    emissiveIntensity = 0.2;
                } else color = isLight ? '#e6d38e' : '#8f773b';
            }"""
    text = re.sub(squares_regex, new_squares, text, flags=re.DOTALL)

    # Change the BackgroundEffects to restore classic as default and remove q-gambit
    bg_regex = r"const BackgroundEffects =.*?};"
    # Actually just replace the 'q-gambit' case and make classic chic
    
    old_bg_sig = "const BackgroundEffects = ({ design }: { design: 'q-gambit' | 'classic' | 'marble' | 'neon' }) => {"
    new_bg_sig = "const BackgroundEffects = ({ design }: { design: 'classic' | 'marble' | 'neon' }) => {"
    text = text.replace(old_bg_sig, new_bg_sig)

    # Remove q-gambit case
    qg_case = r"case 'q-gambit':.*?return \(.*?\);\s*"
    text = re.sub(qg_case, "", text, flags=re.DOTALL)

    # Fix classic case to be purely chic and authentic
    old_classic = """        case 'classic':
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
            );"""
            
    new_classic = """        case 'classic':
        default:
            return (
                <>
                    <Environment preset="studio" background blur={0.8} />
                    <ambientLight intensity={0.6} />
                    <directionalLight position={[5, 10, 5]} intensity={1.0} castShadow shadow-mapSize={[2048, 2048]} />
                    
                    {/* Authentic chic wooden table */}
                    <mesh position={[0, -0.4, 0]} receiveShadow>
                        <cylinderGeometry args={[14, 14, 0.2, 64]} />
                        <meshStandardMaterial color="#1a110a" roughness={0.7} metalness={0.1} />
                    </mesh>
                    <mesh position={[0, -10, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                        <planeGeometry args={[200, 200]} />
                        <meshStandardMaterial color="#0d0805" roughness={0.9} />
                    </mesh>
                </>
            );"""
    text = text.replace(old_classic, new_classic)
    
    # Fix the dynamic board base color
    old_base_color = "color={props.boardDesign === 'marble' ? '#f0f0f0' : (props.boardDesign === 'neon' ? '#4a154b' : props.boardDesign === 'q-gambit' ? '#191714' : '#2c1e16')}"
    new_base_color = "color={props.boardDesign === 'marble' ? '#d9d9d9' : (props.boardDesign === 'neon' ? '#140c21' : '#2c1e16')}"
    text = text.replace(old_base_color, new_base_color)

    old_base_rough = "roughness={props.boardDesign === 'marble' ? 0.3 : props.boardDesign === 'q-gambit' ? 0.6 : 0.9}"
    new_base_rough = "roughness={props.boardDesign === 'marble' ? 0.3 : 0.9}"
    text = text.replace(old_base_rough, new_base_rough)

    old_base_metal = "metalness={props.boardDesign === 'neon' ? 0.5 : props.boardDesign === 'q-gambit' ? 0.3 : 0.1}"
    new_base_metal = "metalness={props.boardDesign === 'neon' ? 0.5 : 0.1}"
    text = text.replace(old_base_metal, new_base_metal)

    old_base_emissive = "emissive={props.boardDesign === 'neon' ? '#ff3366' : props.boardDesign === 'q-gambit' ? '#B39A62' : '#000000'}"
    new_base_emissive = "emissive={props.boardDesign === 'neon' ? '#ff3366' : '#000000'}"
    text = text.replace(old_base_emissive, new_base_emissive)

    old_base_emissiveInt = "emissiveIntensity={props.boardDesign === 'neon' ? 0.3 : props.boardDesign === 'q-gambit' ? 0.1 : 0}"
    new_base_emissiveInt = "emissiveIntensity={props.boardDesign === 'neon' ? 0.1 : 0}"
    text = text.replace(old_base_emissiveInt, new_base_emissiveInt)

    with open('src/components/Board3D.tsx', 'w', encoding='utf-8') as f:
        f.write(text)

fix_preferences()
fix_game_boards()
fix_board2d()
fix_board3d()
print("Reverted to classic concept")
