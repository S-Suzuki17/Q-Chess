export type SecurityEvent='login'|'registration'|'logout_all'|'block'|'unblock'|'upstream_error';
export type SecurityOutcome='success'|'denied'|'error';
export type AuditWriter=(event:SecurityEvent,outcome:SecurityOutcome,userId?:string)=>Promise<void>;
export const noAudit:AuditWriter=async()=>{};
/** Bounded, allow-listed metadata only. Audit failures never leak credentials or break self-erasure. */
export function createSecurityAudit(write:AuditWriter):AuditWriter {
    let pending=0,lastWarning=0;
    return async(event,outcome,userId)=>{
        if(pending>=32)return;
        pending++;
        try{await write(event,outcome,userId);}
        catch{if(Date.now()-lastWarning>60000){lastWarning=Date.now();console.warn('Security audit storage unavailable');}}
        finally{pending--;}
    };
}
