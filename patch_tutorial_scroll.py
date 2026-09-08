import sys

with open('src/components/InteractiveTutorial.tsx', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

# Replace the outer wrapper to allow scrolling on small devices and prevent shrinking
old_wrapper = 'className="w-full max-w-4xl bg-[#191714] border-2 border-[#B39A62]/30 rounded-xl flex flex-col md:flex-row shadow-2xl relative overflow-hidden"'
new_wrapper = 'className="w-full max-w-4xl max-h-[95dvh] overflow-y-auto bg-[#191714] border-2 border-[#B39A62]/30 rounded-xl flex flex-col md:flex-row shadow-2xl relative"'

text = text.replace(old_wrapper, new_wrapper)

# Add flex-shrink-0 to the board container so it stays a full square on mobile
old_board = 'className="w-full md:w-1/2 p-0 bg-[#0b0c10] flex items-center justify-center relative aspect-square md:aspect-auto md:min-h-full"'
new_board = 'className="w-full flex-shrink-0 md:w-1/2 p-0 bg-[#0b0c10] flex items-center justify-center relative aspect-square md:aspect-auto md:min-h-full"'

text = text.replace(old_board, new_board)

with open('src/components/InteractiveTutorial.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print("InteractiveTutorial scroll patched.")
