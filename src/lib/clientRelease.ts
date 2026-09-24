import {ANDROID_BUILD} from '../config/appPlatform';
// Compatibility hints, not authentication claims. All identity checks remain server-side.
export const clientRelease={protocol:1,platform:ANDROID_BUILD?'android':'web',build:Number(process.env.NEXT_PUBLIC_ANDROID_VERSION_CODE||0)};
export const clientReleaseHeaders=()=>({'X-QG-Protocol':String(clientRelease.protocol),'X-QG-Platform':clientRelease.platform,'X-QG-Build':String(clientRelease.build)});
