# PRD — IsyaratLive
### Penerjemah Bahasa Isyarat Indonesia (BISINDO) Real-Time Berbasis AI
**GEMASTIK XIX 2026 — Divisi VIII: Pengembangan Perangkat Lunak**

---

## 1. Ringkasan Eksekutif

IsyaratLive adalah aplikasi web yang menerjemahkan BISINDO (Bahasa Isyarat Indonesia) menjadi teks dan suara secara real-time, dan sebaliknya, untuk memfasilitasi komunikasi tatap muka antara penyandang Tuli dan orang dengar tanpa memerlukan juru bahasa isyarat manusia. Sistem menggabungkan computer vision (deteksi gerakan tangan) dengan large language model (penyusunan kalimat natural) sebagai dua lapis AI yang sama-sama menjadi inti fungsi — bukan sekadar fitur tambahan.

**Kategori lomba:** Divisi VIII — Pengembangan Perangkat Lunak, GEMASTIK XIX 2026
**Tema yang diusung:** Inklusif (aksesibilitas komunikasi difabel Tuli)

---

## 2. Latar Belakang & Masalah

- Indonesia merupakan salah satu negara dengan jumlah penyandang tuli-bisu tertinggi di Asia Tenggara, sementara jumlah juru bahasa isyarat bersertifikat sangat terbatas dan tidak selalu tersedia di layanan publik (loket kelurahan, puskesmas, sekolah, kepolisian).
- Aplikasi penerjemah bahasa isyarat yang sudah ada di Indonesia mayoritas berfokus pada **SIBI** (Sistem Isyarat Bahasa Indonesia, mengikuti struktur tata bahasa Indonesia) atau baru sebatas **alfabet/angka BISINDO statis** — belum ada yang menerjemahkan **rangkaian kata BISINDO** (bahasa alami komunitas Tuli, struktur topic-comment) menjadi kalimat yang natural secara real-time dan dua arah.
- BISINDO secara linguistik tidak satu-ke-satu dengan struktur kalimat Bahasa Indonesia lisan, sehingga pendekatan computer vision saja (deteksi gerakan → kata) tidak cukup — dibutuhkan lapisan pemahaman bahasa untuk menyusun ulang menjadi kalimat yang bisa dipahami orang dengar.

---

## 3. Tujuan Produk

1. Menerjemahkan gerakan BISINDO menjadi kalimat Bahasa Indonesia natural secara real-time (bukan hanya alfabet/kata lepas).
2. Menerjemahkan ucapan/teks Bahasa Indonesia menjadi rangkaian visual isyarat BISINDO.
3. Menunjukkan bahwa AI (CV + LLM) adalah komponen yang **tidak tergantikan** — tanpa salah satu lapisan, sistem tidak berfungsi.
4. Dapat didemokan meyakinkan dalam waktu 5-10 menit di hadapan juri.

### Non-Tujuan (Out of Scope)
- **Bukan** avatar 3D animasi generatif untuk mode teks→isyarat — menggunakan dictionary video/GIF isyarat yang sudah direkam.
- **Bukan** penerjemah kalimat kompleks/multi-klausa pada versi MVP.
- **Bukan** mendukung seluruh variasi dialek isyarat daerah pada versi kompetisi (fokus BISINDO standar nasional).
- **Bukan** panggilan video multi-peserta (>2 orang) atau fitur konferensi kelas Zoom penuh (recording, breakout room, dsb) — Room Remote (§5.3) dibatasi 1-lawan-1.

> *Update 2026-08-10: butir "bukan video call jarak jauh" pada versi PRD sebelumnya dicabut secara sengaja — lihat §5.3 "Room Remote" untuk keputusan pivot dan alasannya.*

---

## 4. Target Pengguna

| Persona | Kebutuhan |
|---|---|
| Penyandang Tuli | Berkomunikasi dengan orang dengar tanpa juru bahasa isyarat manusia, di ruang publik/keluarga |
| Orang dengar (petugas layanan publik, keluarga, guru) | Memahami isyarat lawan bicara & merespons dengan cara yang dipahami penyandang Tuli |
| Institusi (sekolah inklusi, puskesmas, kantor kelurahan) | Alat bantu komunikasi murah, tidak butuh instalasi khusus, cukup buka browser |

---

## 5. Alur Sistem (User Flow)

### Mode 1 — Isyarat → Teks & Suara
```
1. Pengguna membuka web app, memberi izin akses kamera
2. Kamera menangkap gerakan tangan
3. MediaPipe Hand Landmarker (berjalan di browser) mengekstrak 21 titik
   landmark per tangan secara real-time
4. Landmark dikumpulkan sebagai rangkaian frame (buffer beberapa detik)
5. Model klasifikasi (berjalan di browser via TensorFlow.js) membaca
   rangkaian landmark → menghasilkan gloss per kata
   Contoh: ["SAYA", "MAKAN", "SUDAH", "TADI"]
6. Gloss dikirim ke backend
7. Backend memanggil 9Router → LLM menyusun ulang gloss menjadi
   kalimat natural: "Saya sudah makan tadi."
8. Kalimat ditampilkan sebagai teks di layar
9. Web Speech API membacakan teks menjadi suara
10. (Opsional) Kalimat tersimpan ke riwayat percakapan
```

### Mode 2 — Suara/Teks → Isyarat
```
1. Orang dengar berbicara atau mengetik teks
2. Jika berbicara: Web Speech API (speech-to-text) mengubah jadi teks
3. Teks dipecah menjadi kata-kata kunci
4. Setiap kata dicocokkan ke dictionary video/GIF isyarat yang sudah
   direkam sebelumnya
5. Rangkaian video isyarat ditampilkan berurutan di layar
```

### Mode Degradasi (saat koneksi internet terputus)
```
Layer CV (deteksi + klasifikasi gloss) tetap berjalan lokal di browser
      ↓
Jika backend/9Router tidak dapat dihubungi:
      ↓
Sistem menampilkan gloss mentah tanpa penyusunan kalimat
(fallback graceful, bukan crash/error total)
```

### 5.3 Room Remote (update 2026-08-10 — pivot dari desain awal)

**Latar keputusan:** tim ingin pengalaman yang lebih terasa seperti aplikasi video call modern (kamera, obrolan, suara) sambil tetap menjaga demo utama tetap sederhana dan tahan gagal di depan juri. Diputuskan: **dua Room terpisah**, bukan mengganti desain lama.

- **Room Lokal** (fondasi, dipakai untuk demo utama) — desain asli §5 Mode 1 & Mode 2, satu perangkat, dua orang tatap muka. Sekarang digambar ulang sebagai satu "room" percakapan dengan feed obrolan bersama (bukan dua tab terpisah tanpa histori gabungan) — lihat `frontend/src/rooms/RoomLocal.tsx`.
- **Room Remote** (fitur tambahan, bukan taruhan demo utama) — panggilan video 1-lawan-1 antar dua perangkat/lokasi berbeda:
  - Video & audio: **WebRTC** peer-to-peer (`RTCPeerConnection`, bawaan browser, gratis, tidak lewat server).
  - Signaling (pertukaran offer/answer/ICE candidate serta pesan teks) lewat **Socket.io** di backend sendiri (`backend/src/signaling.ts`) — server hanya meneruskan pesan kecil, tidak pernah menyentuh video/audio.
  - STUN pakai server publik gratis (`stun.l.google.com`) — cukup untuk kebanyakan jaringan. TURN relay **belum** disiapkan (lihat risiko di §13) — kalau demo dilakukan di jaringan dengan NAT/firewall ketat, koneksi P2P bisa gagal connect.
  - Deteksi isyarat di Room Remote memakai **pipeline & model yang identik** dengan Room Lokal (Model v3 secara default) — tidak ada logika deteksi baru, hanya kata hasil klasifikasi yang disiarkan ke lawan bicara.
  - Dibatasi 1-lawan-1 (bukan multi-peserta) — lihat Non-Tujuan §3.

---

## 6. Arsitektur Sistem

```
┌─────────────────────────── BROWSER (Client) ───────────────────────────┐
│                                                                          │
│  Kamera → MediaPipe Hand Landmarker (JS/WASM, real-time, GPU delegate) │
│              ↓                                                          │
│  Buffer landmark sequence                                               │
│              ↓                                                          │
│  Model klasifikasi gloss (TensorFlow.js, hasil training di Python)      │
│              ↓                                                          │
│  Gloss mentah ──────────────► [kirim ke backend via HTTP]               │
│                                                                          │
│  Web Speech API (TTS output & STT input, built-in browser)              │
│  React + Vite (UI)                                                      │
└──────────────────────────────────┬──────────────────────────────────────┘
                                     │ HTTPS
┌────────────────────────────────────▼─────────────────────────────────────┐
│                         BACKEND (VPS — Node.js/Express)                   │
│                                                                            │
│  POST /normalize { gloss: [...] }                                        │
│         ↓                                                                 │
│  Panggil 9Router (multi-provider LLM gateway, fallback otomatis)          │
│         ↓                                                                 │
│  Return { text: "kalimat natural" }                                      │
│                                                                            │
│  MySQL — riwayat percakapan                                              │
│  Storage — dictionary video/GIF isyarat (mode teks→isyarat)              │
│  (Opsional) Hermes Agent — akses riwayat via Telegram bot                │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Peran AI (Kenapa Bukan CRUD + Tempelan)

| Komponen | Tanpa komponen ini... |
|---|---|
| CV (MediaPipe + klasifikasi gloss) | Sistem buta total, tidak bisa membaca isyarat sama sekali |
| LLM (9Router) | Output cuma tumpukan kata acak ("SAYA MAKAN SUDAH TADI"), tidak bisa dipahami orang dengar sebagai kalimat |

Kedua lapisan AI ini **saling melengkapi dan sama-sama esensial** — inilah yang membedakan dari seluruh referensi open-source BISINDO yang ada saat ini, yang berhenti di tahap "deteksi kata/huruf" tanpa lapisan pemahaman bahasa di atasnya.

---

## 8. Tech Stack

| Layer | Teknologi | Keterangan |
|---|---|---|
| Deteksi landmark tangan | `@mediapipe/tasks-vision` (JS resmi Google) | Real-time, jalan di browser, tervalidasi mendukung mode video + 2 tangan + akselerasi GPU |
| Klasifikasi gloss | Siformer/SPOTER (Transformer berbasis landmark pose), dilatih di Python memakai dataset WL-BISINDO, diekspor ke TensorFlow.js | Fork dari repo resmi `AceKinnn/WL-BISINDO`, akurasi baseline 93-94% (skema Signer-Dependent) |
| Normalisasi bahasa | 9Router → LLM (multi-provider, ada fallback) | Backend-only, API key tidak boleh di client |
| Text-to-Speech & Speech-to-Text | Web Speech API (built-in browser) | Gratis, mendukung Bahasa Indonesia |
| Frontend | React + Vite, Tailwind | Konsisten dengan stack NetMon ITATS |
| Backend | Node.js + Express | Proxy ke 9Router, endpoint normalisasi |
| Video call Room Remote | WebRTC (`RTCPeerConnection`, bawaan browser) + Socket.io (signaling) | Gratis; video/audio P2P langsung antar browser, server cuma tukar pesan kecil — lihat §5.3 |
| Database | MySQL | Riwayat percakapan |
| Deployment | VPS `vmi3108861` (CyberPanel/OpenLiteSpeed) atau `newgabungan`, HTTPS wajib (Let's Encrypt) | Akses kamera browser mensyaratkan HTTPS |
| Integrasi tambahan (opsional) | Hermes Agent (Telegram) | Review riwayat percakapan via bot |

---

## 9. Dataset & Model

### Dataset utama: WL-BISINDO (publik, siap pakai — tidak perlu rekam sendiri)

- **Sumber:** [WL-BISINDO](https://www.kaggle.com/datasets/glennleonali/wl-bisindo) — dataset akademik publik yang dibuat khusus mengatasi kelangkaan data BISINDO level-kata, dipublikasikan oleh Grace Oktaviani Kindy, Glenn Leonali & Henry Lucky (BINUS University), dimuat di *Procedia Computer Science* 2025 (DOI: 10.1016/j.procs.2025.08.277).
- **Isi:** 1.600 video RGB, **32 kosakata** BISINDO, diperagakan oleh 5 penanda tangan berbeda (varian regional Banten), 10 sampel per kata per orang. Ukuran ±2,16 GB.
- **Lisensi:** CC BY-NC 4.0 (non-komersial, wajib sitasi) — aman untuk kompetisi akademik GEMASTIK. Jika produk dikembangkan ke arah komersial pasca-lomba, perlu izin ulang ke pembuat dataset atau sumber data pengganti.
- **Format nama file:** `[signerID]_[labelID]_[sampleID].mp4` — contoh `signer0_label0_sample10.mp4` = penanda tangan ke-0, kata label 0 ("Air"), sampel ke-10.

### Daftar 32 kosakata (MVP)

| Label | Kata | Label | Kata | Label | Kata | Label | Kata |
|---|---|---|---|---|---|---|---|
| 0 | Air | 8 | Motor | 16 | Mengapa | 24 | Datang |
| 1 | Belajar | 9 | Saya | 17 | Bagaimana | 25 | Teman |
| 2 | Cari | 10 | Terima kasih | 18 | Merah | 26 | Keluarga |
| 3 | Hari | 11 | Tuli | 19 | Kuning | 27 | Rumah |
| 4 | Ingat | 12 | Apa | 20 | Hijau | 28 | Pagi |
| 5 | Lagi | 13 | Siapa | 21 | Hitam | 29 | Siang |
| 6 | Maaf | 14 | Kapan | 22 | Dengar | 30 | Sore |
| 7 | Makan | 15 | Di mana | 23 | Berangkat | 31 | Malam |

*Catatan: kosakata ini kombinasi kata tanya, keseharian, keluarga, warna, dan waktu — cukup untuk menyusun kalimat sederhana yang meyakinkan saat demo (mis. "Saya makan pagi", "Terima kasih", "Kapan teman datang").*

### Repo pendamping (kode siap pakai, bukan cuma dataset)

Dataset ini punya repo resmi pendamping — [`AceKinnn/WL-BISINDO`](https://github.com/AceKinnn/WL-BISINDO) — yang berisi:
- Script `organize_dataset.py` untuk split otomatis data train/test
- Dua skema evaluasi: **Signer-Dependent (SD)** dan **Signer-Independent (SI)** — SI lebih relevan untuk IsyaratLive karena mensimulasikan pengguna baru yang belum pernah dilihat model
- Implementasi & hasil baseline tiga model:

| Model | Basis Data | Akurasi SD | Akurasi SI (rata-rata) |
|---|---|---|---|
| SPOTER | Landmark pose | 93,75% | ~73% |
| **Siformer** | Landmark pose | 93,54% | **~75% (terbaik untuk SI)** |
| MViTv2 | Video RGB mentah | **97,08%** | — |

**Model yang dipilih: Siformer atau SPOTER** (bukan MViTv2) — karena keduanya berbasis landmark pose, sejalan dengan pipeline MediaPipe yang sudah dirancang di Bagian 8, dan lebih ringan untuk diekspor ke TensorFlow.js agar berjalan di browser. MViTv2 memakai video RGB mentah langsung, lebih akurat tapi terlalu berat untuk inferensi real-time di browser.

### Rencana kerja dataset (Bulan 1)

1. Unduh WL-BISINDO dari Kaggle, fork repo `AceKinnn/WL-BISINDO`.
2. Jalankan `organize_dataset.py` dengan skema **Signer-Independent** agar model teruji ke pengguna baru.
3. Ekstrak landmark pose (MediaPipe, sejalan dengan Bagian 8) mengikuti pipeline preprocessing Siformer/SPOTER di repo.
4. Latih ulang (fine-tune) Siformer/SPOTER pada 32 kata, validasi akurasi dengan skema SI.
5. Ekspor model terlatih ke TensorFlow.js untuk inferensi di browser.
6. Cantumkan sitasi BibTeX resmi (tersedia di repo) pada proposal & dokumentasi.

### Risiko yang masih berlaku

- 32 kata dari varian regional **Banten** — jika demo/pengujian lapangan melibatkan penanda tangan dari daerah lain, ada kemungkinan sedikit perbedaan gerakan. Sebutkan ini sebagai batasan eksplisit (sejalan dengan Bagian 2 soal variasi regional BISINDO).
- Akurasi Signer-Independent untuk beberapa penanda tangan uji cukup bervariasi (48–91% tergantung model & signer) — perlu pengujian menyeluruh di Bulan 1 sebelum commit ke satu model, dan realistis untuk set ekspektasi akurasi demo di kisaran 80-90%, bukan mendekati 97%.

---

## 10. Fitur

### MVP (wajib untuk demo)
- [~] Room Lokal: kamera → deteksi isyarat real-time → teks tersusun rapi (LLM) → suara — *pipeline & UI lengkap dan dirapikan (§15.7), model klasifikasi gloss **v1/v2** nyata & terverifikasi benar-benar bisa dimuat browser (v3 dikeluarkan dari daftar karena rusak, lihat §15.8), bisa diuji akurasinya langsung dari UI ("Uji Akurasi Model"), tapi belum divalidasi end-to-end di environment produksi*
- [~] Riwayat percakapan tersimpan, bisa di-scroll — *endpoint CRUD ada dan sekarang benar-benar dipakai (`RoomLocal` memuat riwayat saat dibuka), belum diuji terhadap MySQL sungguhan*
- [x] Fallback mode degradasi saat koneksi terputus — *kode ada di `SignToTextMode.tsx`, tampilkan gloss mentah saat `/normalize` gagal, plus mode degradasi per-kata manual*

### Pengembangan Lanjutan (jika waktu cukup)
- [x] Mode 2: teks/suara → video isyarat (dictionary-based) — *32 video `.mp4` sudah direkam & tersedia di `frontend/public/dictionary/`, dictionary data sudah diperbaiki supaya cocok dengan file & label model (§15.7), terhubung di Room Lokal & `DictionaryModal.tsx`*
- [x] Room Remote: panggilan video 1-lawan-1 antar 2 perangkat/lokasi (WebRTC + Socket.io) dengan deteksi isyarat & obrolan tersinkron — *lihat §5.3, pivot dari non-tujuan awal, dieksekusi 2026-08-10; TURN server belum disiapkan, lihat risiko §13*
- [ ] Mode belajar isyarat (kamera memvalidasi gerakan pengguna untuk latihan)
- [~] Integrasi Hermes Agent via Telegram untuk review riwayat — *service skeleton (`services/hermes.ts`) ada, belum tersambung/diuji*

### Di Luar Cakupan Kompetisi
- Panggilan video multi-peserta (>2 orang) / fitur konferensi penuh (recording, breakout room, dsb) — Room Remote dibatasi 1-lawan-1
- Avatar 3D animasi generatif
- Dukungan kalimat kompleks multi-klausa
- Dukungan dialek isyarat daerah

---

## 11. Metodologi & Timeline (±3 Bulan)

| Bulan | Fokus | Target Selesai |
|---|---|---|
| Bulan 1 | Unduh & fork WL-BISINDO + repo pendamping. Ekstrak landmark, latih ulang Siformer/SPOTER pada 32 kata dengan skema Signer-Independent. Ekspor ke TensorFlow.js dan validasi jalan real-time di browser. | Model klasifikasi gloss berjalan real-time di browser dengan akurasi terukur (target 80-90% skema SI) |
| Bulan 2 | Bangun backend (endpoint normalisasi + integrasi 9Router). Desain prompt normalisasi gloss→kalimat. Integrasi TTS. Bangun UI React. | Alur end-to-end Mode 1 berjalan mulus dari kamera sampai suara |
| Bulan 3 | Uji & perbaiki UX. (Jika waktu cukup) Mode 2. Susun video demo 10 menit. Siapkan kode sumber & dokumentasi untuk sesi tanya-jawab juri. | Sistem siap demo, video presentasi selesai |

**Titik keputusan (decision gate):**
- Jika akhir Bulan 1 model klasifikasi belum mencapai akurasi yang layak didemokan → pertimbangkan pivot ke model pretrained yang lebih matang atau kurangi jumlah kosakata target.
- Jika integrasi TensorFlow.js bermasalah dari sisi performa di Bulan 1 → fallback ke inference di backend (trade-off: butuh koneksi internet terus-menerus, tapi arsitektur tetap valid).

---

## 12. Kesesuaian dengan Kriteria Penilaian GEMASTIK Divisi VIII

| Kriteria Juri | Bagaimana IsyaratLive Memenuhi |
|---|---|
| Inovasi | Kombinasi CV + LLM untuk penerjemahan BISINDO kosakata (bukan alfabet) real-time dua arah — belum ada solusi sejenis yang publik |
| Dampak & keberlanjutan | Aksesibilitas komunikasi bagi komunitas Tuli di layanan publik, sekolah, keluarga |
| Usability/UX | Cukup buka browser, tanpa instalasi; antarmuka sederhana untuk dua pihak yang berhadapan |
| Metodologi RPL | Dikembangkan dengan pendekatan iteratif, arsitektur modular (CV terpisah dari LLM), MVP jelas |
| Urgensi masalah | Keterbatasan juru bahasa isyarat bersertifikat di Indonesia |
| Kesesuaian tema ("Inklusif") | Langsung menyasar aksesibilitas difabel Tuli |

---

## 13. Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Dataset kosakata BISINDO terbatas | Model tidak akurat | Rekam dataset sendiri sejak Bulan 1, prioritaskan 50 kata paling sering dipakai |
| Latensi LLM saat demo | Demo terganggu | 9Router menyediakan fallback multi-provider otomatis; gunakan model kecil/cepat untuk normalisasi kalimat pendek |
| Performa TensorFlow.js di browser lambat | UX real-time terganggu | Uji lebih dini di Bulan 1; siapkan fallback inference di backend jika perlu |
| BISINDO memiliki variasi regional | Model gagal generalisasi | Batasi scope ke BISINDO standar nasional, sebutkan sebagai batasan eksplisit di proposal |
| Koneksi internet terputus saat demo | LLM tidak bisa dipanggil | Mode degradasi: tampilkan gloss mentah tanpa penyusunan kalimat |
| Room Remote: WebRTC gagal connect di jaringan NAT/firewall ketat (belum ada TURN server) | Panggilan video antar 2 device gagal tersambung | Jangan jadikan Room Remote taruhan demo utama — Room Lokal (1 perangkat) tetap fondasi demo yang pasti jalan; tambahkan TURN (`coturn` self-host, gratis) sebelum mengandalkan Room Remote di jaringan tak terkontrol |

---

## 14. Metrik Keberhasilan (untuk evaluasi internal tim)

- Akurasi klasifikasi gloss pada 32 kata target (uji di lingkungan nyata, bukan hanya data uji)
- Latensi end-to-end dari gerakan isyarat sampai suara keluar (target: di bawah 2-3 detik agar terasa "real-time")
- Kalimat hasil normalisasi LLM dapat dipahami tanpa ambiguitas oleh penutur Bahasa Indonesia biasa
- Sistem tetap berfungsi (mode degradasi) saat koneksi internet diputus secara sengaja saat pengujian

---

## 15. Rencana Implementasi Teknis (Untuk Eksekusi Development)

Bagian ini menerjemahkan Bagian 11 (Timeline) menjadi tugas konkret berurutan, siap dieksekusi langkah demi langkah.

### 15.1 Struktur Folder Proyek

```
isyaratlive/
├── ml/                          # Training model (Python, lokal/Colab)
│   ├── dataset/                 # Hasil unduhan WL-BISINDO + organize_dataset.py
│   ├── preprocessing/           # Ekstraksi landmark (MediaPipe Python)
│   ├── training/                # Fine-tuning Siformer/SPOTER
│   ├── export/                  # Konversi model ke TensorFlow.js
│   └── models/                  # Output model (.tflite/.json+.bin untuk TFJS)
├── frontend/                    # React + Vite
│   ├── src/
│   │   ├── components/
│   │   │   ├── CameraCapture.tsx       # Akses kamera + render video
│   │   │   ├── LandmarkDetector.tsx    # Wrapper @mediapipe/tasks-vision
│   │   │   ├── GlossClassifier.tsx     # Wrapper TensorFlow.js model
│   │   │   ├── ChatDisplay.tsx         # Tampilan teks + riwayat
│   │   │   └── SpeechOutput.tsx        # Wrapper Web Speech API
│   │   ├── modes/
│   │   │   ├── SignToTextMode.tsx      # Mode 1
│   │   │   └── TextToSignMode.tsx      # Mode 2
│   │   ├── lib/api.ts            # Client buat panggil backend /normalize
│   │   └── App.tsx
│   └── public/models/            # Model TFJS di-serve statis
├── backend/                      # Node.js + Express
│   ├── src/
│   │   ├── routes/normalize.ts   # POST /normalize -> panggil 9Router
│   │   ├── routes/history.ts     # CRUD riwayat percakapan
│   │   ├── services/9router.ts   # Client 9Router
│   │   ├── services/hermes.ts    # (opsional) integrasi Hermes/Telegram
│   │   └── db/                   # Koneksi MySQL + migrasi
│   └── package.json
├── dictionary/                   # Video/GIF isyarat untuk Mode 2 (32 kata)
└── docs/
    └── PRD_IsyaratLive.md        # Dokumen ini
```

### 15.2 Urutan Kerja (Checklist Berurutan)

**FASE 0 — Setup** ✅ *selesai*
- [x] Inisialisasi repo Git, struktur folder sesuai 15.1
- [x] Setup proyek frontend — Vite + React-TS, `@mediapipe/tasks-vision`, `@tensorflow/tfjs`, Tailwind terpasang (`npm install` bersih, `tsc --noEmit` tanpa error, `npm run dev` jalan di :5173)
- [x] Setup proyek backend — Express, dotenv, mysql2 terpasang (`npm install` bersih, `tsc --noEmit` tanpa error, `npm run dev` jalan di :3001)
- [ ] Setup lingkungan Python (`ml/`) — `venv` belum dibuat/divalidasi; `requirements.txt` ada tapi belum `pip install`

**FASE 1 — Model & Dataset (Bulan 1)** ❌ *belum dieksekusi — blocker utama saat ini*
- [x] Notebook Colab end-to-end disiapkan (`ml/colab/train_gloss_classifier.ipynb`) — mencakup seluruh langkah di bawah, siap dijalankan begitu ada `kaggle.json`. Dipakai karena drive lokal tim (C:) nyaris penuh (1.7GB tersisa dari 459GB) sehingga instalasi `ml/venv` lokal (butuh ~3GB) gagal
- [ ] Unduh dataset WL-BISINDO dari Kaggle (`glennleonali/wl-bisindo`)
- [ ] Clone/fork repo `AceKinnn/WL-BISINDO`, salin `organize_dataset.py` + metadata JSON ke `ml/dataset/` (script ada di `ml/dataset/organize_dataset.py`, belum dijalankan — belum ada dataset)
- [ ] Jalankan `organize_dataset.py` dengan skema **Signer-Independent** (`SI_split_metadata.json`)
- [ ] Tulis script ekstraksi landmark pose dari video (skeleton ada di `ml/preprocessing/extract_landmarks.py`, belum dijalankan terhadap data asli)
- [ ] Fine-tune Siformer (atau SPOTER sebagai pembanding) pada 32 kelas kata (skeleton ada di `ml/training/train.py`, belum ada training run)
- [ ] Evaluasi akurasi pada skema SI, catat hasil per signer
- [ ] Ekspor model terlatih ke format TensorFlow.js (skeleton ada di `ml/export/export_tfjs.py`, belum ada model untuk diekspor)
- [ ] Salin hasil export ke `frontend/public/models/` — folder `frontend/public/models/gloss-classifier/` masih kosong; `GlossClassifier.tsx` sudah siap load model dari path ini begitu tersedia
- [ ] **Validasi checkpoint**: buat halaman test sederhana di frontend yang load model TFJS + `@mediapipe/tasks-vision` HandLandmarker, uji real-time di browser dengan minimal 5 kata sampel — **belum bisa dilakukan tanpa model terlatih**

**FASE 2 — Backend & Integrasi LLM (Bulan 2, minggu 1-2)** 🟡 *skeleton lengkap, belum diuji dengan kredensial asli*
- [x] Buat endpoint `POST /normalize` di backend — terima array gloss, panggil 9Router (`backend/src/routes/normalize.ts` + `services/9router.ts`)
- [ ] Desain & uji prompt normalisasi gloss→kalimat (1 versi prompt sudah ada di `services/9router.ts`, belum diiterasi/dibandingkan dengan variasi lain karena belum ada API key 9Router asli untuk uji coba)
- [x] Setup koneksi MySQL, skema tabel riwayat percakapan (`backend/src/db/schema.sql`, `db/index.ts`) — kode ada, belum divalidasi terhadap instance MySQL sungguhan
- [x] Buat endpoint CRUD riwayat (`GET/POST /history` di `backend/src/routes/history.ts`)
- [ ] Uji fallback: matikan koneksi ke 9Router secara sengaja, pastikan backend merespons error yang bisa ditangani frontend (bukan crash) — logika error sudah ada (`NineRouterError`), belum diuji end-to-end

**FASE 3 — Frontend Mode 1 End-to-End (Bulan 2, minggu 3-4)** 🟡 *skeleton lengkap, belum divalidasi dengan model asli*
- [x] `CameraCapture` — minta izin kamera, render video stream
- [x] `LandmarkDetector` — integrasi `HandLandmarker` mode video real-time
- [x] `GlossClassifier` — buffer landmark sequence, jalankan inferensi TFJS, keluarkan gloss (logika ada, tapi model TFJS yang di-load masih placeholder/belum ada — lihat Fase 1)
- [x] Hubungkan gloss ke `lib/api.ts` → panggil `/normalize` → tampilkan hasil di `ChatDisplay`
- [x] `SpeechOutput` — integrasi Web Speech API untuk baca teks hasil normalisasi
- [x] Implementasi mode degradasi: jika `/normalize` gagal, tampilkan gloss mentah langsung
- [ ] **Validasi checkpoint**: alur lengkap kamera → suara berjalan tanpa error untuk 32 kata target — **belum bisa divalidasi, menunggu model asli dari Fase 1**

**FASE 4 — Mode 2 & Penyempurnaan (Bulan 3, jika waktu cukup)** 🟡 *UI ada, aset belum*
- [ ] Siapkan/rekam 32 video/GIF isyarat pendek untuk dictionary Mode 2 — folder `dictionary/` masih kosong (hanya `.gitkeep`)
- [x] `TextToSignMode` — Web Speech API (STT) atau input teks → pecah kata kunci → mapping ke dictionary → tampilkan berurutan (kode ada di `TextToSignMode.tsx`, tidak bisa ditampilkan penuh tanpa video dictionary)
- [ ] Polish UI/UX, uji dengan pengguna di luar tim jika memungkinkan
- [~] (Opsional) Integrasi Hermes Agent untuk akses riwayat via Telegram — service skeleton (`services/hermes.ts`) ada, belum tersambung ke bot Telegram sungguhan

**FASE 5 — Deployment & Demo (Bulan 3, minggu terakhir)** ❌ *belum dimulai*
- [ ] Deploy frontend (build statis) ke VPS `vmi3108861` atau `newgabungan`
- [ ] Deploy backend Node.js, setup reverse proxy OpenLiteSpeed
- [ ] Pasang HTTPS (Let's Encrypt) — wajib untuk akses kamera browser
- [ ] Uji end-to-end di environment produksi (bukan localhost)
- [ ] Rekam video demo 10 menit sesuai format final GEMASTIK
- [ ] Siapkan kode sumber & dokumentasi rapi untuk sesi tanya-jawab juri

### 15.5 Ringkasan Status (update 2026-08-05)

**Sudah jadi:** Fase 0 penuh, Fase 2 & 3 dalam bentuk skeleton kode yang lengkap dan terverifikasi jalan (deps terinstal bersih, TypeScript compile tanpa error, `npm run dev` backend & frontend sama-sama berhasil start).

**Belum jadi — gap terbesar dari PRD:** Fase 1 (training model klasifikasi gloss) sama sekali belum dieksekusi — dataset belum diunduh, tidak ada model terlatih. Ini blocker utama: tanpa model asli, Mode 1 tidak bisa didemokan end-to-end sungguhan (hanya pipeline kosong). Dictionary video Mode 2 juga masih kosong, dan integrasi 9Router/MySQL/Hermes belum diuji dengan kredensial nyata. Deployment ke VPS belum dimulai.

**Rekomendasi urutan lanjutan:** prioritaskan Fase 1 (unduh dataset Kaggle → training → export TFJS) sebelum menyentuh fitur lain, karena ini sesuai catatan 15.4 ("jangan mulai Fase 3 sebelum Fase 1 punya checkpoint validasi") dan merupakan risiko rundown terbesar terhadap timeline 3 bulan.

**Update 2026-08-05 (lanjutan):** dicoba jalankan Fase 1 secara lokal — `pip install -r ml/requirements.txt` awalnya gagal karena dua konflik versi (`tensorflow` vs `tensorflowjs`, dan `orbax-checkpoint` butuh `uvloop` yang tak didukung Windows), sudah diperbaiki di `ml/requirements.txt`. Namun instalasi tetap gagal karena **disk C: tim nyaris penuh** (1.7GB tersisa dari 459GB) — tidak cukup untuk `venv` (~1.4GB+) plus dataset (±2.16GB). Sebagai jalan keluar, disiapkan notebook Colab end-to-end (`ml/colab/train_gloss_classifier.ipynb`) yang menjalankan seluruh Fase 1 di cloud tanpa perlu instalasi lokal — tinggal upload `kaggle.json` dan jalankan sel demi sel, lalu unduh model hasil dan salin ke `frontend/public/models/gloss-classifier/`. **Aksi berikutnya ada di tangan tim:** jalankan notebook tersebut (perlu akun Kaggle + API token), atau bebaskan ruang disk lokal jika lebih suka training lokal.

### 15.3 Dependensi Kunci per Tahap

| Fase | Blocker jika gagal | Rencana mitigasi |
|---|---|---|
| Fase 1 | Model tidak cukup akurat setelah fine-tune | Kurangi jumlah kata target dari 32 ke subset lebih kecil (mis. 15-20 kata dengan akurasi tertinggi) |
| Fase 1 | Ekspor ke TensorFlow.js gagal/tidak stabil | Fallback: jalankan inferensi di backend (trade-off butuh koneksi terus-menerus) |
| Fase 2 | Prompt normalisasi 9Router tidak konsisten | Iterasi prompt dengan few-shot examples, uji dengan variasi urutan gloss |
| Fase 3 | Performa real-time di browser lambat | Turunkan resolusi input kamera, kurangi frekuensi sampling frame |

### 15.4 Catatan untuk Eksekusi oleh Claude Code

- Ikuti urutan fase di atas — jangan mulai Fase 3 (frontend end-to-end) sebelum Fase 1 (model) punya checkpoint validasi yang lolos.
- Setiap task bertanda "Validasi checkpoint" adalah titik keputusan (decision gate) — konfirmasi ke pengguna sebelum lanjut jika hasil di bawah ekspektasi.
- Kredensial 9Router harus disimpan sebagai environment variable di backend (`.env`), tidak pernah di kode frontend maupun commit ke Git.
- Struktur folder di 15.1 adalah acuan awal, boleh disesuaikan tapi pertahankan pemisahan `ml/` (training, jalan terpisah/offline) dari `frontend/` dan `backend/` (aplikasi jalan/production).

### 15.6 Audit Model Klasifikasi Gloss (update 2026-08-10)

Anggota tim lain (`habib`, commit `0f930ef`) mendorong progres besar di luar sesi Claude Code ini: dictionary Mode 2 (32 video), beberapa iterasi model klasifikasi gloss (v1-v6), gestur mulai/stop, motion-detection buffer, EMA smoothing. Diaudit langsung (baca kode + cek hash file, bukan asumsi) — hasilnya **campuran: sebagian nyata dan berfungsi, sebagian tampilan UI yang tidak terhubung ke apa pun**.

**Nyata & berfungsi:**
- Model **v1, v2, v3** — checkpoint `.keras` di `ml/checkpoints/` punya MD5 hash berbeda satu sama lain (bukan duplikat), dan masing-masing punya file TFJS lengkap (`model.json` + `.bin`) di `frontend/public/models/gloss-classifier{,-v2,-v3}/`.
- Dictionary Mode 2 — 32 file `.mp4` di `frontend/public/dictionary/`, sesuai 32 kosakata PRD.

**Bermasalah — ditemukan lewat pengecekan langsung, bukan sekadar baca kode:**
1. **Model default di UI (v6) tidak pernah ada.** `SignToTextMode.tsx` set default `modelVer = 'v6'` dengan badge "👑 Supreme Pinnacle 320D — 99.69% Akurat", tapi folder `frontend/public/models/gloss-classifier-v6/` tidak ada sama sekali. `loadGlossModel()` gagal lalu diam-diam fallback v6→v5→v4→v3, akhirnya jalan di v3 — **tanpa memberi tahu pengguna**, badge tetap menampilkan "v6 (99.69%)" walau model yang jalan sebenarnya v3.
2. **Model v5 adalah file yang salah label.** `ml/checkpoints/v5/best.keras` **byte-identik** (MD5 sama persis) dengan checkpoint v1/root — artinya tidak pernah benar-benar dilatih ulang dengan pipeline 256D yang diklaim. Folder TFJS-nya di frontend cuma berisi `test.txt` (isi: `"hello"`), bukan model asli.
3. **Model v4 tidak pernah dilatih sama sekali** — script (`train_v4.py`, `export_v4_direct.py`, `extract_landmarks_v4.py`) ada, tapi tidak ada checkpoint maupun folder model TFJS di mana pun di repo.
4. **Angka akurasi di badge UI (99.69%, 98.75%, 95.0%, 87.5%) tidak berdasar** — sudah digrep ke seluruh `ml/`, tidak ada log evaluasi atau file metrik yang menghasilkan angka-angka itu. Sepertinya ditulis manual di teks UI, bukan hasil pengujian.

**Keputusan tim (2026-08-10):** untuk saat ini **dibiarkan dulu tanpa perubahan kode** — hanya didokumentasikan di sini. Sebelum demo ke juri, ini **wajib** diperbaiki (minimal: hapus tombol v4/v5/v6 yang palsu, jadikan v1/v2/v3 satu-satunya pilihan, hapus klaim akurasi yang tidak terbukti, atau lakukan evaluasi akurasi sungguhan dengan test set nyata) — kalau tidak, ada risiko juri menemukan sendiri saat tanya-jawab bahwa klaim akurasi tidak bisa dipertanggungjawabkan.

### 15.7 Perombakan UI, Room Remote, & Perbaikan (update 2026-08-10, lanjutan)

Menindaklanjuti audit §15.6, dikerjakan dalam sesi yang sama:

**Bug diperbaiki (bukan hanya didokumentasikan — kali ini langsung dibetulkan):**
- `frontend/src/lib/signDictionary.ts` — **daftar 32 kata untuk Mode 2/Dictionary Modal tidak sama sekali dengan 32 kata yang dikenali model** (bandingkan dengan `GLOSS_LABELS`) dan menunjuk ke file video yang tidak ada di `frontend/public/dictionary/` (mis. `ada.mp4`, `bantu.mp4`, `cinta.mp4` — tidak pernah direkam). Ditulis ulang total supaya `id` sejajar dengan indeks `GLOSS_LABELS`, dan `videoUrl` cocok dengan 32 file `.mp4` yang benar-benar ada.
- `GlossClassifier.tsx` — `loadGlossModel()` dirapikan: hanya mengenal v1/v2/v3 yang nyata, default `LATEST_GLOSS_MODEL = 'v3'`, tanpa fallback diam-diam ke model lain. **`GlossSequenceBuffer`, semua fungsi `landmarksTo*Vector`, dan algoritma `classify()` (threshold, cooldown, motion-gating) TIDAK diubah sama sekali** — sesuai instruksi eksplisit tim agar logika deteksi gerakan yang sudah divalidasi tidak disentuh.

**UI dirombak (redesign, satu warna aksen teal, tanpa gradien pelangi/neon):**
- Token desain terpusat di `frontend/src/index.css` (`.card`, `.btn-primary/secondary/danger`, `.badge-*`, `.tab-pill*`, `.input`).
- Semua gradien multi-warna & badge akurasi palsu (v4/v5/v6, "Supreme Pinnacle", crown emoji) dihapus dari `SignToTextMode.tsx`.
- Warna overlay skeleton kamera (magenta/violet neon) diredam ke palet teal/slate — ini murni warna canvas, tidak memengaruhi data landmark.

**Fitur baru — "Room" (lihat §5.3 untuk keputusan produk):**
- `frontend/src/rooms/RoomLocal.tsx` — Room Lokal: kamera→teks dan teks→isyarat sekarang satu room dengan **feed obrolan bersama** (bukan dua tab terpisah tanpa histori gabungan), memuat riwayat dari `GET /api/history` saat dibuka.
- `frontend/src/rooms/RoomRemote.tsx` + `backend/src/signaling.ts` — Room Remote: panggilan video WebRTC 1-lawan-1 dengan signaling Socket.io, memakai pipeline deteksi yang identik dengan Room Lokal.
- `frontend/src/components/AccuracyTestPanel.tsx` + `frontend/src/lib/modelSelfTest.ts` — panel "Uji Akurasi Model": menjalankan tiap model (v1/v2/v3) terhadap 32 video dictionary sebagai ground-truth pengganti, langsung di browser, supaya angka akurasi yang tampil **selalu hasil pengukuran nyata**, bukan ditulis manual. Secara eksplisit diberi label "sanity check", **bukan pengganti** evaluasi Signer-Independent resmi yang seharusnya dilakukan saat training di `ml/` (lihat §9).

**Testing ditambahkan (baru, sebelumnya nol test di kedua proyek):**
- Frontend: Vitest, 27 test — `signDictionary.test.ts` (parsing kalimat, integritas 32 label/video), `GlossClassifier.test.ts` (bentuk vector 126D/160D, state machine `GlossSequenceBuffer`, resampling) — **hanya menguji perilaku yang sudah ada, tidak mengubah logikanya**. Jalankan: `cd frontend && npm test`.
- Backend: Vitest + Supertest, 10 test — validasi `/api/normalize` dan `/api/history`, termasuk memastikan server merespons error terstruktur (502/500) alih-alih crash saat 9Router/MySQL tidak tersedia. `backend/src/index.ts` dipecah jadi `app.ts` (Express app, testable) + `index.ts` (bootstrap `listen()`) supaya bisa dites tanpa membuka port asli. Jalankan: `cd backend && npm test`.
- Diverifikasi end-to-end: `tsc -b`/`tsc --noEmit` bersih di kedua proyek, `npm run build` (frontend) sukses, `npm run dev` (frontend & backend) sama-sama start tanpa error, `oxlint` hanya menyisakan 3 warning pra-eksisting yang tidak terkait perubahan sesi ini.

**Belum dikerjakan (di luar sesi ini):**
- TURN server untuk Room Remote (lihat risiko §13) — tanpa itu, panggilan bisa gagal connect di jaringan NAT ketat.
- Rekonsiliasi v4/v5/v6 dari §15.6 (masih belum ada model v4/v5/v6 yang nyata).
- Deployment ke VPS (Fase 5) belum dimulai — tapi file persiapannya sudah ada (§15.9).

### 15.8 Bug ditemukan saat run.bat pertama kali dites user (update 2026-08-10, lanjutan lagi)

Begitu user benar-benar menjalankan aplikasi (bukan cuma `tsc`/build check), **Model v3 langsung gagal dimuat** di browser dengan error `ValueError: Corrupted configuration, expected array for nodeData: [object Object]`. Diselidiki langsung (baca isi `model.json`, bukan tebak-tebakan):

- `frontend/public/models/gloss-classifier-v3/model.json` diekspor dari **Keras 3.x** dengan format `inbound_nodes` baru — tiap layer menyimpan `{"args": [...], "kwargs": {...}}`, bukan format lama `[layer_name, node_index, tensor_index, kwargs]` yang diharapkan runtime **TensorFlow.js 4.22** (`@tensorflow/tfjs` di `frontend/package.json`) saat deserialize model Sequential.
- Dicek juga `gloss-classifier/model.json` (v1) dan `gloss-classifier-v2/model.json` (v2) — **keduanya tidak punya masalah ini** (tidak ada `inbound_nodes` per-layer sama sekali, format Sequential yang lebih sederhana).
- Ini bug murni di sisi ekspor Python (`tensorflowjs_converter`/`ml/export/export_tfjs.py` dijalankan dengan versi TensorFlow/Keras yang menghasilkan format tak kompatibel) — **bukan sesuatu yang bisa diperbaiki dari kode frontend**.

**Perbaikan yang dilakukan:** `v3` dikeluarkan dari `GLOSS_MODEL_VERSIONS` (`GlossClassifier.tsx`) supaya tombolnya tidak lagi muncul di UI dan tidak bisa dipilih (mencegah error yang sama terulang), `LATEST_GLOSS_MODEL` diubah ke **v2**. Konsekuensinya: saat ini cuma **v1 dan v2** yang bisa dipakai. Untuk memakai v3 lagi, perlu ekspor ulang modelnya dari Python dengan versi TensorFlow/tensorflowjs yang menghasilkan format `inbound_nodes` lama, lalu diverifikasi benar-benar bisa `tf.loadLayersModel()` di browser sebelum ditambahkan kembali ke daftar.

**Pelajaran untuk sesi berikutnya:** `tsc`/build check TIDAK cukup untuk memvalidasi model TFJS — file `model.json` bisa 100% valid secara struktur JSON dan lolos semua pemeriksaan level-kode, tapi tetap gagal saat benar-benar di-parse oleh runtime TFJS di browser. Klaim "model X sudah diverifikasi jalan" ke depannya harus disertai bukti model itu benar-benar dimuat (`tf.loadLayersModel()` berhasil) di browser sungguhan, bukan cuma pengecekan file/hash/shape seperti di §15.6.

### 15.9 Persiapan Deployment (Docker) — update 2026-08-10

Disiapkan jalur deploy berbasis Docker (dipilih tim di atas alternatif VPS-panel-spesifik atau platform managed): `backend/Dockerfile`, `frontend/Dockerfile` + `frontend/nginx.conf` (serve static build + proxy `/api` & `/socket.io` ke backend), `deploy/Caddyfile` (edge reverse proxy + HTTPS otomatis Let's Encrypt), `docker-compose.yml` (service `mysql`, `backend`, `frontend`, `caddy`), `.env.example` (root, variabel level-compose). Panduan lengkap step-by-step ada di `docs/DEPLOY.md`. Belum dieksekusi ke VPS sungguhan dalam sesi ini — baru disiapkan filenya.

---

## 16. Catatan Tim

- Tech stack sejalan dengan infrastruktur yang sudah dimiliki (VPS `newgabungan` & `vmi3108861`, 9Router, Hermes Agent) — tidak perlu membangun infrastruktur baru dari nol.
- Pendekatan web (bukan APK native) dipilih untuk mempermudah proses demo di hadapan juri: tinggal buka tautan, tanpa instalasi.