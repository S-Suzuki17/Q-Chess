import sys

with open('src/components/Board3D.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

old_state = """    // Animation states
    const currentPos = React.useRef(new THREE.Vector3(targetX, 0, targetZ));
    const startPos = React.useRef(new THREE.Vector3(targetX, 0, targetZ));
    const animTarget = React.useRef(new THREE.Vector3(targetX, 0, targetZ));
    const moveProgress = React.useRef(1.0);
    const deathProgress = React.useRef(0.0);"""

new_state = """    // Animation states
    const currentPos = React.useRef(new THREE.Vector3(targetX, 0, targetZ));
    const startPos = React.useRef(new THREE.Vector3(targetX, 0, targetZ));
    const animTarget = React.useRef(new THREE.Vector3(targetX, 0, targetZ));
    const moveProgress = React.useRef(1.0);
    const deathProgress = React.useRef(0.0);
    const liftProgress = React.useRef(0.0);"""

text = text.replace(old_state, new_state)

old_anim = """        groupRef.current.position.copy(currentPos.current);

        // Death Animation
        if (isDead) {
            deathProgress.current += delta * 1.5;
            if (deathProgress.current > 1.0) deathProgress.current = 1.0;
            const dt = deathProgress.current;
            
            const scale = 1.0 - dt;
            groupRef.current.scale.setScalar(scale);
            groupRef.current.rotation.y = dt * Math.PI * 4;
            groupRef.current.position.y += dt * 1.5;
        } else {
            groupRef.current.scale.setScalar(1.0);
            groupRef.current.rotation.y = 0;
        }
    });"""

new_anim = """        groupRef.current.position.copy(currentPos.current);

        // Death Animation
        if (isDead) {
            deathProgress.current += delta * 1.5;
            if (deathProgress.current > 1.0) deathProgress.current = 1.0;
            const dt = deathProgress.current;
            
            const scale = 1.0 - dt;
            groupRef.current.scale.setScalar(scale);
            groupRef.current.rotation.y = dt * Math.PI * 4;
            groupRef.current.position.y += dt * 1.5;
        } else {
            // Selection Lift Animation
            if (isSelected) {
                liftProgress.current = THREE.MathUtils.lerp(liftProgress.current, 1.0, delta * 10.0);
            } else {
                liftProgress.current = THREE.MathUtils.lerp(liftProgress.current, 0.0, delta * 10.0);
            }
            // Add a slight hover effect using state.clock.elapsedTime when fully lifted
            const hover = isSelected ? Math.sin(state.clock.elapsedTime * 4) * 0.05 * liftProgress.current : 0;
            
            groupRef.current.position.y += liftProgress.current * 0.4 + hover;
            groupRef.current.scale.setScalar(1.0);
            groupRef.current.rotation.y = 0;
        }
    });"""

text = text.replace(old_anim, new_anim)

with open('src/components/Board3D.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print("Patched Board3D with lift effect")
