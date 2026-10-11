import type {Language} from './dict';

// Registration contact is private and unverified; it grants no recovery rights.
export const registrationPrivacy: Record<Language, string> = {
  en: 'New registration requires an email address, account name and password. The email is stored privately with the account and deleted with it. It is not verified and does not enable sign-in or password recovery. Sign in with your account name and password; existing accounts remain usable.',
  ja: '新規登録にはメールアドレス、アカウント名、パスワードが必要です。メールアドレスはアカウントに紐づけて非公開で保存し、アカウント削除時に削除します。メールの確認は行わず、メールでのログインやパスワード復旧には使用しません。ログインにはアカウント名とパスワードを使います。既存アカウントも引き続き利用できます。',
  zh: '新注册需要邮箱、账户名和密码。邮箱随账户私密保存，并在删除账户时删除。邮箱未经验证，不用于登录或密码恢复。使用账户名和密码登录；现有账户仍可使用。',
  ru: 'Для регистрации нужны электронная почта, имя аккаунта и пароль. Почта хранится непублично и удаляется вместе с аккаунтом. Она не проверяется и не используется для входа или восстановления пароля. Входите по имени и паролю; прежние аккаунты сохраняются.',
  fr: 'L’inscription nécessite une adresse e-mail, un nom de compte et un mot de passe. L’adresse est conservée de façon privée et supprimée avec le compte. Non vérifiée, elle ne permet ni connexion ni récupération du mot de passe. Connectez-vous avec le nom et le mot de passe ; les comptes existants restent utilisables.',
  de: 'Die Registrierung erfordert E-Mail-Adresse, Kontoname und Passwort. Die Adresse wird privat gespeichert und mit dem Konto gelöscht. Sie wird nicht bestätigt und ermöglicht weder Anmeldung noch Passwortwiederherstellung. Melde dich mit Kontoname und Passwort an; bestehende Konten bleiben nutzbar.',
  es: 'El registro requiere correo, nombre de cuenta y contraseña. El correo se guarda de forma privada y se elimina con la cuenta. No se verifica ni permite iniciar sesión o recuperar la contraseña. Usa el nombre y la contraseña; las cuentas existentes siguen funcionando.',
  tr: 'Kayıt için e-posta, hesap adı ve parola gerekir. E-posta gizli saklanır ve hesapla birlikte silinir. Doğrulanmaz; giriş veya parola kurtarma için kullanılmaz. Hesap adı ve parolayla giriş yapın; mevcut hesaplar kullanılabilir.',
  pl: 'Rejestracja wymaga adresu e-mail, nazwy konta i hasła. Adres jest prywatny i usuwany wraz z kontem. Nie jest weryfikowany i nie służy do logowania ani odzyskiwania hasła. Loguj się nazwą i hasłem; istniejące konta nadal działają.',
  hi: 'नए पंजीकरण के लिए ईमेल, खाता नाम और पासवर्ड आवश्यक हैं। ईमेल निजी रूप से रखा जाता है और खाते के साथ मिटता है। इसका सत्यापन नहीं होता और यह लॉगिन या पासवर्ड पुनर्प्राप्ति के लिए नहीं है। खाता नाम और पासवर्ड से लॉगिन करें; पुराने खाते चलते रहेंगे।',
  pt: 'O cadastro exige e-mail, nome de conta e senha. O e-mail fica privado e é excluído com a conta. Não é verificado nem permite login ou recuperação de senha. Entre com nome e senha; contas existentes continuam utilizáveis.',
  ta: 'புதிய பதிவுக்கு மின்னஞ்சல், கணக்குப் பெயர், கடவுச்சொல் தேவை. மின்னஞ்சல் தனிப்பட்ட முறையில் சேமிக்கப்பட்டு கணக்குடன் நீக்கப்படும். அது சரிபார்க்கப்படாது; உள்நுழைவு அல்லது கடவுச்சொல் மீட்புக்குப் பயன்படாது. கணக்குப் பெயர், கடவுச்சொல்லால் உள்நுழையுங்கள்; பழைய கணக்குகள் தொடர்ந்து இயங்கும்.',
};
