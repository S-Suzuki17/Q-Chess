import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { ANDROID_BUILD } from '../config/appPlatform';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';

const native = ANDROID_BUILD || Capacitor.isNativePlatform();
export const supabase = createClient(supabaseUrl, supabaseAnonKey, native ? {
    auth: { flowType: 'pkce', detectSessionInUrl: false },
} : undefined);
