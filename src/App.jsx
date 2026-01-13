/**
 * Q-Gambit: Quantum Chess
 * Main Application Component
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from './hooks/useAuth';
import { useMatchmaking } from './hooks/useMatchmaking';
import { useUserProfile } from './hooks/useUserProfile';
import { useDailyPlayLimit } from './hooks/useDailyPlayLimit';
import { useRewardedAd } from './hooks/useRewardedAd';
import { useBannerAd } from './hooks/useBannerAd';
import { useLeaderboard } from './hooks/useLeaderboard';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { useMatchHistory } from './hooks/useMatchHistory';
import { useAchievements } from './hooks/useAchievements';
import { useDetailedStats } from './hooks/useDetailedStats';
import { useGameRecord } from './hooks/useGameRecord';
import { useDailyLogin } from './hooks/useDailyLogin';
import { useInventory } from './hooks/useInventory';

// Components
import { Header, Navigation, MatchmakingOverlay } from './components/ui';
import { HomeTab, ProfileTab } from './components/tabs';
import { AdGateModal, LoginBonusModal, InventoryModal, AuthModal, LeaderboardModal } from './components/modals';
import GameScreen from './screens/GameScreen';

import './index.css';

// ===== Main App Component =====
export default function App() {
  const { user, loading: authLoading, signInWithGoogle, linkWithGoogle, signOut, isAnonymous } = useAuth();
  const { profile, rating, tier, loading: profileLoading } = useUserProfile(user);
  const {
    isSearching,
    matchedRoom,
    waitTime,
    currentRange,
    startMatchmaking,
    cancelMatchmaking,
    resetMatch
  } = useMatchmaking(user, rating);

  // Daily Play Limit (and persistent tickets)
  const {
    canPlayFree,
    remainingFreeGames,
    bonusTickets,
    incrementPlayCount,
    grantBonusGame,
  } = useDailyPlayLimit();

  // Inventory & Rewards
  const { inventory, addPiece, synthesize, exchange, rates: exchangeRates } = useInventory(grantBonusGame);

  // Daily Login Bonus
  const { streak, showLoginBonus, claimBonus } = useDailyLogin();

  // Ads
  const { showRewardedAd, isLoading: isAdLoading } = useRewardedAd();
  const { showBanner, hideBanner } = useBannerAd();

  const [activeTab, setActiveTab] = useState('home');
  const [currentRoom, setCurrentRoom] = useState(null);
  const [showAdGate, setShowAdGate] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showLeaderboardModal, setShowLeaderboardModal] = useState(false);
  const [pendingMode, setPendingMode] = useState(null);

  // Leaderboard
  const { leaderboard, loading: leaderboardLoading } = useLeaderboard();

  // Online status
  const { onlineCount } = useOnlineStatus(user);

  // Match history
  const { history: matchHistory } = useMatchHistory(user);

  // Achievements
  const { getUnlockedAchievements } = useAchievements(user, profile);

  // Detailed stats
  const { stats: detailedStats, getWhiteWinRate, getBlackWinRate } = useDetailedStats(user);

  // Game record (replay)
  const { records: gameRecords, retentionDays } = useGameRecord(user);

  // Handle match found
  useEffect(() => {
    if (matchedRoom) {
      setCurrentRoom(matchedRoom);
      incrementPlayCount();
    }
  }, [matchedRoom, incrementPlayCount]);

  // Banner ad visibility based on screen
  useEffect(() => {
    if (currentRoom || isSearching) {
      hideBanner();
    } else {
      showBanner();
    }
  }, [currentRoom, isSearching, showBanner, hideBanner]);

  // Handle play request with ad gate
  const handlePlayRequest = useCallback((mode = 'rapid') => {
    console.log('[App] handlePlayRequest triggered:', mode);
    if (canPlayFree) {
      console.log('[App] playing free, starting matchmaking');
      const modeRating = profile?.ratings?.[mode] || rating || 1500;
      startMatchmaking(mode, modeRating);
    } else {
      console.log('[App] limit reached, showing ad gate');
      setPendingMode(mode);
      setShowAdGate(true);
    }
  }, [canPlayFree, startMatchmaking, profile, rating]);

  // Handle watch ad
  const handleWatchAd = useCallback(() => {
    showRewardedAd(() => {
      grantBonusGame();
      setShowAdGate(false);
      const mode = pendingMode || 'rapid';
      const modeRating = profile?.ratings?.[mode] || rating || 1500;
      startMatchmaking(mode, modeRating);
      setPendingMode(null);
    });
  }, [showRewardedAd, grantBonusGame, startMatchmaking, pendingMode, profile, rating]);

  // Handle tab change
  const handleTabChange = useCallback((tabId) => {
    if (tabId === 'play') {
      handlePlayRequest();
      // Don't switch tab to 'play', keep current or go to home?
      // Since Home has the lobby, staying on Home/going to Home makes sense for matching.
      setActiveTab('home');
    } else {
      setActiveTab(tabId);
    }
  }, [handlePlayRequest]);

  // Handle exit game
  const handleExitGame = useCallback(() => {
    setCurrentRoom(null);
    resetMatch();
    cancelMatchmaking();
    setActiveTab('home');
  }, [cancelMatchmaking, resetMatch]);

  // Auth/Profile loading
  if (authLoading || profileLoading) {
    return (
      <div className="loading-overlay">
        <Loader2 size={32} className="animate-spin loading-icon" />
        <p className="loading-text">量子状態を初期化中...</p>
      </div>
    );
  }

  // Game screen
  if (currentRoom) {
    return (
      <div className="game-container-wrapper">
        <GameScreen roomInfo={currentRoom} user={user} onExit={handleExitGame} />
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Header */}
      <Header
        user={user}
        userData={profile}
        handleLogout={signOut}
        setShowAuthModal={setShowAuthModal}
        setShowLeaderboardModal={setShowLeaderboardModal}
      />

      {/* Main Content */}
      <main className="custom-scrollbar main-content">
        {activeTab === 'home' && (
          <HomeTab
            onQuickMatch={handlePlayRequest}
            remainingFreeGames={remainingFreeGames}
            bonusTickets={bonusTickets}
            onOpenInventory={() => setShowInventory(true)}
            onlineCount={onlineCount}
          />
        )}
        {activeTab === 'profile' && (
          <ProfileTab
            profile={profile}
            leaderboard={leaderboard}
            leaderboardLoading={leaderboardLoading}
            matchHistory={matchHistory}
            achievements={getUnlockedAchievements()}
            detailedStats={detailedStats}
            whiteWinRate={getWhiteWinRate()}
            blackWinRate={getBlackWinRate()}
            gameRecords={gameRecords}
            retentionDays={retentionDays}
          />
        )}
      </main>

      {/* Bottom Navigation */}
      <Navigation activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Matchmaking Overlay */}
      {isSearching && (
        <MatchmakingOverlay
          onCancel={cancelMatchmaking}
          waitTime={waitTime}
          currentRange={currentRange}
          rating={rating}
        />
      )}

      {/* Ad Gate Modal */}
      {showAdGate && (
        <AdGateModal
          onWatchAd={handleWatchAd}
          onClose={() => setShowAdGate(false)}
          isLoading={isAdLoading}
        />
      )}

      {/* Daily Login Bonus Modal */}
      {showLoginBonus && (
        <LoginBonusModal streak={streak} onClaim={() => claimBonus(() => addPiece('P', 1))} />
      )}

      {/* Inventory Modal */}
      {showInventory && (
        <InventoryModal
          inventory={inventory}
          rates={exchangeRates}
          onSynthesize={synthesize}
          onExchange={exchange}
          onClose={() => setShowInventory(false)}
        />
      )}

      {/* Auth Modal */}
      {showAuthModal && (
        <AuthModal
          onSignInWithGoogle={signInWithGoogle}
          onLinkWithGoogle={linkWithGoogle}
          onSignInGuest={() => setShowAuthModal(false)} // Already authed as guest by default or handled by useAuth
          isAnonymous={isAnonymous}
          onClose={() => setShowAuthModal(false)}
        />
      )}

      {/* Leaderboard Modal */}
      {showLeaderboardModal && (
        <LeaderboardModal
          user={user}
          onClose={() => setShowLeaderboardModal(false)}
        />
      )}
    </div>
  );
}
