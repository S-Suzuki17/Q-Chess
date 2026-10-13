import React from 'react';
import {CROWN_ENEMIES,crownEnemyName} from '../../../../src/config/crownEnemies';
import {CrownEnemyPortrait} from '../../../../src/components/CrownEnemyPortrait';
import {QubeCompanion} from '../../../../src/components/QubeCompanion';
export function ToonStyleReview(){
    return <main className="toon-style-review" style={{minHeight:'100dvh',padding:24,background:'#182824',color:'#eadfc3'}}><style>{'.toon-style-review .crown-enemy-portrait{width:160px;height:180px;}'}</style><h1 style={{fontSize:20,marginBottom:28}}>QUBE and six enemies · original 2D artwork · equal 160 × 180 display frames</h1><div style={{display:'flex',gap:14,flexWrap:'wrap'}}><figure style={{margin:0,width:160}}><figcaption>QUBE · unchanged</figcaption><div style={{height:180,display:'flex',alignItems:'end'}}><QubeCompanion size={160} reducedMotion/></div></figure>{CROWN_ENEMIES.map(enemy=><figure key={enemy.id} style={{margin:0,width:160}}><figcaption>{crownEnemyName('ja',enemy)} / {enemy.name.en}</figcaption><div style={{height:180}}><CrownEnemyPortrait enemy={enemy}/></div><small>{enemy.foe}</small></figure>)}</div></main>;
}
