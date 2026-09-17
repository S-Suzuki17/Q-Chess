import type { Language } from './dict';
const keys=['stage','intro','rules','frame','versus','skip','ready','timeAverage','newReward','clearedReward'] as const;
const text:Record<Language,readonly string[]>={
 en:['Stage','100 stages. One victory, one reward.','10 min → 3 min → 10 sec per move. A stronger CPU every three stages.','Avatar frame','Versus','Skip','Get ready','Average time remaining per move','New reward','Already collected'],
 ja:['ステージ','100のステージ。1勝ごとに、新たな報酬。','10分 → 3分 → 1手10秒。3ステージごとにCPUが強くなります。','アイコン装飾','対戦','スキップ','対局準備','1手あたりの平均残り時間','新しい報酬','獲得済み'],
 zh:['关卡','100关，每次首胜一个奖励。','10分钟→3分钟→每步10秒。每三关CPU增强。','头像框','对战','跳过','准备对局','每步平均剩余时间','新奖励','已领取'],
 ru:['Этап','100 этапов. Награда за первую победу.','10 мин → 3 мин → 10 сек на ход. CPU сильнее каждые три этапа.','Рамка аватара','Против','Пропустить','Подготовка','Среднее оставшееся время на ход','Новая награда','Уже получено'],
 fr:['Étape','100 étapes. Une récompense par première victoire.','10 min → 3 min → 10 s par coup. CPU renforcé toutes les trois étapes.','Cadre d’avatar','Contre','Passer','Préparez-vous','Temps restant moyen par coup','Nouvelle récompense','Déjà obtenu'],
 de:['Stufe','100 Stufen. Eine Belohnung pro erstem Sieg.','10 Min → 3 Min → 10 Sek pro Zug. Alle drei Stufen stärkerer CPU.','Avatarrahmen','Gegen','Überspringen','Bereit machen','Durchschnittliche Restzeit pro Zug','Neue Belohnung','Bereits erhalten'],
 es:['Etapa','100 etapas. Un premio por primera victoria.','10 min → 3 min → 10 s por jugada. CPU más fuerte cada tres etapas.','Marco de avatar','Contra','Omitir','Prepárate','Tiempo restante medio por jugada','Nuevo premio','Ya obtenido'],
 tr:['Aşama','100 aşama. Her ilk galibiyete bir ödül.','10 dk → 3 dk → hamle başına 10 sn. Her üç aşamada daha güçlü CPU.','Avatar çerçevesi','Karşı','Atla','Hazırlan','Hamle başına ortalama kalan süre','Yeni ödül','Alındı'],
 pl:['Etap','100 etapów. Nagroda za pierwszą wygraną.','10 min → 3 min → 10 s na ruch. CPU silniejszy co trzy etapy.','Ramka awatara','Kontra','Pomiń','Przygotuj się','Średni pozostały czas na ruch','Nowa nagroda','Już zdobyto'],
 hi:['स्तर','100 स्तर। हर पहली जीत पर एक पुरस्कार।','10 मिनट → 3 मिनट → हर चाल 10 सेकंड। हर तीन स्तर पर अधिक मजबूत CPU।','अवतार फ़्रेम','बनाम','छोड़ें','तैयार हों','प्रति चाल औसत बचा समय','नया पुरस्कार','पहले से प्राप्त'],
 pt:['Etapa','100 etapas. Uma recompensa por primeira vitória.','10 min → 3 min → 10 s por lance. CPU mais forte a cada três etapas.','Moldura de avatar','Contra','Pular','Prepare-se','Tempo restante médio por lance','Nova recompensa','Já obtido'],
 ta:['நிலை','100 நிலைகள். ஒவ்வொரு முதல் வெற்றிக்கும் ஒரு பரிசு.','10 நிமிடம் → 3 நிமிடம் → நகர்வுக்கு 10 வினாடி. மூன்று நிலைகளுக்கு ஒருமுறை வலுவான CPU.','அவதார் சட்டகம்','எதிர்','தவிர்','தயாராகுங்கள்','நகர்வுக்கான சராசரி மீதிநேரம்','புதிய பரிசு','ஏற்கெனவே பெற்றது'],
};
export const stageText=(lang:Language,key:typeof keys[number])=>text[lang][keys.indexOf(key)];
