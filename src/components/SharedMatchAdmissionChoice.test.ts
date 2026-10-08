import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {SharedMatchAdmissionChoice} from './SharedMatchAdmissionChoice';
it('makes one ticket or one verified ad choice explicit and leaves cancellation available',()=>{
    const html=renderToStaticMarkup(createElement(SharedMatchAdmissionChoice,{lang:'en',mode:'ranked',
        offer:{matchId:'10000000-0000-4000-8000-000000000001',dailyFreeMatches:3,ticketCost:1,verifiedAdMatches:1,verifiedAdAvailable:false},
        pending:false,error:false,onChoose:()=>{},onCancel:()=>{}}));
    expect(html).toContain('Use 1 rank ticket');expect(html).toContain('3 free online/ranked matches');
    expect(html).toContain('Rewarded ad option currently unavailable');expect(html).toContain('Cancel without spending');expect(html).toContain('disabled=""');
});
