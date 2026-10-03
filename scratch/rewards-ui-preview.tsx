import React from 'react';
import { createRoot } from 'react-dom/client';
import { RewardsDialog } from '../src/components/RewardsDialog';
import { LANGUAGES, type Language } from '../src/locales/dict';
import '../src/components/rewards-hub.css';
import '../src/app/globals.css';

// Local, synthetic UI fixture. No accounts, network calls, consent records or payments.
const query=new URLSearchParams(location.search);
function Preview() {
    const [open,setOpen]=React.useState(false);
    const [lang,setLang]=React.useState<Language>((query.get('lang') as Language)||'ja');
    return <main style={{padding:24,maxWidth:900,margin:'auto'}}>
        <h1 style={{fontSize:24}}>Q-Gambit · UI PREVIEW</h1>
        <p style={{margin:'16px 0'}}>架空の表示確認用データです。本番アカウント・決済へ接続しません。</p>
        <div style={{display:'flex',flexWrap:'wrap',gap:12,marginBottom:24}}>
            <label>状態 <select aria-label="状態" value={query.get('state')||'new'} onChange={e=>{query.set('state',e.target.value);location.search=query.toString();}}>
                <option value="new">未受取・未加入</option><option value="claimed">受取済み</option><option value="full">保有上限</option>
                <option value="member">会員</option><option value="error">通信失敗</option><option value="loading">読込中</option><option value="native">Android</option>
            </select></label>
            <label>言語 <select aria-label="言語" value={lang} onChange={e=>setLang(e.target.value as Language)}>{LANGUAGES.map(l=><option key={l.code} value={l.code}>{l.label}</option>)}</select></label>
        </div>
        <button className="reward-entry" onClick={()=>setOpen(true)}>チケット・報酬を開く →</button>
        {open&&<RewardsDialog user={{id:'QA-LOCAL',name:'Preview',type:'registered'}} lang={lang} onClose={()=>setOpen(false)}/>}
    </main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
