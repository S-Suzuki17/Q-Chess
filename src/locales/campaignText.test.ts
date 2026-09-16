import { expect, it } from 'vitest';
import { LANGUAGES } from './dict';
import { bossDescription, campaignKeys, campaignText, campaignTranslationCount, rewardName } from './campaignText';

it.each(LANGUAGES.map(item => item.code))('supplies every campaign label and reward in %s', lang => {
    expect(campaignTranslationCount(lang)).toBe(campaignKeys.length);
    const labels = [...campaignKeys.map(key => campaignText(lang, key)),
        ...[0, 1, 2, 3].map(index => bossDescription(lang, index)),
        ...['standard', 'slate', 'copper', 'obsidian', 'jade'].map(id => rewardName(lang, id))];
    for (const label of labels) expect(label?.trim().length).toBeGreaterThan(0);
});
