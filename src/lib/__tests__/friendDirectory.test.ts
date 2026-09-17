import { beforeEach,describe,it,expect,vi } from 'vitest';
const mocks=vi.hoisted(()=>({from:vi.fn()}));
vi.mock('../supabaseClient',()=>({supabase:{from:mocks.from}}));
import { formatFriendRating,uniqueFriendships,getFriendDirectory } from '../friendDirectory';
import { acceptFriendRequest,removeFriend,PUBLIC_PROFILE_COLUMNS,type Friend } from '../gameRecordService';
const row=(id:string,user_id:string,friend_id:string,status:Friend['status']='accepted'):Friend=>({id,user_id,friend_id,status,created_at:''});
beforeEach(()=>mocks.from.mockReset());
describe('friend directory quality',()=>{
 it('collapses legacy reverse rows, prefers acceptance and never leaks unrelated friendships',()=>{
    const result=uniqueFriendships([row('1','me','one','pending'),row('2','one','me'),row('3','me','one'),row('4','me','two','pending'),row('5','two','me','pending'),row('6','other','stranger')],'me');
    expect(result).toHaveLength(2);
    expect(result[0].status).toBe('accepted');
    expect(result[1].user_id).toBe('two');
 });
 it('formats each rating independently without inventing a zero rating',()=>{
    expect(formatFriendRating(1523.8)).toBe('1523');
    expect(formatFriendRating(0)).toBe('0');
    for(const value of [undefined,null,NaN,Infinity,-1,'1500']) expect(formatFriendRating(value)).toBe('—');
 });
 it('loads all three ratings in one public-column batch, not per-friend requests',async()=>{
    const selectFriends=vi.fn().mockReturnValue({or:vi.fn().mockResolvedValue({data:[row('1','me','one'),row('2','one','me'),row('3','me','two')],error:null})});
    const inIds=vi.fn().mockResolvedValue({data:[{id:'one',rating_10s:1000,rating_3m:1200,rating_10m:1400},{id:'two'}],error:null});
    const selectProfiles=vi.fn().mockReturnValue({in:inIds});
    mocks.from.mockImplementation(table=>({select:table==='friends'?selectFriends:selectProfiles}));
    const result=await getFriendDirectory('me');
    expect(result.friends).toHaveLength(2);
    expect(selectProfiles).toHaveBeenCalledExactlyOnceWith(PUBLIC_PROFILE_COLUMNS);
    expect(PUBLIC_PROFILE_COLUMNS).not.toMatch(/email|password/);
    expect(inIds).toHaveBeenCalledExactlyOnceWith('id',['one','two']);
    expect(result.profiles.one.rating_10m).toBe(1400);
    expect(result.profilesUnavailable).toBe(false);
 });
 it('distinguishes a failed friendship query from an empty list',async()=>{
    mocks.from.mockReturnValue({select:()=>({or:async()=>({error:{message:'offline'},data:null})})});
    await expect(getFriendDirectory('me')).rejects.toThrow('unavailable');
 });
 it('retains friendships and marks unavailable ratings after a profile failure',async()=>{
    mocks.from.mockImplementation(table=>({select:()=>table==='friends'?{or:async()=>({data:[row('1','me','one')]})}:{in:async()=>({error:{message:'offline'}})}}));
    const result=await getFriendDirectory('me');
    expect(result.friends).toHaveLength(1);expect(result.profilesUnavailable).toBe(true);
 });
 it('accepts only an actually updated request and never inserts a reverse row',async()=>{
    const select=vi.fn().mockResolvedValue({data:[],error:null}),match=vi.fn().mockReturnValue({select});
    const update=vi.fn().mockReturnValue({match}),insert=vi.fn();
    mocks.from.mockReturnValue({update,insert});
    expect(await acceptFriendRequest('me','one')).toBe(false);
    select.mockResolvedValue({data:[{id:'1'}],error:null});
    expect(await acceptFriendRequest('me','one')).toBe(true);
    expect(match).toHaveBeenCalledWith({user_id:'one',friend_id:'me',status:'pending'});
    expect(insert).not.toHaveBeenCalled();
 });
 it('rejects unsafe filter IDs before requesting any deletion',async()=>{
    expect(await removeFriend('me','one),id.gt.0')).toBe(false);
    expect(mocks.from).not.toHaveBeenCalled();
 });
});
