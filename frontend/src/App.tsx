import { useState } from 'react'
import { SignToTextMode } from './modes/SignToTextMode'
import { TextToSignMode } from './modes/TextToSignMode'

type Mode = 'sign-to-text' | 'text-to-sign'

function App() {
  const [mode, setMode] = useState<Mode>('sign-to-text')

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">IsyaratLive</h1>
        <nav className="flex gap-1 rounded-lg bg-gray-100 p-1">
          <button
            className={`rounded-md px-3 py-1.5 text-sm ${
              mode === 'sign-to-text' ? 'bg-white shadow' : 'text-gray-500'
            }`}
            onClick={() => setMode('sign-to-text')}
          >
            Isyarat → Teks
          </button>
          <button
            className={`rounded-md px-3 py-1.5 text-sm ${
              mode === 'text-to-sign' ? 'bg-white shadow' : 'text-gray-500'
            }`}
            onClick={() => setMode('text-to-sign')}
          >
            Teks → Isyarat
          </button>
        </nav>
      </header>

      <main>{mode === 'sign-to-text' ? <SignToTextMode /> : <TextToSignMode />}</main>
    </div>
  )
}

export default App
