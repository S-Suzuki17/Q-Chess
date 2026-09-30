import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { informationMetadata } from './siteMetadata';
import { GAME_DESCRIPTION, gameStructuredData, serializeStructuredData } from './searchMetadata';

describe('public search metadata', () => {
    it('describes only the real public game without invented ratings or offers', () => {
        expect(gameStructuredData.name).toBe('Q-Gambit');
        expect(gameStructuredData.url).toBe('https://q-gambit.com/');
        expect(gameStructuredData.description).toBe(GAME_DESCRIPTION);
        expect(gameStructuredData).not.toHaveProperty('aggregateRating');
        expect(gameStructuredData).not.toHaveProperty('offers');
    });
    it('uses each information page canonical in its sharing metadata', () => {
        for (const path of ['/rules/', '/about/', '/contact/', '/privacy/', '/terms/', '/updates/']) {
            const metadata = informationMetadata('Information', path);
            expect(metadata.alternates?.canonical).toBe(path);
            expect(metadata.openGraph).toMatchObject({ url: path });
            expect(metadata.description).toBeTruthy();
            expect(readFileSync('public/sitemap.xml', 'utf8')).toContain(`https://q-gambit.com${path}`);
        }
    });
    it('escapes script-closing text in JSON-LD', () => {
        const serialized = serializeStructuredData({ name: '</script><script>alert(1)</script>' });
        expect(serialized).not.toContain('<');
        expect(JSON.parse(serialized).name).toBe('</script><script>alert(1)</script>');
    });
});
