import sys

with open('src/components/Board3D.tsx', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

import re

old_camera = """const ResponsiveCamera = () => {
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
};"""

new_camera = """const ResponsiveCamera = () => {
    const { camera, size } = useThree();
    useFrame(() => {
        const aspect = size.width / size.height;
        let targetFov = 45;
        if (aspect < 1) {
            const rad45 = THREE.MathUtils.degToRad(45);
            const tan45Half = Math.tan(rad45 / 2);
            const newFovRad = 2 * Math.atan(tan45Half / aspect);
            targetFov = THREE.MathUtils.radToDeg(newFovRad);
        }
        // Force the camera distance and FOV so it ALWAYS fits
        const pCam = camera as THREE.PerspectiveCamera;
        if (Math.abs(pCam.fov - targetFov) > 0.1) {
            pCam.fov = targetFov;
            pCam.updateProjectionMatrix();
        }
    });
    return null;
};"""

text = text.replace(old_camera, new_camera)

with open('src/components/Board3D.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print("Board3D ResponsiveCamera patched.")
