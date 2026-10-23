import {expect,it} from 'vitest';
import {clockDisplaySnapshot} from './matchClock';

it('updates ten displayed seconds only ten times at a 100ms polling rate',()=>{
    let displayed=600,updates=0;
    for(let tick=1;tick<=100;tick++) {
        const remaining=600-tick/10,next=clockDisplaySnapshot(displayed,remaining);
        if(next!==displayed)updates++;
        expect(Math.ceil(next)).toBe(Math.ceil(remaining));
        displayed=next;
    }
    expect(updates).toBe(10);
});

it('keeps fractional start times and reaches zero without adding time',()=>{
    expect(clockDisplaySnapshot(1.7,1.1)).toBe(1.7);
    expect(clockDisplaySnapshot(1.7,.95)).toBe(.95);
    expect(clockDisplaySnapshot(.95,.05)).toBe(.95);
    expect(clockDisplaySnapshot(.95,0)).toBe(0);
    expect(clockDisplaySnapshot(.95,-.03)).toBe(0);
});
