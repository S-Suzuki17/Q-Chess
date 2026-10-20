'use client';
import {useEffect,useRef,useState} from 'react';
import {revokeAllAccountSessions} from '../lib/accountSecurity';
import {accountSecurityText} from '../locales/accountSecurityText';
import {dict,type Language} from '../locales/dict';
import {confirmGooglePassword,startGoogleSignIn} from '../lib/googleAccount';
import {googleAccountFor} from '../lib/googleAccountIdentity';
export function AccountSecurityPanel({userId,lang,onSignedOut}:{userId:string;lang:Language;onSignedOut:()=>void}){
    const [confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
    const pending=useRef(false),alive=useRef(false);
    const [password,setPassword]=useState('');
    const google=!!googleAccountFor(userId);
    useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
    const text=(key:Parameters<typeof accountSecurityText>[1])=>accountSecurityText(lang,key);
    const logout=async()=>{
        if(pending.current)return;pending.current=true;setBusy(true);setNotice('');
        try{
            const proof=google?await confirmGooglePassword(userId,password,'revoke-all'):undefined;
            await revokeAllAccountSessions(userId,proof);if(alive.current){setPassword('');onSignedOut();}
        }
        catch{if(alive.current)setNotice(text('failed'));}
        finally{pending.current=false;if(alive.current)setBusy(false);}
    };
    const copy=async()=>{try{await navigator.clipboard.writeText(userId);if(alive.current)setNotice(text('copied'));}catch{if(alive.current)setNotice(`ID: ${userId}`);}};
    return <section className="mt-4 space-y-3 text-sm" aria-label={text('logoutAll')}>
        <button type="button" onClick={()=>void copy()} className="w-full border border-[#A89C86]/40 p-3">{text('copy')}</button>
        {confirm?<><p>{text('explain')}</p>
            {google&&<label className="block">{lang==='ja'?'Q-Gambit用パスワード':'Q-Gambit password'}
                <input type="password" autoComplete="current-password" value={password} disabled={busy} onChange={e=>setPassword(e.target.value)} className="mt-2 w-full rounded border bg-[#24211D] p-3"/></label>}
            <button type="button" disabled={busy||(google&&!password)} onClick={()=>void logout()} className="min-h-11 border border-[#A89C86]/40 p-3">{text('confirm')}</button><button type="button" disabled={busy} onClick={()=>{setPassword('');setConfirm(false);}} className="min-h-11 p-3">{dict[lang].cancel}</button></>
            :<button type="button" onClick={()=>{setNotice('');setConfirm(true);}} className="w-full border border-[#A89C86]/40 p-3">{text('logoutAll')}</button>}
        {google&&<button type="button" disabled={busy} onClick={()=>void startGoogleSignIn(true).catch(()=>setNotice(text('failed')))} className="min-h-11 w-full underline">
            {lang==='ja'?'Googleで確認してパスワードを再設定':'Confirm with Google to reset your password'}</button>}
        {notice&&<p role="status">{notice}</p>}
    </section>;
}
