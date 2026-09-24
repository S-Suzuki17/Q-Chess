import type {SupabaseClient} from '@supabase/supabase-js';
type Stars=Partial<Record<'nox'|'ember'|'oracle'|'sovereign',number>>;
export type SavedProgress={version:2;stars:Stars;ascensions:Stars[];stageStars:number[];board:string;piece:string;effect:string;music:string;avatar:string};
const bosses=['nox','ember','oracle','sovereign'] as const;
function stars(input:unknown):Stars|null {
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!bosses.includes(key as typeof bosses[number])))return null;
    const out:Stars={};let gap=false;
    for(const key of bosses){const n=(input as Stars)[key];if(n===undefined){gap=true;continue;}if(gap||!Number.isInteger(n)||n<1||n>3)return null;out[key]=n;}
    return out;
}
/** Bounds save data; this is not proof that an offline CPU match was won. */
export function parseSavedProgress(input:unknown):SavedProgress|null {
    if(!input||typeof input!=='object'||Array.isArray(input))return null;
    const v=input as SavedProgress;
    const keys=['version','stars','ascensions','stageStars','board','piece','effect','music','avatar'];
    if(Object.keys(v).some(key=>!keys.includes(key))||v.version!==2)return null;
    const base=stars(v.stars);if(!base||!Array.isArray(v.ascensions)||v.ascensions.length>100)return null;
    const laps=v.ascensions.map(stars);
    if(laps.some((lap,i)=>!lap||(i===0?Object.keys(base):Object.keys(laps[i-1]??{})).length!==4))return null;
    if(!Array.isArray(v.stageStars)||v.stageStars.length>100||v.stageStars.some(n=>!Number.isInteger(n)||n<1||n>3))return null;
    const choices=Object.fromEntries(['board','piece','effect','music','avatar'].map(key=>[key,(v as Record<string,unknown>)[key]??'standard']));
    if(Object.values(choices).some(id=>typeof id!=='string'||!/^[-a-z0-9]{1,100}$/.test(id)))return null;
    return {version:2,stars:base,ascensions:laps as Stars[],stageStars:[...v.stageStars],...choices} as SavedProgress;
}
export type ProgressRow={progress:SavedProgress|null;revision:number};
export function createAccountProgressStore(client:SupabaseClient,verifyUser:(token:string)=>Promise<string|null>,blocked:(id:string)=>Promise<boolean>){
    return {verifyUser,blocked,
        async read(id:string):Promise<ProgressRow>{
            const {data,error}=await client.from('account_progress').select('progress,revision').eq('user_id',id).maybeSingle();
            if(error)throw new Error('UNAVAILABLE');
            if(!data)return {progress:null,revision:0};
            const progress=parseSavedProgress(data.progress);
            if(!progress||!Number.isSafeInteger(data.revision)||data.revision<1)throw new Error('UNAVAILABLE');
            return {progress,revision:data.revision};
        },
        async save(id:string,revision:number,progress:SavedProgress):Promise<boolean>{
            const {data,error}=await client.rpc('save_account_progress',{p_user_id:id,p_revision:revision,p_progress:progress});
            if(error)throw new Error('UNAVAILABLE');return data===true;
        },
    };
}
