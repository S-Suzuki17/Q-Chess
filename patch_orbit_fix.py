import sys

with open('src/components/Board3D.tsx', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

# Replace touches with enableRotate={false}
text = text.replace('touches={{ ONE: THREE.TOUCH.NONE, TWO: THREE.TOUCH.DOLLY_ROTATE }}', 'enableRotate={false}')

with open('src/components/Board3D.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print("OrbitControls patched again.")
