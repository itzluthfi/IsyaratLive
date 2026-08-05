"""Baseline training: klasifikasi gloss dari sequence landmark tangan.

Ini BUKAN implementasi Siformer/SPOTER — itu ada di repo referensi
`AceKinnn/WL-BISINDO` (lihat PRD bagian 9) dan sebaiknya dipakai untuk hasil
akurasi yang sesuai baseline (SD ~93%, SI ~73-75%). Script ini adalah
baseline Conv1D+LSTM yang lebih sederhana, titik awal cepat untuk validasi
pipeline end-to-end sebelum mengganti ke Siformer/SPoter.
"""

import argparse
import re
from pathlib import Path

import numpy as np
import tensorflow as tf
from tensorflow.keras import layers, models

FILENAME_RE = re.compile(r"signer(\d+)_label(\d+)_sample(\d+)\.npy", re.IGNORECASE)

# Harus sama urutan dengan GLOSS_LABELS di
# frontend/src/components/GlossClassifier.tsx
LABELS = [
    "Air", "Belajar", "Cari", "Hari", "Ingat", "Lagi", "Maaf", "Makan",
    "Motor", "Saya", "Terima kasih", "Tuli", "Apa", "Siapa", "Kapan",
    "Di mana", "Mengapa", "Bagaimana", "Merah", "Kuning", "Hijau", "Hitam",
    "Dengar", "Berangkat", "Datang", "Teman", "Keluarga", "Rumah", "Pagi",
    "Siang", "Sore", "Malam",
]

SEQUENCE_LENGTH = 30  # harus sama dengan SEQUENCE_LENGTH di GlossClassifier.tsx
FEATURE_DIM = 126  # 2 tangan x 21 titik x 3


def pad_or_trim(sequence: np.ndarray, length: int) -> np.ndarray:
    if len(sequence) >= length:
        return sequence[:length]
    pad = np.zeros((length - len(sequence), sequence.shape[1]), dtype=sequence.dtype)
    return np.concatenate([sequence, pad], axis=0)


def load_split(split_dir: Path):
    X, y = [], []
    for npy_path in sorted(split_dir.glob("*.npy")):
        match = FILENAME_RE.match(npy_path.name)
        if not match:
            continue
        _, label_id, _ = (int(g) for g in match.groups())
        sequence = np.load(npy_path)
        X.append(pad_or_trim(sequence, SEQUENCE_LENGTH))
        y.append(label_id)
    return np.stack(X), np.array(y)


def build_model(num_classes: int) -> tf.keras.Model:
    model = models.Sequential([
        layers.Input(shape=(SEQUENCE_LENGTH, FEATURE_DIM)),
        layers.Conv1D(64, 3, padding="same", activation="relu"),
        layers.Conv1D(64, 3, padding="same", activation="relu"),
        layers.LSTM(64, return_sequences=False),
        layers.Dropout(0.3),
        layers.Dense(64, activation="relu"),
        layers.Dense(num_classes, activation="softmax"),
    ])
    model.compile(optimizer="adam", loss="sparse_categorical_crossentropy", metrics=["accuracy"])
    return model


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True, type=Path, help="Output extract_landmarks.py")
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--checkpoint-dir", type=Path, default=Path("checkpoints"))
    args = parser.parse_args()

    X_train, y_train = load_split(args.data / "train")
    X_test, y_test = load_split(args.data / "test")

    model = build_model(num_classes=len(LABELS))
    model.summary()

    args.checkpoint_dir.mkdir(parents=True, exist_ok=True)
    checkpoint = tf.keras.callbacks.ModelCheckpoint(
        args.checkpoint_dir / "best.keras", save_best_only=True, monitor="val_accuracy"
    )

    model.fit(
        X_train,
        y_train,
        validation_data=(X_test, y_test),
        epochs=args.epochs,
        batch_size=args.batch_size,
        callbacks=[checkpoint],
    )

    loss, accuracy = model.evaluate(X_test, y_test)
    print(f"Test accuracy (skema sesuai split yang dipakai): {accuracy:.4f}")


if __name__ == "__main__":
    main()
