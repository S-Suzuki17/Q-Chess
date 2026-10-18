export * from '../../../../src/lib/localGame';
import {createLocalPosition as ordinaryPosition,positionForDisplay} from '../../../../src/lib/localGame';
import {tutorialCourse} from '../../../../src/lib/tutorialCourse';

/** Only the initial fixture position changes; actual move rules and caller timing run. */
export function createLocalPosition(){
 if(new URLSearchParams(location.search).get('screen')!=='standard-victory')return ordinaryPosition();
 const prepared=tutorialCourse.find(lesson=>lesson.id==='checkmate')!.create();
 // The actual recorder accepts the same token_N IDs as a real local match.
 // Tutorial-specific names would throw before the caller could show its result.
 const nextId={white:17,black:1};
 return positionForDisplay({...prepared,pieces:prepared.pieces.map(piece=>({...piece,id:`token_${nextId[piece.owner]++}`}))});
}
