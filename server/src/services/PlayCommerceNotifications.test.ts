import {afterEach,expect,it,vi} from 'vitest';
const google=vi.hoisted(()=>({verify:vi.fn()}));
vi.mock('google-auth-library',()=>({OAuth2Client:class {verifyIdToken=google.verify;}}));
import {createPlayNotificationIdentity} from './PlayCommerceNotifications';
afterEach(()=>{vi.unstubAllEnvs();vi.resetAllMocks();});
const configure=()=>{vi.stubEnv('PLAY_RTDN_AUDIENCE','https://q-chess.onrender.com/commerce/play/rtdn');vi.stubEnv('PLAY_RTDN_SERVICE_ACCOUNT_EMAIL','push@example.iam.gserviceaccount.com');};
it('requires a fixed HTTPS endpoint and a configured service identity',()=>{
 configure();expect(createPlayNotificationIdentity()).not.toBeNull();
 for(const url of ['', 'http://q-chess.onrender.com/commerce/play/rtdn','https://q-chess.onrender.com/commerce/play/rtdn?redirect=1']){vi.stubEnv('PLAY_RTDN_AUDIENCE',url);expect(createPlayNotificationIdentity()).toBeNull();}
 configure();vi.stubEnv('PLAY_RTDN_SERVICE_ACCOUNT_EMAIL','attacker@example.com');expect(createPlayNotificationIdentity()).toBeNull();
});
it('binds Google signature verification to the exact audience, verified email and issuer',async()=>{
 configure();const identity=createPlayNotificationIdentity()!;
 const valid={email:'push@example.iam.gserviceaccount.com',email_verified:true,iss:'https://accounts.google.com'};
 for(const claims of [valid,{...valid,iss:'accounts.google.com'}]){google.verify.mockResolvedValueOnce({getPayload:()=>claims});expect(await identity('fixture-jwt')).toBe(true);}
 expect(google.verify).toHaveBeenCalledWith({idToken:'fixture-jwt',audience:'https://q-chess.onrender.com/commerce/play/rtdn'});
 for(const claims of [undefined,{...valid,email:'other@example.iam.gserviceaccount.com'},{...valid,email_verified:'true'},{...valid,email_verified:false},{...valid,iss:'https://attacker.example'}]){google.verify.mockResolvedValueOnce({getPayload:()=>claims});expect(await identity('fixture-jwt')).toBe(false);}
});
it('rejects failed signature verification without exposing credential errors',async()=>{
 configure();google.verify.mockRejectedValue(new Error('private provider diagnostic'));expect(await createPlayNotificationIdentity()!('fixture-jwt')).toBe(false);
});
