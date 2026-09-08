import sys

with open('src/app/rules/page.tsx', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

text = text.replace("import Link from 'next/link';", "import Link from 'next/link';\nimport { rulesDict } from '@/locales/rulesDict';")

with open('src/app/rules/page.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print("Import added.")
