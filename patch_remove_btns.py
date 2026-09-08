import sys

# 1. Update Board3D.tsx for piece size
with open('src/components/Board3D.tsx', 'r', encoding='utf-8') as f:
    t3d = f.read()

# Fix scale and remove distanceFactor
old_html = """<Billboard follow={true} lockX={false} lockY={false} lockZ={false} position={[0, 0.1, 0]}>
                    <group scale={[0.035, 0.035, 0.035]}>
                        <Html transform distanceFactor={10} zIndexRange={[100, 0]} pointerEvents="none" center>
                            <div style={{ pointerEvents: 'none', transform: 'none' }}>"""
new_html = """<Billboard follow={true} lockX={false} lockY={false} lockZ={false} position={[0, 0.1, 0]}>
                    <group scale={[0.025, 0.025, 0.025]}>
                        <Html transform zIndexRange={[100, 0]} pointerEvents="none" center>
                            <div style={{ pointerEvents: 'none', transform: 'none' }}>"""
t3d = t3d.replace(old_html, new_html)

# Also let's remove distanceFactor if it was written differently
if 'distanceFactor' in t3d:
    print("WARNING: distanceFactor still in t3d!")

with open('src/components/Board3D.tsx', 'w', encoding='utf-8') as f:
    f.write(t3d)

# 2. Update LocalGameBoard.tsx
with open('src/components/LocalGameBoard.tsx', 'r', encoding='utf-8') as f:
    tlocal = f.read()

# Remove Settings button
settings_btn = """<button onClick={() => window.dispatchEvent(new CustomEvent('show-settings'))} className="w-10 h-10 md:w-12 md:h-12 bg-black/60 rounded-lg flex items-center justify-center border border-[#B39A62]/50 hover:bg-black/80 transition-all text-gray-300">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                </button>"""
tlocal = tlocal.replace(settings_btn, "")

# Remove Hint button
hint_btn = """{!roomId && cpuLevel !== undefined && cpuLevel > 0 && (
                    <button onClick={requestHint} disabled={isRequestingHint || currentTurn !== myRole || !!winner} className={w-10 h-10 md:w-12 md:h-12 rounded-lg flex items-center justify-center border transition-all text-gray-300  }>
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill={hintMove ? "#eab308" : "none"} stroke={hintMove ? "#eab308" : "currentColor"} strokeWidth="2"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="M4 12H2"></path><path d="M22 12h-2"></path><path d="M19.07 4.93l-1.41 1.41"></path><path d="M6.34 17.66l-1.41 1.41"></path><path d="M19.07 19.07l-1.41-1.41"></path><path d="M6.34 6.34l-1.41 1.41"></path></svg>
                    </button>
                )}"""
tlocal = tlocal.replace(hint_btn, "")

with open('src/components/LocalGameBoard.tsx', 'w', encoding='utf-8') as f:
    f.write(tlocal)

# 3. Update OnlineGameBoard.tsx
with open('src/components/OnlineGameBoard.tsx', 'r', encoding='utf-8') as f:
    tonline = f.read()

tonline = tonline.replace(settings_btn, "")

with open('src/components/OnlineGameBoard.tsx', 'w', encoding='utf-8') as f:
    f.write(tonline)

print("Removed Settings and Hint buttons. Fixed 2D piece scale.")
