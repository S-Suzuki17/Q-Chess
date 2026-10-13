import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {PlayCommerceError,playToken} from './PlayCommerceValues';

export interface PlayTokenVault{seal(token:string,hash:string):string;open(value:string,hash:string):string}
/** Dedicated configured key, no generated persistent secret and no reuse of an auth signing key. */
export function playTokenVault(encodedKey:string|undefined):PlayTokenVault|null{
    if(!encodedKey||!/^[a-f0-9]{64}$/i.test(encodedKey))return null;
    const key=Buffer.from(encodedKey,'hex');
    const aad=(hash:string)=>{if(!/^[a-f0-9]{64}$/.test(hash))throw new PlayCommerceError('UNAVAILABLE');return Buffer.from('qg-play-token:v1:'+hash);};
    return{
        seal(raw,hash){const token=playToken(raw),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(aad(hash));
            const ciphertext=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);
            return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),ciphertext.toString('base64url')].join('.');},
        open(value,hash){try{
            if(typeof value!=='string'||value.length>12000)throw new Error();
            const [version,iv,tag,ciphertext,...extra]=value.split('.');
            if(version!=='v1'||extra.length||![iv,tag,ciphertext].every(part=>part&&/^[A-Za-z0-9_-]+$/.test(part)))throw new Error();
            const nonce=Buffer.from(iv,'base64url'),authTag=Buffer.from(tag,'base64url');if(nonce.length!==12||authTag.length!==16)throw new Error();
            const decipher=createDecipheriv('aes-256-gcm',key,nonce);decipher.setAAD(aad(hash));decipher.setAuthTag(authTag);
            return playToken(Buffer.concat([decipher.update(Buffer.from(ciphertext,'base64url')),decipher.final()]).toString('utf8'));
        }catch{throw new PlayCommerceError('UNAVAILABLE');}},
    };
}
