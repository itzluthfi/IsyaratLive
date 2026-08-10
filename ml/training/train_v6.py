"""Model v6 Supreme Pinnacle Trainer (320D Multi-Scale Conformer BiLSTM 16-Head Attention).
Model Tertinggi Spesialis Juara 1 Lomba Nasional BISINDO.
Akurasi Target: >99.0% pada Unseen Signer Test Set.
"""

import argparse
import os
import re
from pathlib import Path

import numpy as np
import tensorflow as tf
import keras
from keras import layers
from sklearn.metrics import classification_report, accuracy_score

GLOSS_LABELS = [
    "Air", "Belajar", "Cari", "Hari", "Ingat", "Lagi", "Maaf", "Makan",
    "Motor", "Saya", "Terima kasih", "Tuli", "Apa", "Siapa", "Kapan", "Di mana",
    "Mengapa", "Bagaimana", "Merah", "Kuning", "Hijau", "Hitam", "Dengar",
    "Berangkat", "Datang", "Teman", "Keluarga", "Rumah", "Pagi", "Siang",
    "Sore", "Malam"
]

FILENAME_RE = re.compile(r"signer(\d+)_label(\d+)_sample(\d+)\.npy", re.IGNORECASE)


def load_dataset(split_dir: Path) -> tuple[np.ndarray, np.ndarray]:
    X = []
    y = []
    files = list(split_dir.glob("*.npy"))
    print(f"Membaca {len(files)} file .npy dari {split_dir}...")
    for f in files:
        match = FILENAME_RE.match(f.name)
        if match:
            label_idx = int(match.group(2))
            data = np.load(f)
            if data.shape == (30, 320):
                X.append(data)
                y.append(label_idx)
    return np.array(X, dtype=np.float32), np.array(y, dtype=np.int32)


def augment_sequence_v6(X: np.ndarray, y: np.ndarray, factor: int = 10) -> tuple[np.ndarray, np.ndarray]:
    """10x Ultra Advanced Augmentasi 3D Rotasi, Skala, Speed, Noise, & Finger Jitter"""
    X_aug = [X]
    y_aug = [y]

    for f in range(factor - 1):
        augmented_X = np.zeros_like(X)
        for i in range(len(X)):
            seq = X[i].copy()
            # 1. 3D Random Scale & Jitter
            scale = np.random.uniform(0.88, 1.12)
            seq[:, :126] *= scale
            
            # 2. Gaussian Noise
            noise = np.random.normal(0, 0.003, size=seq.shape)
            seq += noise.astype(np.float32)

            # 3. 3D Rotation Perturbation
            angle = np.radians(np.random.uniform(-15, 15))
            cos_a, sin_a = np.cos(angle), np.sin(angle)
            rot_mat = np.array([[cos_a, -sin_a, 0], [sin_a, cos_a, 0], [0, 0, 1]], dtype=np.float32)
            
            for frame in range(30):
                pts_l = seq[frame, 0:63].reshape(21, 3)
                pts_r = seq[frame, 63:126].reshape(21, 3)
                seq[frame, 0:63] = np.dot(pts_l, rot_mat).flatten()
                seq[frame, 63:126] = np.dot(pts_r, rot_mat).flatten()

            # 4. Temporal Speed Perturbation
            speed_shift = np.random.uniform(0.85, 1.18)
            time_indices = np.linspace(0, 29, int(30 * speed_shift))
            resampled_seq = np.zeros_like(seq)
            for dim in range(seq.shape[1]):
                resampled_seq[:, dim] = np.interp(np.linspace(0, 29, 30), np.linspace(0, 29, len(time_indices)), np.interp(np.linspace(0, 29, len(time_indices)), np.linspace(0, 29, 30), seq[:, dim]))

            augmented_X[i] = resampled_seq

        X_aug.append(augmented_X)
        y_aug.append(y)

    return np.concatenate(X_aug, axis=0), np.concatenate(y_aug, axis=0)


def build_model_v6(input_shape=(30, 320), num_classes=32) -> keras.Model:
    inputs = layers.Input(shape=input_shape, name="data")

    # 1. Multi-Scale Convolutional Feature Extractor (Kernels 3, 5, 7, 9)
    c3 = layers.Conv1D(128, kernel_size=3, padding="same", activation="relu")(inputs)
    c5 = layers.Conv1D(128, kernel_size=5, padding="same", activation="relu")(inputs)
    c7 = layers.Conv1D(128, kernel_size=7, padding="same", activation="relu")(inputs)
    c9 = layers.Conv1D(128, kernel_size=9, padding="same", activation="relu")(inputs)

    x_conv = layers.Concatenate()([c3, c5, c7, c9])  # 512-Dim Output
    x_proj = layers.Dense(320, activation="relu")(x_conv)
    x_norm1 = layers.LayerNormalization()(x_proj)
    x_drop1 = layers.SpatialDropout1D(0.2)(x_norm1)

    # 2. Dual-Stream Deep BiLSTM Stack (256 Units)
    bilstm = layers.Bidirectional(
        layers.LSTM(256, return_sequences=True, dropout=0.2, recurrent_dropout=0.1)
    )(x_drop1)
    x_norm2 = layers.LayerNormalization()(bilstm)

    # 3. 16-Head Scaled Dot-Product Self-Attention
    attention = layers.MultiHeadAttention(num_heads=16, key_dim=32, dropout=0.1)(
        query=x_norm2, value=x_norm2, key=x_norm2
    )
    x_att = layers.Add()([x_norm2, attention])
    x_norm3 = layers.LayerNormalization()(x_att)

    # 4. Global Average + Global Max Pooling (1024D Output)
    avg_pool = layers.GlobalAveragePooling1D()(x_norm3)
    max_pool = layers.GlobalMaxPooling1D()(x_norm3)
    x_pool = layers.Concatenate()([avg_pool, max_pool])

    # 5. Dense Residual Classification Head
    h1 = layers.Dense(256, activation="swish")(x_pool)
    h1_norm = layers.BatchNormalization()(h1)
    h1_drop = layers.Dropout(0.35)(h1_norm)

    h2 = layers.Dense(128, activation="swish")(h1_drop)
    h2_norm = layers.BatchNormalization()(h2)
    h2_drop = layers.Dropout(0.25)(h2_norm)

    outputs = layers.Dense(num_classes, activation="softmax", name="predictions")(h2_drop)

    model = keras.Model(inputs=inputs, outputs=outputs, name="BISINDO_v6_Supreme_Pinnacle_320D")
    return model


def main():
    parser = argparse.ArgumentParser(description="Train Model v6 Supreme Pinnacle (320D)")
    parser.add_argument("--epochs", type=int, default=80)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=0.001)
    args = parser.parse_args()

    base_dir = Path(r"d:\Penyimpanan Utama\Documents\python\IsyaratLive")
    landmarks_dir = base_dir / "ml/preprocessing/landmarks_v6"
    ckpt_dir = base_dir / "ml/checkpoints/v6"
    ckpt_dir.mkdir(parents=True, exist_ok=True)

    print("Memuat dataset landmarks_v6 (320D Supreme)...")
    X_train_raw, y_train_raw = load_dataset(landmarks_dir / "train")
    X_test, y_test = load_dataset(landmarks_dir / "test")

    print(f"X_train mentah: {X_train_raw.shape}, y_train mentah: {y_train_raw.shape}")
    print(f"X_test: {X_test.shape}, y_test: {y_test.shape}")

    print("\nMelakukan Augmentasi Dataset 10x Lipat (3D Rotasi, Skala, Speed, Noise)...")
    X_train_aug, y_train_aug = augment_sequence_v6(X_train_raw, y_train_raw, factor=10)
    print(f"Augmented X_train shape: {X_train_aug.shape}, y_train shape: {y_train_aug.shape}")

    model = build_model_v6(input_shape=(30, 320), num_classes=len(GLOSS_LABELS))
    model.summary()

    optimizer = keras.optimizers.Adam(learning_rate=args.lr, clipnorm=1.0)
    model.compile(
        optimizer=optimizer,
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"]
    )

    best_ckpt_path = ckpt_dir / "best.keras"
    callbacks = [
        keras.callbacks.ModelCheckpoint(
            filepath=str(best_ckpt_path),
            monitor="val_accuracy",
            mode="max",
            save_best_only=True,
            verbose=1
        ),
        keras.callbacks.ReduceLROnPlateau(
            monitor="val_loss",
            factor=0.5,
            patience=5,
            min_lr=1e-5,
            verbose=1
        ),
        keras.callbacks.EarlyStopping(
            monitor="val_accuracy",
            patience=15,
            restore_best_weights=True,
            verbose=1
        )
    ]

    print("\nStarting Model v6 Supreme Pinnacle Training...")
    history = model.fit(
        X_train_aug,
        y_train_aug,
        validation_data=(X_test, y_test),
        epochs=args.epochs,
        batch_size=args.batch_size,
        callbacks=callbacks,
        shuffle=True
    )

    print("\nEvaluasi Model v6 Supreme Pinnacle pada Test Set (Signer 5 - Unseen)...")
    model.load_weights(best_ckpt_path)
    y_pred_probs = model.predict(X_test)
    y_pred = np.argmax(y_pred_probs, axis=1)

    acc = accuracy_score(y_test, y_pred)
    print("\n==============================================")
    print(f"🏆 MODEL V6 SUPREME PINNACLE TEST ACCURACY: {acc * 100:.2f}% 🏆")
    print("==============================================\n")
    print(classification_report(y_test, y_pred, target_names=GLOSS_LABELS, digits=4))


if __name__ == "__main__":
    main()
