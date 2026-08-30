const fs = require('fs');
let code = fs.readFileSync('src/components/LevelSelect.tsx', 'utf8');

if (!code.includes('showPlayMenu')) {
    code = code.replace(
        'const [showLiveMatches, setShowLiveMatches] = React.useState(false);',
        'const [showLiveMatches, setShowLiveMatches] = React.useState(false);\n    const [showPlayMenu, setShowPlayMenu] = React.useState(false);\n    const [recentGames, setRecentGames] = React.useState<any[]>([]);\n    React.useEffect(() => { getGameRecords(3, user.id).then(setRecentGames); }, [user.id]);'
    );
}

const splitRegex = /    \}, \[\]\);\r?\n    return \(/;
const match = code.match(splitRegex);

if (!match) {
    console.error("Could not find the correct 'return ('");
    process.exit(1);
}

const beforeReturn = code.slice(0, match.index + match[0].indexOf('return ('));

const newReturnBlock = `return (
        <div className="w-full h-[100dvh] flex flex-col bg-[#11100E] text-[#E8E2D7] font-sans px-6 py-6 md:px-8 md:py-8 overflow-hidden relative">
            
            {/* Play Menu Modal */}
            {showPlayMenu && (
                <div className="fixed inset-0 bg-[#11100E]/95 z-[60] flex flex-col justify-end md:justify-center p-4 md:p-0 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-full max-w-md mx-auto bg-[#11100E] border border-[#A89C86]/30 p-6 flex flex-col shadow-2xl">
                        <div className="flex justify-between items-center border-b border-[#A89C86]/20 pb-4 mb-4 shrink-0">
                            <span className="text-sm tracking-[0.2em] text-[#E8E2D7] font-serif uppercase">CHOOSE YOUR GAME</span>
                            <button onClick={() => setShowPlayMenu(false)} className="text-[#A89C86] hover:text-[#E8E2D7] text-xl transition-colors">✕</button>
                        </div>
                        
                        <div className="flex flex-col gap-0 overflow-y-auto">
                            {/* RANKED */}
                            <button onClick={() => {
                                if (user.type === 'guest') {
                                    alert(lang === 'ja' ? 'ランクマッチプレイにはアカウント登録が必要です。' : 'Please register an account to play Ranked Matches.');
                                } else {
                                    setPendingAction({ type: 'ranked' });
                                    setShowPlayMenu(false);
                                }
                            }} className="w-full text-left py-6 border-b border-[#A89C86]/10 hover:bg-[#191714] group transition-colors flex flex-col gap-2 px-4">
                                <span className="text-lg tracking-[0.15em] text-[#E8E2D7] group-hover:text-[#B39A62]">RANKED</span>
                                <span className="text-[10px] tracking-widest text-[#A89C86] leading-relaxed">Competitive match.<br/>Your rating is affected by the result.</span>
                            </button>
                            
                            {/* RANDOM MATCH */}
                            <button onClick={() => {
                                setPendingAction({ type: 'random' });
                                setShowPlayMenu(false);
                            }} className="w-full text-left py-6 border-b border-[#A89C86]/10 hover:bg-[#191714] group transition-colors flex flex-col gap-2 px-4">
                                <span className="text-lg tracking-[0.15em] text-[#E8E2D7] group-hover:text-[#B39A62]">RANDOM MATCH</span>
                                <span className="text-[10px] tracking-widest text-[#A89C86] leading-relaxed">Casual online match.<br/>Find an opponent at random.</span>
                            </button>

                            {/* FRIEND MATCH */}
                            <button onClick={() => {
                                setShowFriends(true);
                                setShowPlayMenu(false);
                            }} className="w-full text-left py-6 border-b border-[#A89C86]/10 hover:bg-[#191714] group transition-colors flex flex-col gap-2 px-4">
                                <span className="text-lg tracking-[0.15em] text-[#E8E2D7] group-hover:text-[#B39A62]">FRIEND MATCH</span>
                                <span className="text-[10px] tracking-widest text-[#A89C86] leading-relaxed">Challenge someone you know.</span>
                            </button>
                            
                            {/* JOIN ROOM */}
                            <button onClick={() => {
                                const room = prompt(lang === 'ja' ? 'ルームIDを入力' : 'Enter Room ID');
                                if (room) {
                                    setPendingAction({ type: 'join', roomId: room.toUpperCase() });
                                    setShowPlayMenu(false);
                                }
                            }} className="w-full text-left py-6 hover:bg-[#191714] group transition-colors flex flex-col gap-2 px-4">
                                <span className="text-lg tracking-[0.15em] text-[#E8E2D7] group-hover:text-[#B39A62]">JOIN ROOM</span>
                                <span className="text-[10px] tracking-widest text-[#A89C86] leading-relaxed">Join a private match via 6-letter code.</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Existing Overlays (Time Control, Account, Replays, Leaderboard, Friends, Live, Ad) */}
            {pendingAction && pendingAction.type !== 'cpu' && pendingAction.type !== 'join' && pendingAction.type !== 'host' && (
                <div className="fixed inset-0 bg-[#11100E]/95 z-50 flex flex-col items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-[#11100E] border border-[#A89C86]/30 p-8 w-full max-w-sm text-center shadow-2xl">
                        <h3 className="text-xl tracking-[0.2em] text-[#E8E2D7] mb-2">{t.selectTimeLimit}</h3>
                        <p className="text-[#A89C86] text-xs tracking-widest mb-8">{t.timeLimit}</p>
                        <div className="flex flex-col gap-4">
                            {(['10s', '3m', '10m'] as TimeControl[]).map(tc => (
                                <button
                                    key={tc}
                                    onClick={() => handleTimeControlConfirm(tc)}
                                    className="w-full py-4 bg-[#11100E] border border-[#A89C86]/30 hover:border-[#B39A62] transition-colors text-[#E8E2D7] tracking-widest text-sm flex justify-between px-6 items-center group"
                                >
                                    <span className="group-hover:text-[#B39A62]">{tc === '10s' ? t.tc10s : tc === '3m' ? t.tc3m : t.tc10m}</span>
                                    <span className="text-xs text-[#A89C86]">→</span>
                                </button>
                            ))}
                        </div>
                        <button onClick={() => setPendingAction(null)} className="mt-8 text-xs text-[#A89C86] hover:text-[#E8E2D7] tracking-widest">
                            CANCEL
                        </button>
                    </div>
                </div>
            )}

            {showAccount && (
                <div className="fixed inset-0 bg-[#11100E]/95 z-50 flex flex-col items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-[#11100E] border border-[#A89C86]/30 p-6 md:p-8 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
                        <div className="flex justify-between items-center mb-6 pb-4 border-b border-[#A89C86]/20">
                            <h3 className="text-lg tracking-[0.2em] text-[#E8E2D7] font-serif">ACCOUNT</h3>
                            <button onClick={() => setShowAccount(false)} className="text-[#A89C86] hover:text-[#E8E2D7] text-xl">✕</button>
                        </div>
                        
                        <div className="flex flex-col gap-6 text-left">
                            <div className="flex items-center gap-6">
                                <label className="cursor-pointer group relative">
                                    <div className="w-20 h-20 rounded-full border border-[#A89C86]/50 overflow-hidden bg-[#11100E] flex items-center justify-center transition-all group-hover:border-[#B39A62]">
                                        {userProfile?.avatar_url ? (
                                            <img src={userProfile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="text-[#A89C86] text-xl">?</span>
                                        )}
                                        {uploadingAvatar && (
                                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                                <span className="text-[10px] tracking-widest text-white animate-pulse">UPLOADING</span>
                                            </div>
                                        )}
                                    </div>
                                    <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" disabled={uploadingAvatar} />
                                </label>
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                        {isEditingName ? (
                                            <input 
                                                type="text" 
                                                value={newName} 
                                                onChange={e => setNewName(e.target.value)} 
                                                className="bg-[#191714] border border-[#A89C86]/50 p-1 text-sm text-[#E8E2D7] w-32 outline-none focus:border-[#B39A62]" 
                                            />
                                        ) : (
                                            <span className="text-xl font-serif tracking-wider">{userProfile?.name || user.name}</span>
                                        )}
                                        <button onClick={() => {
                                            if (isEditingName) { handleUpdateName(); setIsEditingName(false); } 
                                            else { setIsEditingName(true); setNewName(userProfile?.name || user.name); }
                                        }} className="text-[10px] text-[#A89C86] hover:text-[#B39A62] ml-2 tracking-widest">
                                            {isEditingName ? 'SAVE' : 'EDIT'}
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-[#A89C86] font-mono mt-1">ID: {user.id}</p>
                                </div>
                            </div>

                            <div>
                                <p className="text-[10px] tracking-[0.2em] text-[#A89C86] mb-2 uppercase">Ratings</p>
                                <div className="border border-[#A89C86]/20 flex justify-between">
                                    <div className="flex flex-col items-center p-4 border-r border-[#A89C86]/20 flex-1">
                                        <span className="text-[10px] text-[#A89C86] mb-1 tracking-widest">10 MIN</span>
                                        <span className="font-mono text-[#B39A62] text-sm">{userProfile ? Math.floor(userProfile.rating_10m) : '---'}</span>
                                    </div>
                                    <div className="flex flex-col items-center p-4 border-r border-[#A89C86]/20 flex-1">
                                        <span className="text-[10px] text-[#A89C86] mb-1 tracking-widest">3 MIN</span>
                                        <span className="font-mono text-[#B39A62] text-sm">{userProfile ? Math.floor(userProfile.rating_3m) : '---'}</span>
                                    </div>
                                    <div className="flex flex-col items-center p-4 flex-1">
                                        <span className="text-[10px] text-[#A89C86] mb-1 tracking-widest">10 SEC</span>
                                        <span className="font-mono text-[#B39A62] text-sm">{userProfile ? Math.floor(userProfile.rating_10s) : '---'}</span>
                                    </div>
                                </div>
                            </div>

                            <button onClick={async () => { await supabase.auth.signOut(); window.location.reload(); }} className="w-full mt-4 py-4 border border-[#A89C86]/30 hover:border-[#E8E2D7] text-[#A89C86] hover:text-[#E8E2D7] text-xs tracking-widest transition-colors">
                                SIGN OUT
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showReplays && (
                <div className="fixed inset-0 bg-[#11100E]/95 z-50 flex flex-col p-4 md:p-8 backdrop-blur-md">
                    <div className="w-full max-w-2xl mx-auto h-full flex flex-col">
                        <div className="flex justify-between items-center mb-6 pb-4 border-b border-[#A89C86]/20 shrink-0">
                            <h3 className="text-xl tracking-[0.2em] text-[#E8E2D7] font-serif">{t.watchReplays}</h3>
                            <button onClick={() => setShowReplays(false)} className="text-[#A89C86] hover:text-[#E8E2D7] text-2xl">✕</button>
                        </div>
                        
                        <div className="flex gap-2 mb-6 shrink-0">
                            <button onClick={() => handleReplayCategoryChange('global')} className={\`flex-1 py-3 text-[10px] tracking-[0.2em] transition-colors border \${replayCategory === 'global' ? 'border-[#B39A62] bg-[#B39A62]/10 text-[#B39A62]' : 'border-[#A89C86]/30 text-[#A89C86] hover:border-[#E8E2D7]'}\`}>GLOBAL</button>
                            <button onClick={() => handleReplayCategoryChange('mine')} className={\`flex-1 py-3 text-[10px] tracking-[0.2em] transition-colors border \${replayCategory === 'mine' ? 'border-[#B39A62] bg-[#B39A62]/10 text-[#B39A62]' : 'border-[#A89C86]/30 text-[#A89C86] hover:border-[#E8E2D7]'}\`}>MY GAMES</button>
                        </div>

                        {loadingReplays ? (
                            <div className="flex-grow flex items-center justify-center text-[#A89C86] animate-pulse text-xs tracking-widest">{t.loading}</div>
                        ) : replays.length === 0 ? (
                            <div className="flex-grow flex items-center justify-center text-[#A89C86] text-xs tracking-widest">{t.noRecords}</div>
                        ) : (
                            <div className="flex-grow overflow-y-auto custom-scrollbar flex flex-col pr-2">
                                {replays.map(r => (
                                    <button key={r.id} onClick={() => onReplay?.(r)} className="w-full text-left py-4 border-b border-[#A89C86]/20 hover:border-[#B39A62] transition-colors flex justify-between items-center group">
                                        <div className="flex flex-col">
                                            <span className="text-sm tracking-widest text-[#E8E2D7]">
                                                {r.white_player} <span className="text-[#A89C86] mx-2 text-[10px]">{t.vs}</span> {r.black_player}
                                            </span>
                                            <span className="text-[10px] text-[#A89C86] mt-1 font-mono tracking-widest">
                                                {new Date(r.created_at!).toLocaleDateString()} / {r.mode.toUpperCase()} {r.time_control ? \`/ \${r.time_control}\` : ''}
                                            </span>
                                        </div>
                                        <span className={\`text-[10px] tracking-widest \${r.winner === 'white_wins' ? 'text-[#E8E2D7]' : r.winner === 'black_wins' ? 'text-red-400' : 'text-[#A89C86]'}\`}>
                                            {r.winner === 'white_wins' ? t.whiteWon : r.winner === 'black_wins' ? t.blackWon : t.draw}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {showLeaderboard && (
                <div className="fixed inset-0 bg-[#11100E]/95 z-50 flex flex-col p-4 md:p-8 backdrop-blur-md">
                    <div className="w-full max-w-2xl mx-auto h-full flex flex-col">
                        <div className="flex justify-between items-center mb-6 pb-4 border-b border-[#A89C86]/20 shrink-0">
                            <h3 className="text-xl tracking-[0.2em] text-[#E8E2D7] font-serif">{t.globalRankings}</h3>
                            <button onClick={() => setShowLeaderboard(false)} className="text-[#A89C86] hover:text-[#E8E2D7] text-2xl">✕</button>
                        </div>
                        <div className="flex gap-2 mb-6 shrink-0">
                            {[ { id: '10m', label: t.lb10m } ].map(tab => (
                                <button key={tab.id} onClick={() => handleCategoryChange(tab.id as TimeControl)} className={\`flex-1 py-3 text-[10px] tracking-[0.2em] transition-colors border \${leaderboardCategory === tab.id ? 'border-[#B39A62] bg-[#B39A62]/10 text-[#B39A62]' : 'border-[#A89C86]/30 text-[#A89C86] hover:border-[#E8E2D7]'}\`}>{tab.label}</button>
                            ))}
                        </div>
                        {loadingLeaderboard ? (
                            <div className="flex-grow flex items-center justify-center text-[#A89C86] animate-pulse text-xs tracking-widest">{t.loading}</div>
                        ) : leaderboard.length === 0 ? (
                            <div className="flex-grow flex items-center justify-center text-[#A89C86] text-xs tracking-widest">{t.noRankedPlayers}</div>
                        ) : (
                            <div className="flex-grow overflow-y-auto custom-scrollbar flex flex-col pr-2">
                                {leaderboard.map((p, index) => {
                                    const ratingVal = leaderboardCategory === '10s' ? (p.rating_10s ?? 2000)
                                                    : leaderboardCategory === '3m' ? (p.rating_3m ?? 2000)
                                                    : (p.rating_10m ?? 2000);
                                    return (
                                        <div key={p.id} className="w-full flex justify-between items-center py-4 border-b border-[#A89C86]/20">
                                            <div className="flex items-center gap-6">
                                                <span className={\`text-sm font-mono tracking-widest \${index === 0 ? 'text-[#B39A62]' : index === 1 ? 'text-[#E8E2D7]' : index === 2 ? 'text-[#A89C86]' : 'text-[#A89C86]/50'}\`}>#{index + 1}</span>
                                                <span className="tracking-widest text-[#E8E2D7] text-sm">{p.name}</span>
                                            </div>
                                            <div className="text-[#B39A62] font-mono text-sm tracking-widest">{Math.floor(ratingVal)}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {showFriends && (
                <div className="fixed inset-0 z-50 bg-[#11100E]">
                    <FriendsMenu user={user} lang={lang} onlineUsers={onlineUsers} onClose={() => setShowFriends(false)} onChallenge={(friendId) => {
                        const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
                        setPendingAction({ type: 'host', roomId: newRoomId });
                        setShowFriends(false);
                    }} />
                </div>
            )}

            {showLiveMatches && (
                <div className="fixed inset-0 z-50 bg-[#11100E]">
                    <LiveMatchesMenu lang={lang} onClose={() => setShowLiveMatches(false)} onSpectate={(roomId) => {
                        onOnlineMatch?.(roomId, 'spectator', 'private', '10m');
                        setShowLiveMatches(false);
                    }} />
                </div>
            )}

            {showAdModal && (
                <div className="fixed inset-0 bg-[#11100E]/95 z-[100] flex flex-col items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-[#191714] border border-[#A89C86]/30 p-8 w-full max-w-sm text-center shadow-2xl flex flex-col items-center">
                        <h3 className="text-xl font-serif text-[#E8E2D7] mb-2">{(t as any).adCloudTitle || 'Preparing Match'}</h3>
                        <p className="text-[#A89C86] text-[10px] tracking-widest mb-8">{(t as any).adCloudDesc || 'Watch a short ad to start the practice match!'}</p>
                        <div className="w-full h-1 bg-[#11100E] mb-6 overflow-hidden">
                            <div className="h-full bg-[#B39A62] transition-all duration-[1000ms] ease-linear" style={{ width: \`\${adProgress}%\` }} />
                        </div>
                        <div className="w-32 h-32 mb-4 bg-transparent border border-[#A89C86]/10 flex items-center justify-center">
                            <AdBanner />
                        </div>
                        {adProgress >= 100 ? (
                            <button onClick={handleAdFinish} className="w-full py-4 bg-[#E8E2D7] text-[#11100E] font-bold tracking-[0.2em] text-xs transition-colors mt-4 hover:bg-[#B39A62]">START MATCH</button>
                        ) : (
                            <div className="w-full py-4 bg-transparent text-[#A89C86] tracking-[0.2em] text-xs mt-4 border border-[#A89C86]/20">LOADING...</div>
                        )}
                    </div>
                </div>
            )}


            {/* --- HOME SCREEN MAIN UI --- */}
            
            <div className="flex justify-between items-center w-full max-w-lg mx-auto shrink-0 z-10 pt-4">
                <span className="text-xl md:text-2xl tracking-[0.2em] font-serif text-[#E8E2D7]">Q-GAMBIT</span>
                <div className="flex items-center gap-2">
                    <span className="font-mono text-[#B39A62] text-sm">{userProfile?.rating_10m ? Math.floor(userProfile.rating_10m) : '---'}</span>
                </div>
            </div>

            <div className="flex-grow flex flex-col justify-center w-full max-w-lg mx-auto z-10 gap-12 mt-8">
                
                <div className="flex flex-col gap-6 w-full">
                    <div className="flex flex-col items-center w-full">
                        <h2 className="text-[10px] tracking-[0.3em] text-[#A89C86] uppercase mb-4">YOUR NEXT GAME</h2>
                        <button onClick={() => setShowPlayMenu(true)} className="w-full py-8 bg-transparent border border-[#A89C86]/50 hover:bg-[#E8E2D7] hover:text-[#11100E] text-[#E8E2D7] transition-all group relative overflow-hidden">
                            <span className="relative z-10 text-2xl tracking-[0.3em] font-serif transition-colors">PLAY</span>
                        </button>
                    </div>

                    <button onClick={handleVsCpuClick} className="w-full py-4 bg-transparent border border-[#A89C86]/20 hover:bg-[#191714] text-xs tracking-[0.2em] transition-colors text-[#A89C86] hover:text-[#E8E2D7] uppercase">
                        PRACTICE
                    </button>
                </div>

                <div className="flex flex-col w-full">
                    <div className="border-b border-[#A89C86]/20 pb-2 mb-2 flex justify-between items-end">
                        <span className="text-[10px] tracking-[0.2em] text-[#A89C86] uppercase">RECENT GAMES</span>
                    </div>
                    {recentGames.length === 0 ? (
                        <div className="py-2 text-[10px] text-[#A89C86]/50 tracking-widest">No recent games.</div>
                    ) : (
                        <div className="flex flex-col gap-0">
                            {recentGames.slice(0, 3).map(r => {
                                const isWhite = r.white_id === user.id;
                                const opponent = isWhite ? r.black_player : r.white_player;
                                const iWon = (isWhite && r.winner === 'white_wins') || (!isWhite && r.winner === 'black_wins');
                                const isDraw = r.winner === 'draw';
                                return (
                                    <div key={r.id} className="flex justify-between items-center py-3 border-b border-[#A89C86]/10 text-xs tracking-widest">
                                        <span className="text-[#E8E2D7] truncate max-w-[150px]">{opponent}</span>
                                        <span className={\`text-[10px] \${iWon ? 'text-[#B39A62]' : isDraw ? 'text-[#A89C86]' : 'text-[#A89C86]/50'}\`}>
                                            {iWon ? 'WIN' : isDraw ? 'DRAW' : 'LOSS'}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            <div className="shrink-0 w-full max-w-lg mx-auto flex flex-wrap justify-center sm:justify-between items-center border-t border-[#A89C86]/20 pt-6 pb-2 text-[10px] tracking-[0.2em] text-[#A89C86] gap-y-4 z-10">
                <div className="flex gap-6 justify-center w-full sm:w-auto">
                    <button onClick={() => { setShowReplays(true); loadReplays(replayCategory); }} className="hover:text-[#E8E2D7] transition-colors uppercase">REPLAYS</button>
                    <button onClick={() => { setShowLeaderboard(true); loadLeaderboard(); }} className="hover:text-[#E8E2D7] transition-colors uppercase">RANKINGS</button>
                    <button onClick={() => setShowFriends(true)} className="hover:text-[#E8E2D7] transition-colors uppercase">FRIENDS</button>
                </div>
                <button onClick={() => setShowAccount(true)} className="hover:text-[#E8E2D7] transition-colors uppercase w-full sm:w-auto text-center">ACCOUNT</button>
            </div>
        </div>
    );
}
`;

fs.writeFileSync('src/components/LevelSelect.tsx', beforeReturn + newReturnBlock);
console.log('Rewrote LevelSelect.tsx with new minimalist Home layout');
