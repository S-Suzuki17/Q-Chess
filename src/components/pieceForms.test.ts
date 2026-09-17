import {describe,it,expect,vi} from 'vitest';
import {Group,Mesh,CylinderGeometry,MeshStandardMaterial,Box3,Vector3} from 'three';
import {sculptPieceGeometry} from './pieceForms';
import {CHAMPIONSHIP_REWARDS} from '../config/championshipRewards';
import {createPieceModelLibrary} from './pieceModelLibrary';
import {PIECE_MAX_WIDTH} from './boardPresentation';
const source=()=>{const scene=new Group(),mesh=new Mesh(new CylinderGeometry(.22,.35,1,32,12),new MeshStandardMaterial());mesh.position.y=.5;scene.add(mesh);return {scene,mesh};};
describe('sculpted reward shapes',()=>{
 it('has five materially different silhouettes, not just five colours',()=>{
  const {scene}=source();
  const forms=['crowned','spire','citadel','fluted','faceted'] as const;
  const signatures=forms.map(form=>{
   const geometry=sculptPieceGeometry(scene,form);
   geometry.computeBoundingBox();
   const size=geometry.boundingBox!.getSize(new Vector3());
   expect(Math.max(size.x,size.z)).toBeLessThanOrEqual(PIECE_MAX_WIDTH+.00001);
   expect(size.y).toBeCloseTo(1);
   const signature=Array.from(geometry.getAttribute('position').array).map(n=>n.toFixed(4)).join(',');
   geometry.dispose();return signature;
  });
  expect(new Set(signatures).size).toBe(5);
 });
 it('shares sculpted geometry, preserves original assets and releases owned geometry',()=>{
  const preset=CHAMPIONSHIP_REWARDS.find(r=>r.kind==='piece'&&r.form==='faceted')!;
  const library=createPieceModelLibrary(preset.id as `champion-piece-${string}`),{scene,mesh}=source();
  const first=library.instantiate(scene,'Pawn',true),second=library.instantiate(scene,'Pawn',false);
  const a=first.children[0] as Mesh,b=second.children[0] as Mesh;
  expect(a.geometry).toBe(b.geometry);expect(a.geometry).not.toBe(mesh.geometry);
  const owned=vi.spyOn(a.geometry,'dispose'),borrowed=vi.spyOn(mesh.geometry,'dispose');
  expect(new Box3().setFromObject(first).min.y).toBeGreaterThanOrEqual(-.001);
  library.dispose();library.dispose();
  expect(owned).toHaveBeenCalledOnce();expect(borrowed).not.toHaveBeenCalled();
 });
});
