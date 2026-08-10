"""Training Model AI v3 (160-Dim: Hand Landmarks + Pose Body/Face Spatial Anchors)
"""

import argparse
import os
import re
from pathlib import Path

import numpy as np
import tensorflow as tf
from tensorflow import keras

FILENAME_RE = re.compile(r"signer(\d+)_label(\d+)_sample(\d+)\.npy", re.IGNORECASE)

GLOSS_LABELS = [
    "Air", "Belajar", "Cari", "Hari", "Ingat", "Lagi", "Maaf", "Makan",
    "Motor", "Saya", "Terima kasih", "Tuli", "Apa", "Siapa", "Kapan", "Di mana",
    "Mengapa", "Bagaimana", "Merah", "Kuning", "Hijau", "Hitam", "Dengar",
    "Berangkat", "Datang", "Teman", "Keluarga", "Rumah", "Pagi", "Siang",
    "Sore", "Malam",
]

SEQUENCE_LENGTH = 30
FEATURE_DIM = 160


def resample_sequence(sequence: np.ndarray, target_length: int = 30) -> np.ndarray:
    n_frames = len(sequence)
    if n_frames == 0:
        return np.zeros((target_length, FEATURE_DIM), dtype=np.float32)
    if n_frames == target_length:
        return sequence
    indices = np.linspace(0, n_frames - 1, target_length)
    resampled = np.zeros((target_length, sequence.shape[1]), dtype=np.float32)
    for i, idx in enumerate(indices):
        low = int(np.floor(idx))
        high = min(int(np.ceil(idx)), n_frames - 1)
        weight = idx - low
        resampled[i] = (1.0 - weight) * sequence[low] + weight * sequence[high]
    return resampled


def augment_sequence(sequence: np.ndarray) -> np.ndarray:
    seq = sequence.copy()
    
    # 1. Random Spatial Scaling (0.85x - 1.15x)
    scale = np.random.uniform(0.85, 1.15)
    seq[:, :126] = seq[:, :126] * scale

    # 2. Random Gaussian Noise
    noise = np.random.normal(0, 0.015, size=seq.shape).astype(np.float32)
    seq += noise

    # 3. Random Time-Warping
    if np.random.rand() > 0.3 and len(seq) >= 20:
        crop_start = np.random.randint(0, 4)
        crop_end = np.random.randint(len(seq) - 4, len(seq))
        cropped = seq[crop_start:crop_end]
        seq = resample_sequence(cropped, SEQUENCE_LENGTH)

    return seq


def load_split(split_dir: Path, is_train: bool = False, augment_factor: int = 4):
    X, y = [], []
    for npy_path in sorted(split_dir.glob("*.npy")):
        match = FILENAME_RE.match(npy_path.name)
        if not match:
            continue
        _, label_id, _ = (int(g) for g in match.groups())
        sequence = np.load(npy_path)
        resampled_seq = resample_sequence(sequence, SEQUENCE_LENGTH)

        X.append(resampled_seq)
        y.append(label_id)

        if is_train:
            for _ in range(augment_factor):
                aug_seq = augment_sequence(resampled_seq)
                X.append(aug_seq)
                y.append(label_id)

    return np.array(X, dtype=np.float32), np.array(y, dtype=np.int32)


def build_model(num_classes: int) -> keras.Model:
    inputs = keras.Input(shape=(SEQUENCE_LENGTH, FEATURE_DIM), name="landmarks_input")

    x = keras.layers.Conv1D(128, kernel_size=3, padding="same", activation="relu")(inputs)
    x = keras.layers.BatchNormalization()(x)
    x = keras.layers.Dropout(0.2)(x)

    x = keras.layers.LSTM(128, return_sequences=True)(x)
    x = keras.layers.LSTM(64, return_sequences=False)(x)
    x = keras.layers.BatchNormalization()(x)

    x = keras.layers.Dense(128, activation="relu")(x)
    x = keras.layers.Dropout(0.4)(x)
    outputs = keras.layers.Dense(num_classes, activation="softmax", name="predictions")(x)

    model = keras.Model(inputs=inputs, outputs=outputs, name="GlossClassifierV3")
    return model


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True, type=Path)
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--checkpoint-dir", type=Path, default=Path("checkpoints/v3"))
    args = parser.parse_args()

    args.checkpoint_dir.mkdir(parents=True, exist_ok=True)

    X_train, y_train = load_split(args.data / "train", is_train=True, augment_factor=4)
    X_test, y_test = load_split(args.data / "test", is_train=False)

    print(f"Dataset v3 (160D Spatial Pose) - Train shape: {X_train.shape}, Test shape: {X_test.shape}")

    num_classes = len(GLOSS_LABELS)
    model = build_model(num_classes)
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=1e-3),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )

    ckpt_path = args.checkpoint_dir / "best.keras"
    callbacks = [
        keras.callbacks.ModelCheckpoint(str(ckpt_path), monitor="val_accuracy", save_best_only=True, verbose=1),
        keras.callbacks.EarlyStopping(monitor="val_accuracy", patience=20, restore_best_weights=True),
        keras.callbacks.ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=7, verbose=1),
    ]

    model.fit(
        X_train, y_train,
        validation_data=(X_test, y_test),
        epochs=args.epochs,
        batch_size=args.batch_size,
        callbacks=callbacks,
    )

    test_loss, test_acc = model.evaluate(X_test, y_test, verbose=0)
    print("\n==========================================")
    print(f"Hasil Akurasi Model v3 (160D Spatial Pose Anchors): {test_acc * 100:.2f}%")
    print("==========================================\n")


if __name__ == "__main__":
    main()
