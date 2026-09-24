import {expect,it,vi} from 'vitest';
import {createCampaignStore,campaignOwnerKey} from '../campaignStore';
import {createCampaignSync,type CloudProgress} from '../campaignSync';
import {emptyCampaign} from '../../config/campaign';
const memory=()=>{const values=new Map<string,string>();return {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};};
const progress=(stageStars:number[])=>({...emptyCampaign(),stageStars});
it('keeps accounts and the guest separate, rejects a stale account update and preserves the earlier save',()=>{
    const storage=memory();storage.setItem('qg_campaign_v1',JSON.stringify(progress([3,3])));
    const store=createCampaignStore(()=>storage,null);store.load();expect(store.getSnapshot().progress.stageStars).toEqual([]);
    store.selectOwner('Alice');expect(store.hasLegacyProgress()).toBe(true);expect(store.importLegacy()).toBe(true);
    store.selectOwner('Bob');expect(store.getSnapshot().progress.stageStars).toEqual([]);expect(store.importLegacy()).toBe(false);
    store.update(()=>progress([3,3,3]),'Alice');expect(store.getSnapshot().progress.stageStars).toEqual([]);
    store.update(()=>progress([1]),'Bob');store.selectOwner('Alice');expect(store.getSnapshot().progress.stageStars).toEqual([3,3]);
    expect(storage.getItem('qg_campaign_v1')).not.toBeNull();expect(storage.getItem(campaignOwnerKey('Bob'))).toContain('[1]');
});
it('merges best scores on a CAS conflict instead of overwriting another device',async()=>{
    const storage=memory(),store=createCampaignStore(()=>storage,'Alice');store.update(()=>progress([3]));
    let call=0;const request=vi.fn(async(body?:any):Promise<CloudProgress>=>{
        if(!body)return {revision:1,progress:progress([1,2])};
        call++;if(call===1)return {saved:false,revision:2,progress:progress([2,3,1])};
        expect(body.revision).toBe(2);expect(body.progress.stageStars).toEqual([3,3,1]);
        return {saved:true,revision:3,progress:body.progress};
    });
    const notify=vi.fn(),sync=createCampaignSync(store,'Alice',request,notify);await sync.flush();
    expect(store.getSnapshot().progress.stageStars).toEqual([3,3,1]);expect(store.hasPending()).toBe(false);expect(notify).toHaveBeenLastCalledWith('saved');
});
it('does not write a late response into another owner and coalesces simultaneous sync calls',async()=>{
    const store=createCampaignStore(memory,'Alice');let resolve!:(value:CloudProgress)=>void;
    const request=vi.fn(()=>new Promise<CloudProgress>(done=>{resolve=done;})),notify=vi.fn();
    const sync=createCampaignSync(store,'Alice',request,notify),a=sync.flush(),b=sync.flush();expect(a).toBe(b);
    store.selectOwner('Bob');resolve({revision:1,progress:progress([3,3])});await a;
    expect(store.getSnapshot().progress.stageStars).toEqual([]);expect(request).toHaveBeenCalledOnce();expect(notify).not.toHaveBeenCalledWith('saved');
});
it('retains offline edits across reload and does not upload an empty save after a failed read',async()=>{
    const storage=memory(),store=createCampaignStore(()=>storage,'Alice');store.update(()=>progress([3]));
    const restored=createCampaignStore(()=>storage,'Alice');restored.load();expect(restored.hasPending()).toBe(true);
    const request=vi.fn().mockRejectedValue(new Error('offline')),notify=vi.fn();await createCampaignSync(restored,'Alice',request,notify).flush();
    expect(request).toHaveBeenCalledOnce();expect(restored.getSnapshot().progress.stageStars).toEqual([3]);expect(restored.hasPending()).toBe(true);expect(notify).toHaveBeenLastCalledWith('error');
});
it('keeps an edit made during upload and saves it with the new revision',async()=>{
    const store=createCampaignStore(memory,'Alice');store.update(()=>progress([1]));let calls=0;
    const request=vi.fn(async(body?:any):Promise<CloudProgress>=>{
        if(!body)return {revision:0,progress:null};calls++;
        if(calls===1)store.update(()=>progress([3,2]));
        return {saved:true,revision:calls,progress:body.progress};
    });
    const notify=vi.fn();await createCampaignSync(store,'Alice',request,notify).flush();
    expect(calls).toBe(2);expect(store.getSnapshot().progress.stageStars).toEqual([3,2]);expect(notify).toHaveBeenLastCalledWith('saved');
});
it('allows only the original owner to recover a legacy import after a storage quota error',()=>{
    const storage=memory();storage.setItem('qg_campaign_v1',JSON.stringify(progress([3,2])));
    let full=true;const guarded={getItem:storage.getItem,setItem:(key:string,value:string)=>{if(full&&key.startsWith('qg_campaign_v2:'))throw new Error('quota');storage.setItem(key,value);}};
    const first=createCampaignStore(()=>guarded,'Alice');first.load();expect(first.importLegacy()).toBe(true);
    const restored=createCampaignStore(()=>guarded,'Alice');restored.load();expect(restored.hasLegacyProgress()).toBe(true);
    restored.selectOwner('Bob');expect(restored.importLegacy()).toBe(false);
    full=false;restored.selectOwner('Alice');expect(restored.importLegacy()).toBe(true);expect(restored.getSnapshot().progress.stageStars).toEqual([3,2]);expect(restored.hasLegacyProgress()).toBe(false);
});
it('does not erase the new account when an earlier account deletion completes late',()=>{
    const storage=memory(),store=createCampaignStore(()=>storage,'Alice');store.update(()=>progress([3]));store.selectOwner('Bob');store.update(()=>progress([2,1]));
    store.resetAfterAccountDeletion('Alice');expect(store.getSnapshot().progress.stageStars).toEqual([2,1]);expect(store.getOwner()).toBe('Bob');
});
