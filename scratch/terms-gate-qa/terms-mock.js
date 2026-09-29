// Only this isolated fixture uses these in-memory records. No network or real account.
export const model={saved:new Set(),pending:[],writes:0,failWrite:false};
export function accountTermsStatus(id){return new Promise((resolve,reject)=>model.pending.push({id,resolve,reject}));}
export async function acceptAccountTerms(id){if(model.failWrite)throw new Error('UNAVAILABLE');model.writes++;model.saved.add(id);}
