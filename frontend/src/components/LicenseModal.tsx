import { useState } from 'react'
import { ShieldCheck, ExternalLink, Scale, CheckCircle2 } from 'lucide-react'

interface LicenseItem {
  name: string
  version: string
  license: string
  category: 'Core & UI' | 'AI & Computer Vision' | 'Backend & Protocol' | 'Dataset'
  description: string
}

const LICENSE_DATA: LicenseItem[] = [
  { name: 'React', version: '19.2.8', license: 'MIT', category: 'Core & UI', description: 'Library UI Frontend (Facebook/Meta)' },
  { name: 'Vite', version: '8.2.0', license: 'MIT', category: 'Core & UI', description: 'Build Tool & Dev Server' },
  { name: 'Tailwind CSS', version: '4.3.3', license: 'MIT', category: 'Core & UI', description: 'Utility-First CSS Framework' },
  { name: 'TypeScript', version: '6.0.2', license: 'Apache-2.0', category: 'Core & UI', description: 'Bahasa Pemrograman Strongly Typed' },
  { name: 'Lucide React', version: '0.475.0', license: 'MIT', category: 'Core & UI', description: 'Open-Source Iconset' },
  { name: '@mediapipe/tasks-vision', version: '1.0.1', license: 'Apache-2.0', category: 'AI & Computer Vision', description: 'Google MediaPipe Hand/Pose Landmark Detector (WASM)' },
  { name: '@tensorflow/tfjs', version: '4.22.0', license: 'Apache-2.0', category: 'AI & Computer Vision', description: 'In-Browser Machine Learning Inference Engine' },
  { name: 'MediaPipe (Python)', version: '0.10.14', license: 'Apache-2.0', category: 'AI & Computer Vision', description: 'Ekstraksi landmark pose saat offline training' },
  { name: 'TensorFlow (Python)', version: '2.15.1', license: 'Apache-2.0', category: 'AI & Computer Vision', description: 'Training model neural network' },
  { name: 'TensorFlow.js Converter', version: '4.20.0', license: 'Apache-2.0', category: 'AI & Computer Vision', description: 'Konversi checkpoint model ke format web' },
  { name: 'Express', version: '5.2.1', license: 'MIT', category: 'Backend & Protocol', description: 'Node.js REST API Backend Framework' },
  { name: 'mysql2', version: '3.23.2', license: 'MIT', category: 'Backend & Protocol', description: 'Driver database MySQL untuk Node.js' },
  { name: 'Socket.io', version: '4.8.3', license: 'MIT', category: 'Backend & Protocol', description: 'Real-time WebSocket Signaling untuk WebRTC Room Remote' },
  { name: 'dotenv', version: '17.4.2', license: 'BSD-2-Clause', category: 'Backend & Protocol', description: 'Environment Variable Loader' },
  { name: 'cors', version: '2.8.6', license: 'MIT', category: 'Backend & Protocol', description: 'Middleware CORS Node.js' },
  { name: 'Dataset WL-BISINDO', version: '2025', license: 'CC BY-NC 4.0', category: 'Dataset', description: 'Dataset 32 kosakata BISINDO (Akademik Non-Komersial, Wajib Sitasi)' },
]

interface LicenseModalProps {
  isOpen: boolean
  onClose: () => void
}

export function LicenseModal({ isOpen, onClose }: LicenseModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('Semua')
  const [searchQuery, setSearchQuery] = useState('')

  if (!isOpen) return null

  const categories = ['Semua', 'Core & UI', 'AI & Computer Vision', 'Backend & Protocol', 'Dataset']

  const filteredData = LICENSE_DATA.filter((item) => {
    const matchesCategory = selectedCategory === 'Semua' || item.category === selectedCategory
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.license.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm animate-fadeIn">
      <div className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-xl overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 text-slate-900">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 border border-teal-200 text-teal-700">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Lisensi & Adopsi Komponen Pihak Ketiga</h2>
              <p className="text-xs text-slate-500">
                Lisensi Perangkat Lunak IsyaRasa &amp; Kepatuhan Hak Cipta Open Source
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

        {/* Project License Summary Banner */}
        <div className="bg-slate-900 px-5 py-3.5 text-white flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0" />
            <span className="text-xs font-medium">
              IsyaRasa didistribusikan di bawah <strong className="text-teal-300">Lisensi MIT</strong>. Komponen open-source pihak ketiga diadopsi sesuai ketentuan lisensi masing-masing.
            </span>
          </div>
          <a
            href="https://github.com/itzluthfi/IsyaratLive/blob/main/LICENSE"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-300 hover:text-white transition-colors"
          >
            Lihat File LICENSE <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* Filter & Search */}
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

          <input
            type="text"
            placeholder="Cari komponen (React, MediaPipe, CC BY-NC)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white py-1.5 px-3 text-xs text-slate-900 placeholder-slate-400 focus:border-slate-800 focus:outline-none min-w-[200px]"
          />
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/80 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-3.5 py-2.5">Komponen / Library</th>
                  <th className="px-3.5 py-2.5">Versi</th>
                  <th className="px-3.5 py-2.5">Lisensi</th>
                  <th className="px-3.5 py-2.5">Kategori</th>
                  <th className="px-3.5 py-2.5">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {filteredData.map((item) => (
                  <tr key={item.name} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-3.5 py-2.5 font-bold text-slate-900">{item.name}</td>
                    <td className="px-3.5 py-2.5 font-mono text-slate-500">{item.version}</td>
                    <td className="px-3.5 py-2.5">
                      <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold border ${
                        item.license.includes('CC BY-NC')
                          ? 'bg-amber-50 text-amber-800 border-amber-300'
                          : item.license.includes('MIT')
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : 'bg-blue-50 text-blue-800 border-blue-300'
                      }`}>
                        {item.license}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-600 font-medium">{item.category}</td>
                    <td className="px-3.5 py-2.5 text-slate-500">{item.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Academic Citation Block */}
          <div className="rounded-lg bg-slate-50 p-4 border border-slate-200 space-y-2">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Sitasi Resmi Dataset WL-BISINDO (Creative Commons CC BY-NC 4.0 Attribution):</span>
            </div>
            <p className="text-xs text-slate-600 font-mono bg-white p-3 rounded border border-slate-200 leading-relaxed select-all">
              Kindy, G. O., Leonali, G., &amp; Lucky, H. (2025). WL-BISINDO: A Word-Level Bahasa Isyarat Indonesia Dataset. <em>Procedia Computer Science</em>, Elsevier. DOI: 10.1016/j.procs.2025.08.277.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-2.5 text-xs text-slate-500">
          <span>Menampilkan {filteredData.length} komponen</span>
          <button onClick={onClose} className="btn-secondary text-xs py-1 px-4">
            Tutup
          </button>
        </div>
      </div>
    </div>
  )
}
