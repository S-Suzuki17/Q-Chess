import {defineConfig} from 'vitest/config';
import base from './vitest.config';
export default defineConfig({...base,test:{...base.test,include:[
 'server/src/services/AdRewardRoutes.test.ts',
 'src/lib/__tests__/adMobVerification.test.ts',
 'src/lib/__tests__/nativeAds.test.ts',
 'src/lib/__tests__/rewardFlow.test.ts',
 'src/lib/__tests__/adPolicy.test.ts',
 'src/lib/adsense.test.ts',
]}});
