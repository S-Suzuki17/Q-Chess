import sys

with open('src/components/LevelSelect.tsx', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

injection = """
    const anyModalOpen = showPlayMenu || showReplays || showLeaderboard || showFriends || showAccount || showTutorial || showAdModal || !!pendingAction || showLiveMatches;
    React.useEffect(() => {
        window.dispatchEvent(new CustomEvent('hide-settings', { detail: anyModalOpen }));
    }, [anyModalOpen]);
"""

text = text.replace("React.useEffect(() => { getGameRecords(3, user.id).then(setRecentGames); }, [user.id]);", "React.useEffect(() => { getGameRecords(3, user.id).then(setRecentGames); }, [user.id]);" + injection)

with open('src/components/LevelSelect.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print("LevelSelect patched.")
