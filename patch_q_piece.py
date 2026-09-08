import sys

with open('src/components/QuantumPieceUI.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Add isOpponentSelected to props
old_props = """    isSelected: boolean;
    onClick: () => void;"""
new_props = """    isSelected: boolean;
    isOpponentSelected?: boolean;
    onClick: () => void;"""
text = text.replace(old_props, new_props)

# 2. Add isOpponentSelected to function signature
old_sig = """export const QuantumPieceUI: React.FC<QuantumPieceProps> = ({ player, probabilities, candidates, isSelected, onClick, promotedTo, responsive = false }) => {"""
new_sig = """export const QuantumPieceUI: React.FC<QuantumPieceProps> = ({ player, probabilities, candidates, isSelected, isOpponentSelected, onClick, promotedTo, responsive = false }) => {"""
text = text.replace(old_sig, new_sig)

# 3. Update highlight ring color
old_ring = "const highlightRing = isWhite ? 'ring-[#B39A62]' : 'ring-[#B39A62]';"
new_ring = "const highlightRing = isOpponentSelected ? 'ring-red-500' : (isWhite ? 'ring-[#B39A62]' : 'ring-[#B39A62]');"
text = text.replace(old_ring, new_ring)

# 4. Update the actual class
old_class = "${isSelected ? `ring-2 ring-offset-2 ring-offset-[#11100E] ${highlightRing} scale-105 z-10` : 'hover:scale-105'}"
new_class = "${isSelected || isOpponentSelected ? `ring-2 ring-offset-2 ring-offset-[#11100E] ${highlightRing} scale-105 z-10` : 'hover:scale-105'}"
text = text.replace(old_class, new_class)

with open('src/components/QuantumPieceUI.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print("Patched QuantumPieceUI")
