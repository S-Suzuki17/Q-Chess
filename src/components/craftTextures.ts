import { DataTexture, LinearMipmapLinearFilter, NoColorSpace, RepeatWrapping, RGBAFormat, SRGBColorSpace } from 'three';
import type { BoardMotif } from '../config/championshipRewards';
import { craftRelief } from './rewardCraft';

/** Colour and relief are separate: PBR data must not be gamma-corrected. */
export function createCraftTextures(motif:BoardMotif) {
    const size=256,color=new Uint8Array(size*size*4),detail=new Uint8Array(size*size*4);
    for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
        const relief=craftRelief(motif,x/size,y/size),i=(y*size+x)*4;
        const shade=Math.round(216+39*relief);
        color[i]=color[i+1]=color[i+2]=shade;color[i+3]=255;
        detail[i]=Math.round(relief*255); // bump height in red
        detail[i+1]=Math.round(210+45*relief); // restrained roughness variation in green
        detail[i+2]=0;detail[i+3]=255;
    }
    const texture=(data:Uint8Array,colorSpace:typeof SRGBColorSpace|typeof NoColorSpace)=>{
        const value=new DataTexture(data,size,size,RGBAFormat);value.colorSpace=colorSpace;
        value.wrapS=value.wrapT=RepeatWrapping;value.generateMipmaps=true;
        value.minFilter=LinearMipmapLinearFilter;value.anisotropy=4;value.needsUpdate=true;return value;
    };
    const map=texture(color,SRGBColorSpace),detailMap=texture(detail,NoColorSpace);
    return {map,detailMap,dispose:()=>{map.dispose();detailMap.dispose();}};
}
