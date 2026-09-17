import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createPieceModelLibrary } from './pieceModelLibrary';
import { PIECE_HEIGHTS, PIECE_MAX_WIDTH } from './boardPresentation';
import { rewardPiece } from '../config/campaign';

function sourceModel() {
    const scene = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial());
    mesh.position.set(2, 1, 3);
    scene.add(mesh);
    return {scene, mesh};
}
function meshOf(instance: THREE.Object3D) {
    let mesh!: THREE.Mesh;
    instance.traverse(child => { if (child instanceof THREE.Mesh) mesh = child; });
    return mesh;
}

describe('Canvas-scoped piece resources', () => {
    it.each(['iceglass','neonglass','crystal'] as const)('renders %s as non-emissive transparent glass with bounded shared materials',finish=>{
        const library=createPieceModelLibrary(finish),{scene}=sourceModel();
        const pieces=Array.from({length:192},(_,i)=>library.instantiate(scene,'Pawn',i<96,true));
        const materials=pieces.map(piece=>meshOf(piece).material as THREE.MeshPhysicalMaterial);
        expect(new Set(materials).size).toBe(2);
        for(const material of materials){
            expect(material.emissive.getHex()).toBe(0);expect(material.emissiveIntensity).toBe(0);
            expect(material.transparent).toBe(true);expect(material.opacity).toBeLessThan(.6);
            expect(material.transmission).toBe(0);expect(material.depthWrite).toBe(false);
        }
        const resolved=meshOf(library.instantiate(scene,'Queen',true));
        expect((resolved.material as THREE.MeshPhysicalMaterial).transmission).toBeGreaterThan(.9);
        expect(resolved.castShadow).toBe(false);
        expect(meshOf(pieces[0]).geometry).toBe(resolved.geometry);
        library.dispose();
    });
    it.each(['boxwood', 'ebony', 'alabaster'] as const)('applies %s without changing geometry or dimensions', finish => {
        const library = createPieceModelLibrary(finish);
        const {scene, mesh} = sourceModel();
        const piece = library.instantiate(scene, 'Knight', true);
        const material = meshOf(piece).material as THREE.MeshPhysicalMaterial;
        expect(material.color.getHexString()).toBe(rewardPiece(finish).white.slice(1));
        expect(material.metalness).toBe(rewardPiece(finish).metalness);
        expect(meshOf(piece).geometry).toBe(mesh.geometry);
        expect(new THREE.Box3().setFromObject(piece).getSize(new THREE.Vector3()).y).toBeCloseTo(PIECE_HEIGHTS.Knight);
        library.dispose();
    });
    it('shares two materials across 192 candidate models without sharing transforms', () => {
        const library = createPieceModelLibrary();
        const {scene, mesh} = sourceModel();
        const pieces = Array.from({length:192}, (_, i) => library.instantiate(scene, 'Pawn', i < 96));
        expect(new Set(pieces.map(piece => meshOf(piece).material)).size).toBe(2);
        expect(new Set(pieces.map(piece => meshOf(piece).geometry))).toEqual(new Set([mesh.geometry]));
        pieces[0].position.x = 8;
        expect(pieces[1].position.x).toBe(0);
        expect(mesh.material).toBeInstanceOf(THREE.MeshStandardMaterial);
        expect(mesh.material).not.toBe(meshOf(pieces[0]).material);
        library.dispose();
    });
    it.each(Object.keys(PIECE_HEIGHTS) as (keyof typeof PIECE_HEIGHTS)[])('retains %s size and contact with the board', type => {
        const library = createPieceModelLibrary();
        const {scene} = sourceModel();
        const bounds = new THREE.Box3().setFromObject(library.instantiate(scene, type, true));
        const size = bounds.getSize(new THREE.Vector3());
        expect(size.y).toBeCloseTo(PIECE_HEIGHTS[type]);
        expect(Math.max(size.x, size.z)).toBeLessThanOrEqual(PIECE_MAX_WIDTH);
        expect(bounds.min.y).toBeCloseTo(0);
        expect(bounds.getCenter(new THREE.Vector3()).x).toBeCloseTo(0);
        library.dispose();
    });
    it('releases only its own materials and keeps other canvases independent', () => {
        const first = createPieceModelLibrary(), second = createPieceModelLibrary();
        const {scene, mesh} = sourceModel();
        const a = meshOf(first.instantiate(scene, 'King', true)).material as THREE.Material;
        const b = meshOf(second.instantiate(scene, 'King', true)).material as THREE.Material;
        const disposeA = vi.spyOn(a, 'dispose'), disposeB = vi.spyOn(b, 'dispose');
        const disposeGeometry = vi.spyOn(mesh.geometry, 'dispose');
        first.dispose(); first.dispose();
        expect(disposeA).toHaveBeenCalledOnce();
        expect(disposeB).not.toHaveBeenCalled();
        expect(disposeGeometry).not.toHaveBeenCalled();
        second.dispose();
    });
});
