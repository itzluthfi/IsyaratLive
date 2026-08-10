import { useState } from 'react'
import { SignToTextMode } from './modes/SignToTextMode'
import { TextToSignMode } from './modes/TextToSignMode'
import { DictionaryModal } from './components/DictionaryModal'

type Mode = 'sign-to-text' | 'text-to-sign'

function App() {
  const [mode, setMode] = useState<Mode>('sign-to-text')
  const [isDictionaryOpen, setIsDictionaryOpen] = useState(false)
  const [selectedWordForTextToSign, setSelectedWordForTextToSign] = useState<string>('')

  const handleSelectWord = (word: string) => {
    setSelectedWordForTextToSign(word)
    setMode('text-to-sign')
  }

  return (
    <div className="min-h-screen bg-slate-50/50 text-slate-900 font-sans antialiased pb-12">
      {/* Top Banner Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
        <div className="mx-auto max-w-6xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-600 to-emerald-500 text-white font-black text-xl shadow-md">
              🖐️
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-900 flex items-center gap-2">
                IsyaratLive
                <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-bold text-cyan-800 border border-cyan-200">
                  v2.0 Motion-AI
                </span>
              </h1>
              <p className="text-[11px] text-slate-500 font-medium">
                Penerjemah Bahasa Isyarat Indonesia (BISINDO) Real-Time
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Mode Switcher */}
            <nav className="flex gap-1 rounded-xl bg-slate-100/80 p-1 border border-slate-200/60">
              <button
                className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
                  mode === 'sign-to-text'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                onClick={() => setMode('sign-to-text')}
              >
                🖐️ Isyarat → Teks
              </button>
              <button
                className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
                  mode === 'text-to-sign'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                onClick={() => setMode('text-to-sign')}
              >
                🎬 Teks → Isyarat
              </button>
            </nav>

            {/* Tombol Buka Kamus Kosakata */}
            <button
              onClick={() => setIsDictionaryOpen(true)}
              className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-800 active:scale-95 transition-all"
            >
              📖 Informasi 32 Label
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-6xl px-4 py-6">
        {mode === 'sign-to-text' ? (
          <SignToTextMode onOpenDictionaryModal={() => setIsDictionaryOpen(true)} />
        ) : (
          <TextToSignMode
            onOpenDictionaryModal={() => setIsDictionaryOpen(true)}
            initialInput={selectedWordForTextToSign}
          />
        )}
      </main>

      {/* Modal Daftar Kosakata (32 Label Informasi) */}
      <DictionaryModal
        isOpen={isDictionaryOpen}
        onClose={() => setIsDictionaryOpen(false)}
        onSelectWordForTextToSign={handleSelectWord}
      />
    </div>
  )
}

export default App
