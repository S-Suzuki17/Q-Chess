import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

it('loads the unchanged production pieces and separate FX seal with finite geometry and no external textures',async()=>{
 for(const name of ['coronation-seal','pawn','knight','bishop','rook','queen','king']){
  const bytes=await readFile(resolve(name==='coronation-seal'?'public/assets/victory-cinematic':'public/models',`${name}.glb`));
  expect(bytes.byteLength).toBeLessThan(450000);
  expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
  const json=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
  expect((json.buffers??[]).every((buffer:{uri?:string})=>!buffer.uri)).toBe(true);
  expect(json.images??[]).toHaveLength(0);
  const data=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  const model=await new GLTFLoader().parseAsync(data,'');let vertices=0;
  const materials=new Set<THREE.Material>();
  model.scene.traverse(object=>{
   if(!(object instanceof THREE.Mesh))return;
   const positions=object.geometry.getAttribute('position');vertices+=positions.count;
   expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
   for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);
   object.geometry.dispose();
  });
  expect(vertices).toBeGreaterThan(100);expect(vertices).toBeLessThan(50000);
  expect(materials.size).toBeGreaterThanOrEqual(1);materials.forEach(material=>material.dispose());
 }
});
