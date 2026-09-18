import type { Language } from './dict';
const text:Record<Language,readonly [string,string]>={
    en:['Sign in to play','Sign in to start Crown Circuit, advance stages and earn rewards. Existing progress stays on this device.'],
    ja:['ログインしてプレイ','クラウン・サーキットの開始・ステージ進行・報酬獲得にはログインが必要です。保存済みの進行状況は、この端末にそのまま残ります。'],
    zh:['登录后游玩','开始皇冠巡回赛、推进关卡和获得奖励需要登录。已有进度会保留在此设备上。'],
    ru:['Войти и играть','Войдите, чтобы начать Crown Circuit, проходить этапы и получать награды. Сохранённый прогресс останется на этом устройстве.'],
    fr:['Se connecter pour jouer','Connectez-vous pour jouer au Crown Circuit, progresser et gagner des récompenses. Votre progression reste sur cet appareil.'],
    de:['Zum Spielen anmelden','Melde dich an, um Crown Circuit zu starten, Stufen abzuschließen und Belohnungen zu erhalten. Dein Fortschritt bleibt auf diesem Gerät.'],
    es:['Inicia sesión para jugar','Inicia sesión para jugar a Crown Circuit, avanzar y ganar premios. El progreso guardado permanece en este dispositivo.'],
    tr:['Oynamak için giriş yap','Crown Circuit’e başlamak, aşamaları geçmek ve ödül kazanmak için giriş yap. Kayıtlı ilerlemen bu cihazda kalır.'],
    pl:['Zaloguj się, aby grać','Zaloguj się, aby rozpocząć Crown Circuit, przechodzić etapy i zdobywać nagrody. Zapisany postęp pozostaje na tym urządzeniu.'],
    hi:['खेलने के लिए लॉग इन करें','Crown Circuit शुरू करने, स्तर आगे बढ़ाने और पुरस्कार पाने के लिए लॉग इन करें। सहेजी गई प्रगति इसी डिवाइस पर रहेगी।'],
    pt:['Entre para jogar','Entre para iniciar o Crown Circuit, avançar nas etapas e ganhar recompensas. O progresso salvo continua neste dispositivo.'],
    ta:['விளையாட உள்நுழையவும்','Crown Circuit தொடங்க, நிலைகளில் முன்னேற மற்றும் பரிசுகளைப் பெற உள்நுழையவும். சேமித்த முன்னேற்றம் இந்தச் சாதனத்தில் இருக்கும்.'],
};
export const circuitAccessText=(lang:Language,key:'action'|'help')=>text[lang][key==='action'?0:1];
