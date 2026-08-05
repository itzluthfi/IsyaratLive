// Integrasi opsional dengan Hermes Agent (Telegram bot) untuk review riwayat
// percakapan. Lihat PRD bagian 10 "Pengembangan Lanjutan" — belum diimplementasi
// pada MVP, disiapkan sebagai titik ekstensi.

const HERMES_WEBHOOK_URL = process.env.HERMES_WEBHOOK_URL

export async function notifyHermes(text: string): Promise<void> {
  if (!HERMES_WEBHOOK_URL) return

  await fetch(HERMES_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
}
