import {expect,it} from 'vitest';
import {Vector3} from 'three';
import {rewardPieceSculpture} from './rewardPieceSculpture';
import {PIECE_HEIGHTS,PIECE_MAX_WIDTH,boardCamera} from './boardPresentation';
it('keeps all 30 sculptures recognisable, within a square and in contact with the board',()=>{
 for(const type of Object.keys(PIECE_HEIGHTS) as (keyof typeof PIECE_HEIGHTS)[])for(const form of ['crowned','spire','citadel','fluted','faceted'] as const){
  const full=rewardPieceSculpture(type,form),small=rewardPieceSculpture(type,form,true);
  for(const geo of [full,small]){
   const size=geo.boundingBox!.getSize(new Vector3());
   expect(size.y).toBeCloseTo(PIECE_HEIGHTS[type],5);
   expect(geo.boundingBox!.min.y).toBeCloseTo(0,5);
   expect(Math.max(size.x,size.z)).toBeLessThanOrEqual(PIECE_MAX_WIDTH+.00001);
   expect([...geo.getAttribute('position').array].every(Number.isFinite)).toBe(true);
  }
  expect(small.getAttribute('position').count).toBeLessThanOrEqual(full.getAttribute('position').count);
  expect(small.getAttribute('position').count).toBeLessThan(7000);
  full.dispose();small.dispose();
 }
});
it('changes only the collection camera, retaining the fixed play camera and 2D option',()=>{
 expect(boardCamera(390,390).position).toEqual([0,14,5]);
 expect(boardCamera(390,390,false,false,true).position).toEqual([0,11,9]);
 expect(boardCamera(390,390,false,true,true).position).toEqual([0,15,.01]);
});
