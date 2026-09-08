import sys
import re

with open('src/app/rules/page.tsx', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

# Fix Japanese dictionary to use ": " instead of full-width colon
ja_dict = """    ja: {
      back: "← もどる",
      title: "Q-GAMBIT: ルール説明",
      intro: "Q-GAMBIT（キュー・ギャンビット）へようこそ！このゲームは、すべての駒の正体が隠された状態からスタートする、推理と心理戦のチェスです。情報こそが最大の武器であり、自分の「王様（キング）」の正体を隠し通すことが勝利へのカギとなります。",
      sec1Title: "1. 駒の正体は動かすまでわからない！",
      sec1p1: "ゲーム開始時、すべての駒は全く同じ見た目をしています。どれがルークで、どれがナイトなのかは誰にもわかりません。",
      sec1p2: "駒の正体は「動かし方」によって少しずつバレていきます。例えば、大きく斜めに動いた駒は「斜めに動ける駒（ビショップかクイーン）」のどちらかだと確定します。ありえない可能性は自動的に消去されていきます。",
      sec2Title: "2. 正体が確定する瞬間",
      sec2p1: "駒を動かすたびに、その駒が何者であるかが絞り込まれていきます。",
      sec2li1: "移動できるかチェック: 選んだ駒の可能性の中に、その動きができる駒が残っていれば移動できます。",
      sec2li2: "可能性の消去: その動きができない駒の可能性は、リストから完全に消去されます。",
      sec2li3: "正体の確定（オープン）: 可能性が「残り１つ」になると、その駒の正体が確定し、両方のプレイヤーに本当の姿が公開されます。",
      sec2rule: "重要ルール: 残っているどの可能性でも「絶対にできない動き」をしようとした場合は、エラーとなり動かすことができません。",
      sec3Title: "3. 勝利条件と戦略",
      sec3p1: "勝利条件は普通のチェスと同じで、「相手のキングを倒すこと」です。ただし、最初はキングも隠れているため、相手のキングを探し出すことが最初の目標になります。",
      sec3BoxTitle: "最強の戦術：キングを隠し通せ",
      sec3Boxp1: "このゲームで最も重要なのは、「自分のキングがどれかバレないようにすること」です。",
      sec3Boxli1: "キングを不用意に動かさない: ナナメに1マスだけ動くなど、キング特有の動きをすると、正体が絞り込まれて相手に狙われやすくなります。",
      sec3Boxli2: "あえてウソの動きをする: キングのフリをして別の駒を動かし、相手の攻撃を誘うのも強力な戦術です。",
      sec3Boxli3: "連鎖に注意: 例えばクイーンの正体が確定すると、「他の駒はクイーンではない」ことが確定し、他の駒の正体まで連鎖してバレてしまうことがあります。",
      sec4Title: "4. 駒を取る ＆ プロモーション",
      sec4p1: "駒を取る: 相手の駒を取った場合、その駒の正体が完全にバレる前に盤面から消滅します。何を倒したのかは最後までわからないこともあります（もし倒したのがキングなら、その瞬間にあなたの勝利です！）。",
      sec4p2: "プロモーション（昇格）: 相手の一番奥のマスにたどり着いた時、その駒が「ポーン（歩兵）」である可能性が残っていた場合、ポーンとして確定し、クイーンなどに変身することができます。",
      sec5Title: "5. ゲームの特徴",
      sec5p1: "Q-GAMBITは、「見えない情報」を推理しながら戦う新感覚のボードゲームです。普通のチェスとは違い、相手を騙す心理戦が楽しめます。",
      sec5p2: "コンピュータ（AI）との対戦や、世界中のプレイヤーとのオンライン対戦で、あなたの推理力と戦略を試してみてください！",
      footer: "バグ報告やお問い合わせはGitHubまでお願いします。",
      playTutorial: "実際の盤面でチュートリアルを見る"
    }"""

text = re.sub(r'    ja: \{.*?\n    \}', ja_dict, text, flags=re.DOTALL)

# Add playTutorial to en
text = text.replace('footer: "For bug reports or inquiries, please visit our GitHub."\n    },', 'footer: "For bug reports or inquiries, please visit our GitHub.",\n      playTutorial: "Play Interactive Tutorial"\n    },')

# Now add imports and language toggle UI
imports_replacement = """import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { AdBanner } from '../../components/AdBanner';
import { InteractiveTutorial } from '../../components/InteractiveTutorial';"""

text = text.replace("import { AdBanner } from '../../components/AdBanner';", imports_replacement)

# Add showTutorial state
text = text.replace("const [lang, setLang] = useState<'en' | 'ja'>('en');", "const [lang, setLang] = useState<'en' | 'ja'>('en');\n  const [showTutorial, setShowTutorial] = useState(false);")

# Add Language Toggle and Tutorial Button UI
header_ui = """      <div className="max-w-4xl mx-auto pb-16">
        <div className="flex justify-between items-center mb-8">
            <Link href="/" className="text-[#D4B872] hover:text-white transition-colors text-sm inline-block tracking-widest font-bold">
            {c.back}
            </Link>
            <div className="flex gap-4 items-center">
                <button 
                    onClick={() => setShowTutorial(true)}
                    className="px-4 py-2 bg-[#B39A62]/20 border border-[#B39A62] text-[#D4B872] text-sm font-bold tracking-widest rounded hover:bg-[#B39A62] hover:text-[#11100E] transition-colors"
                >
                    {c.playTutorial}
                </button>
                <div className="flex gap-2">
                    <button onClick={() => { setLang('en'); localStorage.setItem('qg_language', 'en'); }} className={	ext-sm font-bold px-2 py-1 rounded }>EN</button>
                    <button onClick={() => { setLang('ja'); localStorage.setItem('qg_language', 'ja'); }} className={	ext-sm font-bold px-2 py-1 rounded }>JA</button>
                </div>
            </div>
        </div>

        <h1 className="text-4xl md:text-5xl font-extrabold text-[#D4B872] mb-6 tracking-wider">"""

text = re.sub(r'      <div className="max-w-4xl mx-auto pb-16">.*?<h1 className="text-4xl md:text-5xl font-extrabold text-\[#D4B872\] mb-6 tracking-wider">', header_ui, text, flags=re.DOTALL)

# Add InteractiveTutorial at the bottom
tutorial_modal = """
      </div>
      {showTutorial && <InteractiveTutorial lang={lang} onClose={() => setShowTutorial(false)} />}
    </div>
"""
text = text.replace("      </div>\n    </div>", tutorial_modal)

with open('src/app/rules/page.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print("UI patched.")
