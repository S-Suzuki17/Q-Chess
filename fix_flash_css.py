import sys
import re

with open('src/components/QuantumPieceUI.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

style_regex = r"<style>\{`.*?`\}</style>"
new_style = """<style>{`
                @keyframes quantum-jitter {
                    0% { transform: translate(0px, 0px) rotate(0deg); opacity: 0.6; }
                    33% { transform: translate(0.5px, -0.5px) rotate(1deg); opacity: 0.8; }
                    66% { transform: translate(-0.5px, 0.5px) rotate(-1deg); opacity: 0.5; }
                    100% { transform: translate(0px, 0px) rotate(0deg); opacity: 0.6; }
                }
                .quantum-icon {
                    animation: quantum-jitter 2s infinite alternate ease-in-out;
                    display: inline-block;
                }
                @keyframes identity-flash {
                    0% { box-shadow: 0 0 0 0 rgba(212, 184, 114, 0.8); }
                    50% { box-shadow: 0 0 20px 10px rgba(212, 184, 114, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(212, 184, 114, 0); }
                }
                .flash-effect {
                    animation: identity-flash 1.5s ease-out !important;
                    border-color: #D4B872 !important;
                }
            `}</style>"""

text = re.sub(style_regex, new_style, text, flags=re.DOTALL)

with open('src/components/QuantumPieceUI.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

print("Fixed flash style")
