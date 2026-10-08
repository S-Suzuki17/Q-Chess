import type {Language} from './dict';

export const qubeTeaching: Record<Language, {caption: string; welcome: string}> = {
    ja: {caption: '一緒に確認しよう', welcome: 'QUBEだよ。駒の候補を読みながら、ひとつずつ一緒に考えてみよう。'},
    en: {caption: 'Let’s work through this', welcome: 'I’m QUBE. Let’s read the piece candidates and work through the ideas together.'},
    zh: {caption: '一起看看吧', welcome: '我是QUBE。我们一起阅读棋子的候选身份，一步步理解规则。'},
    ru: {caption: 'Давайте разберёмся вместе', welcome: 'Я QUBE. Давайте вместе читать возможные типы фигур и шаг за шагом разбираться в правилах.'},
    fr: {caption: 'Regardons ensemble', welcome: 'Je suis QUBE. Lisons les identités possibles des pièces et avançons ensemble, étape par étape.'},
    de: {caption: 'Gehen wir es gemeinsam durch', welcome: 'Ich bin QUBE. Lesen wir die möglichen Figurenarten und gehen die Regeln gemeinsam durch.'},
    es: {caption: 'Veámoslo juntos', welcome: 'Soy QUBE. Leamos las identidades posibles de las piezas y repasemos las ideas paso a paso.'},
    tr: {caption: 'Birlikte inceleyelim', welcome: 'Ben QUBE. Taşların olası türlerini okuyup kuralları birlikte adım adım inceleyelim.'},
    pl: {caption: 'Przyjrzyjmy się temu razem', welcome: 'Jestem QUBE. Odczytajmy możliwe rodzaje figur i przejdźmy przez zasady krok po kroku.'},
    hi: {caption: 'आइए साथ में समझें', welcome: 'मैं QUBE हूँ। मोहरों के संभावित प्रकार पढ़कर, हम नियमों को एक-एक करके समझेंगे।'},
    pt: {caption: 'Vamos ver juntos', welcome: 'Sou QUBE. Vamos ler as identidades possíveis das peças e entender as ideias passo a passo.'},
    ta: {caption: 'ஒன்றாகப் பார்ப்போம்', welcome: 'நான் QUBE. காய்களின் சாத்தியமான வகைகளைப் படித்து, விதிகளைப் படிப்படியாகப் புரிந்துகொள்வோம்.'},
};
