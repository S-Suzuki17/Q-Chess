import { describe, expect, it } from 'vitest';
import { LANGUAGES } from './dict';
import { accountDataGuide } from './accountDataGuide';
describe('public account data guide', () => {
  it.each(LANGUAGES)('has instructions and retention/recovery limits in $code', ({code}) => {
    const copy = accountDataGuide(code);
    expect(copy).toHaveLength(3);
    expect(copy.every(value => value.length > 40)).toBe(true);
    expect(copy[0]).toContain('DELETE');
    expect(copy[2]).toContain('Google');
    expect(copy[2]).toContain('Discord');
  });
});
