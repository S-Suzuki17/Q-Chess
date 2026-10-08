import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {TitleScreen} from '../../../../src/components/TitleScreen';
import '../../../../src/app/globals.css';
function App(){const [user,setUser]=useState<any>(null);return user?<main><p data-authenticated>{user.id}</p><button onClick={()=>setUser(null)}>Local sign out</button></main>:<TitleScreen lang="ja" onLogin={setUser}/>;}
createRoot(document.getElementById('root')!).render(<App/>);
