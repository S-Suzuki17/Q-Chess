import {useId} from 'react';
import type {AVATAR_FRAMES} from '../config/avatarFrames';
import {FOUNDERS_FRAME_ID} from '../config/founders';

type FrameGrade=1|2|3;
type FramePaint={metal:string;edge:string;enamel:string;carve:string;grade:FrameGrade};
const SIDES=[false,true];
const mirror=(flipped:boolean)=>flipped?'translate(120 0) scale(-1 1)':undefined;

function Laurel({metal,edge,enamel,carve,grade}:FramePaint) {
    const leaves=3+grade*2;
    return <g data-frame-motif="laurel">
        {SIDES.map(flipped=><g key={String(flipped)} transform={mirror(flipped)}>
            <path d="M53 111C19 106 3 77 12 44C15 32 21 23 29 17" stroke={metal} strokeWidth="2.4"/>
            {Array.from({length:leaves},(_,i)=><g key={i} transform={`rotate(${-53+i*106/(leaves-1)} 60 60)`}>
                <path data-frame-leaf="true" d="M11 66Q1 59 4 48Q15 52 11 66Z M11 66Q21 60 19 48Q10 52 11 66Z" fill={carve} stroke={edge} strokeWidth=".7"/>
                <path d="M6 51 11 63 18 51" stroke="#496044" strokeWidth=".9"/>
                {grade>=2&&<path d="M11 64Q17 60 16 54" stroke={edge} strokeWidth=".65"/>}
            </g>)}
            {grade===3&&<path d="M31 15 34 7 39 12 39 15Z" fill={enamel} stroke={edge} strokeWidth=".8"/>}
        </g>)}
        <path d="M43 107Q51 106 60 112Q69 106 77 107L70 114 60 117 50 114Z" fill={metal} stroke={edge} strokeWidth=".8"/>
        {grade>=2&&<path d="M49 109 60 115 71 109M56 110 60 107 64 110" stroke={edge} strokeWidth=".8"/>}
    </g>;
}

function Facets({metal,edge,enamel,carve,grade}:FramePaint) {
    const jewels=grade===1?4:8;
    const corners=[[60,4],[99,20],[116,60],[99,100],[60,116],[21,100],[4,60],[21,20]];
    const insets=[[60,12],[94,26],[108,60],[94,94],[60,108],[26,94],[12,60],[26,26]];
    return <g data-frame-motif="facets">
        <path d="M60 4 99 20 116 60 99 100 60 116 21 100 4 60 21 20Z M60 12 26 26 12 60 26 94 60 108 94 94 108 60 94 26Z" fill={metal} fillRule="evenodd" stroke={edge} strokeWidth=".7"/>
        {corners.map((corner,i)=>{
            const next=(i+1)%corners.length;
            return <path key={i} data-frame-bevel="true" d={`M${corner.join(' ')} ${corners[next].join(' ')} ${insets[next].join(' ')} ${insets[i].join(' ')}Z`} fill={carve} opacity={i<4?'.95':'.75'}/>;
        })}
        <path d="M60 8 96 23 112 60 96 97 60 112 24 97 8 60 24 23Z" stroke="#203a32" strokeWidth="1.2"/>
        <path d="M60 12 94 26 108 60 94 94 60 108 26 94 12 60 26 26Z" stroke={edge} strokeWidth=".9"/>
        {Array.from({length:jewels},(_,i)=><g key={i} transform={`rotate(${i*360/jewels} 60 60)`}>
            <path data-frame-jewel="true" d="M60 3 66 8 60 15 54 8Z" fill={enamel} stroke={edge} strokeWidth="1"/>
            <path d="M60 5 60 12 56 8Z" fill="#9bcbb4" opacity=".65"/>
            {grade===3&&<>
                <path d="M47 7 51 9 47 12 44 10Z M73 7 76 10 73 12 69 9Z" fill={metal} stroke={edge} strokeWidth=".65"/>
                <path d="M53 16 60 19 67 16" stroke={metal} strokeWidth="1.8"/>
            </>}
        </g>)}
    </g>;
}

// Every feather has a broad lit face, a dark cut side and a raised ridge.
// This gives the small silhouette weight without relying on a bloom/filter.
const WING_FINS=[
    {outline:'M5 8 23 28 25 40 17 53 10 33Z',side:'M16 34 25 40 17 53Z',light:'M5 8 23 28 16 34Z',ridge:'M5 8 16 34 17 53'},
    {outline:'M5 30 20 46 19 58 13 70 5 49Z',side:'M13 53 19 58 13 70Z',light:'M5 30 20 46 13 53Z',ridge:'M5 30 13 53 13 70'},
    {outline:'M4 53 18 65 22 80 16 87 8 72Z',side:'M14 73 22 80 16 87Z',light:'M4 53 18 65 14 73Z',ridge:'M4 53 14 73 16 87'},
    {outline:'M8 76 25 87 31 96 23 103 14 90Z',side:'M21 92 31 96 23 103Z',light:'M8 76 25 87 21 92Z',ridge:'M8 76 21 92 23 103'},
    {outline:'M19 94 35 97 46 108 39 114 27 106Z',side:'M33 105 46 108 39 114Z',light:'M19 94 35 97 33 105Z',ridge:'M19 94 33 105 39 114'},
];
function Wings({metal,edge,enamel,carve,grade}:FramePaint) {
    return <g data-frame-motif="wings">
        {SIDES.map(flipped=><g key={String(flipped)} transform={mirror(flipped)}>
            {WING_FINS.slice(0,grade+2).map(fin=><g key={fin.outline}>
                <path data-frame-fin="true" d={fin.outline} fill={carve} stroke="#10221b" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d={fin.light} fill="#f4edd9" opacity=".45"/>
                <path data-frame-cut-plane="true" d={fin.side} fill="#163f36" stroke={edge} strokeWidth=".45"/>
                <path d={fin.outline} stroke={edge} strokeWidth=".8" strokeLinejoin="round"/>
                <path d={fin.ridge} stroke="#fff0cd" strokeWidth="1"/>
            </g>)}
            <path d="M16 43 22 39 18 59 23 80 18 88 12 72 10 56Z" fill={enamel} stroke={metal} strokeWidth="1.5"/>
            <path d="M17 45 14 59 19 80" stroke={edge} strokeWidth=".9"/>
            <path d="M14 53 17 59 14 65 11 59Z" fill={carve} stroke={edge} strokeWidth=".7"/>
            {grade>=2&&<path d="M23 23 31 11 35 14 30 26Z" fill={carve} stroke={edge} strokeWidth=".8"/>}
            {grade===3&&<>
                <path d="M34 15 43 7 46 10 40 17Z" fill={carve} stroke={edge} strokeWidth=".8"/>
                <path d="M26 99 33 103 30 107 24 102Z" fill={enamel} stroke={edge} strokeWidth=".8"/>
            </>}
        </g>)}
    </g>;
}

function Circuit({metal,edge,enamel,grade}:FramePaint) {
    const nodes=grade===1?[[10,35],[6,76],[36,111]]:[[10,35],[6,76],[20,100],[36,111],[28,11]];
    return <g data-frame-motif="circuit">
        {SIDES.map(flipped=><g key={String(flipped)} transform={mirror(flipped)}>
            <path d="M40 7H25L10 22V43M6 51V78L12 84V96L27 111H43" stroke="#071b16" strokeWidth="6.5"/>
            <path d="M40 7H25L10 22V43M6 51V78L12 84V96L27 111H43" stroke={metal} strokeWidth="4.5"/>
            <path d="M40 7H25L10 22V43M6 51V78L12 84V96L27 111H43" stroke={edge} strokeWidth=".7"/>
            <path d="M35 12H27L16 24V34M10 58V74M18 89V94L28 104H33" stroke="#4d9a7a" strokeWidth="1.2"/>
            {nodes.map(([x,y])=><g key={`${x}-${y}`} data-frame-node="true">
                <path d={`M${x-3} ${y-4}h6l1 1v6l-1 1h-6l-1-1v-6Z`} fill={enamel} stroke={edge} strokeWidth=".8"/>
                <circle cx={x} cy={y} r="1.25" fill="#ddedd8"/>
            </g>)}
            {grade>=2&&<path d="M37 4H44M19 19 15 23V29M5 87V93L15 105M36 115H45" stroke={metal} strokeWidth="1.7"/>}
            {grade===3&&<>
                <path d="M43 6 48 11 53 6M4 40V47M23 107 23 113H30" stroke={edge} strokeWidth="1.3"/>
                <path d="M16 27 22 21 25 24 19 30Z M12 89 18 95 15 98 9 92Z" fill={enamel} stroke={edge} strokeWidth=".8"/>
            </>}
        </g>)}
        {grade===3&&<path d="M60 3 65 8 60 13 55 8Z" fill={enamel} stroke={edge} strokeWidth="1"/>}
    </g>;
}

const CROWN_CRESTS={
    1:'M31 24 26 8 43 14 60 3 77 14 94 8 89 24 76 21 60 19 44 21Z',
    2:'M31 24 25 13 36 6 46 14 60 3 74 14 84 6 95 13 89 24 76 21 60 19 44 21Z',
    3:'M31 24 25 9 34 15 40 5 49 13 60 3 71 13 80 5 86 15 95 9 89 24 76 21 60 19 44 21Z',
};
function Crown({metal,edge,enamel,carve,grade}:FramePaint) {
    return <g data-frame-motif="crown">
        {SIDES.map(flipped=><g key={String(flipped)} transform={mirror(flipped)}>
            <path d="M25 24Q5 46 10 72L21 94 30 100 27 91 18 72Q13 50 29 27Z" fill={carve} stroke="#0a2119" strokeWidth="1.5"/>
            <path d="M25 24Q5 46 10 72L21 94 30 100" stroke={edge} strokeWidth="1"/>
            <path d="M21 32Q8 56 15 75L24 91" stroke="#f4edd9" strokeWidth="1.2"/>
            {grade>=2&&<g data-frame-mantle="true">
                <path d="M17 32 7 25 5 45 10 60 19 67 17 49Z M10 62 5 56 7 79 20 94 26 93 16 77Z" fill={carve} stroke={edge} strokeWidth=".8"/>
                <path data-frame-cut-plane="true" d="M7 25 9 44 19 67 10 60 5 45Z M5 56 11 77 26 93 20 94 7 79Z" fill="#163f36" stroke={edge} strokeWidth=".5"/>
                <path d="M12 39 15 44 13 51 10 45Z M11 71 15 76 14 83 10 77Z" fill={enamel} stroke={edge} strokeWidth=".65"/>
            </g>}
            {grade===3&&<g data-frame-regalia="true">
                <path d="M21 87 13 88 17 103 32 112 43 110 31 104Z M22 30 17 16 28 23 35 21 30 30Z" fill={carve} stroke={edge} strokeWidth=".8"/>
                <path d="M16 91 23 102 39 110M20 20 25 26 31 27" stroke="#f4edd9" strokeWidth="1"/>
                <path d="M23 101 29 103 31 108 25 106Z" fill={enamel} stroke={edge} strokeWidth=".7"/>
            </g>}
        </g>)}
        <path data-frame-crest="true" d={CROWN_CRESTS[grade]} fill={carve} stroke="#0a2119" strokeWidth="1.8" strokeLinejoin="round"/>
        <path d={CROWN_CRESTS[grade]} stroke={edge} strokeWidth=".8" strokeLinejoin="round"/>
        <path data-frame-cut-plane="true" d="M60 3 60 19 48 21 43 14Z M26 8 39 20 31 24Z M94 8 89 24 81 20Z" fill="#163f36" opacity=".8"/>
        <path d="M60 3 72 19 60 19Z M26 8 43 14 39 20Z M94 8 81 20 77 14Z" fill="#f4edd9" opacity=".55"/>
        {grade===3&&<path d="M40 5 43 17 34 15Z M80 5 86 15 77 17Z" fill="#fff0ce" opacity=".6"/>}
        <path d="M32 23Q60 13 88 23" stroke="#081f17" strokeWidth="4"/>
        <path d="M32 23Q60 13 88 23" stroke={metal} strokeWidth="2.6"/>
        <path d="M34 23Q60 14 86 23" stroke={edge} strokeWidth=".6"/>
        <path d="M60 7 66 13 60 20 54 13Z" fill={enamel} stroke={edge} strokeWidth="1"/>
        <path d="M60 9 60 17 56 13Z" fill="#bce0c1" opacity=".8"/>
        <path d="M35 104 42 113 60 117 78 113 85 104 72 108 60 111 48 108Z" fill={carve} stroke={edge} strokeWidth=".8"/>
        <path d="M42 107 48 112 60 115 72 112 78 107" stroke="#fff0ce" strokeWidth=".8"/>
        {grade>=2&&<path d="M42 109 47 112 48 108M72 108 73 112 78 109" stroke="#163f36" strokeWidth="1.6"/>}
    </g>;
}

const MOTIFS={laurel:Laurel,facets:Facets,wings:Wings,circuit:Circuit,crown:Crown};

/** Original cast-metal silhouettes. All ornament stays inside the avatar footprint. */
export function AvatarFrameArtwork({decoration,animate=false}:{decoration:typeof AVATAR_FRAMES[number];animate?:boolean}) {
    const id=useId();
    const grade=Math.min(3,Math.max(1,Math.ceil(decoration.tier/5))) as FrameGrade;
    const metal=`url(#${id}-metal)`,edge=`url(#${id}-edge)`,enamel=`url(#${id}-enamel)`;
    const carve=`url(#${id}-carve)`;
    const paint={metal,edge,enamel,carve,grade};
    const Motif=MOTIFS[decoration.motif];
    return <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false" className="account-avatar-frame" fill="none" data-frame-grade={grade} data-frame-design={`${decoration.motif}-${grade}`}>
        <defs>
            <linearGradient id={`${id}-metal`} gradientUnits="userSpaceOnUse" x1="18" y1="4" x2="102" y2="116">
                <stop stopColor="#f3ebd6"/><stop offset=".22" stopColor={decoration.color}/><stop offset=".4" stopColor={decoration.accent}/><stop offset=".53" stopColor="#405044"/><stop offset=".72" stopColor={decoration.color}/><stop offset="1" stopColor="#807050"/>
            </linearGradient>
            <linearGradient id={`${id}-edge`} gradientUnits="userSpaceOnUse" x1="35" y1="4" x2="85" y2="116">
                <stop stopColor="#fff4d8"/><stop offset=".46" stopColor={decoration.accent}/><stop offset="1" stopColor="#66573e"/>
            </linearGradient>
            <linearGradient id={`${id}-enamel`} gradientUnits="userSpaceOnUse" x1="20" y1="8" x2="96" y2="109">
                <stop stopColor="#9bcdb6"/><stop offset=".2" stopColor="#397e61"/><stop offset=".6" stopColor="#143f33"/><stop offset="1" stopColor="#081f1d"/>
            </linearGradient>
            <linearGradient id={`${id}-carve`} x1="0" y1="0" x2=".85" y2="1">
                <stop stopColor="#f4edd9"/><stop offset=".23" stopColor={decoration.color}/><stop offset=".44" stopColor={decoration.accent}/><stop offset=".5" stopColor="#f4edd9"/><stop offset=".56" stopColor="#385044"/><stop offset="1" stopColor={decoration.color}/>
            </linearGradient>
            <clipPath id={`${id}-envelope`}><rect x="2" y="2" width="116" height="116"/></clipPath>
        </defs>
        <g clipPath={`url(#${id}-envelope)`} data-frame-envelope="2 2 116 116">
            <circle cx="60" cy="60" r="50.5" stroke="#081b18" strokeWidth="8"/>
            <circle cx="60" cy="60" r="51.2" stroke={metal} strokeWidth="5.8"/>
            <circle cx="60" cy="60" r="49.1" stroke="#142f24" strokeWidth="1.1"/>
            <circle cx="60" cy="60" r="48.2" stroke={edge} strokeWidth=".8"/>
            <circle cx="60" cy="60" r="54.1" stroke={edge} strokeWidth=".7"/>
            {grade>=2&&<circle cx="60" cy="60" r="51.2" stroke="#244c3a" strokeWidth=".9" strokeDasharray="1.5 5.2"/>}
            {grade===3&&<path d="M37 14 41 12M79 12 83 14M37 106 41 108M79 108 83 106" stroke={edge} strokeWidth="2.1"/>}
            <Motif {...paint}/>
            {decoration.id===FOUNDERS_FRAME_ID?<g data-founders-seal="true">
                <path d="M33 105Q60 115 87 105L85 114Q60 119 35 114Z" fill="#101f1b" stroke={metal} strokeWidth="1.5"/>
                <path d="M54 112h12m-6-4v8" stroke={edge} strokeWidth="1.4"/>
                <circle cx="45" cy="112" r="1.7" fill={metal}/><circle cx="75" cy="112" r="1.7" fill={metal}/>
            </g>:decoration.motif!=='laurel'&&<path d="M60 107 66 112 60 117 54 112Z" fill={enamel} stroke={edge} strokeWidth=".8"/>}
            {/* A keyed, single CSS pass on display/frame change; no timer or render loop. */}
            <path key={decoration.id} className={`account-avatar-frame-glint${animate?' is-revealing':''}`} d="M17 35A50 50 0 0 1 43 13M77 13A50 50 0 0 1 103 35" stroke="#fff5d9" strokeWidth="1.8" strokeLinecap="round" pathLength="100"/>
        </g>
    </svg>;
}
