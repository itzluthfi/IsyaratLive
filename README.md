# IsyaRasa

Penerjemah BISINDO (Bahasa Isyarat Indonesia) real-time berbasis AI —
GEMASTIK XIX 2026, Divisi VIII: Pengembangan Perangkat Lunak. Dokumen produk lengkap ada di
[`docs/PRD_IsyaRasa.md`](docs/PRD_IsyaRasa.md) (lihat §15.6/§15.7 untuk
audit & status terbaru).

## Struktur

- `ml/` — training model klasifikasi gloss (Python, offline). Lihat `ml/README.md`.
- `frontend/` — React + Vite + Tailwind. Kamera, deteksi landmark
  (MediaPipe), klasifikasi gloss (TensorFlow.js), Room Lokal & Room Remote (WebRTC).
- `backend/` — Node.js + Express + Socket.io. Endpoint `/api/normalize`
  (proxy ke 9Router), `/api/history` (MySQL), dan signaling WebRTC untuk Room Remote.
- `dictionary/`, `frontend/public/dictionary/` — video isyarat untuk Mode 2 (teks → isyarat).

## Jalankan lokal — cara cepat (Windows)

```bat
setup.bat   REM sekali di awal: npm install kedua sisi + buat backend\.env
run.bat     REM buka backend & frontend, masing-masing di jendela cmd terpisah
```

Setelah `setup.bat`, buka `backend\.env` dan isi `NINEROUTER_API_KEY` (wajib
untuk Mode Kalimat/LLM — tanpa ini otomatis jatuh ke mode degradasi) serta
kredensial MySQL (opsional, kalau tidak diisi riwayat percakapan tidak
tersimpan tapi aplikasi tetap jalan).

## Jalankan lokal — manual (semua OS)

```bash
# Backend
cd backend
cp .env.example .env   # isi NINEROUTER_API_KEY & kredensial MySQL
npm install
npm run dev             # http://localhost:3001 (HTTP + signaling Socket.io)

# Frontend (terminal terpisah)
cd frontend
npm install
npm run dev              # https://localhost:5173, proxy /api & /socket.io -> backend
```

Model klasifikasi gloss (v1/v2 — v3 dikeluarkan dari daftar karena file
ekspornya rusak/tidak kompatibel, lihat PRD §15.8) sudah tersedia di
`frontend/public/models/`. Lihat panel **"Uji Akurasi Model"** di header
aplikasi untuk mengecek akurasi tiap versi terhadap 32 video dictionary
(sanity check, bukan evaluasi Signer-Independent resmi).

## Testing

```bash
cd frontend && npm test   # Vitest — parsing dictionary, vector klasifikasi, buffer state
cd backend  && npm test   # Vitest + Supertest — endpoint /normalize & /history
```

## Deployment / Hosting (Docker & VPS)

Panduan lengkap mengenai arsitektur Docker 4-container (Caddy, Frontend Nginx, Backend Node.js, MySQL) dan pendaftaran sertifikat HTTPS/SSL otomatis tersedia di file tersendiri:

👉 **[`docs/DEPLOY.md`](docs/DEPLOY.md)**

Ringkasan deploy di VPS Ubuntu:

```bash
git clone https://github.com/itzluthfi/IsyaRasa.git IsyaRasa && cd IsyaRasa
cp .env.example .env && cp backend/.env.example backend/.env
# isi DOMAIN & API key di file .env
docker compose up -d --build
```

## Status implementasi

Lihat checklist fase lengkap & audit di PRD bagian 15.2–15.9. Ringkas:

- [x] **Fase 0** — struktur proyek, scaffold frontend & backend
- [~] **Fase 1** — model klasifikasi gloss v1/v2 sudah ada, terverifikasi bisa
  dimuat browser, & bisa diuji dari UI (v3 rusak, dikeluarkan — PRD §15.8),
  tapi belum lewat pipeline training resmi ml/ dataset WL-BISINDO (§15.6)
- [x] **Fase 2/3** — backend, Room Lokal (kamera↔teks & teks↔isyarat satu feed obrolan)
- [x] **Fase 4** — Mode 2 (dictionary video, 32 kata) + Room Remote (video call WebRTC 1-lawan-1)
- [x] **Fase 5** — deployment ke VPS (Docker Compose + Caddy HTTPS otomatis di `docs/DEPLOY.md`)
