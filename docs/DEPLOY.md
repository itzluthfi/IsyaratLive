# Deploy IsyaratLive (Docker)

Arsitektur: **Caddy** (edge, HTTPS otomatis via Let's Encrypt) → **frontend**
(Nginx, static build + proxy `/api` & `/socket.io`) → **backend** (Node/Express
+ Socket.io) → **MySQL**. Semua di 4 container lewat `docker-compose.yml` di
root repo.

```
Internet ──HTTPS──▶ Caddy ──▶ frontend (Nginx) ──/api,/socket.io──▶ backend ──▶ mysql
                                     │
                                     └── serve static build (React, model TFJS, video dictionary)
```

## Prasyarat di server

1. VPS Linux (Ubuntu 22.04+ disarankan) dengan **Docker** dan **Docker
   Compose plugin** terinstal:
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER   # lalu logout/login ulang
   ```
2. Domain yang **A record**-nya sudah diarahkan ke IP VPS ini. **Wajib** —
   akses kamera browser tidak diizinkan tanpa HTTPS (PRD §8), dan Caddy butuh
   domain untuk minta sertifikat Let's Encrypt otomatis.
3. Port **80** dan **443** terbuka di firewall VPS (`ufw allow 80,443/tcp`
   kalau pakai `ufw`).
4. API key **9Router** (untuk Mode Kalimat/LLM) — tanpa ini aplikasi tetap
   jalan tapi otomatis mode degradasi (gloss mentah, bukan crash).

## Langkah deploy

```bash
git clone <url-repo-kamu> isyaratlive
cd isyaratlive

# 1. Variabel level-compose (domain, email Let's Encrypt, password MySQL)
cp .env.example .env
nano .env   # isi DOMAIN, ACME_EMAIL, MYSQL_ROOT_PASSWORD, MYSQL_PASSWORD

# 2. Variabel backend (API key 9Router, dll)
cp backend/.env.example backend/.env
nano backend/.env   # isi NINEROUTER_API_KEY (DB_* akan di-override compose, tak perlu diisi di sini)

# 3. Build & jalankan
docker compose up -d --build

# 4. Cek semua container sehat
docker compose ps
docker compose logs -f
```

Setelah beberapa detik (Caddy sedang minta sertifikat TLS), buka
`https://domain-kamu.com` — harus langsung dapat sertifikat valid otomatis,
tanpa langkah manual certbot.

## Update ke versi baru

```bash
git pull
docker compose up -d --build
```

Data MySQL (riwayat percakapan) tersimpan di Docker volume `mysql-data`,
**tidak hilang** saat rebuild/redeploy — hanya hilang kalau eksplisit
`docker compose down -v`.

## Cek kesehatan cepat

```bash
curl https://domain-kamu.com/api/health   # harus {"ok":true}
```

Kalau gagal: `docker compose logs backend` untuk lihat error (biasanya
kredensial MySQL salah, atau `NINEROUTER_API_KEY` belum diisi — yang kedua
bukan fatal, endpoint tetap merespons 502 terkendali, bukan crash).

## Model klasifikasi gloss & video dictionary

Model TFJS (`frontend/public/models/`) dan video dictionary
(`frontend/public/dictionary/`, ±39MB) ikut ter-build ke dalam image
frontend saat `docker compose build` — tidak perlu langkah unggah terpisah,
asalkan folder itu sudah ada di repo sebelum build (lihat PRD §15.6 soal
model mana yang benar-benar valid: v1/v2/v3).

## Room Remote (WebRTC) di balik NAT/firewall VPS

Signaling (Socket.io) sudah otomatis lewat `/socket.io/` via Nginx →
backend. Video/audio WebRTC-nya sendiri **peer-to-peer langsung antar
browser pengguna** (bukan lewat server), pakai STUN publik Google — ini
sudah cukup untuk kebanyakan jaringan. Kalau ada pengguna di jaringan
korporat/NAT sangat ketat dan panggilan gagal connect, perlu tambahan **TURN
server** (self-host `coturn`, gratis, tapi belum disiapkan di compose ini —
lihat risiko di PRD §13).

## Kalau belum punya domain (tes cepat via IP)

Ganti isi `deploy/Caddyfile` baris `{$DOMAIN} { ... }` menjadi `:80 { ... }`
lalu `docker compose up -d --build`, akses `http://IP-VPS`. **Kamera tidak
akan bisa diakses browser** tanpa HTTPS — mode ini cuma untuk cek API/UI
selain fitur kamera.
