import sys
import re

with open('src/components/InteractiveTutorial.tsx', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

text = text.replace('className="w-full md:w-1/2 p-0 bg-[#0b0c10] flex items-center justify-center relative min-h-[300px]"', 'className="w-full md:w-1/2 p-0 bg-[#0b0c10] flex items-center justify-center relative aspect-square md:aspect-auto md:min-h-full"')

text = text.replace('className="w-full h-full min-h-[300px] md:min-h-full"', 'className="w-full h-full md:min-h-full"')

with open('src/components/InteractiveTutorial.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print("Tutorial CSS patched.")
