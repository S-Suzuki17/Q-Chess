export type AvatarFrameId=`avatar-frame-${string}`;
export const AVATAR_FRAMES=Array.from({length:15},(_,i)=>({
    id:`avatar-frame-${String(i+1).padStart(2,'0')}` as AvatarFrameId,
    tier:i+1,requiredWins:Math.floor((i+1)*100/15),
    motif:(['laurel','facets','wings','circuit','crown'] as const)[i%5],
    color:['#b79463','#b8c7cc','#dfbf77'][Math.floor(i/5)],
    accent:['#ead2a2','#8cbfbc','#f0e3be'][Math.floor(i/5)],
}));
export const avatarFrame=(id:string|undefined)=>AVATAR_FRAMES.find(frame=>frame.id===id);
