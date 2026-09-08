import sys
import re

with open('src/components/Board3D.tsx', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

text = text.replace("import { Canvas, useFrame } from '@react-three/fiber';", "import { Canvas, useFrame, useThree } from '@react-three/fiber';")

with open('src/components/Board3D.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print("Imports fixed.")
