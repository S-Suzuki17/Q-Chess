import sharp from 'sharp';
import { resolve } from 'node:path';

// Original geometric artwork, one distinct text-free 512px icon for each stat.
const shapes = {
    matches: '<rect x="120" y="120" width="272" height="272" rx="16"/><path d="M120 188h272M120 256h272M120 324h272M188 120v272M256 120v272M324 120v272"/>',
    wins: '<path d="M174 116h164v108c0 64-40 96-82 96s-82-32-82-96zM174 140h-54v48c0 48 30 70 68 70M338 140h54v48c0 48-30 70-68 70M256 320v70M190 396h132"/>',
    moves: '<circle cx="138" cy="362" r="28"/><path d="M166 362h64V230h134V120M310 174l54-54 54 54"/><circle cx="230" cy="230" r="20"/>',
    captures: '<circle cx="256" cy="218" r="57"/><path d="M226 272l-30 94h120l-30-94M178 397h156M100 124h80M140 84v80M332 108l80 80M412 108l-80 80"/>',
    checkmate: '<path d="M256 84v100M222 120h68M154 212l42 112h120l42-112-66 35-36-63-36 63zM196 324l-20 66h160l-20-66M160 414h192"/>',
    progress: '<path d="M256 90l44 90 99 15-72 70 17 99-88-47-88 47 17-99-72-70 99-15zM120 420h272M120 420v-30M392 420v-30"/>',
};
for (const [name, shape] of Object.entries(shapes)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><circle cx="256" cy="256" r="240" fill="#111511"/><g fill="none" stroke="#d3bc87" stroke-width="16" stroke-linecap="round" stroke-linejoin="round">${shape}</g></svg>`;
    await sharp(Buffer.from(svg)).png().toFile(resolve('docs/play-games', `${name}.png`));
}
console.log('Generated six distinct 512 × 512 Play Games stat icons.');
