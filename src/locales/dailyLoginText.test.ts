import { expect, it } from 'vitest';
import { LANGUAGES } from './dict';
import { dailyLoginText } from './dailyLoginText';

it('provides all read-only daily reward labels in all twelve languages', () => {
    expect(LANGUAGES).toHaveLength(12);
    const keys = Object.keys(dailyLoginText('en'));
    for (const { code } of LANGUAGES) {
        const copy = dailyLoginText(code);
        expect(Object.keys(copy)).toEqual(keys);
        for (const label of Object.values(copy)) expect(label.trim().length).toBeGreaterThan(0);
    }
});
