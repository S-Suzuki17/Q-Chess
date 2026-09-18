import { AVATAR_FRAMES } from './avatarFrames';

export type CircuitIconId = `circuit-${string}`;
/** Portraits are paired with frame rewards, not rating-dependent rank badges. */
export const CIRCUIT_ICONS = AVATAR_FRAMES.map((frame, index) => ({
    id: `circuit-${String(index + 1).padStart(2, '0')}` as CircuitIconId,
    url: `/avatars/circuit-${String(index + 1).padStart(2, '0')}.svg`,
    frameId: frame.id,
    requiredWins: frame.requiredWins,
    number: index + 1,
}));
export const circuitIcon = (id: unknown) => CIRCUIT_ICONS.find(icon => icon.id === id);
export const circuitIconFromUrl = (url: unknown) => CIRCUIT_ICONS.find(icon => icon.url === url);
export const circuitIconForFrame = (frameId: unknown) => CIRCUIT_ICONS.find(icon => icon.frameId === frameId);
export const circuitIconUnlocked = (id: unknown, clears: number) => {
    const icon = circuitIcon(id);
    return !!icon && Number.isSafeInteger(clears) && clears >= icon.requiredWins;
};
