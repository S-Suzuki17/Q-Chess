import sys

with open('src/app/rules/page.tsx', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

old_effect = """  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedLang = localStorage.getItem('qg_language');
      if (savedLang === 'ja') setLang('ja');
    }
  }, []);"""

new_effect = """  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedLang = localStorage.getItem('qg_language');
      if (savedLang === 'ja') {
        setLang('ja');
      } else if (!savedLang) {
        const browserLang = navigator.language.split('-')[0];
        if (browserLang === 'ja') setLang('ja');
      }
    }
  }, []);"""

text = text.replace(old_effect, new_effect)

with open('src/app/rules/page.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print("Rules language auto-detection patched.")
