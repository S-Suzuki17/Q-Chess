import { createClient } from '@libsql/client';

// 環境変数が無い場合（ローカル開発時の初期状態など）でもクラッシュしないガードコード
const url = process.env.TURSO_DATABASE_URL || 'file:./local.db';
const authToken = process.env.TURSO_AUTH_TOKEN;

export const db = createClient({
    url,
    authToken,
});

export const getDbStatus = () => {
    return url === 'file:./local.db' ? 'LOCAL_MOCK' : 'TURSO_CONNECTED';
};
