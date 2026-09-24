import * as THREE from 'three';
import type { PieceType } from '../config/gameConfig';
import { PIECE_HEIGHTS, PIECE_MAX_WIDTH } from './boardPresentation';
import { rewardPiece, type PieceFinish } from '../config/campaign';
import { championshipReward } from '../config/championshipRewards';
import { createCraftTextures } from './craftTextures';
import { pieceTrimGeometry } from './pieceForms';
import { rewardPieceSculpture } from './rewardPieceSculpture';
import {FOUNDERS_PIECE_ID} from '../config/founders';

/** One library per Canvas: GLTF geometry is borrowed, materials are owned here. */
export function createPieceModelLibrary(finish: PieceFinish = 'boxwood') {
    const prototypes = new WeakMap<THREE.Object3D, Map<string, THREE.Group>>();
    const ownedGeometry=new Set<THREE.BufferGeometry>();
    const materials = new Map<string, THREE.MeshPhysicalMaterial>();
    const reward=championshipReward(finish),motif=reward?.kind==='piece'?reward.motif:finish;
    const glass=['iceglass','neonglass','crystal','jade'].includes(motif);
    const textureMotif=motif==='alabaster'?'marble':motif==='crystal'||motif==='jade'?'crystal':motif==='gold'?'gold':['bronze','silver','copper'].includes(motif)?'brass':'walnut';
    let textures:ReturnType<typeof createCraftTextures>|undefined;
    let trimGeometry:THREE.BufferGeometry|undefined;
    function trimMaterial(isWhite:boolean) {
        const key=`trim:${isWhite}`;let material=materials.get(key);
        if(!material){
            const cool=finish!==FOUNDERS_PIECE_ID&&(motif==='silver'||motif==='alabaster'||motif==='crystal');
            material=new THREE.MeshPhysicalMaterial({color:cool?(isWhite?'#657c8a':'#c5d2da'):(isWhite?'#876035':'#d9b578'),metalness:1,roughness:.3,clearcoat:.2});
            materials.set(key,material);
        }
        return material;
    }

    function materialFor(isWhite: boolean,candidate:boolean) {
        const key=String(isWhite)+(glass&&candidate?':candidate':'');
        let material = materials.get(key);
        if (!material) {
            const surface=rewardPiece(finish);
            if(!glass)textures??=createCraftTextures(textureMotif);
            material = new THREE.MeshPhysicalMaterial({
                color: isWhite ? surface.white : surface.black,
                roughness:glass?.07:surface.roughness, metalness:surface.metalness, clearcoat:glass?1:surface.clearcoat, clearcoatRoughness:glass?.06:.24,
                map:textures?.map??null,bumpMap:textures?.detailMap??null,roughnessMap:textures?.detailMap??null,bumpScale:textureMotif==='walnut'?.0018:.0006,
                // Transparent candidate shells avoid a refraction pass for all
                // 192 possibilities. Resolved pieces use optical transmission.
                transmission:glass&&!candidate?.92:0,thickness:glass?.12:0,ior:1.45,envMapIntensity:glass?1.25:1,
                transparent:glass&&candidate,opacity:glass&&candidate?(isWhite?.28:.34):1,depthWrite:!(glass&&candidate),
                attenuationColor:isWhite?surface.white:surface.black,attenuationDistance:5,
                emissive:'#000000',emissiveIntensity:0,
            });
            materials.set(key, material);
        }
        return material;
    }

    return {
        glass,
        instantiate(scene: THREE.Object3D, type: PieceType, isWhite: boolean,candidate=false) {
            let byType = prototypes.get(scene);
            if (!byType) { byType = new Map(); prototypes.set(scene, byType); }
            const prototypeKey=reward?.kind==='piece'?`${type}:${candidate}`:type;
            let prototype = byType.get(prototypeKey);
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
                const form=reward?.kind==='piece'?reward.form:undefined;
                if(form&&form!=='staunton'){
                    const geometry=rewardPieceSculpture(type,form,candidate);
                    ownedGeometry.add(geometry);
                    prototype.add(new THREE.Mesh(geometry,materialFor(isWhite,candidate)));
                }else prototype.add(model);
                byType.set(prototypeKey, prototype);
            }
            const instance = prototype.clone(true);
            const material = materialFor(isWhite,candidate);
            instance.traverse(child => {
                if (child instanceof THREE.Mesh) {
                    child.material = material;
                    child.castShadow = !glass;
                    child.receiveShadow = true;
                }
            });
            // No extra draw calls for the 192 small quantum candidates.
            if(!candidate&&reward?.kind==='piece'&&reward.form){
                if(!trimGeometry){trimGeometry=pieceTrimGeometry(reward.form,reward.tier);ownedGeometry.add(trimGeometry);}
                const trim=new THREE.Mesh(trimGeometry,trimMaterial(isWhite));trim.receiveShadow=true;instance.add(trim);
            }
            return instance;
        },
        dispose() {
            // Never dispose cached GLTF geometry or another Canvas's materials.
            materials.forEach(material => material.dispose());
            materials.clear();
            ownedGeometry.forEach(geometry=>geometry.dispose());ownedGeometry.clear();
            textures?.dispose();textures=undefined;
        },
    };
}
