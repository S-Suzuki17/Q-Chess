import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { captureOAuthCallback } from './oauthLoginIntent';
import { ANDROID_BUILD } from '../config/appPlatform';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';

const native = ANDROID_BUILD || Capacitor.isNativePlatform();
// Capture callback shape before automatic initialization can consume the URL.
export const oauthCallbackAtStartup = captureOAuthCallback();
export const supabase = createClient(supabaseUrl, supabaseAnonKey, native ? {
    auth: { flowType: 'pkce', detectSessionInUrl: false },
} : undefined);
