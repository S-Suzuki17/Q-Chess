'use client';
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { DataTexture, EquirectangularReflectionMapping, FloatType, LinearSRGBColorSpace, PMREMGenerator, RGBAFormat } from 'three';

/** Reflection lighting only: no room geometry, background, network asset or controls. */
export function StudioReflections() {
    const {gl,scene,invalidate}=useThree();
    useEffect(()=>{
        const width=256,height=128,data=new Float32Array(width*height*4);
        for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
            const u=x/width,v=y/height;
            // Broad softboxes and a narrow rim produce readable turned silhouettes.
            const box=(cx:number,cy:number,w:number,h:number)=>Math.exp(-Math.pow((u-cx)/w,8)-Math.pow((v-cy)/h,8));
            const key=box(.23,.3,.09,.12)*2.8,fill=box(.72,.37,.12,.18)*1.6,rim=box(.5,.45,.018,.22)*2;
            const ambient=.15+.12*Math.sin(v*Math.PI),i=(y*width+x)*4;
            data[i]=ambient+key+fill*.83+rim;
            data[i+1]=ambient+key*.95+fill*.92+rim;
            data[i+2]=ambient+key*.85+fill+rim;
            data[i+3]=1;
        }
        const source=new DataTexture(data,width,height,RGBAFormat,FloatType);
        source.mapping=EquirectangularReflectionMapping;source.colorSpace=LinearSRGBColorSpace;source.needsUpdate=true;
        const generator=new PMREMGenerator(gl);
        const target=generator.fromEquirectangular(source);
        const previous=scene.environment,previousIntensity=scene.environmentIntensity;
        scene.environment=target.texture;scene.environmentIntensity=.7;
        source.dispose();generator.dispose();invalidate();
        return()=>{
            if(scene.environment===target.texture) {scene.environment=previous;scene.environmentIntensity=previousIntensity;}
            target.dispose();
        };
    },[gl,scene,invalidate]);
    return null;
}
