import { MeshPhysicalMaterial } from 'three';
import type { ChampionBoard, CraftFinish } from '../config/championshipRewards';
import { createCraftTextures } from './craftTextures';

/** Five shared materials and one 256² texture per displayed reward, not a cache
 * growing to 60 boards. The board owner disposes these when changing finishes. */
export function createRewardMaterials(preset:ChampionBoard) {
    const textures=createCraftTextures(preset.motif),{map,detailMap}=textures;
    const material=(color:string,finish:CraftFinish)=>new MeshPhysicalMaterial({color,metalness:finish.metalness,roughness:finish.roughness,clearcoat:finish.clearcoat,map,bumpMap:detailMap,bumpScale:preset.motif==='walnut'?.006:.002,roughnessMap:detailMap,clearcoatRoughness:.38});
    const result={light:material(preset.light,preset.surface),dark:material(preset.dark,preset.surface),
        frame:material(preset.frameColor,preset.frameMaterial),rim:material(preset.rim,preset.inlay),accent:material(preset.accent,preset.inlay)};
    return {...result,dispose:()=>{Object.values(result).forEach(value=>value.dispose());textures.dispose();}};
}
