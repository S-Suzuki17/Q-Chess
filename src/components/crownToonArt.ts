import type {CrownEnemyFoe} from '../../server/src/presentation/crownEnemies';

export const TOON_PARTS=['cape','left-foot','right-foot','body','left-hand','right-hand','head','gear'] as const;
export type ToonShape={tag:'path'|'circle'|'ellipse'|'rect';props:Record<string,string|number>};
const path=(d:string,fill:string,extra:Record<string,string|number>={}):ToonShape=>({tag:'path',props:{d,fill,...extra}});
const ellipse=(cx:number,cy:number,rx:number,ry:number,fill:string,extra:Record<string,string|number>={}):ToonShape=>({tag:'ellipse',props:{cx,cy,rx,ry,fill,...extra}});
const circle=(cx:number,cy:number,r:number,fill:string):ToonShape=>({tag:'circle',props:{cx,cy,r,fill}});
const palettes:Record<CrownEnemyFoe,readonly [string,string,string,string]>={
 pawn:['#aea66d','#7d774e','#d8c78d','#518c91'],
 knight:['#789aa1','#4c6d7a','#afc0bc','#c99064'],
 bishop:['#a18ca9','#695774','#c7b4c2','#cba775'],
 rook:['#939985','#606955','#bbb99c','#709c9d'],
 queen:['#b698a7','#795d76','#d4b5bc','#80a8a4'],
 king:['#ddc571','#b8994b','#efdc9e','#8e9d8b'],
};
const emblems:Record<CrownEnemyFoe,string>={
 pawn:'M121 68Q128 64 135 68V72H132Q131 82 138 88H141V92H115V88H118Q125 82 124 72H121Z',
 knight:'M115 92V75L122 63L132 66L142 77L134 80L130 76L127 80V92Z',
 bishop:'M128 63Q110 80 128 87Q146 80 128 63ZM115 89H141V94H115Z',
 rook:'M114 65H121V70H125V65H132V70H136V65H142V77H138V88H142V93H114V88H118V77H114Z',
 queen:'M113 76L120 86L128 72L136 86L143 76L140 91H116Z',
 king:'M125 62H131V68H137V74H131V84H138V90H118V84H125V74H119V68H125Z',
};

/** Same brown contour, mouthless crescent eyes and two flat shades as unchanged QUBE. */
export function crownToonLayers(foe:CrownEnemyFoe):readonly ToonShape[][] {
 const [base,shade,light,accent]=palettes[foe],ink='#403926',limb='#51443a';
 const cape=foe==='bishop'||foe==='queen'||foe==='king'?[path('M95 177Q80 189 77 247Q104 255 128 245Q155 257 181 247Q176 190 160 177Z',foe==='king'?'#617a74':foe==='queen'?'#9b6b7b':'#88758e'),path('M95 191L89 240L105 240Z',shade,{stroke:'none'})]:[];
 const leftFoot=[path('M106 238C99 233 88 235 83 243C80 253 72 255 72 264Q72 272 94 273Q111 271 116 260L118 245Z',base),path('M81 261Q92 260 110 258L106 268Q92 273 78 267Z',shade,{stroke:'none'})];
 const rightFoot=[path('M148 238C156 233 167 236 172 244C176 254 185 257 185 265Q185 273 162 274Q146 271 141 258L137 245Z',base),path('M150 259L178 262Q180 270 164 271L151 267Z',shade,{stroke:'none'})];
 const body=[path('M100 170Q128 183 156 170L166 214Q171 237 158 247Q128 258 99 247Q86 238 91 216Z',base),path('M100 176Q128 188 156 176L158 185Q128 197 98 185Z',shade,{stroke:'none'}),ellipse(109,202,7,8,accent),path('M95 229Q128 239 164 228L161 240Q128 249 97 240Z',shade,{stroke:'none'}),path('M113 187Q127 192 146 187',light,{fill:'none',stroke:light,strokeWidth:2})];
 const leftHand=[path('M91 181Q80 179 76 188L69 212Q65 223 75 228Q85 230 91 219L101 193Z',limb),path('M71 218Q63 222 64 231Q65 241 77 241Q88 239 86 230Q83 221 77 220Z',limb),path('M69 224L77 227',light,{fill:'none',stroke:'#726452',strokeWidth:2})];
 const rightHand=[path('M162 181Q174 179 179 188L187 210Q193 220 181 225Q169 224 163 213L153 192Z',limb),path('M177 214Q192 210 197 221Q202 235 190 239Q178 240 173 230Z',limb),path('M180 217L189 224',light,{fill:'none',stroke:'#726452',strokeWidth:2})];
 const head=[path('M122 31C152 29 178 44 188 71C203 101 197 129 180 151C166 172 145 184 121 182C98 183 74 168 63 147C51 126 50 104 58 81C64 55 93 35 122 31Z',base),path('M179 60Q198 92 190 122Q183 148 160 166Q137 183 111 178Q169 165 176 126Q184 94 174 64Z',shade,{stroke:'none'}),path('M72 64Q62 88 66 106',light,{fill:'none',stroke:light,strokeWidth:3}),path('M68 60Q70 87 88 103Q109 118 128 108Q150 98 160 75L176 53',base,{fill:'none',stroke:ink,strokeWidth:2.8})];
 if(foe==='pawn')head.push(ellipse(126,27,13,11,light),path('M116 35Q127 40 139 35L137 43H118Z',shade));
 if(foe==='knight')head.push(path('M64 66L63 29Q76 32 83 48Q111 34 139 40Q160 31 178 25L180 66Q161 50 141 53Q101 45 64 66Z',shade),path('M68 35L76 50M168 34L161 48',base,{fill:'none',stroke:light,strokeWidth:3}));
 if(foe==='bishop')head.push(path('M90 51Q98 29 128 9Q155 26 166 52Q127 41 90 51Z',shade),path('M128 12L119 36',light,{fill:'none',stroke:light,strokeWidth:3}));
 if(foe==='rook')head.push(path('M72 51V28Q80 24 91 27V35H110V24H144V35H165V27Q176 25 183 30V53Q128 43 72 51Z',shade),path('M79 47Q126 39 175 47',light,{fill:'none',stroke:light,strokeWidth:3}));
 if(foe==='queen')head.push(path('M82 53L76 21L101 41L126 12L152 40L179 21L170 53Q127 42 82 53Z','#d5bc70'),...[76,126,179].map((x,i)=>circle(x,i===1?12:21,5,light)),ellipse(128,46,6,7,accent));
 if(foe==='king')head.push(path('M85 53L80 24L101 37L124 25L151 37L176 24L171 55Q126 44 85 53Z','#c6a455'),path('M123 8H132V16H140V24H132V32H123V24H115V16H123Z',light),ellipse(128,47,6,6,accent));
 head.push(path(emblems[foe],ink,{stroke:'none'}));
 if(foe==='pawn')head.push(circle(128,62,6,ink));
 if(foe==='bishop')head.push(path('M128 65L122 78',base,{fill:'none',stroke:base,strokeWidth:2}));
 if(foe==='queen')head.push(...[113,128,143].map(x=>circle(x,x===128?72:76,3,ink)));
 head.push(path('M79 126C80 116 88 110 97 112C109 113 117 125 112 135Q109 147 96 148Q82 148 79 136Z',base),path('M132 124C134 113 143 108 151 110C163 112 171 122 167 135Q165 145 151 146Q136 145 132 134Z',base),path('M81 128Q96 130 112 125Q110 140 97 144Q85 144 81 136Z','#d3f0f2',{stroke:'none'}),path('M135 127Q149 129 167 124Q166 140 152 142Q139 142 135 134Z','#d3f0f2',{stroke:'none'}),path('M90 129Q96 143 103 129L103 127Z',ink,{stroke:'none'}),path('M144 129Q151 141 158 128L158 127Z',ink,{stroke:'none'}),path('M80 127Q96 132 114 125M133 125Q151 131 169 123','none',{stroke:ink,strokeWidth:3}));
  // Guarded opposing silhouettes share the QUBE contour and flat shading.
 const armour=foe==='rook'?[path('M94 184L106 191L100 220L90 222L85 196Z',shade),path('M157 184L173 194L168 221L156 218Z',shade),path('M103 195L127 200L153 195L156 227L128 242L100 226Z',shade),path('M113 205H144M128 204V229',light,{fill:'none',stroke:light,strokeWidth:2})]:foe==='knight'?[path('M100 188L128 197L154 186L158 208L148 229L125 239L102 223Z',shade),path('M75 184L84 168L102 184L94 202L77 201Z',shade),path('M159 182L174 168L183 187L180 200L166 199Z',shade)]:foe==='pawn'?[path('M90 186L78 174L67 190L75 202L89 198Z',shade),path('M99 193L128 201L155 193L157 221L129 235L100 221Z',shade)]:[path('M103 189L128 201L151 189L155 211L129 232L101 214Z',shade),path('M115 202L128 216L142 202',light,{fill:'none',stroke:light,strokeWidth:2})];
 body.push(...armour);
 // Inward lids confront the viewer; the face remains mouthless.
 head.push(path('M77 116L113 124M134 124L171 113','none',{stroke:ink,strokeWidth:5}),path('M82 115L110 122M137 121L166 112','none',{stroke:shade,strokeWidth:3}));
 const gear:ToonShape[]=[];
  // Six authored silhouettes and layered equipment; not palette swaps of one body.
 if(foe==='pawn'){
  head[0]=path('M113 30Q152 22 179 48L195 79L188 118Q181 152 155 173L120 182Q86 174 67 148L58 112L64 71Q77 41 113 30Z',base);
  head.push(path('M63 66L76 50L84 87L68 107Z',shade),path('M182 61L194 83L187 115L176 102Z',shade),path('M80 145L98 152L122 161L150 150L169 142L163 164L128 175L95 166Z',shade),path('M98 158L108 162M142 159L153 155','none',{stroke:light,strokeWidth:2}));
  body.push(path('M99 217L128 228L156 217L159 239L128 252L97 237Z',shade),path('M109 235L119 240M137 240L148 234','none',{stroke:light,strokeWidth:2}));
 }
 if(foe==='knight'){
  head[0]=path('M105 33L142 25L179 46L197 79L189 115L170 151L147 174L118 182L88 164L65 130L59 94L69 61Z',base);
  head.push(path('M64 81L80 69L89 103L78 127L85 145L65 130L58 103Z',shade),path('M184 69L197 92L188 123L171 146L167 124L181 103Z',shade),path('M89 145L127 158L165 141L158 165L128 177L101 169Z',shade),path('M102 150L121 160M145 160L157 151','none',{stroke:light,strokeWidth:2}));
  body[0]=path('M104 170L148 169L159 192L168 225L151 247L123 253L95 236L94 202Z',base);
  body.push(path('M102 198L125 212L153 190L157 209L134 235L112 226Z',shade),path('M108 201L124 211M137 224L151 207','none',{stroke:light,strokeWidth:2}),path('M95 232L115 235L128 249L108 252L96 244Z',light));
 }
 if(foe==='bishop'){
  head[0]=path('M122 32L150 35L174 54L189 90L183 132L162 165L133 183L103 172L78 148L65 116L67 84L85 53Z',base);
  head.push(path('M72 66L98 44L91 78L82 111L75 140L65 115L65 85Z',shade),path('M169 53L189 88L183 132L163 161L164 135L174 102L163 70Z',shade),path('M84 149L129 169L170 144L155 170L129 183L104 175Z',shade));
  cape.push(path('M83 190L69 249L96 260L130 252L163 262L187 246L172 187L159 208L171 243L148 247L131 225L111 247L86 242L100 205Z','#665075'),path('M77 235L94 244M160 249L179 239','none',{stroke:'#b99d7c',strokeWidth:3}));
  body.push(path('M104 190L130 207L150 189L157 239L129 252L99 235Z',shade),path('M129 207V242M106 235L129 245L151 238','none',{stroke:light,strokeWidth:2}));
 }
 if(foe==='rook'){
  head[0]=path('M72 38Q63 39 60 52L57 135Q62 164 87 174L163 178Q190 167 194 141L198 60Q195 42 181 39Z',base);
  head[1]=path('M177 44L197 62L192 143Q188 165 164 174L152 175Q180 153 180 131Z',shade,{stroke:'none'});
  head.push(path('M59 61L74 62L71 133L81 161L62 147L54 122Z',shade),path('M184 57L202 63L202 132L190 151L177 165L182 138Z',shade),path('M75 148L100 157L127 162L157 153L181 146L174 165L130 179L88 173Z',shade));
  body[0]=path('M88 169L163 168L180 198L177 231L157 252L103 253L81 232L78 200Z',base);
  body.push(path('M84 183L96 196L92 222L78 215L72 195Z',shade),path('M163 182L184 194L183 218L170 225L158 206Z',shade),path('M92 231L129 239L166 230L160 249L129 256L100 250Z',shade));
 }
 if(foe==='queen'){
  head[0]=path('M119 31L144 35L168 54L185 83L184 115L165 152L143 175L119 182L94 168L75 143L65 113L71 78L90 47Z',base);
  head.push(path('M75 64L89 48L94 69L80 102L73 130L65 113L66 86Z',shade),path('M171 64L185 89L181 119L161 158L158 136L174 108Z',shade),path('M88 150L127 164L164 146L151 171L124 181L103 170Z',shade));
  cape.push(path('M90 178L69 199L61 242L82 263L106 249L130 261L157 248L181 263L194 242L183 199L162 176L160 205L169 241L151 239L128 251L105 240L82 240L94 205Z','#65435d'),path('M73 240L84 252M174 249L185 239','none',{stroke:'#c2a87b',strokeWidth:3}));
  body.push(path('M104 190L128 210L151 190L155 218L130 241L101 217Z',shade),path('M128 212L138 223L128 234L118 223Z','#b9a77a'),ellipse(128,223,3,5,accent));
 }
 if(foe==='king'){
  head[0]=path('M93 36L159 33Q183 44 194 69L199 111L184 145L161 173L129 185L94 174L70 149L57 112L61 73Q73 48 93 36Z',base);
  head.push(path('M60 77L76 66L80 103L68 134L58 116Z',shade),path('M184 66L198 86L195 119L180 145L172 119L181 100Z',shade),path('M78 146L103 157L128 170L160 154L181 142L173 166L130 185L93 175Z',shade),path('M104 167L126 178L151 166','none',{stroke:light,strokeWidth:2}));
  cape.push(path('M87 172L70 196L59 244L85 270L112 254L128 264L154 253L176 270L199 247L186 192L164 172L163 197L177 242L159 245L132 252L110 245L83 243L98 199Z','#743e49'),path('M67 238L86 260M173 259L191 240','none',{stroke:'#c6a463',strokeWidth:4}));
  body[0]=path('M91 170L166 169L177 203L173 234L155 254L104 254L80 236L82 199Z',base);
  body.push(path('M84 179L105 184L99 207L81 211L73 194Z',shade),path('M157 181L178 179L188 195L177 213L158 208Z',shade),path('M106 195L129 210L152 195L157 227L132 247L103 226Z',shade),path('M116 215H143M130 207V236','none',{stroke:light,strokeWidth:3}));
 }
 for(const part of [body,head]){part.push(path(foe==='rook'||foe==='king'?'M110 222L116 216M149 142L157 137':'M86 98L92 92M149 223L154 218','none',{stroke:shade,strokeWidth:1.5}));}
  // Individual faces replace the shared prototype eyes; QUBE artwork is untouched.
 const sharedEyes=new Set(['M79 126C80 116 88 110 97 112C109 113 117 125 112 135Q109 147 96 148Q82 148 79 136Z','M132 124C134 113 143 108 151 110C163 112 171 122 167 135Q165 145 151 146Q136 145 132 134Z','M81 128Q96 130 112 125Q110 140 97 144Q85 144 81 136Z','M135 127Q149 129 167 124Q166 140 152 142Q139 142 135 134Z','M90 129Q96 143 103 129L103 127Z','M144 129Q151 141 158 128L158 127Z','M80 127Q96 132 114 125M133 125Q151 131 169 123','M77 116L113 124M134 124L171 113','M82 115L110 122M137 121L166 112']);
 const face=head.filter(shape=>typeof shape.props.d!=='string'||!sharedEyes.has(shape.props.d));
 if(foe==='pawn'){
  face.push(ellipse(99,121,18,21,'#e8dbb0'),ellipse(102,122,7,12,ink),path('M139 114L173 118L162 129L142 127Z',ink),path('M83 92L112 98M143 96L168 100','none',{stroke:ink,strokeWidth:4}),path('M99 146Q130 162 164 143Q154 172 123 169Q108 164 99 146Z',ink),path('M108 153L113 162L120 155L128 165L137 155L145 161L151 151','#e7d8a8'),path('M85 101L81 111M87 144L82 155','none',{stroke:shade,strokeWidth:2}));
 }
 if(foe==='knight'){
  face.push(path('M81 105L113 116L105 134L89 123Z','#dae0c5'),path('M138 117L171 102L161 124L143 134Z','#dae0c5'),path('M97 115L102 130M152 114L147 128','none',{stroke:ink,strokeWidth:4}),path('M123 122L138 130L149 150L131 161L105 149L112 135Z',light),path('M116 141L122 145M135 144L141 140','none',{stroke:ink,strokeWidth:3}),path('M110 154Q134 167 154 151','none',{stroke:ink,strokeWidth:3}),path('M72 94L102 101M151 99L178 88','none',{stroke:shade,strokeWidth:4}));
 }
 if(foe==='bishop'){
  face.push(path('M81 125Q128 83 174 122Q129 161 81 125Z','#d8cdb3'),ellipse(128,123,14,24,'#5d837f'),path('M126 102H131V146H126Z',ink),path('M83 123Q128 101 172 120','none',{stroke:ink,strokeWidth:4}),path('M114 161L128 167L142 158','none',{stroke:light,strokeWidth:3}),path('M119 95L127 81L137 94','none',{stroke:shade,strokeWidth:3}));
 }
 if(foe==='rook'){
  face.push(path('M73 112H105V132H76Z',ink),path('M147 111H180V131H150Z',ink),path('M80 118H99V125H80ZM153 117H172V124H153Z','#c9d5bd'),path('M116 112H139L145 146L129 151L110 143Z',light),path('M89 158H166V167H91Z',ink),path('M102 160V166M123 160V166M145 160V166','none',{stroke:light,strokeWidth:2}),path('M76 95H106M146 94H180','none',{stroke:shade,strokeWidth:6}));
 }
 if(foe==='queen'){
  face.push(path('M78 120Q92 107 116 120L102 136L84 131Z','#e1d9cb'),path('M132 119Q157 103 176 117L162 133L143 133Z','#e1d9cb'),ellipse(103,124,4,9,'#704458'),ellipse(153,123,4,9,'#704458'),ellipse(130,99,9,12,light),ellipse(130,98,3,7,ink),path('M110 151Q131 162 153 147Q143 167 131 168Q118 165 110 151Z',ink),path('M114 153L129 157L148 151','none',{stroke:'#e2c6bb',strokeWidth:3}),path('M81 105L99 99L116 108M139 107L157 96L178 103','none',{stroke:shade,strokeWidth:3}));
 }
 if(foe==='king'){
  face.push(path('M75 112L111 123L106 136L82 131Z',ink),path('M144 123L181 111L176 131L149 136Z',ink),path('M83 119L104 126M152 126L173 118','none',{stroke:'#c99678',strokeWidth:3}),path('M124 119L140 130L151 152L130 176L109 151Z',light),path('M132 133L145 152L130 169Z',shade,{stroke:'none'}),path('M76 99L108 109M148 109L181 98','none',{stroke:ink,strokeWidth:6}),path('M94 148L89 164M166 148L172 163','none',{stroke:light,strokeWidth:3}));
 }
 return [cape,leftFoot,rightFoot,body,leftHand,rightHand,face,gear];
}
