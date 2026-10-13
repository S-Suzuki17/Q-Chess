import {createElement} from 'react';
import type {CrownEnemy} from '../config/crownEnemies';
import {crownToonLayers,TOON_PARTS} from './crownToonArt';

export function CrownToonArtwork({enemy}:{enemy:CrownEnemy}){
    return <svg xmlns="http://www.w3.org/2000/svg" className="crown-character-flat" viewBox="0 0 256 288" aria-hidden="true" focusable="false"><g stroke="#403926" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">{crownToonLayers(enemy.foe).map((shapes,i)=><g key={TOON_PARTS[i]} data-character-part={TOON_PARTS[i]}>{shapes.map((shape,index)=>createElement(shape.tag,{key:index,...shape.props}))}</g>)}</g></svg>;
}
