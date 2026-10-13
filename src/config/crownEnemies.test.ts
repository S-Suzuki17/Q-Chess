import {describe,expect,it} from 'vitest';
import {CROWN_ENEMIES,crownEnemyForStage,crownEnemyForMatch,confirmedCrownEnemyForMatch,crownEnemyName} from './crownEnemies';
import {CIRCUIT_STAGES} from './circuitStages';
import {crownEncounterForStage} from '../components/crownCollection';
describe('six original Crown characters',()=>{
 it('has six distinct piece designs and plain proper names, without epithets',()=>{
  expect(CROWN_ENEMIES).toHaveLength(6);expect(new Set(CROWN_ENEMIES.map(e=>e.foe)).size).toBe(6);
  for(const lang of ['ja','en']){const names=CROWN_ENEMIES.map(e=>crownEnemyName(lang,e));expect(new Set(names).size).toBe(6);expect(names.some(n=>/CPU|[0-9,·]|の/.test(n))).toBe(false);}
 });
 it('cycles five rivals on adjacent stages and reserves the King for 100 without changing gameplay',()=>{
  for(const[index,stage]of CIRCUIT_STAGES.entries()){
   const enemy=crownEnemyForStage(stage.id);expect(stage.id).toBe(index+1);expect(stage.strength).toBe(Math.floor(index/3)+1);expect(stage.timeControl).toBe(['10m','3m','10s'][index%3]);
   expect(enemy.foe).toBe(crownEncounterForStage(stage.id).foe);expect(enemy.finalBoss).toBe(stage.id===100);if(index)expect(enemy.id).not.toBe(crownEnemyForStage(index).id);
  }
  expect(CIRCUIT_STAGES.filter(s=>crownEnemyForStage(s.id).foe==='king').map(s=>s.id)).toEqual([100]);
 });
 it('draws directly from the six unique IDs and is stable through repeat reads/reconnection',()=>{
  const counts=new Map<string,number>();for(let i=0;i<1200;i++){const id='00000000-0000-4000-8000-'+i.toString(16).padStart(12,'0'),enemy=crownEnemyForMatch(id);expect(crownEnemyForMatch(id).id).toBe(enemy.id);counts.set(enemy.id,(counts.get(enemy.id)??0)+1);}
  expect(counts.size).toBe(6);for(const count of counts.values()){expect(count).toBeGreaterThan(120);expect(count).toBeLessThan(280);}
 });
 it('does not replace a human just because their name resembles CPU, and checks explicit metadata',()=>{
  expect(confirmedCrownEnemyForMatch('match',{name:'CPU 01'})).toBeNull();expect(confirmedCrownEnemyForMatch('match',undefined)).toBeNull();expect(confirmedCrownEnemyForMatch('match',{side:'host',rating:-1})).toBeNull();
  expect(confirmedCrownEnemyForMatch('match',{side:'joiner',rating:1000})?.id).toBe(crownEnemyForMatch('match').id);
 });
});
