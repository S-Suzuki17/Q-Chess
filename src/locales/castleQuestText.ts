// Compatibility name for preserved presentation fixtures; current mode uses neutral map copy.
export {hundredMapText as mapChallengeText} from './hundredMapText';
import {hundredMapText} from './hundredMapText';
import type {Language} from './dict';
export const castleQuestText=(lang:Language,key:'title'|'deeper'|'travel'|'skip')=>hundredMapText(lang,key==='deeper'?'next':key);
