import { avatarFrame } from '../config/avatarFrames';
import { badgeFromRating } from '../config/profileBadges';
import { badgeName } from '../locales/profileCosmeticsText';
import { RankBadgeArtwork } from './RankBadgeArtwork';
import { AvatarFrameArtwork } from './AvatarFrameArtwork';
import './account-avatar.css';

export function AccountAvatar({name,url,frame,size=64,rating,lang='en'}:{name:string;url?:string;frame?:string;size?:number;rating?:number|null;lang?:string}) {
    const decoration=avatarFrame(frame);
    const badge=badgeFromRating(rating);
    return <span className="account-avatar" style={{width:size,height:size}} data-avatar-frame={decoration?.id??'standard'}>
        {decoration&&<span className="account-avatar-aura" aria-hidden="true" style={{background:`radial-gradient(circle, transparent 53%, ${decoration.color}55 64%, transparent 74%)`}}/>}
        <span className="account-avatar-portrait">{url?<img key={url} src={url} alt="" referrerPolicy="no-referrer" onError={event=>{event.currentTarget.style.display='none';}}/>:null}<span aria-hidden="true">{name.trim().slice(0,1)||'?'}</span></span>
        {decoration&&<AvatarFrameArtwork decoration={decoration}/>}
        {badge&&<span className="account-avatar-rank" role="img" aria-label={badgeName(lang,badge.id)} title={badgeName(lang,badge.id)} data-rank-badge={badge.id} style={{width:Math.max(18,size*.4),height:Math.max(18,size*.4)}}><RankBadgeArtwork badge={badge}/></span>}
    </span>;
}
