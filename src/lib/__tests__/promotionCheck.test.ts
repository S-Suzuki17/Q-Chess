import { describe,it,expect } from 'vitest';
import { isPlayerInCheck,isTokenThreatened,type Token } from '../GameEngine';
import { IdentityPool } from '../IdentityPool';
import { onlineKingInCheck } from '../onlineMovement';
import type { PieceType } from '../../config/gameConfig';
const probabilities={King:0,Queen:0,Rook:0,Bishop:0,Knight:0,Pawn:1};
describe('promoted-piece check presentation',()=>{
    it.each<[PieceType,number,number,number,number]>([
        ['Queen',0,0,0,7],['Rook',2,0,2,7],['Bishop',0,0,4,4],['Knight',3,3,1,4],
    ])('recognizes %s attacks while retaining Pawn identity', (promotedTo,row,col,kingRow,kingCol)=>{
        const piece:Token={id:'pawn',player:'white',row,col,promotedTo,probabilities};
        const king:Token={id:'king',player:'black',row:kingRow,col:kingCol,probabilities:{...probabilities,Pawn:0,King:1}};
        const pool=new IdentityPool(undefined,new Map([['pawn',new Set<PieceType>(['Pawn'])],['king',new Set<PieceType>(['King'])]]));
        expect(isPlayerInCheck('black',[piece,king],pool)).toBe(true);
        expect([...pool.piecePossibilities.get('pawn')!]).toEqual(['Pawn']);
        expect(isTokenThreatened(king,[{...piece,isCaptured:true},king],pool)).toBe(false);
        const unresolved={...king,id:'other-king',row:7,col:7};
        pool.piecePossibilities.set(unresolved.id,new Set(['King','Rook']));
        expect(isPlayerInCheck('black',[piece,king,unresolved],pool)).toBe(false);
    });
    it('does not attack through a blocker or use queen geometry after knight promotion',()=>{
        const king:Token={id:'king',player:'black',row:0,col:7,probabilities};
        const piece:Token={id:'pawn',player:'white',row:0,col:0,promotedTo:'Queen',probabilities};
        const blocker:Token={id:'blocker',player:'black',row:0,col:3,probabilities};
        const pool=new IdentityPool(undefined,new Map([['pawn',new Set<PieceType>(['Pawn'])]]));
        expect(isTokenThreatened(king,[piece,king,blocker],pool)).toBe(false);
        expect(isTokenThreatened(king,[{...piece,promotedTo:'Knight'},king],pool)).toBe(false);
    });
    it('mirrors online server check after promotion',()=>{
        const board=Array<number|null>(64).fill(null);board[0]=1;board[7]=2;
        const pieces=[{id:1,x:0,y:0,team:0,possibilities:['Q'],captured:false},{id:2,x:7,y:0,team:1,possibilities:['K'],captured:false}];
        expect(onlineKingInCheck(board,pieces,1)).toBe(true);
        expect(onlineKingInCheck(board,[pieces[0],{...pieces[1],possibilities:['K','R']}],1)).toBe(false);
        board[3]=3;
        expect(onlineKingInCheck(board,pieces,1)).toBe(false);
    });
});
