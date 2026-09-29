// Shared production/preview choreography. No game state or reward ownership writes.
export const SHOT_SECONDS = 3;
// CHECK and MATE land on the wood hit and settling knock in the existing SE.
export const CUES = { anticipation: 0, check: .18, mate: .246, polish: .48, result: 1.5 } as const;
export const unit = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => 1 - (1 - unit(v)) ** 4;
const time = (seconds: number) => Math.min(SHOT_SECONDS, Math.max(0, Number.isFinite(seconds) ? seconds : 0));
export function shotAt(seconds: number, reduced = false) {
    const t = reduced ? SHOT_SECONDS : time(seconds);
    const pulse = (start: number) => t < start ? 0 : Math.exp(-(t-start)*15);
    return { t, anticipation: 1-ease(t/.18), reveal: .35+.65*ease(t/.45),
        impact: reduced || t>=SHOT_SECONDS ? 0 : Math.max(pulse(CUES.check)*.55,pulse(CUES.mate)),
        sweep: reduced ? 1 : unit((t-CUES.polish)/.9),
        result: ease((t-1.45)/.35),
        boardSweep: reduced ? 1 : ease((t-CUES.mate)/.6),
        rule: ease((t-CUES.mate)/.6), done: reduced || t>=SHOT_SECONDS };
}
export function letterAt(index: number, seconds: number, reduced = false) {
    const t = reduced ? SHOT_SECONDS : time(seconds), landing = index<5 ? CUES.check : CUES.mate;
    const stagger = (index<5 ? index : index-5)*.008;
    const progress = ease((t-(landing-.15+stagger))/(.15-stagger));
    const age = t-landing;
    const rebound = reduced || age<0 || age>.32 ? 0 : Math.sin(age*29)*Math.exp(-age*15);
    const polish = reduced ? 1 : unit((t-CUES.polish-index*.035)/.48);
    const rest=1-progress,side=index<5?-1:1;
    return { x: (side*rest*30)||0, y: (-rest*100-rebound*5)||0,
        scale: 1+(1-progress)*.38, rotate: ((index<5?-1:1)*(1-progress)*9)||0,
        opacity: unit(progress*1.7), blur: (1-progress)*5,
        shine: reduced || polish===0 || polish===1 ? 0 : Math.sin(polish*Math.PI)*.8, shinePosition: 160-polish*320 };
}
export type Fragment = { origin: number; direction: number; speed: number; size: number; delay: number; life: number; spin: number };
export function fragments(seed: number, compact = false): Fragment[] {
    let n=seed>>>0;
    const random=()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/4294967296);
    return Array.from({length:compact?64:112},(_,index)=>({origin:random(),direction:random()*Math.PI*2,
        speed:65+random()*175,size:.6+random()*1.7,delay:(index%2?CUES.check:CUES.mate)+random()*.08,
        life:.4+random()*.65,spin:random()*8-4}));
}
export function fragmentAt(p: Fragment, seconds: number) {
    const age=seconds-p.delay,progress=unit(age/p.life),distance=p.speed*(1-(1-progress)**2);
    return { x:Math.cos(p.direction)*distance,y:Math.sin(p.direction)*distance*.38+age*age*95,
        opacity:age<0||age>=p.life?0:(1-progress)**1.5,rotation:age*p.spin };
}
