import type {Language} from './dict';
const keys=['email','account','password','keep','or'] as const;
const rows:Record<Language,readonly [string,string,string,string,string]>={
 ja:['メールアドレス','アカウント名','パスワード','ログイン状態を保持する','または'],
 en:['Email address','Account name','Password','Keep me signed in','or'],
 zh:['电子邮箱地址','账号名','密码','保持登录状态','或'],
 ru:['Электронная почта','Имя аккаунта','Пароль','Оставаться в системе','или'],
 fr:['Adresse e-mail','Nom du compte','Mot de passe','Rester connecté','ou'],
 de:['E-Mail-Adresse','Kontoname','Passwort','Angemeldet bleiben','oder'],
 es:['Correo electrónico','Nombre de cuenta','Contraseña','Mantener la sesión iniciada','o'],
 tr:['E-posta adresi','Hesap adı','Parola','Oturumumu açık tut','veya'],
 pl:['Adres e-mail','Nazwa konta','Hasło','Nie wylogowuj mnie','lub'],
 hi:['ईमेल पता','खाते का नाम','पासवर्ड','मुझे लॉग इन रखें','या'],
 pt:['Endereço de e-mail','Nome da conta','Senha','Manter a sessão iniciada','ou'],
 ta:['மின்னஞ்சல் முகவரி','கணக்கின் பெயர்','கடவுச்சொல்','உள்நுழைந்த நிலையில் வைத்திரு','அல்லது'],
};
export const authFormText=(lang:Language,key:typeof keys[number])=>rows[lang][keys.indexOf(key)];
