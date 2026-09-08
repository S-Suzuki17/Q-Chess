import sys

with open('src/app/page.tsx', 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

for i in range(len(lines)):
    if 'right-4' in lines[i] and 'top-4' in lines[i] and '<div' in lines[i]:
        if 'pointer-events-auto' in lines[i]:
            lines[i] = r'                <div className={ixed right-4 top-4 z-40 flex gap-2 items-center pointer-events-auto }>' + '\n'
        else:
            lines[i] = r'                <div className={ixed right-4 top-4 z-40 flex gap-2 items-center }>' + '\n'

with open('src/app/page.tsx', 'w', encoding='utf-8') as f:
    f.writelines(lines)
