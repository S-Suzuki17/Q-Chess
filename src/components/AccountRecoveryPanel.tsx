'use client';
import {useEffect,useRef,useState} from 'react';
import {dict,type Language} from '../locales/dict';
import {accountRecoveryText} from '../locales/accountRecoveryText';
import {recoveryAvailable,startRecovery,completeRecovery} from '../lib/accountRecovery';
import {SettingsDialog} from './SettingsDialog';

export function AccountRecoveryPanel({lang,userId}:{lang:Language;userId?:string}) {
    const text=accountRecoveryText(lang),common={...dict.en,...dict[lang]};
    const enroll=userId!==undefined;
    const [open,setOpen]=useState(false),[available,setAvailable]=useState<boolean|null>(null);
    const [id,setId]=useState(userId??''),[email,setEmail]=useState(''),[password,setPassword]=useState('');
    const [repeat,setRepeat]=useState(''),[code,setCode]=useState(''),[ticket,setTicket]=useState('');
    const [busy,setBusy]=useState(false),[done,setDone]=useState(false),[error,setError]=useState('');
    const mounted=useRef(false),inFlight=useRef(false);
    useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
    useEffect(()=>{if(!open)return;let live=true;void recoveryAvailable().then(value=>{if(live)setAvailable(value);});return()=>{live=false;};},[open]);
    const close=()=>{if(inFlight.current)return;setOpen(false);setPassword('');setRepeat('');setCode('');setTicket('');setEmail('');setError('');setDone(false);setAvailable(null);};
    const submit=async()=>{
        if(inFlight.current||available!==true)return;
        if(ticket&&!enroll){
            if([...password].length<12||new TextEncoder().encode(password).length>72){setError(text.passwordRule);return;}
            if(password!==repeat){setError(text.mismatch);return;}
        }
        inFlight.current=true;setBusy(true);setError('');
        try {
            if(!ticket){
                const next=await startRecovery(id.trim(),email.trim(),enroll?password:undefined);
                if(mounted.current){setTicket(next);setPassword('');}
            }else{
                await completeRecovery(ticket,code.trim(),enroll?undefined:password,enroll?userId:undefined);
                if(mounted.current){setDone(true);setPassword('');setRepeat('');setCode('');setTicket('');}
            }
        }catch{if(mounted.current)setError(text.failed);}
        finally{inFlight.current=false;if(mounted.current)setBusy(false);}
    };
    const inputClass='mt-1 min-h-11 w-full rounded border border-[#A89C86]/50 bg-[#24211D] p-3 text-base';
    return <>
        <button type="button" className="min-h-11 w-full border border-[#A89C86]/40 p-3 text-sm text-[#D0C8B6]" onClick={()=>setOpen(true)}>{enroll?text.enroll:text.reset}</button>
        {open&&<SettingsDialog label={enroll?text.enroll:text.reset} onClose={close}>
            <form onSubmit={event=>{event.preventDefault();void submit();}} className="space-y-4 rounded border border-[#A89C86]/50 bg-[#161513] p-5 text-[#E8E2D7]">
                <h3 className="text-xl">{enroll?text.enroll:text.reset}</h3>
                {done?<p role="status">{text.saved}</p>:<>
                    <p className="text-sm leading-relaxed">{enroll?text.enrollHelp:text.resetHelp}</p>
                    {!ticket?<>
                        {!enroll&&<label className="block text-sm">ID<input className={inputClass} value={id} onChange={event=>setId(event.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={128} required disabled={busy}/></label>}
                        <label className="block text-sm">{text.email}<input type="email" className={inputClass} value={email} onChange={event=>setEmail(event.target.value)} autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={254} required disabled={busy}/></label>
                        {enroll&&<label className="block text-sm">{common.password}<input type="password" className={inputClass} value={password} onChange={event=>setPassword(event.target.value)} autoComplete="current-password" maxLength={1024} required disabled={busy}/></label>}
                    </>:<>
                        <p role="status" className="text-sm text-[#D0C8B6]">{text.sent}</p>
                        <label className="block text-sm">{text.code}<input className={inputClass} value={code} onChange={event=>setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" maxLength={10} required disabled={busy}/></label>
                        {!enroll&&<>
                            <label className="block text-sm">{text.password}<input type="password" className={inputClass} value={password} onChange={event=>setPassword(event.target.value)} autoComplete="new-password" minLength={12} maxLength={72} required disabled={busy}/></label>
                            <label className="block text-sm">{text.repeat}<input type="password" className={inputClass} value={repeat} onChange={event=>setRepeat(event.target.value)} autoComplete="new-password" minLength={12} maxLength={72} required disabled={busy}/></label>
                            <p className="text-sm">{text.passwordRule}</p>
                        </>}
                    </>}
                    {available===false&&<p role="status" className="text-sm text-amber-200">{text.unavailable}</p>}
                    {error&&<p role="alert" className="text-sm text-red-200">{error}</p>}
                </>}
                <div className="flex flex-wrap gap-3">
                    <button type="button" onClick={close} disabled={busy} className="min-h-11 flex-1 border border-[#A89C86]/50 p-3">{done?'OK':common.cancel}</button>
                    {!done&&<button type="submit" disabled={busy||available!==true} className="min-h-11 flex-1 bg-[#B39A62] p-3 text-[#11100E] disabled:opacity-40">{busy?'…':ticket?text.verify:text.send}</button>}
                </div>
            </form>
        </SettingsDialog>}
    </>;
}
