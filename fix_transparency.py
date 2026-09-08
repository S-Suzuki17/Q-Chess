import sys
import re

def fix_board3d():
    with open('src/components/Board3D.tsx', 'r', encoding='utf-8') as f:
        text = f.read()

    # We want to remove the modification of 'color' and 'emissive' for isMoveCandidate
    regex_move_candidate = r"if \(isMoveCandidate\) \{.*?emissiveIntensity = 0\.5;\s*\}"
    text = re.sub(regex_move_candidate, "", text, flags=re.DOTALL)

    # And we add a semi-transparent plane overlay inside the group if isMoveCandidate is true
    group_regex = r"(<mesh receiveShadow>.*?<boxGeometry args=\{\[1, 0\.1, 1\]\} />.*?<meshStandardMaterial.*?/>.*?</mesh>)"
    
    # We will replace the first group match by appending the overlay. But wait, we need to do this carefully.
    # It's better to just use replace.
    old_mesh = """                    <mesh receiveShadow>
                        <boxGeometry args={[1, 0.1, 1]} />
                        <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} emissive={emissive} emissiveIntensity={emissiveIntensity} />
                    </mesh>"""
    
    new_mesh = """                    <mesh receiveShadow>
                        <boxGeometry args={[1, 0.1, 1]} />
                        <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} emissive={emissive} emissiveIntensity={emissiveIntensity} />
                    </mesh>
                    {isMoveCandidate && (
                        <mesh position={[0, 0.051, 0]} rotation={[-Math.PI/2, 0, 0]}>
                            <planeGeometry args={[1, 1]} />
                            <meshBasicMaterial color={isEnemySelected ? "#ff4444" : "#D4B872"} transparent opacity={0.4} depthWrite={false} />
                        </mesh>
                    )}"""
    
    text = text.replace(old_mesh, new_mesh)
    
    with open('src/components/Board3D.tsx', 'w', encoding='utf-8') as f:
        f.write(text)

def fix_board2d():
    with open('src/components/Board2D.tsx', 'r', encoding='utf-8') as f:
        text = f.read()
        
    old_move_div = """<div className={`absolute inset-0 border-4 ${isEnemySelected ? 'border-red-500/80 bg-red-500/30' : 'border-[#B39A62]/80 bg-[#B39A62]/30'} pointer-events-none animate-pulse`} />"""
    
    # Make it a clean, very obvious semi-transparent fill with no thick solid borders, so it looks like a wash of color.
    new_move_div = """<div className={`absolute inset-0 ${isEnemySelected ? 'bg-red-500/40' : 'bg-[#B39A62]/40'} pointer-events-none animate-pulse`} />"""
    
    text = text.replace(old_move_div, new_move_div)
    
    with open('src/components/Board2D.tsx', 'w', encoding='utf-8') as f:
        f.write(text)

fix_board3d()
fix_board2d()
print("Fixed transparency for highlights")
