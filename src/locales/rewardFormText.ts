import type {Language} from './dict';
const keys=['crowned','spire','citadel','fluted','faceted','inlaid','stepped','floating','armored','gallery'] as const;
const text:Record<Language,readonly string[]>={
en:["Banded","Tapered","Square","Fluted","Faceted","Inlay","Layered","Floating","Panel","Studio"],
ja:["リング","テーパー","スクエア","フルート","ファセット","インレイ","レイヤー","フロート","パネル","スタジオ"],
zh:["环纹","锥形","方形","凹槽","切面","镶嵌","层叠","悬浮","面板","展台"],
ru:["Кольца","Конус","Квадрат","Каннелюры","Грани","Инкрустация","Слои","Подвес","Панель","Студия"],
fr:["Anneaux","Fuselé","Carré","Cannelé","Facettes","Marqueterie","Couches","Flottant","Panneau","Studio"],
de:["Ringe","Konisch","Quadratisch","Gerillt","Facetten","Intarsie","Schichten","Schwebend","Paneel","Studio"],
es:["Anillos","Cónico","Cuadrado","Estriado","Facetas","Taracea","Capas","Flotante","Panel","Estudio"],
tr:["Halkalı","Konik","Kare","Yivli","Fasetli","Kakma","Katmanlı","Yüzer","Panel","Stüdyo"],
pl:["Obręcze","Stożkowy","Kwadratowy","Żłobiony","Fasety","Intarsja","Warstwy","Unoszący","Panel","Studio"],
hi:["छल्लेदार","शंक्वाकार","चौकोर","खाँचेदार","फलकदार","जड़ाई","परतें","तैरता","पैनल","स्टूडियो"],
pt:["Anéis","Cônico","Quadrado","Canelado","Facetado","Marchetaria","Camadas","Flutuante","Painel","Estúdio"],
ta:["வளையம்","கூம்பு","சதுரம்","பள்ளம்","பலமுகம்","பதிப்பு","அடுக்குகள்","மிதப்பு","தகடு","ஸ்டூடியோ"],
};
export const rewardFormText=(lang:Language,key:string|undefined)=>key&&keys.includes(key as typeof keys[number])?text[lang][keys.indexOf(key as typeof keys[number])]:'';
