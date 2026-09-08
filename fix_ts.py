import sys

with open('src/components/Board3D.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Fix missing ContactShadows import
if "ContactShadows" not in text:
    text = text.replace("import { Backdrop, OrbitControls", "import { Backdrop, OrbitControls, ContactShadows")

# 2. Fix the BoardSquares loop
old_sq = """            let color = isLight ? '#d4c0a5' : '#5c3e29';
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
            }"""

new_sq = """            let color = isLight ? '#d4c0a5' : '#5c3e29';
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
                color = isLight ? '#00e5ff' : '#d400ff';
                metalness = 0.2;
                roughness = 0.2;
                emissive = isLight ? '#00e5ff' : '#d400ff';
                emissiveIntensity = 0.6;
                clearcoat = 1.0;
            }"""

text = text.replace(old_sq, new_sq)

# Sometimes there are weird indentations, let's just do a regex if replace fails
if new_sq not in text:
    import re
    # Find let color = ... up to the end of the if-else block
    regex = r"let color = isLight \? '#d4c0a5' : '#5c3e29';\s*let metalness = 0\.1;\s*let roughness = 0\.8;\s*let emissive = '#000000';\s*let emissiveIntensity = 0;\s*if \(boardDesign === 'marble'\) \{[\s\S]*?\} else if \(boardDesign === 'neon'\) \{[\s\S]*?\}"
    text = re.sub(regex, new_sq, text)

with open('src/components/Board3D.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

print("Fixed clearcoat and ContactShadows")
