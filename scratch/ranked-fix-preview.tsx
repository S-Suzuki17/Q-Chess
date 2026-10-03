import React from 'react';
import {createRoot} from 'react-dom/client';
import {RankedCancellationNotice} from '../src/components/RankedCancellationNotice';
import {QuantumPieceUI} from '../src/components/QuantumPieceUI';
import '../src/app/globals.css';
function Preview() {
    const [open,setOpen]=React.useState(true);
    const [captured,setCaptured]=React.useState(false);
    return <main style={{padding:16,maxWidth:900,margin:'auto'}}>
        <h1>ランク戦修正 · ローカル表示確認</h1><p>架空の局面です。本番対局・残高へ接続しません。</p>
        <button onClick={()=>setOpen(true)}>制限表示を開く</button>
        <p style={{marginTop:24}}>キング／ポーンの2駒から1駒を捕獲：残る駒はキングに確定</p>
        <div style={{display:'flex',gap:24,margin:'24px 0'}}>
            <QuantumPieceUI id="last" player="black" probabilities={{Pawn:captured?0:.5,King:captured?1:.5,Knight:0,Bishop:0,Rook:0,Queen:0}} isSelected={false} onClick={()=>{}}/>
            <button onClick={()=>setCaptured(!captured)}>{captured?'局面を戻す':'捕獲後の候補を表示'}</button>
        </div>
        {open&&<div style={{position:'fixed',inset:0,background:'#11100eee',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <RankedCancellationNotice lang="ja" reason="INSUFFICIENT_FUNDS" onHome={()=>setOpen(false)}/>
        </div>}
    </main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
