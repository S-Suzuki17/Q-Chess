// Public product facts only. Never include account or match data in JSON-LD.
export const PUBLIC_SITE_URL = 'https://q-gambit.com';
export const GAME_DESCRIPTION = 'Q-Gambit is a chess variant with uncertain piece identities. Moves and piece-count limits narrow the candidates. Play the tutorial and CPU practice in your browser.';

export const gameStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    '@id': `${PUBLIC_SITE_URL}/#game`,
    name: 'Q-Gambit',
    url: `${PUBLIC_SITE_URL}/`,
    description: GAME_DESCRIPTION,
    genre: ['Chess variant', 'Deduction', 'Strategy'],
    gamePlatform: 'Web browser',
    mainEntityOfPage: `${PUBLIC_SITE_URL}/`,
};

export function serializeStructuredData(value: unknown): string {
    return JSON.stringify(value).replace(/</g, '\\u003c');
}
