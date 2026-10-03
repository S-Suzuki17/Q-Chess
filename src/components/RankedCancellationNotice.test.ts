import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RankedCancellationNotice } from './RankedCancellationNotice';
import { matchCancellation, queueFailureCode } from '../lib/rankedProtocol';
import { isRankedLimitReason, rankedLimitText } from '../locales/rankedLimitText';
import { LANGUAGES } from '../locales/dict';
import { cancelledRankedText } from '../locales/rankedText';

describe('ranked admission limits', () => {
    it('preserves reason on cancellation, not just queue_error.code', () => {
        expect(queueFailureCode({code:'INSUFFICIENT_FUNDS'})).toBe('INSUFFICIENT_FUNDS');
        expect(queueFailureCode({reason:'INSUFFICIENT_FUNDS'})).toBe('INSUFFICIENT_FUNDS');
        expect(matchCancellation({matchId:'m',reason:'INSUFFICIENT_FUNDS'},'m')).toEqual({matchId:'m',reason:'INSUFFICIENT_FUNDS'});
        for (const value of [null, {}, {matchId:'other'}, {matchId:7}]) expect(matchCancellation(value,'m')).toBeNull();
        expect(matchCancellation({matchId:'m',reason:'private server message'},'m')?.reason).toBe('QUEUE_FAILED');
    });
    it.each(LANGUAGES.map(lang=>lang.code))('explains the limit and next steps in %s without a cancellation or purchase prompt', lang => {
        const copy=rankedLimitText(lang);
        const html=renderToStaticMarkup(React.createElement(RankedCancellationNotice,{lang,reason:'INSUFFICIENT_FUNDS',onHome:()=>{}}));
        expect(html).toContain(copy.title);
        expect(html).toContain('UTC');
        expect(html).toContain('role="alert"');
        expect(html).not.toContain(cancelledRankedText(lang));
        expect(html).not.toContain('$2.99');
        expect(html).not.toContain('href=');
    });
    it('does not mislabel disconnects or CPU failures as the daily limit', () => {
        for (const reason of ['cpu_unavailable','connection_timeout','server_recovery',null]) {
            expect(isRankedLimitReason(reason)).toBe(false);
            const html=renderToStaticMarkup(React.createElement(RankedCancellationNotice,{lang:'ja',reason,onHome:()=>{}}));
            expect(html).toContain(cancelledRankedText('ja'));
            expect(html).not.toContain(rankedLimitText('ja').title);
        }
    });
});
