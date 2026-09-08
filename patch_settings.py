import sys

with open('src/app/page.tsx', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

text = text.replace('<div className="fixed right-4 top-4 z-40 flex gap-2 items-center">', '<div className={ixed right-4 top-4 z-40 flex gap-2 items-center }>')
text = text.replace('<div className="fixed right-4 top-4 z-40 flex gap-2 items-center pointer-events-auto">', '<div className={ixed right-4 top-4 z-40 flex gap-2 items-center pointer-events-auto }>')

with open('src/app/page.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print("Settings button patched cleanly.")
