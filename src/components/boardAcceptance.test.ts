import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BOARD_THEMES, boardCamera } from './boardPresentation';
import { LANGUAGES } from '../locales/dict';

// Architecture guardrails complement real browser interaction/visual checks.
const read = (path: string) => readFileSync(path, 'utf8');
describe('player-approved board contract', () => {
    it('makes the original 3D board available by default without a campaign unlock', () => {
        const preferences = read('src/hooks/useBoardPreferences.ts');
        expect(preferences).toContain('[is2DView, setIs2DView] = useState(false)');
        const layout = read('src/components/MatchLayout.tsx');
        const button3D = layout.split('\n').find(line => line.includes('>3D</button>'));
        expect(button3D).toBeTruthy();
        expect(button3D).not.toMatch(/disabled|rewardUnlocked|bossUnlocked/);
    });
    it('does not mount background art, 3D scenery or interactive camera controls', () => {
        const board = read('src/components/Board3D.tsx');
        expect(board).not.toMatch(/import[^;]*(?:OrbitControls|CameraControls|MapControls|BoardEnvironment3D|BoardAtmosphere)/);
        expect(board).toContain('data-camera="fixed"');
        expect(board).toContain('<QuantumBlock');
        expect(board).toContain('active.map((type,i)');
        expect(board).toContain('reducedMotion={reducedMotion}');
    });
    it.each([[360,800],[412,915],[1440,960]])('fills the limiting board dimension at %i × %i', (width,height) => {
        const camera = boardCamera(width,height);
        expect(camera.zoom * 8.85 / Math.min(width,height)).toBeGreaterThan(.99);
        expect(camera.zoom * 8.85).toBeLessThan(Math.min(width,height));
    });
    it('retains three themes, twelve languages and resizable portrait packaging', () => {
        expect(Object.keys(BOARD_THEMES)).toEqual(['classic','marble','neon']);
        expect(LANGUAGES.map(language=>language.code)).toEqual(['en','ja','zh','ru','fr','de','es','tr','pl','hi','pt','ta']);
        expect(read('android/app/src/main/AndroidManifest.xml')).toContain('android:screenOrientation="portrait"');
        expect(read('android/app/src/main/AndroidManifest.xml')).toContain('android:resizeableActivity="true"');
        expect(read('android/app/src/main/AndroidManifest.xml')).toContain('android:appCategory="game"');
        expect(JSON.parse(read('public/manifest.json')).orientation).toBe('portrait');
        expect(read('src/app/manifest.ts')).toContain("orientation: 'portrait'");
    });
});
