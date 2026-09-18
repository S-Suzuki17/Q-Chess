import type { Language } from './dict';
const text:Record<Language,readonly [string,string,string,string]>={
 en:['Star soundtrack rewards','Total stars','Stars remaining','Your best rating for each stage counts once. 10 stage tracks + 5 star tracks.'],
 ja:['星で獲得するBGM','累計の星','獲得まであと','各ステージの最高評価を1回ずつ集計。ステージ報酬10曲＋星の報酬5曲。'],
 zh:['星级音乐奖励','累计星数','还需星数','每关只计算最高评价。关卡奖励10首，星级奖励5首。'],
 ru:['Музыка за звёзды','Всего звёзд','Осталось звёзд','Учитывается лучший результат каждого этапа. 10 треков за этапы и 5 за звёзды.'],
 fr:['Musiques des étoiles','Total d’étoiles','Étoiles restantes','Seule la meilleure note de chaque étape compte. 10 morceaux d’étape et 5 d’étoiles.'],
 de:['Musik für Sterne','Sterne insgesamt','Fehlende Sterne','Nur die Bestwertung jeder Stufe zählt. 10 Stufen- und 5 Sternen-Musikstücke.'],
 es:['Música por estrellas','Estrellas totales','Estrellas restantes','Cuenta la mejor valoración de cada etapa. 10 temas por etapas y 5 por estrellas.'],
 tr:['Yıldız müzik ödülleri','Toplam yıldız','Kalan yıldız','Her aşamanın en iyi puanı bir kez sayılır. 10 aşama parçası + 5 yıldız parçası.'],
 pl:['Muzyka za gwiazdy','Suma gwiazd','Brakujące gwiazdy','Liczy się najlepsza ocena każdego etapu. 10 utworów za etapy i 5 za gwiazdy.'],
 hi:['सितारों से संगीत पुरस्कार','कुल सितारे','बाकी सितारे','हर स्तर का सर्वोत्तम स्कोर एक बार गिना जाता है। स्तरों से 10 और सितारों से 5 धुनें।'],
 pt:['Músicas por estrelas','Total de estrelas','Estrelas restantes','Conta a melhor avaliação de cada etapa. 10 faixas por etapas e 5 por estrelas.'],
 ta:['நட்சத்திர இசைப் பரிசுகள்','மொத்த நட்சத்திரங்கள்','மீதமுள்ள நட்சத்திரங்கள்','ஒவ்வொரு நிலையின் சிறந்த மதிப்பீடு மட்டுமே கணக்கிடப்படும். நிலைகளில் 10, நட்சத்திரங்களில் 5 பாடல்கள்.'],
};
export const musicMilestoneText=(lang:Language,key:'title'|'total'|'remaining'|'help')=>text[lang][(['title','total','remaining','help'] as const).indexOf(key)];
