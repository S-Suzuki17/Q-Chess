import type { BoardMotif } from '../config/championshipRewards';
import type { Language } from './dict';

const material:Record<Language,readonly [string,string,string,string,string,string]>={
    en:['Walnut · maple inlay','Honed stone · carved border','Brushed steel · copper fittings','Jade glass · mineral facets','Black lacquer · silver inlay','Ivory enamel · satin gold'],
    ja:['ウォールナット・メープル象嵌','磨き石・彫刻の縁取り','ヘアライン鋼・銅の金具','翡翠ガラス・結晶の面取り','黒漆・銀の象嵌','アイボリーエナメル・艶消し金'],
    zh:['胡桃木·枫木镶嵌','磨砂石材·雕刻边框','拉丝钢·铜饰件','翡翠玻璃·晶体切面','黑漆·银镶嵌','象牙色珐琅·哑光金'],
    ru:['Орех · инкрустация клёном','Шлифованный камень · резной край','Матовая сталь · медная фурнитура','Нефритовое стекло · грани','Чёрный лак · серебряная инкрустация','Эмаль слоновой кости · матовое золото'],
    fr:['Noyer · marqueterie d’érable','Pierre adoucie · bord sculpté','Acier brossé · garnitures en cuivre','Verre de jade · facettes minérales','Laque noire · incrustations d’argent','Émail ivoire · or satiné'],
    de:['Nussbaum · Ahornintarsien','Geschliffener Stein · Reliefkante','Gebürsteter Stahl · Kupferbeschläge','Jadeglas · Mineralfacetten','Schwarzlack · Silberintarsien','Elfenbeinemaille · Mattgold'],
    es:['Nogal · taracea de arce','Piedra pulida · borde tallado','Acero cepillado · herrajes de cobre','Vidrio de jade · facetas minerales','Laca negra · incrustaciones de plata','Esmalte marfil · oro satinado'],
    tr:['Ceviz · akçaağaç kakma','Mat taş · oyma kenar','Fırçalanmış çelik · bakır donanım','Yeşim cam · mineral yüzeyler','Siyah lake · gümüş kakma','Fildişi emaye · saten altın'],
    pl:['Orzech · klonowa intarsja','Szlifowany kamień · rzeźbiona krawędź','Szczotkowana stal · miedziane okucia','Jadeitowe szkło · mineralne fasety','Czarna laka · srebrna intarsja','Emalia w kolorze kości słoniowej · matowe złoto'],
    hi:['अखरोट की लकड़ी · मेपल जड़ाई','घिसा पत्थर · नक्काशीदार किनारा','ब्रश किया इस्पात · ताँबे की फिटिंग','जेड काँच · खनिज के फलक','काला लाख · चाँदी की जड़ाई','हाथीदाँत रंग का एनामेल · मद्धिम सोना'],
    pt:['Nogueira · marchetaria de bordo','Pedra acetinada · borda esculpida','Aço escovado · ferragens de cobre','Vidro de jade · facetas minerais','Laca preta · incrustações de prata','Esmalte marfim · ouro acetinado'],
    ta:['வால்நட் மரம் · மேப்பிள் பதிப்பு','மெருகூட்டிய கல் · செதுக்கிய விளிம்பு','துலக்கிய எஃகு · செம்புப் பொருத்தங்கள்','ஜேட் கண்ணாடி · கனிம முகங்கள்','கருப்பு அரக்கு · வெள்ளிப் பதிப்பு','தந்த நிற எனாமல் · மென்மையான தங்கம்'],
};
const motifs:BoardMotif[]=['walnut','marble','brass','crystal','obsidian','gold'];
export const rewardCraftText=(lang:Language,motif:BoardMotif)=>material[lang][motifs.indexOf(motif)];
