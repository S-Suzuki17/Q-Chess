import * as THREE from 'three';
import type { PieceType } from '../config/gameConfig';
import { PIECE_HEIGHTS, PIECE_MAX_WIDTH } from './boardPresentation';
import { REWARD_PIECES, type PieceFinish } from '../config/campaign';

/** One library per Canvas: GLTF geometry is borrowed, materials are owned here. */
export function createPieceModelLibrary(finish:PieceFinish='standard') {
    const prototypes = new WeakMap<THREE.Object3D, Map<PieceType, THREE.Group>>();
    const materials = new Map<boolean, THREE.MeshPhysicalMaterial>();

    function materialFor(isWhite: boolean) {
        let material = materials.get(isWhite);
        if (!material) {
            const surface=REWARD_PIECES[finish];
            material = new THREE.MeshPhysicalMaterial({
                color: isWhite ? surface.white : surface.black,
                roughness:0.05, metalness:0.2, clearcoat:1.0, clearcoatRoughness:0.1, transmission:0.95, thickness:1.5, ior:1.5, transparent:true, opacity:1.0, emissive:isWhite ? '#88ccff' : '#00e5ff', emissiveIntensity:0.6,
            });
            materials.set(isWhite, material);
        }
        return material;
    }

    return {
        instantiate(scene: THREE.Object3D, type: PieceType, isWhite: boolean) {
            let byType = prototypes.get(scene);
            if (!byType) { byType = new Map(); prototypes.set(scene, byType); }
            let prototype = byType.get(type);
            if (!prototype) {
                const model = scene.clone(true);
                model.updateMatrixWorld(true);
                const bounds = new THREE.Box3().setFromObject(model);
                const size = bounds.getSize(new THREE.Vector3());
                if (size.y > 0) {
                    const scale = Math.min(PIECE_HEIGHTS[type] / size.y,
                        PIECE_MAX_WIDTH / Math.max(size.x, size.z));
                    model.scale.setScalar(scale);
                    model.updateMatrixWorld(true);
                    bounds.setFromObject(model);
                    const center = bounds.getCenter(new THREE.Vector3());
                    model.position.set(-center.x, -bounds.min.y, -center.z);
                }
                prototype = new THREE.Group();
                prototype.add(model);
                byType.set(type, prototype);
            }
            const instance = prototype.clone(true);
            const material = materialFor(isWhite);
            instance.traverse(child => {
                if (child instanceof THREE.Mesh) {
                    child.material = material;
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            return instance;
        },
        dispose() {
            // Never dispose cached GLTF geometry or another Canvas's materials.
            materials.forEach(material => material.dispose());
            materials.clear();
        },
    };
}
