export type SignCategory =
  | "Pertanyaan"
  | "Waktu"
  | "Warna"
  | "Sosial"
  | "Aktivitas";

export interface SignLabelInfo {
  id: number;
  label: string;
  english: string;
  category: SignCategory;
  videoUrl: string;
  cleanKey: string;
  description: string;
}

/**
 * 32 kosakata resmi IsyaRasa (PRD bagian 9). `id` di sini SENGAJA sama
 * dengan urutan indeks `GLOSS_LABELS` di components/GlossClassifier.tsx —
 * jangan ubah urutan salah satu tanpa menyamakan keduanya, dan jangan ubah
 * tanpa juga menyamakan `LABELS` di ml/training/train.py.
 */
export const SIGN_DICTIONARY_DATA: SignLabelInfo[] = [
  {
    id: 0,
    label: "Air",
    english: "Water",
    category: "Aktivitas",
    videoUrl: "/dictionary/air.mp4",
    cleanKey: "air",
    description: "Menyebut air sebagai benda atau kebutuhan minum.",
  },
  {
    id: 1,
    label: "Belajar",
    english: "Learn",
    category: "Aktivitas",
    videoUrl: "/dictionary/belajar.mp4",
    cleanKey: "belajar",
    description: "Proses menuntut ilmu atau berlatih sesuatu.",
  },
  {
    id: 2,
    label: "Cari",
    english: "Search",
    category: "Aktivitas",
    videoUrl: "/dictionary/cari.mp4",
    cleanKey: "cari",
    description: "Mencari atau menemukan sesuatu/seseorang.",
  },
  {
    id: 3,
    label: "Hari",
    english: "Day",
    category: "Waktu",
    videoUrl: "/dictionary/hari.mp4",
    cleanKey: "hari",
    description: "Satuan waktu siklus harian.",
  },
  {
    id: 4,
    label: "Ingat",
    english: "Remember",
    category: "Aktivitas",
    videoUrl: "/dictionary/ingat.mp4",
    cleanKey: "ingat",
    description: "Mengingat sesuatu di masa lalu.",
  },
  {
    id: 5,
    label: "Lagi",
    english: "Again",
    category: "Aktivitas",
    videoUrl: "/dictionary/lagi.mp4",
    cleanKey: "lagi",
    description: "Menunjukkan pengulangan suatu tindakan.",
  },
  {
    id: 6,
    label: "Maaf",
    english: "Sorry",
    category: "Sosial",
    videoUrl: "/dictionary/maaf.mp4",
    cleanKey: "maaf",
    description: "Ungkapan permohonan maaf.",
  },
  {
    id: 7,
    label: "Makan",
    english: "Eat",
    category: "Aktivitas",
    videoUrl: "/dictionary/makan.mp4",
    cleanKey: "makan",
    description: "Aktivitas mengonsumsi makanan.",
  },
  {
    id: 8,
    label: "Motor",
    english: "Motorcycle",
    category: "Aktivitas",
    videoUrl: "/dictionary/motor.mp4",
    cleanKey: "motor",
    description: "Kendaraan bermotor roda dua.",
  },
  {
    id: 9,
    label: "Saya",
    english: "I",
    category: "Sosial",
    videoUrl: "/dictionary/saya.mp4",
    cleanKey: "saya",
    description: "Kata ganti orang pertama.",
  },
  {
    id: 10,
    label: "Terima kasih",
    english: "Thank you",
    category: "Sosial",
    videoUrl: "/dictionary/terima_kasih.mp4",
    cleanKey: "terima_kasih",
    description: "Ungkapan rasa syukur dan terima kasih.",
  },
  {
    id: 11,
    label: "Tuli",
    english: "Deaf",
    category: "Sosial",
    videoUrl: "/dictionary/tuli.mp4",
    cleanKey: "tuli",
    description: "Menyebut penyandang Tuli atau kondisi tuli.",
  },
  {
    id: 12,
    label: "Apa",
    english: "What",
    category: "Pertanyaan",
    videoUrl: "/dictionary/apa.mp4",
    cleanKey: "apa",
    description: "Menanyakan sesuatu hal atau kejadian.",
  },
  {
    id: 13,
    label: "Siapa",
    english: "Who",
    category: "Pertanyaan",
    videoUrl: "/dictionary/siapa.mp4",
    cleanKey: "siapa",
    description: "Menanyakan identitas seseorang.",
  },
  {
    id: 14,
    label: "Kapan",
    english: "When",
    category: "Pertanyaan",
    videoUrl: "/dictionary/kapan.mp4",
    cleanKey: "kapan",
    description: "Menanyakan waktu suatu kejadian.",
  },
  {
    id: 15,
    label: "Di mana",
    english: "Where",
    category: "Pertanyaan",
    videoUrl: "/dictionary/di_mana.mp4",
    cleanKey: "di_mana",
    description: "Menanyakan tempat atau lokasi.",
  },
  {
    id: 16,
    label: "Mengapa",
    english: "Why",
    category: "Pertanyaan",
    videoUrl: "/dictionary/mengapa.mp4",
    cleanKey: "mengapa",
    description: "Menanyakan alasan atau sebab.",
  },
  {
    id: 17,
    label: "Bagaimana",
    english: "How",
    category: "Pertanyaan",
    videoUrl: "/dictionary/bagaimana.mp4",
    cleanKey: "bagaimana",
    description: "Menanyakan cara, keadaan, atau proses.",
  },
  {
    id: 18,
    label: "Merah",
    english: "Red",
    category: "Warna",
    videoUrl: "/dictionary/merah.mp4",
    cleanKey: "merah",
    description: "Warna merah.",
  },
  {
    id: 19,
    label: "Kuning",
    english: "Yellow",
    category: "Warna",
    videoUrl: "/dictionary/kuning.mp4",
    cleanKey: "kuning",
    description: "Warna kuning.",
  },
  {
    id: 20,
    label: "Hijau",
    english: "Green",
    category: "Warna",
    videoUrl: "/dictionary/hijau.mp4",
    cleanKey: "hijau",
    description: "Warna hijau.",
  },
  {
    id: 21,
    label: "Hitam",
    english: "Black",
    category: "Warna",
    videoUrl: "/dictionary/hitam.mp4",
    cleanKey: "hitam",
    description: "Warna hitam.",
  },
  {
    id: 22,
    label: "Dengar",
    english: "Hear",
    category: "Sosial",
    videoUrl: "/dictionary/dengar.mp4",
    cleanKey: "dengar",
    description: "Mendengar atau kemampuan mendengar.",
  },
  {
    id: 23,
    label: "Berangkat",
    english: "Depart",
    category: "Aktivitas",
    videoUrl: "/dictionary/berangkat.mp4",
    cleanKey: "berangkat",
    description: "Memulai perjalanan menuju suatu tempat.",
  },
  {
    id: 24,
    label: "Datang",
    english: "Come",
    category: "Aktivitas",
    videoUrl: "/dictionary/datang.mp4",
    cleanKey: "datang",
    description: "Tiba di suatu tempat.",
  },
  {
    id: 25,
    label: "Teman",
    english: "Friend",
    category: "Sosial",
    videoUrl: "/dictionary/teman.mp4",
    cleanKey: "teman",
    description: "Kawan atau sahabat.",
  },
  {
    id: 26,
    label: "Keluarga",
    english: "Family",
    category: "Sosial",
    videoUrl: "/dictionary/keluarga.mp4",
    cleanKey: "keluarga",
    description: "Anggota keluarga.",
  },
  {
    id: 27,
    label: "Rumah",
    english: "House",
    category: "Aktivitas",
    videoUrl: "/dictionary/rumah.mp4",
    cleanKey: "rumah",
    description: "Tempat tinggal.",
  },
  {
    id: 28,
    label: "Pagi",
    english: "Morning",
    category: "Waktu",
    videoUrl: "/dictionary/pagi.mp4",
    cleanKey: "pagi",
    description: "Waktu pagi hari.",
  },
  {
    id: 29,
    label: "Siang",
    english: "Noon",
    category: "Waktu",
    videoUrl: "/dictionary/siang.mp4",
    cleanKey: "siang",
    description: "Waktu siang hari.",
  },
  {
    id: 30,
    label: "Sore",
    english: "Afternoon",
    category: "Waktu",
    videoUrl: "/dictionary/sore.mp4",
    cleanKey: "sore",
    description: "Waktu sore hari.",
  },
  {
    id: 31,
    label: "Malam",
    english: "Night",
    category: "Waktu",
    videoUrl: "/dictionary/malam.mp4",
    cleanKey: "malam",
    description: "Waktu malam hari.",
  },
];

/** Map pencarian cepat kata -> URL Video */
export const SIGN_DICTIONARY_MAP: Record<string, string> =
  SIGN_DICTIONARY_DATA.reduce(
    (acc, item) => {
      acc[item.label.toLowerCase()] = item.videoUrl;
      acc[item.cleanKey] = item.videoUrl;
      return acc;
    },
    {} as Record<string, string>,
  );

/** Parsing kalimat teks menjadi daftar token kata/frasa yang tersedia video nya */
export function parseTextToSignTokens(
  text: string,
): { originalWord: string; videoUrl: string | null; labelName?: string }[] {
  const normalized = text
    .toLowerCase()
    .replace(/[.,?!]/g, "")
    .trim();

  if (!normalized) return [];

  const tokens: {
    originalWord: string;
    videoUrl: string | null;
    labelName?: string;
  }[] = [];
  const words = normalized.split(/\s+/).filter(Boolean);

  let i = 0;
  while (i < words.length) {
    // 1. Cek frasa 2 kata (contoh: "terima kasih", "di mana")
    if (i + 1 < words.length) {
      const phrase = `${words[i]} ${words[i + 1]}`;
      if (SIGN_DICTIONARY_MAP[phrase]) {
        const found = SIGN_DICTIONARY_DATA.find(
          (item) =>
            item.label.toLowerCase() === phrase ||
            item.cleanKey === phrase.replace(" ", "_"),
        );
        tokens.push({
          originalWord: phrase,
          videoUrl: SIGN_DICTIONARY_MAP[phrase],
          labelName: found?.label ?? phrase,
        });
        i += 2;
        continue;
      }
    }

    // 2. Cek per kata tunggal
    const singleWord = words[i];
    const foundUrl = SIGN_DICTIONARY_MAP[singleWord] ?? null;
    const foundLabel = SIGN_DICTIONARY_DATA.find(
      (item) =>
        item.label.toLowerCase() === singleWord || item.cleanKey === singleWord,
    );

    tokens.push({
      originalWord: words[i],
      videoUrl: foundUrl,
      labelName: foundLabel?.label ?? words[i],
    });

    i++;
  }

  return tokens;
}
