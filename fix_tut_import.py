import sys

with open('src/components/InteractiveTutorial.tsx', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

if "import { tutorialDict } from '@/locales/rulesDict';" not in text:
    text = text.replace("import { Board3D } from './Board3D';", "import { Board3D } from './Board3D';\nimport { tutorialDict } from '@/locales/rulesDict';")

with open('src/components/InteractiveTutorial.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print("Import added to InteractiveTutorial.")
