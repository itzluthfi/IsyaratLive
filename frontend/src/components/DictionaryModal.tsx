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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm animate-fadeIn">
      <div className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-xl overflow-hidden border border-slate-200">
        {/* Header Modal */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 text-slate-900">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Kamus Kosakata BISINDO</h2>
              <p className="text-xs text-slate-500">
                <span className="font-semibold text-slate-800">32 Label Kosakata</span> yang didukung model AI & video peragaan
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-all"
          >
            ✕
          </button>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-5 py-2.5">
          <div className="flex flex-wrap items-center gap-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                  selectedCategory === cat
                    ? 'bg-slate-900 text-white shadow-xs'
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
              placeholder="Cari label (Air, Makan)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white py-1.5 px-3 text-xs text-slate-900 placeholder-slate-400 focus:border-slate-800 focus:outline-none"
            />
          </div>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredData.map((item) => (
              <div
                key={item.id}
                className="group relative flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-3.5 hover:border-slate-300 transition-all"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 border border-slate-200">
                      ID {item.id} • {item.category}
                    </span>
                    <span className="text-[11px] font-mono italic text-slate-400">{item.english}</span>
                  </div>

                  <h3 className="mt-2 text-base font-bold text-slate-900 group-hover:text-teal-700 transition-colors">
                    {item.label}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 leading-relaxed line-clamp-2">{item.description}</p>
                </div>

                <div className="mt-4 flex items-center gap-2 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => setPreviewItem(item)}
                    className="btn-primary flex-1 text-xs py-1.5"
                  >
                    Tonton Video
                  </button>

                  {onSelectWordForTextToSign && (
                    <button
                      onClick={() => {
                        onSelectWordForTextToSign(item.label)
                        onClose()
                      }}
                      className="btn-secondary text-xs py-1.5 px-2.5"
                      title="Tes kata di Teks -> Isyarat"
                    >
                      Tes
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {filteredData.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="mt-2 text-sm font-semibold text-slate-700">Tidak ada label yang cocok dengan "{searchQuery}"</p>
              <p className="text-xs text-slate-400">Coba ubah kata kunci atau pilih kategori lain.</p>
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-2.5 text-xs text-slate-500">
          <span>Menampilkan {filteredData.length} dari 32 label</span>
          <button
            onClick={onClose}
            className="btn-secondary text-xs py-1"
          >
            Tutup
          </button>
        </div>
      </div>

      {/* Video Preview Popup inside Modal */}
      {previewItem && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fadeIn">
          <div className="relative flex w-full max-w-md flex-col rounded-xl bg-white p-5 shadow-2xl border border-slate-200">
            <button
              onClick={() => setPreviewItem(null)}
              className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
            >
              ✕
            </button>

            <div className="mb-3">
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 border border-slate-200">
                {previewItem.category} • ID {previewItem.id}
              </span>
              <h3 className="mt-1 text-lg font-bold text-slate-900">{previewItem.label} ({previewItem.english})</h3>
            </div>

            <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-slate-950 border border-slate-200">
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
              {previewItem.description}
            </p>

            <div className="mt-4 flex gap-2">
              {onSelectWordForTextToSign && (
                <button
                  onClick={() => {
                    onSelectWordForTextToSign(previewItem.label)
                    setPreviewItem(null)
                    onClose()
                  }}
                  className="btn-primary flex-1 text-xs py-2"
                >
                  Coba di Teks -&gt; Isyarat
                </button>
              )}
              <button
                onClick={() => setPreviewItem(null)}
                className="btn-secondary text-xs py-2 px-4"
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

