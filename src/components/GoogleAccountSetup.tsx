'use client';
import {useEffect,useRef,useState} from 'react';
import type {Language} from '../locales/dict';
import {dict} from '../locales/dict';
import {TermsDocument} from './TermsDocument';
import {termsText} from '../locales/termsText';
import {accountSecurityText} from '../locales/accountSecurityText';
import {registrationFieldText} from '../locales/registrationValidationText';
import {registrationIssues} from '../../server/src/services/RegistrationValidation';
import {changeGooglePassword,completeGoogleAccount,GoogleLoginError,readGoogleAccount,startGoogleSignIn} from '../lib/googleAccount';
import type {GoogleAccount} from '../lib/googleAccountIdentity';

export function GoogleAccountSetup({lang,authId,reset=false,onComplete,onCancel}:{
    lang:Language;authId:string;reset?:boolean;onComplete:(account:GoogleAccount)=>void;onCancel:()=>void;
}) {
    const ja=lang==='ja',t=dict[lang],terms=termsText(lang);
    const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[repeat,setRepeat]=useState(''),
        [legacyPassword,setLegacyPassword]=useState(''),[link,setLink]=useState(false),[agreed,setAgreed]=useState(false),
        [busy,setBusy]=useState(false),[error,setError]=useState('');
    const pending=useRef<AbortController|null>(null),mounted=useRef(false),heading=useRef<HTMLHeadingElement>(null);
    useEffect(()=>{mounted.current=true;heading.current?.focus();return()=>{mounted.current=false;pending.current?.abort();};},[]);
    const submit=async(event:React.FormEvent)=>{
        event.preventDefault();if(busy||(!reset&&!agreed))return;
        const issues=registrationIssues(reset?'Player':username.trim(),password,undefined,false);
        if(issues.length){setError(registrationFieldText(lang,issues[0]));return;}
        if(password!==repeat){setError(ja?'パスワードが一致しません。':'The passwords do not match.');return;}
        setBusy(true);setError('');const controller=new AbortController();pending.current=controller;
        try{
            let account:GoogleAccount|null;
            if(reset){await changeGooglePassword(authId,password,controller.signal);account=await readGoogleAccount(authId,controller.signal);}
            else account=await completeGoogleAccount(authId,username.trim(),password,link?legacyPassword:undefined,controller.signal);
            if(mounted.current&&!controller.signal.aborted&&account){setPassword('');setRepeat('');setLegacyPassword('');onComplete(account);}
        }catch(error){
            if(mounted.current&&!controller.signal.aborted){
                const code=error instanceof GoogleLoginError?error.code:'AUTH_UNAVAILABLE';
                setError(code==='NAME_UNAVAILABLE'?(ja?'このユーザー名は使用できません。':'This username is unavailable.')
                    :code==='LEGACY_AUTH_REQUIRED'?(ja?'引き継ぐユーザー名と現在のパスワードを確認してください。':'Check the existing username and password.')
                    :code==='GOOGLE_REAUTH_REQUIRED'?(ja?'Googleで再確認してから、もう一度設定してください。':'Confirm your Google account again, then retry.')
                    :code==='ALREADY_HAS_ACCOUNT'?(ja?'このGoogleアカウントには進行があります。「既存アカウントを引き継ぐ」を外して設定してください。':'This Google account already has progress. Turn off linking and finish setup.')
                    :(ja?'保存できませんでした。接続を確認して再試行してください。':'Could not save. Check your connection and retry.'));
            }
        }finally{if(mounted.current)setBusy(false);}
    };
    return <main data-google-setup className="min-h-[100dvh] overflow-y-auto bg-[#11100E] px-5 py-8 text-[#E8E2D7]">
        <div className="mx-auto max-w-2xl space-y-6 pb-12">
            <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold">{reset
                ?(ja?'Q-Gambitのパスワードを再設定':'Reset your Q-Gambit password')
                :(ja?'Google認証が完了しました':'Google sign-in complete')}</h1>
            <p>{ja?'Q-Gambit用のパスワードです。Googleのパスワードは入力しないでください。アカウント削除など、重要な操作で使用します。'
                :'Choose a Q-Gambit password, not your Google password. It confirms important actions such as deleting your account.'}</p>
            {!reset&&<p>{ja?'初回だけ設定します。次回からは保存したGoogle認証で直接入れます。':'Finish this setup once. Next time, your saved Google session opens the game directly.'}</p>}
            <form onSubmit={submit} className="space-y-5">
                {!reset&&<>
                    <label className="flex gap-3"><input type="checkbox" checked={link} disabled={busy} onChange={e=>{setLink(e.target.checked);setLegacyPassword('');setError('');}}/>
                        <span>{ja?'既存のユーザー名・パスワードのアカウントを引き継ぐ':'Link my existing username/password account'}</span></label>
                    <label className="block">{ja?'ユーザー名':'Username'}<input name="username" autoComplete="username" value={username} maxLength={15}
                        onChange={e=>setUsername(e.target.value)} required disabled={busy} className="mt-2 w-full rounded border p-3 bg-[#24211D]"/></label>
                    {link&&<label className="block">{ja?'引き継ぐアカウントの現在のパスワード':'Existing account password'}
                        <input type="password" autoComplete="current-password" value={legacyPassword} onChange={e=>setLegacyPassword(e.target.value)}
                            required disabled={busy} className="mt-2 w-full rounded border p-3 bg-[#24211D]"/></label>}
                </>}
                <label className="block">{ja?'新しいQ-Gambit用パスワード':'New Q-Gambit password'}
                    <input name="password" type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}
                        required disabled={busy} aria-describedby="google-password-rules" className="mt-2 w-full rounded border p-3 bg-[#24211D]"/></label>
                <p id="google-password-rules" className="text-sm">{accountSecurityText(lang,'rules')}</p>
                <label className="block">{ja?'パスワードの確認':'Confirm password'}
                    <input type="password" autoComplete="new-password" value={repeat} onChange={e=>setRepeat(e.target.value)}
                        required disabled={busy} className="mt-2 w-full rounded border p-3 bg-[#24211D]"/></label>
                {!reset&&<>
                    <details className="rounded border border-[#A89C86]/40 p-4"><summary className="min-h-11 cursor-pointer">{terms[0]}</summary><TermsDocument initialLanguage={lang}/></details>
                    <a href="https://q-gambit.com/privacy/" target="_blank" rel="noopener noreferrer" className="block underline">{t.privacyPolicy}</a>
                    <label className="flex gap-3"><input type="checkbox" required checked={agreed} disabled={busy} onChange={e=>setAgreed(e.target.checked)} className="h-5 w-5 shrink-0"/>
                        <span>{terms[1]} {ja?'入力したユーザー名で同意を記録します。':'Consent will be recorded with your username.'}</span></label>
                </>}
                {error&&<p role="alert" className="text-red-200">{error}</p>}
                <button type="submit" disabled={busy||(!reset&&!agreed)} className="min-h-11 w-full rounded bg-[#D4B872] p-3 font-semibold text-[#11100E] disabled:opacity-40">
                    {busy?t.loading:reset?(ja?'パスワードを保存':'Save password'):(ja?'設定して同意する':'Save setup and agree')}</button>
            </form>
            {reset&&<button type="button" disabled={busy} onClick={()=>void startGoogleSignIn(true).catch(()=>setError(ja?'Google認証を開始できませんでした。':'Could not start Google sign-in.'))} className="min-h-11 underline">
                {ja?'Googleで再確認':'Confirm with Google again'}</button>}
            <button type="button" disabled={busy} onClick={onCancel} className="min-h-11 w-full border p-3">{t.cancel}</button>
        </div>
    </main>;
}
