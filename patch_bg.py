import sys

with open('src/components/Board3D.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Add imports for Stars, Sky, Sparkles, Cloud
old_import = "import { OrbitControls, useGLTF, Text, Float, Billboard, Environment, Html } from '@react-three/drei';"
new_import = "import { OrbitControls, useGLTF, Text, Float, Billboard, Environment, Html, Stars, Sky, Sparkles, Cloud } from '@react-three/drei';"
text = text.replace(old_import, new_import)

# 2. Add BackgroundEffects component
bg_component = """
const BackgroundEffects = ({ design }: { design: 'classic' | 'marble' | 'neon' }) => {
    switch (design) {
        case 'marble':
            return (
                <>
                    <Environment preset="dawn" background blur={0.5} />
                    <Sky distance={450000} sunPosition={[0, 1, 0]} inclination={0} azimuth={0.25} />
                    <Cloud position={[0, -5, -10]} speed={0.2} opacity={0.2} />
                    <Cloud position={[10, -5, 5]} speed={0.2} opacity={0.2} />
                    <Cloud position={[-10, -5, 5]} speed={0.2} opacity={0.2} />
                </>
            );
        case 'neon':
            return (
                <>
                    <Environment preset="night" background blur={0.8} />
                    <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
                    <Sparkles count={200} scale={20} size={5} speed={0.4} opacity={0.5} color="#00e5ff" position={[0, -2, 0]} />
                    <Sparkles count={200} scale={20} size={5} speed={0.4} opacity={0.5} color="#ff3366" position={[0, 5, 0]} />
                    <gridHelper args={[50, 50, '#ff3366', '#00e5ff']} position={[0, -2, 0]} />
                </>
            );
        case 'classic':
        default:
            return (
                <>
                    <Environment preset="studio" background blur={0.8} />
                    <mesh position={[0, -10, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                        <planeGeometry args={[100, 100]} />
                        <meshStandardMaterial color="#1a1412" roughness={0.8} />
                    </mesh>
                    <ambientLight intensity={0.3} />
                    <spotLight position={[0, 15, 0]} angle={0.5} penumbra={1} intensity={2} castShadow />
                </>
            );
    }
};
"""

text = text.replace("const ResponsiveCamera =", bg_component + "\nconst ResponsiveCamera =")

# 3. Replace Environment in Canvas
old_canvas = """                <Environment preset="sunset" />
                <directionalLight position={[5, 10, 5]} intensity={1.2} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />"""
new_canvas = """                <BackgroundEffects design={props.boardDesign || 'classic'} />
                <directionalLight position={[5, 10, 5]} intensity={1.2} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />"""
text = text.replace(old_canvas, new_canvas)

with open('src/components/Board3D.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print("Patched backgrounds")
