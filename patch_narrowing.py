import sys
import re

def remove_json_btn(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        text = f.read()

    # The button starts with <button and ends with </button> and contains JSON.stringify
    # Let's find it with regex
    json_btn_regex = r"<button[^>]*onClick=\{\(\) => \{\s*const dataStr.*?</button>"
    text = re.sub(json_btn_regex, "", text, flags=re.DOTALL)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(text)

remove_json_btn('src/components/LocalGameBoard.tsx')
remove_json_btn('src/components/OnlineGameBoard.tsx')

def patch_quantum_piece():
    with open('src/components/QuantumPieceUI.tsx', 'r', encoding='utf-8') as f:
        text = f.read()

    # Need to add import { useState, useEffect, useRef } from 'react'; if not exists
    # Or just use React.useState etc.
    
    # Add states and effect
    old_start = """export const QuantumPieceUI: React.FC<QuantumPieceProps> = ({ player, probabilities, candidates, isSelected, isOpponentSelected, onClick, promotedTo, responsive = false }) => {
    const possibleTypes = (Object.keys(probabilities) as PieceType[]).filter(type => candidates ? candidates.has(type) : probabilities[type] > 0);"""
    
    new_start = """export const QuantumPieceUI: React.FC<QuantumPieceProps> = ({ player, probabilities, candidates, isSelected, isOpponentSelected, onClick, promotedTo, responsive = false }) => {
    const possibleTypes = (Object.keys(probabilities) as PieceType[]).filter(type => candidates ? candidates.has(type) : probabilities[type] > 0);
    
    const [flash, setFlash] = React.useState(false);
    const prevLen = React.useRef(possibleTypes.length);
    React.useEffect(() => {
        if (possibleTypes.length < prevLen.current && possibleTypes.length > 0) {
            setFlash(true);
            const timer = setTimeout(() => setFlash(false), 1500);
            prevLen.current = possibleTypes.length;
            return () => clearTimeout(timer);
        }
        prevLen.current = possibleTypes.length;
    }, [possibleTypes.length]);"""

    if "const [flash" not in text:
        text = text.replace(old_start, new_start)

    # Add style for flash
    old_style = """                .quantum-icon {
                    animation: quantize 3s infinite ease-in-out;
                }
            `}</style>"""
    new_style = """                .quantum-icon {
                    animation: quantize 3s infinite ease-in-out;
                }
                @keyframes identity-flash {
                    0% { box-shadow: 0 0 0 0 rgba(212, 184, 114, 0.8); }
                    50% { box-shadow: 0 0 20px 10px rgba(212, 184, 114, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(212, 184, 114, 0); }
                }
                .flash-effect {
                    animation: identity-flash 1.5s ease-out;
                    border-color: #D4B872 !important;
                }
            `}</style>"""
    if "@keyframes identity-flash" not in text:
        text = text.replace(old_style, new_style)

    # Add flash-effect class to the div
    old_div = "${isSelected || isOpponentSelected ? `ring-2 ring-offset-2 ring-offset-[#11100E] ${highlightRing} scale-105 z-10` : 'hover:scale-105'}"
    new_div = "${isSelected || isOpponentSelected ? `ring-2 ring-offset-2 ring-offset-[#11100E] ${highlightRing} scale-105 z-10` : 'hover:scale-105'}\n                    ${flash ? 'flash-effect z-20' : ''}"
    text = text.replace(old_div, new_div)

    with open('src/components/QuantumPieceUI.tsx', 'w', encoding='utf-8') as f:
        f.write(text)

patch_quantum_piece()
print("Patched json button and narrowing effect")
