import sys
import re

with open('src/app/page.tsx', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

# Insert the state and effect right after const [timeControl, setTimeControl] = useState<TimeControl>('10m');
injection = """
    const [hideSettingsGlobal, setHideSettingsGlobal] = useState(false);
    useEffect(() => {
        const handleHide = (e: any) => setHideSettingsGlobal(e.detail);
        window.addEventListener('hide-settings', handleHide);
        return () => window.removeEventListener('hide-settings', handleHide);
    }, []);
"""

text = text.replace("const [timeControl, setTimeControl] = useState<TimeControl>('10m');", "const [timeControl, setTimeControl] = useState<TimeControl>('10m');" + injection)

# Modify the Settings button
text = text.replace("className={ixed right-4 top-4 z-40 flex gap-2 items-center pointer-events-auto }", "className={ixed right-4 top-4 z-40 flex gap-2 items-center pointer-events-auto }")

with open('src/app/page.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print("page.tsx patched.")
