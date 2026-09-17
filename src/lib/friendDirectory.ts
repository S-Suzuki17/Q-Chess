import { supabase } from './supabaseClient';
import { getFriends,PUBLIC_PROFILE_COLUMNS,type Friend,type Profile } from './gameRecordService';

export const validFriendId=(id:string)=>/^[a-zA-Z0-9_-]{1,128}$/.test(id);
export const formatFriendRating=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0?String(Math.floor(value)):'—';
export function uniqueFriendships(rows:Friend[],userId:string):Friend[] {
    const byUser=new Map<string,Friend>();
    for(const row of rows) {
        if(row.user_id!==userId&&row.friend_id!==userId) continue;
        const other=row.user_id===userId?row.friend_id:row.user_id;
        if(other===userId||!validFriendId(other)) continue;
        const previous=byUser.get(other);
        if(!previous||row.status==='accepted'||(previous.status==='pending'&&row.friend_id===userId)) byUser.set(other,row);
    }
    return [...byUser.values()];
}
export async function getFriendDirectory(userId:string) {
    const friends=uniqueFriendships(await getFriends(userId),userId);
    const ids=friends.map(row=>row.user_id===userId?row.friend_id:row.user_id);
    const profiles:Record<string,Profile>={};
    let profilesUnavailable=false;
    // One public-profile request per 100 people, not a serial query per friend.
    const batches=Array.from({length:Math.ceil(ids.length/100)},(_,i)=>ids.slice(i*100,i*100+100));
    await Promise.all(batches.map(async batch=>{
        const {data,error}=await supabase.from('profiles').select(PUBLIC_PROFILE_COLUMNS).in('id',batch);
        if(error) {profilesUnavailable=true;return;}
        for(const profile of data??[]) profiles[profile.id]=profile;
    }));
    return {friends,profiles,profilesUnavailable:profilesUnavailable||ids.some(id=>!profiles[id])};
}
