'use client';
import { useState,useEffect,useCallback,useRef } from 'react';
import { matchText } from '../locales/matchText';
import type { User } from '../types/game';
import { sendFriendRequest,acceptFriendRequest,removeFriend,type Friend,type Profile } from '../lib/gameRecordService';
import { getFriendDirectory,formatFriendRating,validFriendId } from '../lib/friendDirectory';
import { dict,type Language } from '../locales/dict';
import { friendsText } from '../locales/friendsText';
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh';
import { SettingsDialog } from './SettingsDialog';
import './friends.css';

interface FriendsMenuProps {user:User;lang:Language;onlineUsers:Set<string>;onClose:()=>void}
export function FriendsMenu({user,lang,onlineUsers,onClose}:FriendsMenuProps) {
    const t=dict[lang],f=(key:Parameters<typeof friendsText>[1])=>friendsText(lang,key);
    const [friends,setFriends]=useState<Friend[]>([]);
    const [profiles,setProfiles]=useState<Record<string,Profile>>({});
    const [loading,setLoading]=useState(true),[error,setError]=useState(false),[partial,setPartial]=useState(false);
    const [searchId,setSearchId]=useState(''),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false);
    const [removeId,setRemoveId]=useState<string|null>(null);
    const request=useRef(0),acting=useRef(false);
    const registered=user.type==='registered';
    const loadFriends=useCallback(async()=>{
        if(!registered) {setLoading(false);return;}
        const serial=++request.current;
        setLoading(true);
        try {
            const result=await getFriendDirectory(user.id);
            if(serial!==request.current) return;
            setFriends(result.friends);setProfiles(result.profiles);setPartial(result.profilesUnavailable);setError(false);
        } catch {
            if(serial===request.current) setError(true);
        } finally {if(serial===request.current) setLoading(false);}
    },[user.id,registered]);
    useEffect(()=>{void loadFriends();return()=>{request.current++;};},[loadFriends]);
    useRealtimeRefresh(['friends','profiles'],loadFriends,registered);
    const run=async(operation:()=>Promise<boolean>,success?:()=>void)=>{
        if(acting.current) return;
        acting.current=true;setBusy(true);setMsg('');
        try {
            if(await operation()) {success?.();await loadFriends();}
            else setMsg(f('actionError'));
        } catch {setMsg(f('actionError'));}
        finally {acting.current=false;setBusy(false);}
    };
    const send=()=>{
        const id=searchId.trim();
        if(!validFriendId(id)) {setMsg(matchText(lang,'送信できませんでした。IDを確認してください','Failed to send request. Check ID.'));return;}
        if(id===user.id) {setMsg(matchText(lang,'自分は追加できません','Cannot add yourself'));return;}
        if(friends.some(row=>row.user_id===id||row.friend_id===id)) {setMsg(matchText(lang,'友達登録済み、または申請中です','Already friends or request pending'));return;}
        void run(()=>sendFriendRequest(user.id,id),()=>{setSearchId('');setMsg(matchText(lang,'申請を送信しました','Request sent!'));});
    };
    const accepted=friends.filter(row=>row.status==='accepted');
    const received=friends.filter(row=>row.status==='pending'&&row.friend_id===user.id);
    const sent=friends.filter(row=>row.status==='pending'&&row.user_id===user.id);
    const name=(id:string)=>profiles[id]?.name||id;
    return <SettingsDialog label={t.friends} onClose={onClose}>
        <section className="friends-panel" data-testid="friends-panel" aria-busy={loading}>
            <header><div><small>{t.settings}</small><h2>{t.friends}</h2></div><button autoFocus aria-label={t.settings} onClick={onClose}>←</button></header>
            {!registered?<p role="status">{f('signIn')}</p>:<>
                <form className="friend-add" onSubmit={event=>{event.preventDefault();send();}}>
                    <label htmlFor="friend-id">{matchText(lang,'友達を追加','Add Friend')}</label>
                    <div><input id="friend-id" value={searchId} onChange={event=>setSearchId(event.target.value)} placeholder={t.enterId} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={128}/>
                    <button type="submit" disabled={busy||loading||error||!searchId.trim()}>{matchText(lang,'送信','Send')}</button></div>
                </form>
                {msg&&<p className="friend-notice" role="status">{msg}</p>}
                {error&&<div className="friend-error" role="alert"><p>{f('loadError')}</p><button disabled={loading} onClick={()=>void loadFriends()}>{f('retry')}</button></div>}
                {partial&&!error&&<p className="friend-notice" role="status">{f('profileError')}</p>}
                {received.length>0&&<section className="friend-group"><h3>{matchText(lang,'友達申請','Friend Requests')} · {received.length}</h3>
                    {received.map(row=><article className="friend-request" key={row.id}><strong>{name(row.user_id)}</strong><div>
                        <button disabled={busy||loading||error} onClick={()=>void run(()=>acceptFriendRequest(user.id,row.user_id))}>{matchText(lang,'承認','Accept')}</button>
                        <button disabled={busy||loading||error} onClick={()=>void run(()=>removeFriend(user.id,row.user_id))}>{matchText(lang,'拒否','Decline')}</button>
                    </div></article>)}
                </section>}
                <section className="friend-group"><h3>{t.friends} · {accepted.length}</h3>
                    {loading&&<p role="status">{t.loading}</p>}
                    {!loading&&!error&&accepted.length===0&&<p className="friend-empty">{matchText(lang,'まだ友達がいません','No friends yet.')}</p>}
                    {accepted.map(row=>{
                        const id=row.user_id===user.id?row.friend_id:row.user_id,profile=profiles[id];
                        return <article className="friend-card" data-friend-id={id} key={id}>
                            <div className="friend-identity"><span className="friend-avatar" aria-hidden="true">{(profile?.name||'?').slice(0,1)}</span><div><strong>{name(id)}</strong>
                                <small><span aria-hidden="true" className={onlineUsers.has(id)?'friend-online':'friend-offline'}/> {onlineUsers.has(id)?matchText(lang,'オンライン','Online'):id}</small></div></div>
                            <dl className="friend-ratings" aria-label={t.ratings}>{([['rating_10s',t.tc10s],['rating_3m',t.lb3m],['rating_10m',t.lb10m]] as const).map(([key,label])=><div key={key}><dt>{label}</dt><dd data-rating={key}>{formatFriendRating(profile?.[key])}</dd></div>)}</dl>
                            {removeId===id?<div className="friend-confirm"><p>{f('confirmRemove')}</p><button disabled={busy||loading||error} onClick={()=>void run(()=>removeFriend(user.id,id),()=>setRemoveId(null))}>{matchText(lang,'削除','Remove')}</button><button disabled={busy} onClick={()=>setRemoveId(null)}>{t.cancel}</button></div>
                            :<button className="friend-remove" disabled={busy||loading||error} onClick={()=>setRemoveId(id)}>{matchText(lang,'削除','Remove')}</button>}
                        </article>;
                    })}
                </section>
                {sent.length>0&&<section className="friend-group"><h3>{f('pending')} · {sent.length}</h3>{sent.map(row=><article className="friend-request" key={row.id}><strong>{name(row.friend_id)}</strong><button disabled={busy||loading||error} onClick={()=>void run(()=>removeFriend(user.id,row.friend_id))}>{t.cancel}</button></article>)}</section>}
            </>}
        </section>
    </SettingsDialog>;
}
