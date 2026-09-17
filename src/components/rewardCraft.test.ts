import { describe,expect,it,vi } from 'vitest';
import { CHAMPIONSHIP_REWARDS } from '../config/championshipRewards';
import { rewardFrameParts,craftRelief } from './rewardCraft';
import { createRewardMaterials } from './rewardMaterials';
const boards=CHAMPIONSHIP_REWARDS.filter(reward=>reward.kind==='board');
const luminance=(hex:string)=>{
    const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
    return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
};
describe('authored reward craft',()=>{
    it('keeps every decoration outside squares, within its supporting frame and below pieces',()=>{
        for(const board of boards) for(const part of rewardFrameParts(board)) {
            const c=Math.abs(Math.cos(part.rotation)),s=Math.abs(Math.sin(part.rotation));
            const halfX=(part.size[0]*c+part.size[2]*s)/2,halfZ=(part.size[0]*s+part.size[2]*c)/2;
            expect(Math.abs(part.position[0])+halfX).toBeLessThanOrEqual(4.351);
            expect(Math.abs(part.position[2])+halfZ).toBeLessThanOrEqual(4.351);
            expect(Math.abs(part.position[0])-halfX>4 || Math.abs(part.position[2])-halfZ>4).toBe(true);
            expect(part.position[1]+part.size[1]/2).toBeLessThan(0);
        }
    });
    it('protects light/dark square contrast and bounded material values',()=>{
        for(const board of boards) {
            expect((luminance(board.light)+.05)/(luminance(board.dark)+.05)).toBeGreaterThan(3);
            for(const finish of [board.frameMaterial,board.surface,board.inlay]) {
                expect([0,1]).toContain(finish.metalness);
                expect(finish.roughness).toBeGreaterThanOrEqual(.3);expect(finish.roughness).toBeLessThanOrEqual(.8);
            }
        }
    });
    it('shares colour and linear-data relief textures and disposes both',()=>{
        for(const board of boards.slice(0,6)) {
            for(let x=0;x<16;x++) for(let y=0;y<16;y++) {
                const value=craftRelief(board.motif,x/16,y/16);
                expect(value).toBeGreaterThan(0);expect(value).toBeLessThan(1);
                expect(value).toBe(craftRelief(board.motif,x/16,y/16));
            }
            const materials=createRewardMaterials(board);
            expect(materials.light.map).toBe(materials.dark.map);
            expect(materials.frame.map).toBe(materials.light.map);
            expect(materials.light.map?.image).toMatchObject({width:256,height:256});
            const dispose=vi.spyOn(materials.light.map!,'dispose');
            const detail=vi.spyOn(materials.light.bumpMap!,'dispose');
            expect(materials.light.bumpMap?.colorSpace).toBe('');
            expect(materials.light.roughnessMap).toBe(materials.light.bumpMap);
            materials.dispose();expect(dispose).toHaveBeenCalledOnce();expect(detail).toHaveBeenCalledOnce();
        }
    });
});
