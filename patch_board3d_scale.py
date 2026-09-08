import sys
with open('src/components/Board3D.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

old_html = """<Billboard follow={true} lockX={false} lockY={false} lockZ={false} position={[0, 0.1, 0]}>
                    <group scale={[0.035, 0.035, 0.035]}>
                        <Html transform distanceFactor={10} zIndexRange={[100, 0]} pointerEvents="none" center>"""
new_html = """<Billboard follow={true} lockX={false} lockY={false} lockZ={false} position={[0, 0.1, 0]}>
                    <group scale={[0.025, 0.025, 0.025]}>
                        <Html transform zIndexRange={[100, 0]} pointerEvents="none" center>"""
text = text.replace(old_html, new_html)

with open('src/components/Board3D.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print("Fixed Board3D size again")
