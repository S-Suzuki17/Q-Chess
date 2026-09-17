import type { BoardMotif, ChampionBoard } from '../config/championshipRewards';

type Triple=[number,number,number];
export type CraftPart={size:Triple;position:Triple;rotation:number;finish:'rim'|'accent'};

/** A ten-step fabrication sequence. Coordinates at ±4.19 remain unobstructed. */
export function rewardFrameParts(preset:ChampionBoard):CraftPart[] {
    const parts:CraftPart[]=[];
    const add=(x:number,z:number,w:number,d:number,finish:CraftPart['finish']='rim',rotation=0)=>{
        parts.push({size:[w,.012,d],position:[x,-.02,z],rotation,finish});
    };
    const rail=(z:number,width:number,finish:CraftPart['finish']='rim')=>{
        add(0,z,8.56,width,finish);add(0,-z,8.56,width,finish);
        add(z,0,width,8.56,finish);add(-z,0,width,8.56,finish);
    };
    rail(4.31,.018);
    if(preset.tier>=2) rail(4.27,.01);
    if(preset.tier>=6) rail(4.335,.008,'accent');
    // Deliberate 90° joints; no random rotations or decorative gems on wood.
    for(const sx of [-1,1]) for(const sz of [-1,1]) {
        const x=sx*4.19,z=sz*4.19;
        const line=(dx:number,dz:number,w:number,d:number,finish:CraftPart['finish']='rim',rotation=0)=>add(x+sx*dx,z+sz*dz,w,d,finish,rotation);
        if(preset.motif==='walnut') {
            line(0,0,.19,.025);line(0,0,.025,.19);
            if(preset.tier>=3) {line(-.05,-.05,.035,.09,'accent');line(.05,.05,.09,.035,'accent');}
        } else if(preset.motif==='marble') {
            line(0,.07,.18,.035);line(.07,0,.035,.18);
            if(preset.tier>=3) {line(-.025,.015,.085,.025);line(.015,-.025,.025,.085);}
        } else if(preset.motif==='brass') {
            line(0,0,.17,.13);line(0,0,.11,.015,'accent');
            if(preset.tier>=3) for(const dx of [-.065,.065]) line(dx,0,.016,.06,'accent');
        } else if(preset.motif==='crystal') {
            line(0,0,.15,.15,'rim',Math.PI/4);line(0,0,.1,.1,'accent',Math.PI/4);
            if(preset.tier>=3) {line(-.1,0,.022,.08);line(0,-.1,.08,.022);}
        } else if(preset.motif==='obsidian') {
            line(0,0,.19,.02);line(0,0,.02,.19);
            if(preset.tier>=3) line(0,0,.075,.075,'accent',Math.PI/4);
        } else {
            line(0,0,.2,.2);line(0,0,.14,.14,'accent',Math.PI/4);
            if(preset.tier>=3) {line(-.105,0,.02,.11);line(0,-.105,.11,.02);}
        }
        if(preset.tier>=5) {line(.105,0,.012,.22);line(0,.105,.22,.012);}
        if(preset.tier>=8) {line(-.105,0,.009,.19,'accent');line(0,-.105,.19,.009,'accent');}
    }
    // Engraving lies on the outer rail, not beneath the coordinate labels.
    if(preset.tier>=4) for(const side of [-1,1]) for(let i=0;i<preset.tier-2;i++) {
        const offset=(i-(preset.tier-3)/2)*.085;
        add(offset,side*4.29,.025,.07,i%2?'accent':'rim');
        add(side*4.29,offset,.07,.025,i%2?'accent':'rim');
    }
    if(preset.tier>=7) for(const axis of [-1,1]) for(const position of [-2,2]) {
        add(position,axis*4.29,.28,.04,'accent');add(axis*4.29,position,.04,.28,'accent');
    }
    if(preset.tier>=9) for(const axis of [-1,1]) for(const position of [-3,-1,1,3]) {
        add(position,axis*4.29,.07,.04);add(axis*4.29,position,.04,.07);
    }
    if(preset.tier===10) rail(4.065,.008,'accent');
    return parts;
}

function hash(x: number, y: number): number {
    const val = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453123;
    return val - Math.floor(val);
}

function noise(x: number, y: number): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const a = hash(ix, iy);
    const b = hash(ix + 1, iy);
    const c = hash(ix, iy + 1);
    const d = hash(ix + 1, iy + 1);
    const ux = fx * fx * (3.0 - 2.0 * fx);
    const uy = fy * fy * (3.0 - 2.0 * fy);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x: number, y: number, octaves: number): number {
    let value = 0.0;
    let amplitude = 0.5;
    let cx = x, cy = y;
    for (let i = 0; i < octaves; i++) {
        value += amplitude * noise(cx, cy);
        cx *= 2.0;
        cy *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}

/** Restrained deterministic surface relief: highly realistic organic procedural noise. */
export function craftRelief(motif:BoardMotif,x:number,y:number):number {
    switch(motif) {
        case 'walnut': 
            // Wood grain: stretched noise along Y axis
            return 0.4 + 0.4 * fbm(x * 40.0, y * 4.0, 4) + 0.1 * noise(x * 150.0, y * 15.0);
        case 'marble': 
            // Marble veins: turbulent noise
            const t = fbm(x * 10.0, y * 10.0, 5);
            return 0.5 + 0.2 * Math.sin((x * 15.0 + y * 15.0 + t * 4.0) * Math.PI);
        case 'brass': 
            // Brushed metal: high frequency noise along one axis
            return 0.5 + 0.2 * noise(x * 2.0, y * 400.0) + 0.1 * noise(x * 5.0, y * 800.0);
        case 'crystal': 
            // Crystalline facets: large cellular-like noise
            return 0.5 + 0.2 * fbm(x * 8.0, y * 8.0, 3) + 0.1 * Math.abs(noise(x * 20.0, y * 20.0) - 0.5);
        case 'obsidian': 
            // Obsidian: very smooth with occasional sharp fractures
            const fracture = Math.pow(Math.abs(noise(x * 12.0, y * 12.0) - 0.5), 3.0);
            return 0.5 - 0.3 * fracture;
        case 'gold': 
            // Hammered gold: medium sized soft dimples
            const dimples = fbm(x * 25.0, y * 25.0, 4);
            return 0.5 + 0.15 * Math.sin(dimples * Math.PI * 4.0);
        default: return 0.5;
    }
}
