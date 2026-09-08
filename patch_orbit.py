import sys
import re

with open('src/components/Board3D.tsx', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

text = text.replace('<OrbitControls ref={controlsRef} enablePan={false} minPolarAngle={0} maxPolarAngle={Math.PI / 2.5} minDistance={5} maxDistance={15}  autoRotate={props.autoRotate} autoRotateSpeed={1.5} />', '<OrbitControls ref={controlsRef} enablePan={false} minPolarAngle={0} maxPolarAngle={Math.PI / 2.5} minDistance={5} maxDistance={15} autoRotate={props.autoRotate} autoRotateSpeed={1.5} touches={{ ONE: THREE.TOUCH.NONE, TWO: THREE.TOUCH.DOLLY_ROTATE }} />')

with open('src/components/Board3D.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print("OrbitControls patched.")
