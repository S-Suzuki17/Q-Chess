import type {Language} from './dict';

const keys=['play','appearance','account','support','playHelp','appearanceHelp','accountHelp','supportHelp'] as const;
const rows:Record<Language,readonly string[]>={
 ja:['音・言語','外観','アカウント','サポート','音量と言語を、自分に合う設定に。','獲得したデザインで、次の対局を彩ろう。','進行の保存とアカウントの情報を確認。','プライバシー、遊び方、お問い合わせ。'],
 en:['Sound & language','Appearance','Account','Support','Make the sound and language your own.','Choose earned designs for your next match.','Check your saved progress and account.','Privacy, how to play, and help.'],
 zh:['声音与语言','外观','账号','帮助','调整适合自己的音量和语言。','为下一局选择已获得的外观。','查看进度存档与账号信息。','隐私、玩法与联系支持。'],
 ru:['Звук и язык','Оформление','Аккаунт','Помощь','Настройте громкость и язык.','Выберите полученное оформление для следующей игры.','Проверьте сохранение прогресса и аккаунт.','Конфиденциальность, правила и поддержка.'],
 fr:['Son et langue','Apparence','Compte','Aide','Réglez le volume et la langue à votre goût.','Choisissez vos décors obtenus pour la prochaine partie.','Vérifiez votre progression sauvegardée et votre compte.','Confidentialité, règles et assistance.'],
 de:['Ton & Sprache','Aussehen','Konto','Hilfe','Passe Lautstärke und Sprache an.','Wähle erhaltene Designs für dein nächstes Spiel.','Prüfe deinen Spielstand und dein Konto.','Datenschutz, Spielanleitung und Kontakt.'],
 es:['Sonido e idioma','Apariencia','Cuenta','Ayuda','Ajusta el volumen y el idioma a tu gusto.','Elige diseños obtenidos para la próxima partida.','Consulta tu progreso guardado y tu cuenta.','Privacidad, cómo jugar y contacto.'],
 tr:['Ses ve dil','Görünüm','Hesap','Yardım','Ses düzeyini ve dili kendine göre ayarla.','Sonraki maçın için kazandığın tasarımları seç.','Kaydedilen ilerlemeni ve hesabını kontrol et.','Gizlilik, oyun kuralları ve destek.'],
 pl:['Dźwięk i język','Wygląd','Konto','Pomoc','Dostosuj głośność i język.','Wybierz zdobyte wzory na następny mecz.','Sprawdź zapisany postęp i swoje konto.','Prywatność, zasady gry i kontakt.'],
 hi:['ध्वनि और भाषा','रूप','खाता','सहायता','आवाज़ और भाषा अपनी पसंद से चुनें।','अगले मैच के लिए जीते हुए डिज़ाइन चुनें।','सहेजी गई प्रगति और खाता देखें।','गोपनीयता, खेलने का तरीका और संपर्क।'],
 pt:['Som e idioma','Aparência','Conta','Ajuda','Ajuste o volume e o idioma ao seu gosto.','Escolha designs obtidos para a próxima partida.','Confira o progresso salvo e sua conta.','Privacidade, como jogar e suporte.'],
 ta:['ஒலி மற்றும் மொழி','தோற்றம்','கணக்கு','உதவி','ஒலியையும் மொழியையும் விருப்பப்படி அமைக்கவும்.','அடுத்த ஆட்டத்திற்குப் பெற்ற வடிவமைப்புகளைத் தேர்ந்தெடுக்கவும்.','சேமித்த முன்னேற்றத்தையும் கணக்கையும் பார்க்கவும்.','தனியுரிமை, விளையாட்டு வழிகாட்டி, தொடர்பு.'],
};
const privacy:Record<Language,readonly [string,string]>={ja:['プライバシー','データ利用や広告のプライバシーを確認。'],en:['Privacy','Review data use and advertising privacy.'],zh:['隐私','查看数据使用与广告隐私。'],ru:['Приватность','Проверьте использование данных и конфиденциальность рекламы.'],fr:['Vie privée','Vérifiez l’utilisation des données et la confidentialité publicitaire.'],de:['Datenschutz','Prüfe Datennutzung und Werbedatenschutz.'],es:['Privacidad','Revisa el uso de datos y la privacidad publicitaria.'],tr:['Gizlilik','Veri kullanımını ve reklam gizliliğini kontrol et.'],pl:['Prywatność','Sprawdź wykorzystanie danych i prywatność reklam.'],hi:['गोपनीयता','डेटा उपयोग और विज्ञापन गोपनीयता देखें।'],pt:['Privacidade','Confira o uso de dados e a privacidade dos anúncios.'],ta:['தனியுரிமை','தரவு பயன்பாட்டையும் விளம்பரத் தனியுரிமையையும் பார்க்கவும்.']};
export const settingsScreenText=(lang:Language,key:typeof keys[number]|'privacy'|'privacyHelp')=>key==='privacy'?privacy[lang][0]:key==='privacyHelp'?privacy[lang][1]:rows[lang][keys.indexOf(key)];
