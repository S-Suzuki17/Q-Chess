import {BufferGeometry,Box3,CylinderGeometry,Mesh,Object3D,TorusGeometry,Vector3} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {PieceForm} from '../config/championshipRewards';
import {PIECE_MAX_WIDTH} from './boardPresentation';

/** Sculpt once per type / Canvas, then share the owned geometry across candidates.
 * Heads are preserved so every finish retains readable chess identities. */
export function sculptPieceGeometry(model:Object3D,form:Exclude<PieceForm,'staunton'>):BufferGeometry {
    model.updateMatrixWorld(true);
    const parts:BufferGeometry[]=[];
    model.traverse(child=>{
        if(!(child instanceof Mesh))return;
        const source=child.geometry as BufferGeometry;
        const copy=source.index?source.toNonIndexed():source.clone();
        copy.applyMatrix4(child.matrixWorld);
        for(const key of Object.keys(copy.attributes))if(!['position','normal','uv'].includes(key))copy.deleteAttribute(key);
        parts.push(copy);
    });
    const result=mergeGeometries(parts);
    parts.forEach(part=>part.dispose());
    if(!result)throw new Error('Unable to build reward piece');
    const bounds=new Box3().setFromBufferAttribute(result.getAttribute('position') as import('three').BufferAttribute);
    const height=bounds.max.y-bounds.min.y,position=result.getAttribute('position');
    for(let i=0;i<position.count;i++){
        const x=position.getX(i),z=position.getZ(i),y=position.getY(i),h=(y-bounds.min.y)/height;
        if(h<.18||h>.76)continue;
        const angle=Math.atan2(z,x),envelope=Math.sin((h-.18)/.58*Math.PI);
        const radius=Math.hypot(x,z);
        let factor=1;
        if(form==='spire')factor=1-.42*envelope;
        if(form==='crowned')factor=1+(.12+.23*Math.cos(h*Math.PI*10))*envelope;
        if(form==='citadel')factor=1+.32*envelope;
        if(form==='fluted')factor=1+(.12+.13*Math.cos(angle*12))*envelope;
        if(form==='faceted')factor=(1+.14*envelope)*Math.cos(Math.PI/6)/Math.cos((angle+Math.PI*4)% (Math.PI/3)-Math.PI/6);
        position.setXYZ(i,x*factor,y,z*factor);
    }
    // Distinct layered/polygonal bases, kept below the stem and within the cell.
    const segments=form==='faceted'?6:form==='citadel'?8:32;
    const base=new CylinderGeometry(PIECE_MAX_WIDTH*.43,PIECE_MAX_WIDTH*.49,.045,segments).toNonIndexed();
    base.translate(0,.024,0);
    const final=mergeGeometries([result,base]);
    result.dispose();base.dispose();
    if(!final)throw new Error('Unable to finish reward base');
    final.computeBoundingBox();
    const size=final.boundingBox!.getSize(new Vector3()),scale=Math.min(1,PIECE_MAX_WIDTH/Math.max(size.x,size.z));
    final.scale(scale,1,scale);
    final.computeVertexNormals();
    return final;
}

/** Secondary material at the base only; heads and candidate silhouettes stay clear. */
export function pieceTrimGeometry(form:PieceForm,tier:number):BufferGeometry {
    const parts:BufferGeometry[]=[];
    const ring=(radius:number,y:number,segments=48)=>{
        const geometry=new TorusGeometry(radius,.011,4,segments).toNonIndexed();
        geometry.rotateX(Math.PI/2);geometry.translate(0,y,0);parts.push(geometry);
    };
    const segments=form==='faceted'?6:form==='citadel'?8:48;
    ring(PIECE_MAX_WIDTH*.448,.045,segments);
    if(tier>=4)ring(PIECE_MAX_WIDTH*.414,.07,segments);
    if(tier>=7)for(let i=0;i<(form==='fluted'?12:8);i++){
        const a=i*Math.PI*2/(form==='fluted'?12:8);
        const pin=new CylinderGeometry(.012,.012,.026,6).toNonIndexed();
        pin.translate(Math.cos(a)*PIECE_MAX_WIDTH*.446,.061,Math.sin(a)*PIECE_MAX_WIDTH*.446);parts.push(pin);
    }
    const result=mergeGeometries(parts);parts.forEach(p=>p.dispose());
    if(!result)throw new Error('Unable to finish piece inlay');return result;
}
