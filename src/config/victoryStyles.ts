export const RESULT_STYLES = [
    { id:'brass',name:'ブラス',decoration:'sparks',description:'真鍮の火花と金属片が外側へ弾ける。',
        color:'#d7ac65',highlight:'#fff0d2',mid:'#d2a56a',shade:'#85603a',edge:'#bc9560',depth:'#493018',boardLight:'#b89251',boardShade:'#5b4428',boardDark:'#171718',ambient:'#25211d' },
    { id:'platinum',name:'プラチナ',decoration:'curtain',description:'白金の細長い閃片が回転しながら飛び散る。',
        color:'#a6c6df',highlight:'#f5fcff',mid:'#adbcca',shade:'#3d566e',edge:'#e0eef7',depth:'#2c3c4f',boardLight:'#8399ac',boardShade:'#3c4b5d',boardDark:'#111922',ambient:'#1b2831' },
    { id:'copper',name:'カッパー',decoration:'engraving',description:'刻み目のある銅片が不揃いに弾け、散って消える。',
        color:'#db8f66',highlight:'#ffe2ce',mid:'#ca7c53',shade:'#813d29',edge:'#de9a79',depth:'#552719',boardLight:'#a96946',boardShade:'#482821',boardDark:'#231a17',ambient:'#30201d' },
    { id:'obsidian',name:'オブシディアン',decoration:'fracture',description:'金の縁を持つ黒い破片と、深い陰影。',
        color:'#c9a575',highlight:'#c3cbd0',mid:'#303a43',shade:'#111923',edge:'#dbc297',depth:'#060c12',boardLight:'#4a4d50',boardShade:'#171b20',boardDark:'#080d12',ambient:'#1c2429' },
    { id:'scarlet',name:'レッド',decoration:'ribbon',description:'赤い帯の断片が大きく噴き出し、翻って消える。',
        color:'#da745e',highlight:'#ffc8a5',mid:'#c23132',shade:'#541723',edge:'#eb9e77',depth:'#3a101c',boardLight:'#993637',boardShade:'#3f1521',boardDark:'#170d15',ambient:'#2d171e' },
    { id:'crystal',name:'ブルーガラス',decoration:'glass',description:'透き通ったガラス片と斜めの光の層。',
        color:'#88cde2',highlight:'#edfbff',mid:'#8dc6dd',shade:'#315f80',edge:'#c3f2ff',depth:'#173952',boardLight:'#648eaa',boardShade:'#2b475e',boardDark:'#0c1925',ambient:'#152b39' },
    { id:'ivory',name:'アイボリー',decoration:'ivory',description:'象牙色の曲がった薄片が舞い上がり、散って消える。',
        color:'#d2c29f',highlight:'#fff7e5',mid:'#e3dbc9',shade:'#c3b291',edge:'#f4e8cd',depth:'#84725b',boardLight:'#c2ac84',boardShade:'#6d5942',boardDark:'#201c18',ambient:'#292722' },
    { id:'gilded',name:'ゴールド',decoration:'foil',description:'金箔が大きく噴き出し、光を返しながら舞い散る。',
        color:'#efc967',highlight:'#fff7cf',mid:'#e5b83f',shade:'#92641d',edge:'#ffdf8c',depth:'#684316',boardLight:'#d0aa4b',boardShade:'#75602b',boardDark:'#1b201a',ambient:'#302a17' },
] as const;
export type ResultStyle = typeof RESULT_STYLES[number];


export type VictoryStyleId = ResultStyle['id'];
// Preserve issued reward IDs. Cycle material families by grade, not unlock position.
export function victoryStyle(preset: { tier: number; familyIndex: number }): ResultStyle {
    return RESULT_STYLES[((preset.tier - 1) * 3 + preset.familyIndex) % RESULT_STYLES.length];
}
