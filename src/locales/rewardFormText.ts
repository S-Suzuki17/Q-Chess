import type {Language} from './dict';
const keys=['crowned','spire','citadel','fluted','faceted','inlaid','stepped','floating','armored','gallery'] as const;
const text:Record<Language,readonly string[]>={
 en:['Crown bands','Spire','Citadel','Fluted','Faceted','Inlay','Terraces','Suspended','Armored','Gallery'],
 ja:['王冠の帯','尖塔','城塞','溝彫り','多面体','象嵌','段積み','浮遊層','装甲','ギャラリー'],
 zh:['冠饰','尖塔','城堡','凹槽','多面体','镶嵌','阶台','悬浮层','装甲','展台'],
 ru:['Коронные пояса','Шпиль','Цитадель','Каннелюры','Грани','Инкрустация','Террасы','Подвес','Броня','Галерея'],
 fr:['Anneaux couronnés','Flèche','Citadelle','Cannelures','Facettes','Incrustation','Terrasses','Suspension','Armure','Galerie'],
 de:['Kronenringe','Spitze','Zitadelle','Rillen','Facetten','Intarsie','Terrassen','Schwebend','Panzerung','Galerie'],
 es:['Anillos de corona','Aguja','Ciudadela','Estrías','Facetas','Taracea','Terrazas','Suspendido','Blindado','Galería'],
 tr:['Taç halkaları','Kule','Hisar','Yivli','Fasetli','Kakma','Teras','Askılı','Zırhlı','Galeri'],
 pl:['Koronne obręcze','Iglica','Cytadela','Żłobienia','Fasety','Intarsja','Tarasy','Zawieszenie','Pancerz','Galeria'],
 hi:['मुकुट पट्टियाँ','शिखर','दुर्ग','नक्काशीदार धारियाँ','बहुफलक','जड़ाई','सीढ़ीदार','निलंबित','बख़्तरबंद','दीर्घा'],
 pt:['Anéis de coroa','Pináculo','Cidadela','Caneluras','Facetas','Marchetaria','Terraços','Suspenso','Blindado','Galeria'],
 ta:['கிரீட வளையங்கள்','கூர்கோபுரம்','கோட்டை','பள்ளங்கள்','பலமுகம்','பதிப்பு','படிநிலை','மிதக்கும் அடுக்கு','கவசம்','காட்சியகம்'],
};
export const rewardFormText=(lang:Language,key:string|undefined)=>key&&keys.includes(key as typeof keys[number])?text[lang][keys.indexOf(key as typeof keys[number])]:'';
