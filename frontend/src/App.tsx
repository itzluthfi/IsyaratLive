import { lazy, Suspense, useState } from 'react'
import { Home, Video, PhoneCall, BookOpen } from 'lucide-react'
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
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans antialiased">
      {/* Top Navigation Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/80">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <button 
            onClick={() => setViewMode('landing')}
            className="flex items-center gap-3 group text-left transition-opacity hover:opacity-90"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 overflow-hidden border border-slate-200">
              <img src="/logo.jpg" alt="IsyaRasa" className="h-full w-full object-cover" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-slate-900 leading-none">IsyaRasa</h1>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                Penerjemah Bahasa Isyarat
              </p>
            </div>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <nav className="flex gap-1 rounded-lg bg-slate-100/80 p-1 border border-slate-200/80">
              <button
                className={viewMode === 'landing' ? 'tab-pill-active flex items-center gap-1.5' : 'tab-pill flex items-center gap-1.5'}
                onClick={() => setViewMode('landing')}
              >
                <Home className="w-3.5 h-3.5" /> Beranda
              </button>
              <button
                className={viewMode === 'local' ? 'tab-pill-active flex items-center gap-1.5' : 'tab-pill flex items-center gap-1.5'}
                onClick={() => setViewMode('local')}
              >
                <Video className="w-3.5 h-3.5" /> Room Lokal
              </button>
              <button
                className={viewMode === 'remote' ? 'tab-pill-active flex items-center gap-1.5' : 'tab-pill flex items-center gap-1.5'}
                onClick={() => setViewMode('remote')}
              >
                <PhoneCall className="w-3.5 h-3.5" /> Room Remote
              </button>
            </nav>

            <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block"></div>

            <button onClick={() => setIsDictionaryOpen(true)} className="btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-3">
              <BookOpen className="w-3.5 h-3.5" /> Kamus 32 Kata
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full mx-auto max-w-[1440px] px-4 sm:px-6 py-6">
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

      {/* Clean Dataset License Footer */}
      <footer className="w-full border-t border-slate-200/80 bg-white py-4 mt-auto">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 flex items-center justify-start text-xs text-slate-500 font-medium">
          <span>
            Model AI dilatih menggunakan Dataset Open Source{' '}
            <a 
              href="https://www.kaggle.com/datasets/achmadnoer/alfabet-bisindo" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="font-semibold text-slate-700 hover:text-teal-600 underline underline-offset-2 transition-colors"
            >
              BISINDO di Kaggle
            </a>
          </span>
        </div>
      </footer>

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

