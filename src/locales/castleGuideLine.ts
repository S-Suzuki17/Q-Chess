import type {Language} from './dict';
import {crownEnemyForStage,crownEnemyName} from '../config/crownEnemies';

/** Spoken visually once per confirmed arrival; no gameplay claim or generated speech. */
export function castleGuideLine(lang:Language,stage:number){
    const enemy=crownEnemyForStage(stage),name=crownEnemyName(lang,enemy);
    const ja:Record<string,string>={'crown-pawn':'まずは落ち着いて盤面を見よう。','crown-knight':'次の一手をよく読もう。','crown-bishop':'見えている情報を確かめよう。','crown-rook':'君のペースで挑もう。','crown-queen':'焦らず、可能性を絞ろう。','crown-king':'ここまでの読みを信じよう。'};
    const en:Record<string,string>={'crown-pawn':'Take a breath and read the board.','crown-knight':'Think through your next move.','crown-bishop':'Check what the board reveals.','crown-rook':'Play at your own pace.','crown-queen':'Narrow the possibilities, one move at a time.','crown-king':'Trust what you have learned.'};
    if(lang==='ja')return `${name}だね。${ja[enemy.id]}`;
    if(lang==='en')return `${name} is waiting. ${en[enemy.id]}`;
    const other:Record<Exclude<Language,'ja'|'en'>,string>={zh:`${name}在等你。沉住气，看清棋盘。`,ru:`${name} ждёт. Не спеши, изучи доску.`,fr:`${name} t’attend. Prends le temps de lire l’échiquier.`,de:`${name} wartet. Bleib ruhig und lies die Stellung.`,es:`${name} espera. Respira y observa el tablero.`,tr:`${name} bekliyor. Sakin ol ve tahtayı oku.`,pl:`${name} czeka. Spokojnie przyjrzyj się planszy.`,hi:`${name} इंतज़ार कर रहा है। शांत होकर बोर्ड को पढ़ो।`,pt:`${name} espera. Respira e observa o tabuleiro.`,ta:`${name} காத்திருக்கிறார். அமைதியாகப் பலகையைப் பாருங்கள்.`};
    return other[lang];
}
