import sys

with open('src/components/Board3D.tsx', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

# Replace the hardcoded background with dynamic
old_bg = "style={{ background: 'radial-gradient(circle at 50% 50%, #4a3424 0%, #1a100b 100%)', touchAction: 'none' }}"
new_bg = "style={{ background: props.boardDesign === 'marble' ? 'radial-gradient(circle at 50% 50%, #e0e0e0 0%, #a0a0a0 100%)' : props.boardDesign === 'neon' ? 'radial-gradient(circle at 50% 50%, #1a0b2e 0%, #000000 100%)' : 'radial-gradient(circle at 50% 50%, #4a3424 0%, #1a100b 100%)', touchAction: 'none' }}"
text = text.replace(old_bg, new_bg)

with open('src/components/Board3D.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print("Patched Board3D background")
