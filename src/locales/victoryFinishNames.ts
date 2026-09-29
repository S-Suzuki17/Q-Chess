import type {Language} from './dict';
import {RESULT_STYLES, victoryStyle} from '../config/victoryStyles';
const names:Record<Language,readonly string[]> = {
 en:['Brass','Platinum','Copper','Obsidian','Red','Blue glass','Ivory','Gold'],
 ja:['ブラス','プラチナ','カッパー','オブシディアン','レッド','ブルーガラス','アイボリー','ゴールド'],
 zh:['黄铜','铂金','铜','黑曜石','红色','蓝色玻璃','象牙色','黄金'],
 ru:['Латунь','Платина','Медь','Обсидиан','Красный','Синее стекло','Слоновая кость','Золото'],
 fr:['Laiton','Platine','Cuivre','Obsidienne','Rouge','Verre bleu','Ivoire','Or'],
 de:['Messing','Platin','Kupfer','Obsidian','Rot','Blauglas','Elfenbein','Gold'],
 es:['Latón','Platino','Cobre','Obsidiana','Rojo','Vidrio azul','Marfil','Oro'],
 tr:['Pirinç','Platin','Bakır','Obsidyen','Kırmızı','Mavi cam','Fildişi','Altın'],
 pl:['Mosiądz','Platyna','Miedź','Obsydian','Czerwień','Niebieskie szkło','Kość słoniowa','Złoto'],
 hi:['पीतल','प्लैटिनम','ताँबा','ओब्सीडियन','लाल','नीला काँच','हाथीदाँत','सोना'],
 pt:['Latão','Platina','Cobre','Obsidiana','Vermelho','Vidro azul','Marfim','Ouro'],
 ta:['பித்தளை','பிளாட்டினம்','செம்பு','கருங்கண்ணாடி','சிவப்பு','நீலக் கண்ணாடி','தந்தம்','தங்கம்'],
};
export const victoryFinishName=(lang:Language,preset:{tier:number;familyIndex:number})=>names[lang][RESULT_STYLES.indexOf(victoryStyle(preset))];
