export type RewardKind='hint'|'online';
export const nativeRewardsEnabled=()=>new URLSearchParams(location.search).has('native');
export const readRewardBalance=async()=>({hint:7,online:3});
export const watchNativeReward=async()=>{throw new Error('QA_FORBIDS_REAL_AD_OR_REWARD');};
