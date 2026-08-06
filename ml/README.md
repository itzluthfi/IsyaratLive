# ml/ — Training model klasifikasi gloss (Fase 1, PRD bagian 15.2)

Bagian ini **jalan terpisah/offline** dari `frontend/` dan `backend/` — hasil
akhirnya (model TensorFlow.js) disalin ke `frontend/public/models/`.

Butuh mesin dengan Python 3.10+ (idealnya GPU untuk training) dan kredensial
Kaggle sendiri — keduanya tidak tersedia di lingkungan eksekusi Claude Code
ini, jadi bagian ini disiapkan sebagai skeleton siap jalan, bukan sudah
dieksekusi.

## Cara tercepat: Google Colab (direkomendasikan)

Buka `ml/colab/train_gloss_classifier.ipynb` di [Google Colab](https://colab.research.google.com/)
(File → Upload notebook), pilih runtime GPU (T4 cukup), lalu jalankan
sel demi sel. Notebook ini sudah berisi seluruh pipeline Fase 1 secara
end-to-end (identik logikanya dengan script di folder ini): unduh dataset
Kaggle → split Signer-Independent → ekstraksi landmark → training → ekspor
TFJS → unduh hasil model sebagai `.zip`. Butuh `kaggle.json` (API token dari
akun Kaggle-mu) untuk diupload saat diminta.

Setelah selesai, ekstrak `gloss-classifier.zip` dan salin isinya ke
`frontend/public/models/gloss-classifier/`.

## Setup lokal (alternatif, butuh Python 3.10+ & ruang disk ~3GB kosong)

> Catatan: `requirements.txt` sudah diperbaiki dari versi awal —
> `tensorflow==2.16.1` semula bentrok dengan `tensorflowjs`
> (`tensorflow-decision-forests` butuh `tensorflow~=2.15.0`), dan
> `orbax-checkpoint` versi terbaru mensyaratkan `uvloop` yang **tidak
> didukung di Windows**. Sudah dipin ke `tensorflow==2.15.1` dan
> `orbax-checkpoint==0.4.4` supaya `pip install -r requirements.txt` jalan
> bersih di Windows.

```bash
cd ml
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Langkah (sesuai PRD 15.2 Fase 1)

1. **Unduh dataset WL-BISINDO dari Kaggle** — butuh `kaggle.json` (API token
   dari akun Kaggle-mu) di `~/.kaggle/kaggle.json`:
   ```bash
   kaggle datasets download -d glennleonali/wl-bisindo -p dataset/raw --unzip
   ```
2. **Split Signer-Independent**:
   ```bash
   python dataset/organize_dataset.py --input dataset/raw --output dataset/split --scheme SI
   ```
3. **Ekstraksi landmark pose** dari tiap video (MediaPipe Python):
   ```bash
   python preprocessing/extract_landmarks.py --input dataset/split --output preprocessing/landmarks
   ```
4. **Training** (baseline sequence classifier di atas landmark):
   ```bash
   python training/train.py --data preprocessing/landmarks --epochs 50
   ```
5. **Evaluasi akurasi** per signer (target 80-90% skema SI, lihat PRD bagian 9
   soal risiko akurasi bervariasi 48-91% tergantung signer).
6. **Ekspor ke TensorFlow.js**:
   ```bash
   python export/export_tfjs.py --model training/checkpoints/best.keras --output export/tfjs_model
   cp -r export/tfjs_model/* ../frontend/public/models/gloss-classifier/
   ```

## Catatan

- Dataset asli (CC BY-NC 4.0, non-komersial) — cantumkan sitasi BibTeX resmi
  dari repo `AceKinnn/WL-BISINDO` di dokumentasi/proposal, jangan commit file
  dataset mentah ke Git (lihat `.gitignore`).
- Model referensi PRD adalah Siformer/SPOTER (transformer berbasis landmark
  pose). `training/train.py` di sini adalah baseline sequence classifier
  (Conv1D + LSTM di atas landmark) sebagai titik awal — ganti dengan
  implementasi Siformer/SPOTER dari repo `AceKinnn/WL-BISINDO` untuk hasil
  yang sesuai baseline akurasi di PRD bagian 9.
- `GLOSS_WINDOW_MS`/`SEQUENCE_LENGTH` di
  `frontend/src/components/GlossClassifier.tsx` harus disamakan dengan
  panjang sequence yang dipakai saat training di sini.
