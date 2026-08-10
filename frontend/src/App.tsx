import { lazy, Suspense, useState } from 'react'
import { RoomLocal } from './rooms/RoomLocal'
import { DictionaryModal } from './components/DictionaryModal'
import { LandingPage } from './components/LandingPage'

const RoomRemote = lazy(() => import('./rooms/RoomRemote').then((m) => ({ default: m.RoomRemote })))
const AccuracyTestPanel = lazy(() =>
  import('./components/AccuracyTestPanel').then((m) => ({ default: m.AccuracyTestPanel })),
)

type ViewMode = 'landing' | 'local' | 'remote'

function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('landing')
  const [isDictionaryOpen, setIsDictionaryOpen] = useState(false)
  const [isAccuracyOpen, setIsAccuracyOpen] = useState(false)
  const [wordToSign, setWordToSign] = useState<string>('')

  const handleSelectWord = (word: string) => {
    setWordToSign(word)
    setViewMode('local')
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased pb-12">
      {/* Top Navigation Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/80">
        <div className="mx-auto max-w-6xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <button 
            onClick={() => setViewMode('landing')}
            className="flex items-center gap-3 group text-left transition-opacity hover:opacity-90"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 overflow-hidden border border-slate-200">
              <img src="/logo.jpg" alt="IsyaratLive" className="h-full w-full object-cover" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-slate-900 leading-none">IsyaratLive</h1>
                <span className="badge-active text-[10px] py-0 px-2">v2.4 Ready</span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">
                Penerjemah BISINDO Real-Time
              </p>
            </div>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <nav className="flex gap-1 rounded-lg bg-slate-100/80 p-1 border border-slate-200/80">
              <button
                className={viewMode === 'landing' ? 'tab-pill-active' : 'tab-pill'}
                onClick={() => setViewMode('landing')}
              >
                Beranda
              </button>
              <button
                className={viewMode === 'local' ? 'tab-pill-active' : 'tab-pill'}
                onClick={() => setViewMode('local')}
              >
                Room Lokal
              </button>
              <button
                className={viewMode === 'remote' ? 'tab-pill-active' : 'tab-pill'}
                onClick={() => setViewMode('remote')}
              >
                Room Remote
              </button>
            </nav>

            <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block"></div>

            <button onClick={() => setIsDictionaryOpen(true)} className="btn-secondary text-xs">
              32 Kata
            </button>
            <button onClick={() => setIsAccuracyOpen(true)} className="btn-secondary text-xs">
              Uji Akurasi
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-6xl px-4 py-6">
        {viewMode === 'landing' && (
          <LandingPage
            onStartLocalRoom={() => setViewMode('local')}
            onStartRemoteRoom={() => setViewMode('remote')}
            onOpenDictionary={() => setIsDictionaryOpen(true)}
            onOpenAccuracyTest={() => setIsAccuracyOpen(true)}
          />
        )}

        {viewMode === 'local' && (
          <RoomLocal onOpenDictionaryModal={() => setIsDictionaryOpen(true)} wordToSign={wordToSign} />
        )}

        {viewMode === 'remote' && (
          <Suspense fallback={<p className="text-sm text-slate-500 text-center py-12">Memuat Room Remote P2P…</p>}>
            <RoomRemote onOpenDictionaryModal={() => setIsDictionaryOpen(true)} />
          </Suspense>
        )}
      </main>

      {/* Modals */}
      <DictionaryModal
        isOpen={isDictionaryOpen}
        onClose={() => setIsDictionaryOpen(false)}
        onSelectWordForTextToSign={handleSelectWord}
      />
      {isAccuracyOpen && (
        <Suspense fallback={null}>
          <AccuracyTestPanel isOpen={isAccuracyOpen} onClose={() => setIsAccuracyOpen(false)} />
        </Suspense>
      )}
    </div>
  )
}

export default App

