// Keep the existing CI entrypoint; Google-only authentication replaces the former flow.
import {verifyGoogleLogin} from './google-login-browser.mjs';
await verifyGoogleLogin('setup');
