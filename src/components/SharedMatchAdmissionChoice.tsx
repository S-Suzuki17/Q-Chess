'use client';
import type { SharedMatchChoiceRequired, SharedMatchChoiceSource } from '../../server/src/protocol/SharedMatchAdmission';
import { QubeTeacher } from './QubeTeacher';
import type { Language } from '../locales/dict';
export function SharedMatchAdmissionChoice({lang,mode,offer,pending,error,onChoose,onCancel}:{
    lang:string;mode?:string;offer:SharedMatchChoiceRequired;pending:boolean;error:boolean;
    onChoose:(source:SharedMatchChoiceSource)=>void;onCancel:()=>void;
}) {
    const ja=lang==='ja';
    return <section role="dialog" aria-modal="true" aria-labelledby="match-choice-title" className="m-auto max-w-md rounded-xl border border-[#B39A62]/40 bg-[#161513] p-6 text-[#E8E2D7]">
        <h2 id="match-choice-title" className="text-lg font-semibold">{ja?(mode==='ranked'?'ランク戦の参加方法':'オンライン対局の参加方法'):'Choose how to start this match'}</h2>
        <QubeTeacher lang={lang as Language} variant="compact"><p className="my-4">{ja?'オンライン・ランク戦共通の本日の無料3局を利用済みです。この1局の参加方法を選んでください。':'You’ve used today’s 3 free online/ranked matches. Choose one option for this match.'}</p></QubeTeacher>
        <div className="flex flex-col gap-3">
            <button className="min-h-11 rounded border border-[#B39A62]/60 p-3" disabled={pending} onClick={()=>onChoose('ticket')}>
                {ja?'ランク戦チケットを1枚使う':'Use 1 rank ticket'}</button>
            <button className="min-h-11 rounded border border-[#B39A62]/60 p-3 disabled:opacity-50" disabled={pending||!offer.verifiedAdAvailable} onClick={()=>onChoose('verified_ad')}>
                {offer.verifiedAdAvailable?(ja?'確認済み広告の1局分を使う':'Use 1 verified ad match'):(ja?'広告の参加方法は現在利用できません':'Rewarded ad option currently unavailable')}</button>
            <button className="min-h-11 rounded border p-3" onClick={onCancel}>{ja?'キャンセル（消費なし）':'Cancel without spending'}</button>
        </div>
        {pending&&<p role="status" className="mt-3">{ja?'参加を確認中…':'Confirming your choice…'}</p>}
        {error&&<p role="alert" className="mt-3">{ja?'参加を確認できませんでした。再試行するかキャンセルしてください。':'Couldn’t confirm your choice. Retry or cancel.'}</p>}
    </section>;
}
