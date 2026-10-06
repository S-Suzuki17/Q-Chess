import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {CampaignMode} from '../../../../src/components/CampaignMode';
import {circuitAccess} from '../../../../src/lib/circuitAccess';
const user={id:'CrownFixture',name:'Fixture',type:'registered' as const};
const login=()=>circuitAccess.grant(user,circuitAccess.beginAuthentication());login();
Object.assign(window,{qaRevoke:()=>circuitAccess.revoke(),qaRelogin:login});
function App(){
    const [shown,setShown]=useState(true);
    return shown?<CampaignMode lang="en" user={user} onBack={()=>setShown(false)} onLogin={login}/>:
        <button data-reopen onClick={()=>setShown(true)}>Reopen Campaign</button>;
}
createRoot(document.getElementById('root')!).render(<App/>);
