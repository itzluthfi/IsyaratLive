export interface SignLabelInfo {
  id: number
  label: string
  english: string
  category: 'Pertanyaan' | 'Warna' | 'Waktu' | 'Sosial' | 'Aktivitas'
  videoUrl: string
  cleanKey: string
  description: string
}

export const SIGN_DICTIONARY_DATA: SignLabelInfo[] = [
  { id: 0, label: 'ADA', english: 'Exist / Have', category: 'Aktivitas', videoUrl: '/dictionary/ada.mp4', cleanKey: 'ada', description: 'Menunjukkan keberadaan atau ketersediaan sesuatu.' },
  { id: 1, label: 'AKU', english: 'I / Me', category: 'Sosial', videoUrl: '/dictionary/aku.mp4', cleanKey: 'aku', description: 'Kata ganti orang pertama (Aku/Saya).' },
  { id: 2, label: 'APA', english: 'What', category: 'Pertanyaan', videoUrl: '/dictionary/apa.mp4', cleanKey: 'apa', description: 'Menanyakan sesuatu hal atau kejadian.' },
  { id: 3, label: 'BAGAIMANA', english: 'How', category: 'Pertanyaan', videoUrl: '/dictionary/bagaimana.mp4', cleanKey: 'bagaimana', description: 'Menanyakan cara, keadaan, atau proses.' },
  { id: 4, label: 'BAIK', english: 'Good / Fine', category: 'Sosial', videoUrl: '/dictionary/baik.mp4', cleanKey: 'baik', description: 'Ungkapan kabar baik atau rasa terima kasih.' },
  { id: 5, label: 'BISA', english: 'Can / Able', category: 'Aktivitas', videoUrl: '/dictionary/bisa.mp4', cleanKey: 'bisa', description: 'Menunjukkan kemampuan atau sanggup.' },
  { id: 6, label: 'BANTU', english: 'Help / Assist', category: 'Aktivitas', videoUrl: '/dictionary/bantu.mp4', cleanKey: 'bantu', description: 'Meminta atau memberikan pertolongan.' },
  { id: 7, label: 'BELAJAR', english: 'Study / Learn', category: 'Aktivitas', videoUrl: '/dictionary/belajar.mp4', cleanKey: 'belajar', description: 'Proses menuntut ilmu dan latihan.' },
  { id: 8, label: 'BERAPA', english: 'How much / How many', category: 'Pertanyaan', videoUrl: '/dictionary/berapa.mp4', cleanKey: 'berapa', description: 'Menanyakan jumlah, harga, atau kuantitas.' },
  { id: 9, label: 'BICARA', english: 'Speak / Talk', category: 'Sosial', videoUrl: '/dictionary/bicara.mp4', cleanKey: 'bicara', description: 'Berkomunikasi kata-kata atau berdiskusi.' },
  { id: 10, label: 'CINTA', english: 'Love / Affection', category: 'Sosial', videoUrl: '/dictionary/cinta.mp4', cleanKey: 'cinta', description: 'Perasaan kasih sayang mendalam.' },
  { id: 11, label: 'DI', english: 'At / In', category: 'Pertanyaan', videoUrl: '/dictionary/di.mp4', cleanKey: 'di', description: 'Kata depan penunjuk lokasi atau tempat.' },
  { id: 12, label: 'HARI', english: 'Day', category: 'Waktu', videoUrl: '/dictionary/hari.mp4', cleanKey: 'hari', description: 'Satuan waktu siklus harian.' },
  { id: 13, label: 'INI', english: 'This', category: 'Sosial', videoUrl: '/dictionary/ini.mp4', cleanKey: 'ini', description: 'Menunjuk objek atau situasi yang dekat.' },
  { id: 14, label: 'INGIN', english: 'Want / Desire', category: 'Aktivitas', videoUrl: '/dictionary/ingin.mp4', cleanKey: 'ingin', description: 'Keinginan atau hasrat melakukan sesuatu.' },
  { id: 15, label: 'ISYARAT', english: 'Sign Language / Deaf Sign', category: 'Sosial', videoUrl: '/dictionary/isyarat.mp4', cleanKey: 'isyarat', description: 'Komunikasi Isyarat BISINDO / Teman Tuli.' },
  { id: 16, label: 'KAMU', english: 'You', category: 'Sosial', videoUrl: '/dictionary/kamu.mp4', cleanKey: 'kamu', description: 'Kata ganti orang kedua tunggal.' },
  { id: 17, label: 'KERJA', english: 'Work / Job', category: 'Aktivitas', videoUrl: '/dictionary/kerja.mp4', cleanKey: 'kerja', description: 'Aktivitas pekerjaan atau profesi.' },
  { id: 18, label: 'MAAF', english: 'Sorry', category: 'Sosial', videoUrl: '/dictionary/maaf.mp4', cleanKey: 'maaf', description: 'Ungkapan permohonan maaf.' },
  { id: 19, label: 'MAKAN', english: 'Eat', category: 'Aktivitas', videoUrl: '/dictionary/makan.mp4', cleanKey: 'makan', description: 'Aktivitas mengonsumsi makanan.' },
  { id: 20, label: 'MANA', english: 'Where', category: 'Pertanyaan', videoUrl: '/dictionary/mana.mp4', cleanKey: 'mana', description: 'Menanyakan tempat atau pilihan.' },
  { id: 21, label: 'MINUM', english: 'Drink', category: 'Aktivitas', videoUrl: '/dictionary/minum.mp4', cleanKey: 'minum', description: 'Aktivitas mengonsumsi cairan/minuman.' },
  { id: 22, label: 'NAMA', english: 'Name', category: 'Sosial', videoUrl: '/dictionary/nama.mp4', cleanKey: 'nama', description: 'Sebutan atau identitas diri.' },
  { id: 23, label: 'PANGGIL', english: 'Call / Summon', category: 'Aktivitas', videoUrl: '/dictionary/panggil.mp4', cleanKey: 'panggil', description: 'Memanggil atau menyapa seseorang.' },
  { id: 24, label: 'SAMA', english: 'Same / With', category: 'Sosial', videoUrl: '/dictionary/sama.mp4', cleanKey: 'sama', description: 'Kesamaan atau bersama-sama.' },
  { id: 25, label: 'SANGAT', english: 'Very / So much', category: 'Sosial', videoUrl: '/dictionary/sangat.mp4', cleanKey: 'sangat', description: 'Menunjukkan tingkat keteringatan tinggi.' },
  { id: 26, label: 'SAYA', english: 'I / Myself', category: 'Sosial', videoUrl: '/dictionary/saya.mp4', cleanKey: 'saya', description: 'Kata ganti orang pertama sopan.' },
  { id: 27, label: 'SELAMAT', english: 'Congratulations / Safe', category: 'Sosial', videoUrl: '/dictionary/selamat.mp4', cleanKey: 'selamat', description: 'Ucapan selamat atau aman.' },
  { id: 28, label: 'TANYA', english: 'Ask / Question', category: 'Pertanyaan', videoUrl: '/dictionary/tanya.mp4', cleanKey: 'tanya', description: 'Mengajukan pertanyaan atau bertanya.' },
  { id: 29, label: 'TEMAN', english: 'Friend / Companion', category: 'Sosial', videoUrl: '/dictionary/teman.mp4', cleanKey: 'teman', description: 'Kawan atau sahabat dekat.' },
  { id: 30, label: 'TERIMA_KASIH', english: 'Thank You', category: 'Sosial', videoUrl: '/dictionary/terima_kasih.mp4', cleanKey: 'terima_kasih', description: 'Ungkapan rasa syukur dan terima kasih.' },
  { id: 31, label: 'TIDAK', english: 'No / Not', category: 'Sosial', videoUrl: '/dictionary/tidak.mp4', cleanKey: 'tidak', description: 'Menyatakan penolakan atau penyangkalan.' },
]

/** Map pencarian cepat kata -> URL Video */
export const SIGN_DICTIONARY_MAP: Record<string, string> = SIGN_DICTIONARY_DATA.reduce(
  (acc, item) => {
    acc[item.label.toLowerCase()] = item.videoUrl
    acc[item.cleanKey] = item.videoUrl
    return acc
  },
  {} as Record<string, string>
)

// Alias tambahan untuk frasa multi-kata dan variasinya (termasuk TULI)
SIGN_DICTIONARY_MAP['tuli'] = '/dictionary/isyarat.mp4'
SIGN_DICTIONARY_MAP['temanuli'] = '/dictionary/isyarat.mp4'
SIGN_DICTIONARY_MAP['terima kasih'] = '/dictionary/terima_kasih.mp4'
SIGN_DICTIONARY_MAP['terimakasih'] = '/dictionary/terima_kasih.mp4'
SIGN_DICTIONARY_MAP['di mana'] = '/dictionary/di_mana.mp4'
SIGN_DICTIONARY_MAP['dimana'] = '/dictionary/di_mana.mp4'

/** Parsing kalimat teks menjadi daftar token kata/frasa yang tersedia video nya */
export function parseTextToSignTokens(text: string): { originalWord: string; videoUrl: string | null; labelName?: string }[] {
  const normalized = text
    .toLowerCase()
    .replace(/[.,?!]/g, '')
    .trim()

  if (!normalized) return []

  const tokens: { originalWord: string; videoUrl: string | null; labelName?: string }[] = []
  const words = normalized.split(/\s+/).filter(Boolean)

  let i = 0
  while (i < words.length) {
    // 1. Cek frasa 2 kata (contoh: "terima kasih", "di mana")
    if (i + 1 < words.length) {
      const phrase = `${words[i]} ${words[i + 1]}`
      if (SIGN_DICTIONARY_MAP[phrase]) {
        const found = SIGN_DICTIONARY_DATA.find(
          (item) => item.label.toLowerCase() === phrase || item.cleanKey === phrase.replace(' ', '_')
        )
        tokens.push({
          originalWord: phrase,
          videoUrl: SIGN_DICTIONARY_MAP[phrase],
          labelName: found?.label ?? phrase,
        })
        i += 2
        continue
      }
    }

    // 2. Cek per kata tunggal
    const singleWord = words[i]
    const foundUrl = SIGN_DICTIONARY_MAP[singleWord] ?? null
    const foundLabel = SIGN_DICTIONARY_DATA.find(
      (item) => item.label.toLowerCase() === singleWord || item.cleanKey === singleWord
    )

    tokens.push({
      originalWord: words[i],
      videoUrl: foundUrl,
      labelName: foundLabel?.label ?? words[i],
    })

    i++
  }

  return tokens
}
