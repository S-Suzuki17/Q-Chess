import React from 'react';
import {createRoot} from 'react-dom/client';
import Home from '../../../../src/app/page';
import {circuitAccess} from '../../../../src/lib/circuitAccess';
import '../../../../src/app/globals.css';
Object.assign(window,{qaAccess:()=>circuitAccess.getSnapshot()});
const root=createRoot(document.getElementById('root')!);
Object.assign(window,{qaUnmount:()=>root.unmount()});
root.render(<React.StrictMode><Home/></React.StrictMode>);
