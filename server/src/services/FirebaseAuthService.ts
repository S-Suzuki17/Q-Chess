import { initializeApp, credential } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Initialize Firebase Admin
// In production, you must set GOOGLE_APPLICATION_CREDENTIALS or pass the service account JSON
// For Render, you can parse it from an environment variable:
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        initializeApp({
            credential: credential.cert(serviceAccount)
        });
    } catch (e) {
        console.error('[Auth] Failed to parse FIREBASE_SERVICE_ACCOUNT');
    }
} else {
    console.warn('[Auth] No FIREBASE_SERVICE_ACCOUNT provided. Firebase Admin will attempt default credentials.');
    initializeApp({ projectId: 'demo-project' });
}

export class FirebaseAuthService {
    public static async verifyToken(token: string): Promise<string | null> {
        if (!token) return null;
        
        // Mock token for testing/dev
        if (token.startsWith('anon_')) return token;
        
        try {
            const decodedToken = await getAuth().verifyIdToken(token);
            return decodedToken.uid;
        } catch (error) {
            console.error('[Auth] Token verification failed:', error);
            return null;
        }
    }
}
