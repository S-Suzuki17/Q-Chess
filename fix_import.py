import sys
with open('src/components/Board3D.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace("import { Backdrop, OrbitControls", "import { Backdrop, OrbitControls, ContactShadows")

with open('src/components/Board3D.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

print("Added ContactShadows")
