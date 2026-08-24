import { betterAuth } from 'better-auth';

// Better Authの基本設定
// データベースアダプタとしてTurso（またはその他のSQL DB）を将来的に接続可能
export const auth = betterAuth({
    database: {
        // 現在はプレースホルダー。Drizzle等のORMを入れた際にここに設定を渡します
        provider: 'sqlite',
        url: process.env.TURSO_DATABASE_URL || 'file:./local.db',
    },
    emailAndPassword: {
        enabled: true,
    },
    // セッションの保存設定など
    session: {
        expiresIn: 60 * 60 * 24 * 7, // 7 days
    },
});
