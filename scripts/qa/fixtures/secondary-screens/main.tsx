import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {GameSettings} from '../../../../src/components/GameSettings';
import {SettingsDialog} from '../../../../src/components/SettingsDialog';
import {CosmeticsSettings} from '../../../../src/components/CosmeticsSettings';
import {CampaignCloudPanel} from '../../../../src/components/CampaignCloudPanel';
import {FoundersSettings} from '../../../../src/components/FoundersSettings';
import {NativeRewardSettings} from '../../../../src/components/NativeRewardSettings';
import {OptionalMetricsSettings} from '../../../../src/components/OptionalMetricsSettings';
import {Gift} from 'lucide-react';
import {rewardsHubText} from '../../../../src/locales/rewardsHubText';
import '../../../../src/components/rewards-hub.css';
import {SiteLinks} from '../../../../src/components/SiteInformation';
import {OnlineMatchWaiting} from '../../../../src/components/OnlineMatchWaiting';
import {CampaignMode} from '../../../../src/components/CampaignMode';
import {GuestCircuitPreview} from '../../../../src/components/GuestCircuitPreview';
import {InteractiveTutorial} from '../../../../src/components/InteractiveTutorial';
import ActualLocalGameBoard from '../../../../src/components/LocalGameBoard';
import {LearningPage} from '../../../../src/components/LearningPage';
import RulesPage from '../../../../src/app/rules/page';
import {emptyCampaign} from '../../../../src/config/campaign';
import {soundManager} from '../../../../src/lib/SoundService';
import {dict,type Language} from '../../../../src/locales/dict';
import type {MatchPreparation} from '../../../../src/hooks/useMatchPreparation';
import '../../../../src/app/globals.css';

const query=new URLSearchParams(location.search),initialLanguage=(query.get('lang')??'ja') as Language;
if(query.get('screen')==='standard-victory')soundManager.updateConfig({masterMute:true});
const user={id:'UI-OnlyFixture',name:'UI fixture',type:'registered' as const};
function App(){
 const [spectator,setSpectator]=useState(false);
 const [lang,setLang]=useState(initialLanguage),[open,setOpen]=useState(['waiting','tutorial','standard-victory'].includes(query.get('screen')??''));
 const [config,setConfig]=useState(()=>soundManager.getConfig()),[progress,setProgress]=useState(emptyCampaign);
 const [connected,setConnected]=useState(query.get('connected')!=='0');
 const [preparation,setPreparation]=useState((query.get('reason')||null) as MatchPreparation|null);
 useEffect(()=>soundManager.subscribe(setConfig),[]);
 useEffect(()=>{Object.assign(window,{qaWaiting:{setConnected,setPreparation},qaHome:0,qaVictorySpectate:()=>setSpectator(true)});},[]);
 const back=()=>{(window as unknown as {qaHome:number}).qaHome++;setOpen(false);};
 if(query.get('screen')==='standard-victory')return open?<ActualLocalGameBoard lang={lang} user={{id:'GUEST-standard-fixture',name:'Local fixture',type:'guest'}} onlineRole={spectator?'spectator':'white'} cpuLevel={0} onHome={back}/>:<p data-qa-home>Home</p>;
 if(query.get('screen')==='map')return query.has('guest')?<GuestCircuitPreview lang={lang} onBack={back} onLogin={()=>{}}/>:<CampaignMode lang={lang} user={user} onBack={back} onLogin={()=>{}}/>;
 if(query.get('screen')==='guide')return <LearningPage kind="guide"/>;
 if(query.get('screen')==='rules')return <RulesPage/>;
 if(query.get('screen')==='tutorial')return open?<InteractiveTutorial lang={lang} onClose={back}/>:<p data-qa-home>Home</p>;
 if(query.get('screen')==='waiting')return open?<main style={{minHeight:'100dvh',display:'grid',placeItems:'center',padding:'12px',background:'#0d1710'}}><OnlineMatchWaiting lang={lang} mode="ranked" connected={connected} preparation={preparation} onHome={back}/></main>:<p data-qa-home>Home</p>;
 return <><button id="settings-opener" onClick={()=>setOpen(true)}>Open settings</button>{open&&<SettingsDialog wide label={dict[lang].settings} onClose={()=>setOpen(false)}><GameSettings lang={lang} soundConfig={config} onLanguageChange={setLang} onClose={()=>setOpen(false)}
  appearance={<CosmeticsSettings compact lang={lang} progress={progress} update={change=>setProgress(change)} loaded locked={query.has('locked')}/>}
  appearanceExtra={query.has('native')?<FoundersSettings lang={lang} accountName={user.name} progress={progress} locked={false}
   rewards={{signedIn:true,native:true,busy:false,error:null,available:false,status:null,refresh:async()=>{},claim:async()=>{}}}/>:undefined}
  account={query.has('guest')?null:<><button className="reward-entry"><Gift size={18}/><span>{rewardsHubText(lang).title}<small>{rewardsHubText(lang).description}</small></span></button><div className="settings-account-actions"><button>{dict[lang].account}</button><button>{dict[lang].friends}</button></div><CampaignCloudPanel lang={lang} cloud={{userId:user.id,state:'saved',retry:()=>{}}} locked={false}/></>}
  accountExtra={query.has('native')?<NativeRewardSettings userId={user.id} lang={lang} locked={false}/>:undefined}
  privacy={<><OptionalMetricsSettings lang={lang}/><a className="settings-policy-link" href="/privacy/">{dict[lang].privacyPolicy}</a></>}
  support={<SiteLinks compact lang={lang} newTab/>}/></SettingsDialog>}</>;
}
createRoot(document.getElementById('root')!).render(<App/>);
