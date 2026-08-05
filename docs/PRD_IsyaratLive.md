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
- **Bukan** video call jarak jauh (seperti Zoom). Sistem dirancang untuk **satu perangkat dipakai tatap muka** oleh dua orang di lokasi yang sama.
- **Bukan** avatar 3D animasi generatif untuk mode teks→isyarat — menggunakan dictionary video/GIF isyarat yang sudah direkam.
- **Bukan** penerjemah kalimat kompleks/multi-klausa pada versi MVP.
- **Bukan** mendukung seluruh variasi dialek isyarat daerah pada versi kompetisi (fokus BISINDO standar nasional).

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
- [ ] Mode 1: kamera → deteksi isyarat real-time → teks tersusun rapi (LLM) → suara
- [ ] Riwayat percakapan tersimpan, bisa di-scroll
- [ ] Fallback mode degradasi saat koneksi terputus

### Pengembangan Lanjutan (jika waktu cukup)
- [ ] Mode 2: teks/suara → video isyarat (dictionary-based)
- [ ] Mode belajar isyarat (kamera memvalidasi gerakan pengguna untuk latihan)
- [ ] Integrasi Hermes Agent via Telegram untuk review riwayat

### Di Luar Cakupan Kompetisi
- Video call jarak jauh (real-time dua sisi)
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

**FASE 0 — Setup**
- [ ] Inisialisasi repo Git, struktur folder sesuai 15.1
- [ ] Setup lingkungan Python (`ml/`) — `venv`, `requirements.txt` (mediapipe, tensorflow, tensorflowjs)
- [ ] Setup proyek frontend — `npm create vite@latest frontend -- --template react-ts`, install `@mediapipe/tasks-vision`, `@tensorflow/tfjs`, Tailwind
- [ ] Setup proyek backend — `npm init`, Express, dotenv, mysql2

**FASE 1 — Model & Dataset (Bulan 1)**
- [ ] Unduh dataset WL-BISINDO dari Kaggle (`glennleonali/wl-bisindo`)
- [ ] Clone/fork repo `AceKinnn/WL-BISINDO`, salin `organize_dataset.py` + metadata JSON ke `ml/dataset/`
- [ ] Jalankan `organize_dataset.py` dengan skema **Signer-Independent** (`SI_split_metadata.json`)
- [ ] Tulis script ekstraksi landmark pose dari video (di `ml/preprocessing/`), ikuti pipeline preprocessing Siformer/SPOTER di repo referensi
- [ ] Fine-tune Siformer (atau SPOTER sebagai pembanding) pada 32 kelas kata di `ml/training/`
- [ ] Evaluasi akurasi pada skema SI, catat hasil per signer
- [ ] Ekspor model terlatih ke format TensorFlow.js (`ml/export/`) menggunakan `tensorflowjs_converter`
- [ ] Salin hasil export ke `frontend/public/models/`
- [ ] **Validasi checkpoint**: buat halaman test sederhana di frontend yang load model TFJS + `@mediapipe/tasks-vision` HandLandmarker, uji real-time di browser dengan minimal 5 kata sampel

**FASE 2 — Backend & Integrasi LLM (Bulan 2, minggu 1-2)**
- [ ] Buat endpoint `POST /normalize` di backend — terima array gloss, panggil 9Router
- [ ] Desain & uji prompt normalisasi gloss→kalimat (butuh iterasi, simpan beberapa versi prompt untuk dibandingkan)
- [ ] Setup koneksi MySQL, skema tabel riwayat percakapan (`conversations`, `messages`)
- [ ] Buat endpoint CRUD riwayat (`GET/POST /history`)
- [ ] Uji fallback: matikan koneksi ke 9Router secara sengaja, pastikan backend merespons error yang bisa ditangani frontend (bukan crash)

**FASE 3 — Frontend Mode 1 End-to-End (Bulan 2, minggu 3-4)**
- [ ] `CameraCapture` — minta izin kamera, render video stream
- [ ] `LandmarkDetector` — integrasi `HandLandmarker` mode video real-time
- [ ] `GlossClassifier` — buffer landmark sequence, jalankan inferensi TFJS, keluarkan gloss
- [ ] Hubungkan gloss ke `lib/api.ts` → panggil `/normalize` → tampilkan hasil di `ChatDisplay`
- [ ] `SpeechOutput` — integrasi Web Speech API untuk baca teks hasil normalisasi
- [ ] Implementasi mode degradasi: jika `/normalize` gagal, tampilkan gloss mentah langsung
- [ ] **Validasi checkpoint**: alur lengkap kamera → suara berjalan tanpa error untuk 32 kata target

**FASE 4 — Mode 2 & Penyempurnaan (Bulan 3, jika waktu cukup)**
- [ ] Siapkan/rekam 32 video/GIF isyarat pendek untuk dictionary Mode 2 (bisa direkam ulang oleh tim, boleh berbeda dari dataset training karena hanya untuk ditampilkan, bukan untuk training)
- [ ] `TextToSignMode` — Web Speech API (STT) atau input teks → pecah kata kunci → mapping ke dictionary → tampilkan berurutan
- [ ] Polish UI/UX, uji dengan pengguna di luar tim jika memungkinkan
- [ ] (Opsional) Integrasi Hermes Agent untuk akses riwayat via Telegram

**FASE 5 — Deployment & Demo (Bulan 3, minggu terakhir)**
- [ ] Deploy frontend (build statis) ke VPS `vmi3108861` atau `newgabungan`
- [ ] Deploy backend Node.js, setup reverse proxy OpenLiteSpeed
- [ ] Pasang HTTPS (Let's Encrypt) — wajib untuk akses kamera browser
- [ ] Uji end-to-end di environment produksi (bukan localhost)
- [ ] Rekam video demo 10 menit sesuai format final GEMASTIK
- [ ] Siapkan kode sumber & dokumentasi rapi untuk sesi tanya-jawab juri

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

---

## 16. Catatan Tim

- Tech stack sejalan dengan infrastruktur yang sudah dimiliki (VPS `newgabungan` & `vmi3108861`, 9Router, Hermes Agent) — tidak perlu membangun infrastruktur baru dari nol.
- Pendekatan web (bukan APK native) dipilih untuk mempermudah proses demo di hadapan juri: tinggal buka tautan, tanpa instalasi.