import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createVictoryCinematic, type CinematicPlatform } from './cinematic';
import { CHAMPIONSHIP_REWARDS } from '../../config/championshipRewards';
import { createVictoryPlan } from '../victoryScene';
import { victoryEncounterModel } from './encounter';
const effects = CHAMPIONSHIP_REWARDS.filter(reward => reward.kind === 'effect');
function harness() {
    let scene: THREE.Scene | undefined, camera: THREE.PerspectiveCamera | undefined, visible = true;
    const renderer = { setClearColor: vi.fn(), setPixelRatio: vi.fn(), setSize: vi.fn(), dispose: vi.fn(), forceContextLoss:vi.fn(),
        shadowMap: {enabled:false,type:THREE.PCFSoftShadowMap},
        render: vi.fn((nextScene: THREE.Scene, nextCamera: THREE.PerspectiveCamera) => {scene=nextScene;camera=nextCamera;}),
    };
    const environment = {texture:new THREE.Texture(),dispose:vi.fn()};
    const glow = new THREE.Texture(); const textureDisposed=vi.fn();glow.addEventListener('dispose',textureDisposed);
    const loads: {url:string;loaded:(scene:THREE.Group)=>void}[]=[];
    const platform: CinematicPlatform = {
        renderer:()=>renderer as unknown as THREE.WebGLRenderer,environment:()=>environment,glow:()=>glow,
        load:(url,loaded)=>{loads.push({url,loaded});},visible:()=>visible,
    };
    const canvas = {style:{opacity:''}} as HTMLCanvasElement;
    return {platform,renderer,environment,textureDisposed,loads,canvas,scene:()=>scene!,camera:()=>camera!,hide:()=>{visible=false;}};
}
describe('real Three cinematic scene with an injected GPU boundary',()=>{
 it('builds distinct original 3D geometry for every motif and finite transforms throughout the shot',()=>{
  const signatures=new Set<string>();
  for(const motif of ['rings','shards','starfall','corona'] as const){
   const effect=effects.find(effect=>effect.motif===motif)!;
   const h=harness(),shot=createVictoryCinematic(h.canvas,createVictoryPlan(effect),false,undefined,h.platform);
   shot.resize(1280,720,3);expect(h.renderer.setPixelRatio).toHaveBeenCalledWith(1.75);
   for(const time of [0,.15,.35,.7,1.2,1.8,2.3,2.8,3]){
    shot.draw(time);
    h.scene().traverse(object=>{
     expect([...object.position.toArray(),...object.rotation.toArray().slice(0,3),...object.scale.toArray()].every(Number.isFinite)).toBe(true);
     if(object instanceof THREE.Mesh){
      const positions=object.geometry.getAttribute('position');
      expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
     }
    });
   }
   const geometry:string[]=[];h.scene().traverse(object=>{if(object instanceof THREE.Mesh)geometry.push(object.geometry.type);});
   signatures.add(geometry.sort().join(','));expect(h.canvas.style.opacity).toBe('0');shot.dispose();
  }
  expect(signatures.size).toBe(4);
 });
 it('increases actual motif mesh detail at later grades without increasing the dust pool',()=>{
  for(const motif of ['rings','shards','starfall','corona'] as const){
   const preset=effects.find(effect=>effect.motif===motif)!;
   const counts=[1,100].map(requiredWins=>{
    const h=harness(),shot=createVictoryCinematic(h.canvas,createVictoryPlan({...preset,requiredWins}),false,undefined,h.platform);
    shot.draw(1.6);let meshes=0;h.scene().traverse(object=>{if(object instanceof THREE.Mesh && !(object instanceof THREE.InstancedMesh))meshes++;});
    shot.dispose();return meshes;
   });
   expect(counts[1]).toBeGreaterThan(counts[0]);
  }
 });
 it('releases a renderer if environment initialization fails, allowing the owner to show Canvas fallback',()=>{
  const h=harness();h.platform.environment=()=>{throw new Error('GPU allocation unavailable');};
  expect(()=>createVictoryCinematic(h.canvas,createVictoryPlan(effects[0]),false,undefined,h.platform)).toThrow('GPU allocation unavailable');
  expect(h.renderer.dispose).toHaveBeenCalledOnce();
 });
 it.each(['glow','load'] as const)('cleans every acquired resource once when %s initialization throws',failure=>{
  const h=harness(),error=new Error(`${failure} initialization failed`);
  const geometryDispose=vi.spyOn(THREE.BufferGeometry.prototype,'dispose');
  const materialDispose=vi.spyOn(THREE.Material.prototype,'dispose');
  const instanceDispose=vi.spyOn(THREE.InstancedMesh.prototype,'dispose');
  try {
   if(failure==='glow')h.platform.glow=()=>{throw error;};
   else h.platform.load=()=>{throw error;};
   expect(()=>createVictoryCinematic(h.canvas,createVictoryPlan(effects[0]),false,undefined,h.platform)).toThrow(error);
   expect(h.renderer.dispose).toHaveBeenCalledOnce();expect(h.renderer.forceContextLoss).toHaveBeenCalledOnce();
   expect(h.environment.dispose).toHaveBeenCalledOnce();expect(h.textureDisposed).toHaveBeenCalledTimes(failure==='glow'?0:1);
   expect(geometryDispose.mock.contexts).toHaveLength(failure==='glow'?25:26);
   expect(materialDispose.mock.contexts).toHaveLength(failure==='glow'?6:7);
   expect(new Set(geometryDispose.mock.contexts).size).toBe(geometryDispose.mock.contexts.length);
   expect(new Set(materialDispose.mock.contexts).size).toBe(materialDispose.mock.contexts.length);
   expect(instanceDispose).toHaveBeenCalledTimes(failure==='glow'?0:1);
   expect(h.renderer.render).not.toHaveBeenCalled();
  } finally { geometryDispose.mockRestore();materialDispose.mockRestore();instanceDispose.mockRestore(); }
 });
 it('releases the context when a renderer setter fails, even if renderer disposal also fails',()=>{
  const h=harness(),error=new Error('renderer setup failed');
  h.renderer.setClearColor.mockImplementation(()=>{throw error;});
  h.renderer.dispose.mockImplementation(()=>{throw new Error('driver cleanup failed');});
  expect(()=>createVictoryCinematic(h.canvas,createVictoryPlan(effects[0]),false,undefined,h.platform)).toThrow(error);
  expect(h.renderer.dispose).toHaveBeenCalledOnce();expect(h.renderer.forceContextLoss).toHaveBeenCalledOnce();
  expect(h.environment.dispose).not.toHaveBeenCalled();expect(h.textureDisposed).not.toHaveBeenCalled();
 });
 it('continues cleanup after a resource disposer throws without hiding the initialization error',()=>{
  const h=harness(),error=new Error('glow allocation failed');
  h.platform.glow=()=>{throw error;};h.environment.dispose.mockImplementation(()=>{throw new Error('environment cleanup failed');});
  expect(()=>createVictoryCinematic(h.canvas,createVictoryPlan(effects[0]),false,undefined,h.platform)).toThrow(error);
  expect(h.environment.dispose).toHaveBeenCalledOnce();expect(h.renderer.dispose).toHaveBeenCalledOnce();expect(h.renderer.forceContextLoss).toHaveBeenCalledOnce();
 });
 it('disposes late model callbacks after a later load startup fails without rendering the abandoned scene',()=>{
  const h=harness(),error=new Error('second load failed');
  h.platform.load=(url,loaded)=>{h.loads.push({url,loaded});if(h.loads.length===2)throw error;};
  expect(()=>createVictoryCinematic(h.canvas,createVictoryPlan(effects[0]),false,
   {stageId:100,foe:'king',finalBoss:true,pieceFinish:'standard',foeWhite:false},h.platform)).toThrow(error);
  const texture=new THREE.Texture(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({map:texture})),group=new THREE.Group();group.add(mesh);
  const geometryDisposed=vi.fn(),materialDisposed=vi.fn(),textureDisposed=vi.fn();
  mesh.geometry.addEventListener('dispose',geometryDisposed);mesh.material.addEventListener('dispose',materialDisposed);texture.addEventListener('dispose',textureDisposed);
  h.loads[0].loaded(group);
  expect(geometryDisposed).toHaveBeenCalledOnce();expect(materialDisposed).toHaveBeenCalledOnce();expect(textureDisposed).toHaveBeenCalledOnce();
  expect(h.renderer.render).not.toHaveBeenCalled();expect(h.renderer.dispose).toHaveBeenCalledOnce();expect(h.renderer.forceContextLoss).toHaveBeenCalledOnce();
 });
 it('adds tier-specific meshes under bounded mobile instancing and capped resolution',()=>{
  const h=harness(),shot=createVictoryCinematic(h.canvas,createVictoryPlan(effects.at(-1)!,true),true,undefined,h.platform);
  shot.resize(360,780,3);shot.draw(1.6);
  expect(h.renderer.setPixelRatio).toHaveBeenCalledWith(1.25);expect(h.camera().fov).toBe(40);
  expect(h.renderer.shadowMap.enabled).toBe(false);
  const instances:THREE.InstancedMesh[]=[];h.scene().traverse(object=>{if(object instanceof THREE.InstancedMesh)instances.push(object);});
  expect(instances).toHaveLength(1);expect(instances[0].count).toBe(28);shot.dispose();
 });
 it('disposes real geometry/materials, environment, texture, renderer once, and ignores later draw/resize',()=>{
  const h=harness(),shot=createVictoryCinematic(h.canvas,createVictoryPlan(effects[0]),false,undefined,h.platform);
  shot.draw(1.6);const geometry=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
  h.scene().traverse(object=>{if(object instanceof THREE.Mesh){geometry.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);}});
  const disposeGeometry=vi.fn(),disposeMaterial=vi.fn();geometry.forEach(value=>value.addEventListener('dispose',disposeGeometry));materials.forEach(value=>value.addEventListener('dispose',disposeMaterial));
  shot.dispose();shot.dispose();shot.draw(2);shot.resize(360,700,2);
  expect(disposeGeometry).toHaveBeenCalledTimes(geometry.size);expect(disposeMaterial).toHaveBeenCalledTimes(materials.size);
  expect(h.environment.dispose).toHaveBeenCalledOnce();expect(h.textureDisposed).toHaveBeenCalledOnce();expect(h.renderer.dispose).toHaveBeenCalledOnce();expect(h.renderer.forceContextLoss).toHaveBeenCalledOnce();expect(h.renderer.render).toHaveBeenCalledOnce();
 });
 it('disposes late model loads after unmount and never renders while hidden',()=>{
  const h=harness(),shot=createVictoryCinematic(h.canvas,createVictoryPlan(effects[0]),false,undefined,h.platform);
  h.hide();shot.draw(.5);expect(h.renderer.render).not.toHaveBeenCalled();shot.dispose();
  const map=new THREE.Texture(),mapDisposed=vi.fn();map.addEventListener('dispose',mapDisposed);
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({map})),group=new THREE.Group();group.add(mesh);
  const geometryDispose=vi.fn(),materialDispose=vi.fn();mesh.geometry.addEventListener('dispose',geometryDispose);mesh.material.addEventListener('dispose',materialDispose);
  h.loads[0].loaded(group);expect(geometryDispose).toHaveBeenCalledOnce();expect(materialDispose).toHaveBeenCalledOnce();expect(mapDisposed).toHaveBeenCalledOnce();expect(h.renderer.render).not.toHaveBeenCalled();
 });
 it('never invents an opponent mesh or finish when the actual match appearance is missing',()=>{
  for(const encounter of [{stageId:1,foe:'pawn' as const,finalBoss:false},{stageId:1,foe:'pawn' as const,finalBoss:false,pieceFinish:'standard' as const}]){
   const h=harness(),shot=createVictoryCinematic(h.canvas,createVictoryPlan(effects[0]),false,encounter,h.platform);
   expect(h.loads.map(load=>load.url).some(url=>url.startsWith('/models/'))).toBe(false);shot.dispose();
  }
 });
 it('loads the actual encounter model separately from cosmetic ownership and gates the King boss',()=>{
  expect(victoryEncounterModel({stageId:99,foe:'king',finalBoss:true})).toContain('queen.glb');
  expect(victoryEncounterModel({stageId:100,foe:'king',finalBoss:false})).toContain('queen.glb');
  const h=harness(),shot=createVictoryCinematic(h.canvas,createVictoryPlan(effects[0]),false,{stageId:100,foe:'king',finalBoss:true,pieceFinish:'boxwood',foeWhite:false},h.platform);
  expect(h.loads.map(load=>load.url)).toContain('/models/king.glb');
  expect(h.loads.map(load=>load.url)).toContain('/assets/victory-cinematic/coronation-seal.glb');
  const group=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(1,2,1),new THREE.MeshStandardMaterial());group.add(mesh);
  const originalGeometry=Array.from(mesh.geometry.getAttribute('position').array),originalColor=mesh.material.color.getHex();
  h.loads[0].loaded(group);shot.draw(.6);
  expect(mesh.material.clippingPlanes).toBeNull();expect(mesh.material.color.getHex()).toBe(originalColor);
  expect(Array.from(mesh.geometry.getAttribute('position').array)).toEqual(originalGeometry);
  const instances:THREE.Mesh[]=[];h.scene().traverse(object=>{if(object instanceof THREE.Mesh&&object.geometry===mesh.geometry)instances.push(object);});
  expect(instances).toHaveLength(1);expect(instances[0].material).not.toBe(mesh.material);
  expect((instances[0].material as THREE.Material).clippingPlanes).toHaveLength(1);shot.dispose();
 });
});
