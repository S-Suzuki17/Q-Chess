import type { User } from '../types/game';

type Access = Readonly<{userId:string|null;revision:number}>;
const INITIAL:Access={userId:null,revision:0};
export const isCircuitAccount=(user:User|null|undefined):user is User=>!!user&&user.type==='registered'&&typeof user.id==='string'&&!!user.id.trim()&&!user.id.toUpperCase().startsWith('GUEST-');

/** Profile display changes must not interrupt a match in another tab.
 * This only avoids revocation; it never grants access from cached data. */
export function isSameCircuitIdentity(previous:string|null,next:string|null):boolean {
    if(!previous||!next)return false;
    try {
        const before=JSON.parse(previous),after=JSON.parse(next);
        return isCircuitAccount(before)&&isCircuitAccount(after)&&before.id===after.id;
    } catch { return false; }
}

/** In-memory login lifecycle, NOT a server authorization token. Cached profile
 * display data must never grant access. Existing local saves remain untouched. */
export function createCircuitAccessStore() {
    let snapshot=INITIAL;
    const listeners=new Set<()=>void>();
    const publish=(userId:string|null)=>{
        snapshot={userId,revision:snapshot.revision+1};
        listeners.forEach(listener=>listener());
        return snapshot.revision;
    };
    const canPlay=(user:User|null|undefined)=>isCircuitAccount(user)&&snapshot.userId===user.id;
    return {
        getSnapshot:()=>snapshot,
        getServerSnapshot:()=>INITIAL,
        subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},
        revoke:()=>publish(null),
        beginAuthentication:()=>publish(null),
        grant:(user:User,attempt:number)=>{
            if(attempt!==snapshot.revision||!isCircuitAccount(user))return false;
            publish(user.id);return true;
        },
        canPlay,
        permit:(user:User)=>{
            const revision=snapshot.revision;
            return ()=>revision===snapshot.revision&&canPlay(user);
        },
    };
}
export const circuitAccess=createCircuitAccessStore();
