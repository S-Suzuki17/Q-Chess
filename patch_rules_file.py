import sys

with open('src/app/rules/page.tsx', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

import re
# Remove everything between const content = { and const c = content[lang];
text = re.sub(r'const content = \{.*?(?=  const c = content\[lang\];)', '', text, flags=re.DOTALL)
text = text.replace("import { LANGUAGES } from '@/locales/dict';", "import { LANGUAGES } from '@/locales/dict';\nimport { rulesDict } from '@/locales/rulesDict';")
text = text.replace("const c = content[lang];", "const c = rulesDict[lang as keyof typeof rulesDict] || rulesDict['en'];")

with open('src/app/rules/page.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print("Patched rules/page.tsx")
