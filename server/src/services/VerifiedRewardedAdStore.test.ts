import {generateKeyPairSync,sign,verify} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import {createVerifiedRewardedAdRecorder,type VerifiedRewardedAdEvidence} from './VerifiedRewardedAdStore';
const evidence:VerifiedRewardedAdEvidence={grantId:'10000000-0000-4000-8000-000000000001',userId:'Alice',
    purpose:'online_ranked_match',targetKey:'10000000-0000-4000-8000-000000000002',provider:'synthetic_signed_fixture',transactionId:'SYNTHETIC_TX_1'};
const rpc=()=>vi.fn(()=>({abortSignal:async()=>({data:{grantId:evidence.grantId,duplicate:false},error:null})}));
describe('dormant independently verified ad recorder',()=>{
    it('production gate cannot consume even a valid claimed completion',async()=>{
        const call=rpc(),verifier={verify:vi.fn(async()=>evidence)};
        await expect(createVerifiedRewardedAdRecorder({rpc:call} as never,verifier)('adViewed=true')).rejects.toThrow('DISABLED');
        expect(verifier.verify).not.toHaveBeenCalled();expect(call).not.toHaveBeenCalled();
    });
    it('missing canonical ticket consent is explicit and retryable, without treating completion as consumed',async()=>{
        const call=vi.fn(()=>({abortSignal:async()=>({data:null,error:{code:'42501',message:'CURRENT_TICKET_TERMS_REQUIRED'}})}));
        const record=createVerifiedRewardedAdRecorder({rpc:call} as never,{verify:async()=>evidence},()=>true);
        await expect(record('synthetic-already-verified-evidence')).rejects.toMatchObject({code:'CURRENT_TICKET_TERMS_REQUIRED',retryable:true});
    });
    it('requires independently checked synthetic signature and stores only a digest',async()=>{
        // Ephemeral fixture keys are never production provider credentials.
        const keys=generateKeyPairSync('ed25519'),body=JSON.stringify(evidence);
        const signature=sign(null,Buffer.from(body),keys.privateKey).toString('base64url');
        const verifier={verify:async(raw:string)=>{
            try{const envelope=JSON.parse(raw);return verify(null,Buffer.from(envelope.body),keys.publicKey,Buffer.from(envelope.signature,'base64url'))?JSON.parse(envelope.body):null;}catch{return null;}
        }};
        const call=rpc(),record=createVerifiedRewardedAdRecorder({rpc:call} as never,verifier,()=>true);
        await expect(record(JSON.stringify({adViewed:true}))).rejects.toThrow('INVALID');
        await expect(record(JSON.stringify({body:body.replace('Alice','Bob'),signature}))).rejects.toThrow('INVALID');
        expect(call).not.toHaveBeenCalled();await record(JSON.stringify({body,signature}));
        expect(call).toHaveBeenCalledWith('record_verified_rewarded_ad',expect.objectContaining({p_user_id:'Alice',p_purpose:'online_ranked_match',p_expires_at:null}));
        const parameters=call.mock.calls[0][1];expect(parameters).not.toHaveProperty('signature');expect(parameters).not.toHaveProperty('body');
        expect(parameters.p_evidence_sha256).toMatch(/^[a-f0-9]{64}$/);
    });
});
