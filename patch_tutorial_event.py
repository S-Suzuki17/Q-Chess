import sys

with open('src/components/InteractiveTutorial.tsx', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

injection = """
    React.useEffect(() => {
        window.dispatchEvent(new CustomEvent('hide-settings', { detail: true }));
        return () => window.dispatchEvent(new CustomEvent('hide-settings', { detail: false }));
    }, []);
"""

text = text.replace("const [step, setStep] = React.useState(0);", "const [step, setStep] = React.useState(0);" + injection)

with open('src/components/InteractiveTutorial.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print("InteractiveTutorial patched.")
