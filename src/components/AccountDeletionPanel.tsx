'use client';
import { useEffect, useRef, useState } from 'react';
import type { Language } from '../locales/dict';
import { accountDeletionText } from '../locales/accountDeletionText';
import { accountDeletionAvailable, AccountDeletionError, clearDeletedAccountDeviceData, deleteOwnAccount } from '../lib/accountDeletion';
import { campaignStore } from '../lib/campaignStore';
import { SettingsDialog } from './SettingsDialog';

export function AccountDeletionPanel({userId,lang,onDeleted}:{userId:string;lang:Language;onDeleted:()=>void}) {
    const text = accountDeletionText(lang);
    const [open,setOpen] = useState(false),[confirmation,setConfirmation] = useState('');
    const [available,setAvailable] = useState<boolean|null>(null),[error,setError] = useState('');
    const [busy,setBusy] = useState(false);
    const [cleanupFailed,setCleanupFailed] = useState(false);
    const inFlight = useRef(false),mounted = useRef(true);
    useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
    useEffect(()=>{
        if(!open)return;
        let cancelled=false;
        void accountDeletionAvailable().then(value=>{if(!cancelled)setAvailable(value);});
        return()=>{cancelled=true;};
    },[open]);
    const erase=async()=>{
        if(confirmation!=='DELETE'||available!==true||inFlight.current)return;
        inFlight.current=true;setBusy(true);setError('');
        try {
            await deleteOwnAccount(userId);
            const cleared=clearDeletedAccountDeviceData();campaignStore.resetAfterAccountDeletion();
            // Never report the already-completed server deletion as a failure.
            if(!cleared&&mounted.current)setCleanupFailed(true);
            else onDeleted();
        } catch(failure) {
            if(mounted.current)setError(failure instanceof AccountDeletionError&&failure.code==='ACCOUNT_BUSY'?text.busy
                :failure instanceof AccountDeletionError&&failure.code==='AUTH_REQUIRED'?text.reauthenticate:text.unavailable);
        } finally {inFlight.current=false;if(mounted.current)setBusy(false);}
    };
    return <>
        <button type="button" className="min-h-11 w-full border border-red-400/40 p-3 text-sm text-red-200" onClick={()=>{setConfirmation('');setError('');setAvailable(null);setOpen(true);}}>{text.title}</button>
        {open&&<SettingsDialog label={text.title} onClose={()=>{if(cleanupFailed)onDeleted();else if(!busy)setOpen(false);}}>
            {cleanupFailed?<div className="space-y-5 rounded border border-[#A89C86]/50 bg-[#161513] p-6">
                <h3 className="text-xl" role="status">{text.done}</h3>
                <p role="alert" className="text-sm leading-relaxed text-amber-200">{text.cleanupWarning}</p>
                <button type="button" onClick={onDeleted} className="min-h-11 w-full rounded border border-[#A89C86]/50 p-3">OK</button>
            </div>:
            <form className="space-y-5 rounded border border-red-400/40 bg-[#161513] p-6" onSubmit={event=>{event.preventDefault();void erase();}}>
                <h3 className="text-xl">{text.title}</h3><p className="text-sm leading-relaxed text-[#d3cabb]">{text.scope}</p>
                <label className="block text-sm">{text.confirmation}<input autoComplete="off" autoCapitalize="characters" spellCheck={false} value={confirmation} disabled={busy}
                    onChange={event=>setConfirmation(event.target.value)} className="mt-2 min-h-11 w-full rounded border border-[#A89C86]/60 bg-[#24211D] p-3"/></label>
                {available===false&&<p role="status" className="text-sm text-amber-200">{text.unavailable}</p>}
                {error&&<p role="alert" className="text-sm text-red-200">{error}</p>}
                {busy&&<p role="status" className="text-sm">{text.working}</p>}
                <div className="flex flex-wrap gap-3">
                    <button type="button" disabled={busy} onClick={()=>setOpen(false)} className="min-h-11 flex-1 rounded border border-[#A89C86]/50 p-3 disabled:opacity-50">{text.cancel}</button>
                    <button type="submit" disabled={busy||confirmation!=='DELETE'||available!==true} className="min-h-11 flex-1 rounded bg-red-900 p-3 text-white disabled:opacity-40">{text.action}</button>
                </div>
            </form>}
        </SettingsDialog>}
    </>;
}
