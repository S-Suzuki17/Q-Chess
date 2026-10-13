import {gameServerUrl} from './rankedSession';
import {clientReleaseHeaders} from './clientRelease';

/** A successful provider login is not yet new admission to Q-Gambit. */
export async function requireOAuthAdmission(token:string,userId:string):Promise<void>{
 const response=await fetch(new URL('/auth/oauth-admission',gameServerUrl()),{method:'POST',
  headers:{Authorization:`Bearer ${token}`,...clientReleaseHeaders()},credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('OAUTH_ADMISSION_UNAVAILABLE');
 const body=await response.json();if(body?.userId!==userId||body.admitted!==true)throw new Error('OAUTH_ADMISSION_UNAVAILABLE');
}
