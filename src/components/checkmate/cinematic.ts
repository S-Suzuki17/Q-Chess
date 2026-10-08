import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { VictoryPlan } from '../victoryScene';
import { coronationAt } from './coronation';
import { unit } from './timeline';
import { victoryEncounterModel, type VictoryEncounter } from './encounter';
import { createPieceModelLibrary } from '../pieceModelLibrary';
import type { PieceType } from '../../config/gameConfig';

export type VictoryCinematic = {
    resize: (width: number, height: number, dpr: number) => void;
    draw: (seconds: number) => void;
    dispose: () => void;
};
const GOLD = 0xc5a367, IVORY = 0xf3e9cb, EMERALD = 0x1b7152;
const TAU = Math.PI * 2;
const MODEL_URL = '/assets/victory-cinematic/coronation-seal.glb';
const ease = (value: number) => 1 - (1 - unit(value)) ** 3;

function modelResources(object: THREE.Object3D) {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    object.traverse(child => {
        if (!(child instanceof THREE.Mesh)) return;
        geometries.add(child.geometry);
        for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
            materials.add(material);
            for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
        }
    });
    return { geometries, materials, textures };
}
function disposeModel(object: THREE.Object3D) {
    const resources = modelResources(object);
    resources.geometries.forEach(geometry => geometry.dispose());
    resources.materials.forEach(material => material.dispose());
    resources.textures.forEach(texture => texture.dispose());
}

/** Injectable GPU boundary lets geometry, choreography, and disposal be verified without a browser. */
export type CinematicPlatform = {
    renderer: (canvas: HTMLCanvasElement, compact: boolean) => THREE.WebGLRenderer;
    environment: (renderer: THREE.WebGLRenderer) => {texture: THREE.Texture; dispose: () => void};
    glow: () => THREE.Texture;
    load: (url: string, loaded: (scene: THREE.Group) => void) => void;
    visible: () => boolean;
};
const browserPlatform: CinematicPlatform = {
    renderer: (canvas, compact) => new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !compact, powerPreference: 'low-power' }),
    environment(renderer) {
        const environment = new RoomEnvironment();
        let pmrem: THREE.PMREMGenerator | undefined;
        try { pmrem = new THREE.PMREMGenerator(renderer); return pmrem.fromScene(environment, .04); }
        finally { environment.dispose(); pmrem?.dispose(); }
    },
    glow() {
        const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            const light = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
            light.addColorStop(0, 'rgba(175,229,182,.5)'); light.addColorStop(.2, 'rgba(94,179,137,.24)'); light.addColorStop(1, 'rgba(26,76,48,0)');
            ctx.fillStyle = light; ctx.fillRect(0, 0, 128, 128);
        }
        return new THREE.CanvasTexture(canvas);
    },
    load: (url, loaded) => new GLTFLoader().load(url, gltf => loaded(gltf.scene), undefined, () => { /* Local procedural artwork remains available. */ }),
    visible: () => !document.hidden,
};

/** Real-time original metalwork. The owner supplies the only animation clock. */
export function createVictoryCinematic(canvas: HTMLCanvasElement, plan: VictoryPlan, compact: boolean, encounter?: VictoryEncounter, platform: CinematicPlatform = browserPlatform): VictoryCinematic {
    // Register ownership immediately, before the next fallible initialization step.
    // The same scope handles failed construction and the successful shot's teardown.
    let disposed = false;
    const owned = new Set<{ dispose: () => void }>();
    const cleanup: (() => void)[] = [];
    const own = <T extends { dispose: () => void }>(resource: T): T => {
        if (!owned.has(resource)) { owned.add(resource); cleanup.push(() => resource.dispose()); }
        return resource;
    };
    const ownModel = (object: THREE.Object3D) => {
        const resources = modelResources(object);
        resources.geometries.forEach(own); resources.materials.forEach(own); resources.textures.forEach(own);
    };
    const dispose = () => {
        if (disposed) return;
        disposed = true;
        // A driver/resource error must not prevent release of the remaining resources or context.
        for (let index = cleanup.length - 1; index >= 0; index--) {
            try { cleanup[index](); } catch { /* Continue deterministic best-effort GPU cleanup. */ }
        }
        cleanup.length = 0; owned.clear();
    };
    try {
        const renderer = platform.renderer(canvas, compact);
        cleanup.push(() => renderer.forceContextLoss());
        own(renderer);
        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.15;
        renderer.localClippingEnabled = true;
        renderer.shadowMap.enabled = !compact;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(31, 1, .1, 30);
        camera.position.set(0, 1.65, 8.2); camera.lookAt(0, .12, 0);
        const environmentTarget = own(platform.environment(renderer));
        scene.environment = environmentTarget.texture;

        const gold = own(new THREE.MeshStandardMaterial({ color: GOLD, metalness: .96, roughness: .24, envMapIntensity: 1.35 }));
        const paleGold = own(new THREE.MeshStandardMaterial({ color: IVORY, metalness: .88, roughness: .18, envMapIntensity: 1.5 }));
        const emerald = own(new THREE.MeshPhysicalMaterial({ color: EMERALD, metalness: .48, roughness: .16, clearcoat: 1, clearcoatRoughness: .16 }));
        const dark = own(new THREE.MeshStandardMaterial({ color: 0x102d24, metalness: .65, roughness: .32 }));
        const luminous = own(new THREE.MeshBasicMaterial({ color: IVORY, transparent: true, opacity: .9 }));
        const root = new THREE.Group(); scene.add(root);
        const hero = new THREE.Group(); hero.position.y = .67; root.add(hero);
        const addMesh = (geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D = hero) => {
            own(geometry); own(material);
            const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
        };
        const ambient = new THREE.AmbientLight(0xa6c5b8, .55); scene.add(ambient);
        const key = own(new THREE.SpotLight(0xffe4a8, 48, 24, Math.PI / 5, .8, 2));
        key.position.set(-3.6, 5, 4.5); key.target.position.set(0, .4, 0); key.castShadow = !compact;
        key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -.001; scene.add(key, key.target);
        const rim = own(new THREE.PointLight(0x72d9b0, 28, 12, 2)); rim.position.set(2.5, 2.3, -1.8); scene.add(rim);
        const front = own(new THREE.PointLight(0xf5ead1, 10, 12, 2)); front.position.set(0, 1, 3); scene.add(front);

        // Concentric milled plinth, inset emerald and a soft contact shadow.
        const plinth = new THREE.Group(); plinth.position.y = -.45; root.add(plinth);
        for (const [radius, height, y, material] of [
            [1.17, .09, 0, dark], [1.12, .025, .052, gold], [1.04, .055, .09, emerald], [.98, .014, .126, gold],
        ] as const) {
            const mesh = addMesh(new THREE.CylinderGeometry(radius, radius + .02, height, compact ? 48 : 80), material, plinth); mesh.position.y = y;
        }
        const shadowGeometry = own(new THREE.PlaneGeometry(5, 5));
        const shadow = addMesh(shadowGeometry, new THREE.ShadowMaterial({ opacity: .3 }), root);
        shadow.rotation.x = -Math.PI / 2; shadow.position.y = -.53;
        const floorRing = addMesh(new THREE.TorusGeometry(1.4, .008, 4, 80), gold, plinth); floorRing.rotation.x = Math.PI / 2; floorRing.position.y = .05;

        // The local procedural seal is always ready, including while a Blender GLB loads.
        const crown = new THREE.Group(); hero.add(crown);
        const crownShape = new THREE.Shape();
        crownShape.moveTo(-.48, -.3); crownShape.lineTo(-.6, .3); crownShape.lineTo(-.27, .12);
        crownShape.lineTo(0, .66); crownShape.lineTo(.27, .12); crownShape.lineTo(.6, .3);
        crownShape.lineTo(.48, -.3); crownShape.closePath();
        const crownBody = addMesh(new THREE.ExtrudeGeometry(crownShape, { depth: .17, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: .035, bevelThickness: .035 }), gold, crown);
        crownBody.position.z = -.085;
        const band = addMesh(new THREE.BoxGeometry(1.01, .09, .23), paleGold, crown); band.position.set(0, -.39, 0);
        const jewel = addMesh(new THREE.OctahedronGeometry(.17, 0), emerald, crown); jewel.position.set(0, .03, .17); jewel.scale.z = .45;
        const base = addMesh(new THREE.BoxGeometry(.86, .034, .26), gold, crown); base.position.y = -.48;
        const motif = new THREE.Group(); hero.add(motif);
        const orbitMeshes: THREE.Mesh[] = [], shardMeshes: THREE.Mesh[] = [], fanMeshes: THREE.Mesh[] = [], comets: THREE.Group[] = [];
        const count = plan.coronation;

        if (plan.motif === 'rings') {
            for (let index = 0; index < count.orbitCount; index++) {
                const arc = addMesh(new THREE.TorusGeometry(.9 + index * .095, index % 2 ? .009 : .018, 6, compact ? 56 : 88, Math.PI * 1.65), index % 2 ? emerald : paleGold, motif);
                orbitMeshes.push(arc);
            }
            for (let index = 0; index < count.tickCount; index++) {
                const angle = index / count.tickCount * TAU;
                const tick = addMesh(new THREE.BoxGeometry(index % 4 ? .025 : .038, index % 4 ? .075 : .12, .035), gold, motif);
                tick.position.set(Math.sin(angle) * 1.5, Math.cos(angle) * 1.5, -.12); tick.rotation.z = -angle;
            }
        } else if (plan.motif === 'shards') {
            crown.visible = false;
            for (let index = 0; index < count.facets.length; index++) {
                const facet = count.facets[index];
                const shape = new THREE.Shape();
                facet.points.forEach(([x, y], vertex) => vertex ? shape.lineTo(x, -y) : shape.moveTo(x, -y)); shape.closePath();
                const shard = addMesh(new THREE.ExtrudeGeometry(shape, { depth: .2, bevelEnabled: true, bevelSize: .018, bevelThickness: .02, bevelSegments: 2 }), index % 2 ? emerald : gold, motif);
                shard.position.z = -.1; shardMeshes.push(shard);
            }
            const band = addMesh(new THREE.BoxGeometry(1.72, .09, .26), paleGold, motif); band.position.y = -.55;
            const diamond = addMesh(new THREE.OctahedronGeometry(.14), paleGold, motif); diamond.position.set(0, .1, .2); diamond.scale.z = .5;
        } else if (plan.motif === 'starfall') {
            crown.scale.setScalar(.68);
            for (let index = 0; index < 8; index++) {
                const ray = addMesh(new THREE.ConeGeometry(index % 2 ? .075 : .115, index % 2 ? .43 : .7, 4), index % 2 ? emerald : paleGold, motif);
                const angle = index * Math.PI / 4;
                ray.position.set(Math.sin(angle) * .9, Math.cos(angle) * .9, -.12); ray.rotation.z = -angle;
            }
            for (let index = 0; index < count.cometCount; index++) {
                const group = new THREE.Group(); motif.add(group);
                addMesh(new THREE.OctahedronGeometry(.07), paleGold, group);
                const tail = addMesh(new THREE.ConeGeometry(.028, .9, 5), luminous, group); tail.position.y = .42;
                group.rotation.z = index % 2 ? -.8 : .8; comets.push(group);
            }
        } else {
            crown.scale.setScalar(.8);
            for (let index = 0; index < count.fanCount; index++) {
                const blade = addMesh(new THREE.BoxGeometry(.09, .96, .07), index % 2 ? emerald : gold, motif);
                fanMeshes.push(blade);
            }
            for (let index = 0; index < Math.ceil(count.grade / 2); index++) {
                const arch = addMesh(new THREE.TorusGeometry(1.15 + index * .16, .012, 6, 64, Math.PI), paleGold, motif);
                arch.position.z = -.18;
            }
        }

        // Additive light is localized behind metal rather than a fullscreen bloom pass.
        const glowTexture = own(platform.glow());
        const glowMaterial = new THREE.SpriteMaterial({ map: glowTexture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: .7 });
        own(glowMaterial);
        const glow = new THREE.Sprite(glowMaterial); glow.scale.set(4.6, 4.6, 1); glow.position.set(0, .3, -.65); hero.add(glow);

        // One instanced draw for depth accents; fixed allocation, deterministic positions.
        const dustGeometry = own(new THREE.OctahedronGeometry(.018, 0));
        const dustCount = compact ? 28 : 52;
        const dust = own(new THREE.InstancedMesh(dustGeometry, paleGold, dustCount)); root.add(dust);
        const matrix = new THREE.Object3D();
        let seed = plan.seed >>> 0;
        const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
        const dustPlan = Array.from({ length: dustCount }, () => ({ angle: random() * TAU, radius: .9 + random() * 1.5, depth: (random() - .5) * 2.3, size: .4 + random() * 1.1, delay: random() * .4 }));
        let lastTime = 0;
        let loadedCrown: THREE.Object3D | undefined;
        const adversary = new THREE.Group(); adversary.position.set(0, .56, .1); root.add(adversary);
        const dissolve = new THREE.Plane(new THREE.Vector3(0, -1, 0), 2.2);
        const pieceLibrary = encounter?.pieceFinish && typeof encounter.foeWhite === 'boolean' ? own(createPieceModelLibrary(encounter.pieceFinish)) : undefined;
        if (encounter && pieceLibrary) {
            // Reuse Board3D's exact source geometry AND equipped material/form library.
            // There is deliberately no substitute enemy mesh if loading fails.
            platform.load(victoryEncounterModel(encounter), loaded => {
                if (disposed || lastTime >= 1) { disposeModel(loaded); return; }
                ownModel(loaded);
                const foe = victoryEncounterModel(encounter).split('/').at(-1)!.replace('.glb', '');
                const type = (foe[0].toUpperCase() + foe.slice(1)) as PieceType;
                const object = pieceLibrary.instantiate(loaded, type, encounter.foeWhite!);
                object.rotation.y = encounter.foeWhite ? 0 : Math.PI;
                const box = new THREE.Box3().setFromObject(object), center = box.getCenter(new THREE.Vector3());
                const height = Math.max(.01, box.max.y - box.min.y); object.position.sub(center);
                const normalized = new THREE.Group(); normalized.add(object); normalized.scale.setScalar(1.7 / height);
                object.traverse(child => {
                    if (child instanceof THREE.Mesh) {
                        // Only effect-owned material instances receive the dissolve plane.
                        for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
                            material.clippingPlanes = [dissolve]; material.clipShadows = true;
                        }
                    }
                });
                adversary.add(normalized); draw(lastTime);
            });
        }
        // An optional locally-authored GLB can replace the procedural seal without blocking first paint.
        // A missing asset is harmless; no external hosts, auth or remote-service dependency.
        if (plan.motif !== 'shards') {
            platform.load(MODEL_URL, loaded => {
                if (disposed || lastTime >= 1.2) { disposeModel(loaded); return; }
                ownModel(loaded);
                const object = loaded;
                const box = new THREE.Box3().setFromObject(object), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
                object.position.sub(center); const normalized = new THREE.Group(); normalized.add(object);
                normalized.scale.setScalar(1.15 / Math.max(size.y, .01));
                object.traverse(child => {
                    if (child instanceof THREE.Mesh) {
                        child.castShadow = true; child.receiveShadow = true;
                    }
                });
                crown.add(normalized); for (const mesh of [crownBody, band, jewel, base]) mesh.visible = false;
                loadedCrown = normalized; draw(lastTime);
            });
        }

        function draw(seconds: number) {
            if (disposed) return;
            lastTime = seconds;
            if (!platform.visible()) return;
            const f = coronationAt(seconds), reveal = f.reveal, gather = f.gather, rest = 1 - reveal;
            root.visible = f.opacity > 0;
            adversary.visible = !!encounter && seconds < 1;
            if (encounter) {
                const defeat = ease((seconds - .25) / .65);
                adversary.scale.setScalar(1 - defeat * .18); adversary.rotation.y = -.2 + defeat * .15;
                dissolve.constant = 1.55 - defeat * 2.1;
                motif.visible = seconds >= .45; crown.visible = plan.motif !== 'shards' && seconds >= .45;
            }
            canvas.style.opacity = String(f.opacity);
            // Small object travel creates depth. Camera remains steady and never shakes.
            hero.rotation.y = rest * -.42;
            hero.position.y = .67 - (1 - gather) * .32 + f.settle * .1;
            hero.scale.setScalar(.84 + .16 * gather);
            crown.rotation.y = rest * .4;
            if (loadedCrown) loadedCrown.rotation.y = -.18;
            plinth.scale.setScalar(.94 + .06 * gather);
            floorRing.scale.setScalar(1 + f.pulse * .4);
            for (let index = 0; index < orbitMeshes.length; index++) {
                const arc = orbitMeshes[index], side = index % 2 ? -1 : 1;
                arc.position.set(side * rest * .66, Math.sin(index) * rest * .3, 0);
                arc.rotation.set(rest * (index % 2 ? .8 : -.8), rest * side * .9, index * .48 + f.orbit * side);
            }
            for (let index = 0; index < shardMeshes.length; index++) {
                const shard = shardMeshes[index], facet = count.facets[index];
                const scatter = 1 - ease((f.t - facet.delay) / .95);
                shard.position.set(Math.sin(facet.angle) * (scatter * 1.4 + f.settle * .5), scatter * .8 + f.settle * .35, -.1 + scatter * (index % 2 ? .5 : -.5));
                shard.rotation.set(scatter * .6, scatter * facet.angle, scatter * facet.angle * .4 + f.settle * facet.angle * .2);
            }
            for (let index = 0; index < fanMeshes.length; index++) {
                const angle = (index / (fanMeshes.length - 1) - .5) * Math.PI * 1.23 * (.15 + .85 * reveal);
                const blade = fanMeshes[index]; blade.rotation.z = -angle;
                blade.position.set(Math.sin(angle) * .85, Math.cos(angle) * .85, -.28 - Math.abs(Math.sin(angle)) * .12);
                blade.scale.y = .68 + .32 * reveal;
            }
            for (let index = 0; index < comets.length; index++) {
                const progress = unit((f.t - index * .07) / .65), remaining = 1 - ease(progress), side = index % 2 ? -1 : 1;
                comets[index].visible = progress > 0 && progress < 1;
                comets[index].position.set(side * remaining * 3, remaining * 2.7, remaining * .7);
            }
            for (let index = 0; index < dustPlan.length; index++) {
                const particle = dustPlan[index], age = Math.max(0, seconds - .35 - particle.delay);
                const life = unit(age / 2.25), opacity = unit(age / .2) * (1 - life);
                const radius = particle.radius * (.65 + .35 * ease(age));
                matrix.position.set(Math.cos(particle.angle) * radius, .65 + Math.sin(particle.angle) * radius * .62 + age * .12, particle.depth);
                matrix.rotation.set(age * .3, particle.angle, age * .2);
                matrix.scale.setScalar(particle.size * opacity); matrix.updateMatrix(); dust.setMatrixAt(index, matrix.matrix);
            }
            dust.instanceMatrix.needsUpdate = true;
            glowMaterial.opacity = .5 + f.pulse;
            rim.intensity = 24 + reveal * 8; front.intensity = 8 + reveal * 5;
            renderer.render(scene, camera);
        }
        return {
            resize(width, height, dpr) {
                if (disposed || width <= 0 || height <= 0) return;
                const reducedQuality = compact || width < 600;
                renderer.shadowMap.enabled = !reducedQuality;
                renderer.setPixelRatio(Math.min(dpr, reducedQuality ? 1.25 : 1.75)); renderer.setSize(width, height, false);
                camera.aspect = width / height;
                // Constant vertical art size on desktop; fit all geometry on narrow portrait screens.
                camera.fov = width / height < .8 ? 40 : 31; camera.updateProjectionMatrix();
            },
            draw,
            dispose,
        };
    } catch (error) {
        dispose();
        throw error;
    }
}
