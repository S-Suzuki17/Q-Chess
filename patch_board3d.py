import sys
import re

with open('src/components/Board3D.tsx', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

responsive_camera = """
const ResponsiveCamera = () => {
    const { camera, size } = useThree();
    React.useEffect(() => {
        const aspect = size.width / size.height;
        if (aspect < 1) {
            const rad45 = THREE.MathUtils.degToRad(45);
            const tan45Half = Math.tan(rad45 / 2);
            const newFovRad = 2 * Math.atan(tan45Half / aspect);
            (camera as THREE.PerspectiveCamera).fov = THREE.MathUtils.radToDeg(newFovRad);
        } else {
            (camera as THREE.PerspectiveCamera).fov = 45;
        }
        camera.updateProjectionMatrix();
    }, [camera, size]);
    return null;
};
"""

# Insert ResponsiveCamera before Board3DProps
text = text.replace("export interface Board3DProps", responsive_camera + "\nexport interface Board3DProps")

# Insert <ResponsiveCamera /> inside Canvas
text = text.replace("<Canvas shadows camera={{ position: isFlipped ? [0, 8, -6] : [0, 8, 6], fov: 45 }}>", "<Canvas shadows camera={{ position: isFlipped ? [0, 8, -6] : [0, 8, 6], fov: 45 }}>\n                <ResponsiveCamera />")

with open('src/components/Board3D.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print("Board3D patched.")
