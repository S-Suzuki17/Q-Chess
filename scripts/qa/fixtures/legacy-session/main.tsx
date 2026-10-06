import React from 'react';
import {createRoot} from 'react-dom/client';
import Home from '../../../../src/app/page';
import {circuitAccess} from '../../../../src/lib/circuitAccess';
import {clearRankedSession} from '../../../../src/lib/rankedSession';
Object.assign(window,{qaAccess:()=>circuitAccess.getSnapshot(),qaLogout:()=>{clearRankedSession();circuitAccess.revoke();}});
createRoot(document.getElementById('root')!).render(<React.StrictMode><Home/></React.StrictMode>);
