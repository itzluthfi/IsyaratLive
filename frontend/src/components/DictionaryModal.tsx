import { useState } from 'react'
import { SIGN_DICTIONARY_DATA, type SignLabelInfo } from '../lib/signDictionary'

interface DictionaryModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectWordForTextToSign?: (word: string) => void
}

export function DictionaryModal({ isOpen, onClose, onSelectWordForTextToSign }: DictionaryModalProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('Semua')
  const [previewItem, setPreviewItem] = useState<SignLabelInfo | null>(null)

  if (!isOpen) return null

  const categories = ['Semua', 'Pertanyaan', 'Warna', 'Waktu', 'Sosial', 'Aktivitas']

  const filteredData = SIGN_DICTIONARY_DATA.filter((item) => {
    const matchesSearch =
      item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.english.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesCategory = selectedCategory === 'Semua' || item.category === selectedCategory

    return matchesSearch && matchesCategory
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm animate-fadeIn">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-100">
        {/* Header Modal */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-900 px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-400 text-xl font-bold border border-cyan-500/30">
              📖
            </span>
            <div>
              <h2 className="text-lg font-bold text-white">Daftar Kosakata Isyarat Terdaftar</h2>
              <p className="text-xs text-slate-400">
                Tersedia <span className="font-semibold text-cyan-400">32 Label Kosakata</span> yang didukung model AI & video peragaan
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-all"
          >
            ✕
          </button>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-6 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  selectedCategory === cat
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="relative min-w-[220px]">
            <input
              type="text"
              placeholder="Cari label (misal: Air, Makan)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
          </div>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredData.map((item) => (
              <div
                key={item.id}
                className="group relative flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs hover:border-cyan-400 hover:shadow-md transition-all"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-block rounded-md bg-cyan-50 px-2 py-0.5 text-[10px] font-bold text-cyan-700 border border-cyan-100">
                      Label {item.id}: {item.category}
                    </span>
                    <span className="text-[11px] font-medium italic text-slate-400">{item.english}</span>
                  </div>

                  <h3 className="mt-2 text-base font-bold text-slate-900 group-hover:text-cyan-700 transition-colors">
                    {item.label}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 leading-relaxed">{item.description}</p>
                </div>

                <div className="mt-4 flex items-center gap-2 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => setPreviewItem(item)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 active:scale-95 transition-all"
                  >
                    ▶️ Tonton Video
                  </button>

                  {onSelectWordForTextToSign && (
                    <button
                      onClick={() => {
                        onSelectWordForTextToSign(item.label)
                        onClose()
                      }}
                      className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 border border-emerald-200 hover:bg-emerald-100 active:scale-95 transition-all"
                      title="Tes kata di Teks -> Isyarat"
                    >
                      ✨ Tes
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {filteredData.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <span className="text-3xl">🔍</span>
              <p className="mt-2 text-sm font-semibold text-slate-700">Tidak ada label yang cocok dengan "{searchQuery}"</p>
              <p className="text-xs text-slate-400">Coba ubah kata kunci atau pilih kategori lain.</p>
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-6 py-3 text-xs text-slate-500">
          <span>Menampilkan {filteredData.length} dari 32 label kosakata</span>
          <button
            onClick={onClose}
            className="rounded-lg bg-slate-200 px-4 py-1.5 font-semibold text-slate-700 hover:bg-slate-300 transition-all"
          >
            Tutup
          </button>
        </div>
      </div>

      {/* Video Preview Popup inside Modal */}
      {previewItem && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md animate-fadeIn">
          <div className="relative flex w-full max-w-md flex-col rounded-2xl bg-white p-5 shadow-2xl border border-slate-100">
            <button
              onClick={() => setPreviewItem(null)}
              className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/70 text-white hover:bg-slate-900"
            >
              ✕
            </button>

            <div className="mb-3">
              <span className="rounded bg-cyan-100 px-2 py-0.5 text-xs font-bold text-cyan-800">
                {previewItem.category} • Label {previewItem.id}
              </span>
              <h3 className="mt-1 text-xl font-bold text-slate-900">{previewItem.label} ({previewItem.english})</h3>
            </div>

            <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-950 border border-slate-200 shadow-inner">
              <video
                src={previewItem.videoUrl}
                autoPlay
                loop
                muted
                playsInline
                controls
                className="h-full w-full object-contain"
              />
            </div>

            <p className="mt-3 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              💡 {previewItem.description}
            </p>

            <div className="mt-4 flex gap-2">
              {onSelectWordForTextToSign && (
                <button
                  onClick={() => {
                    onSelectWordForTextToSign(previewItem.label)
                    setPreviewItem(null)
                    onClose()
                  }}
                  className="flex-1 rounded-xl bg-cyan-600 py-2 text-xs font-bold text-white hover:bg-cyan-700 shadow-sm"
                >
                  🚀 Coba Kata ini di Teks → Isyarat
                </button>
              )}
              <button
                onClick={() => setPreviewItem(null)}
                className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
