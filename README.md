# IsyaratLive

Penerjemah BISINDO (Bahasa Isyarat Indonesia) real-time berbasis AI —
GEMASTIK XIX 2026, Divisi VIII. Dokumen produk lengkap ada di
[`docs/PRD_IsyaratLive.md`](docs/PRD_IsyaratLive.md).

## Struktur

- `ml/` — training model klasifikasi gloss (Python, offline). Lihat `ml/README.md`.
- `frontend/` — React + Vite + Tailwind. Kamera, deteksi landmark
  (MediaPipe), klasifikasi gloss (TensorFlow.js), UI dua mode.
- `backend/` — Node.js + Express. Endpoint `/api/normalize` (proxy ke
  9Router) dan `/api/history` (MySQL).
- `dictionary/` — video/GIF isyarat untuk Mode 2 (teks → isyarat).

## Jalankan lokal

```bash
# Backend
cd backend
cp .env.example .env   # isi NINEROUTER_API_KEY & kredensial MySQL
npm install
npm run dev             # http://localhost:3001

# Frontend
cd frontend
npm install
npm run dev              # http://localhost:5173, proxy /api -> backend
```

Model klasifikasi gloss (`frontend/public/models/gloss-classifier/`) belum
terisi — perlu training di `ml/` terlebih dahulu (lihat `ml/README.md`) atau
model placeholder untuk pengujian pipeline.

## Status implementasi

Lihat checklist fase lengkap di PRD bagian 15.2. Ringkas:

- [x] **Fase 0** — struktur proyek, scaffold frontend & backend
- [ ] **Fase 1** — training model (`ml/`) — butuh dataset Kaggle + kredensial,
      belum dieksekusi di sesi ini
- [x] **Fase 2/3 (skeleton)** — endpoint backend & alur frontend Mode 1 sudah
      tersambung, menunggu model asli dari Fase 1 untuk berfungsi penuh
- [ ] **Fase 4** — Mode 2 (dictionary video) — UI sudah ada, dictionary video
      belum direkam
- [ ] **Fase 5** — deployment ke VPS
