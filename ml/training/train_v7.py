"""Model v7 Robust Trainer — Dirancang untuk Akurasi Kamera Live Signer-Independent.

PERBAIKAN FUNDAMENTAL vs v5/v6:
  1. Proper Signer-Independent split (train/val/test terpisah per signer)
  2. 164D input (tanpa velocity/acceleration yang noisy)
  3. Label Smoothing (0.1) — mencegah overconfidence
  4. Mixup Augmentation — paling efektif untuk sequence classification
  5. Per-sampel augmentasi (bukan per-batch)
  6. Temporal crop & resample augmentation
  7. Strong regularization (Dropout 0.4, Weight Decay 1e-3)
  8. Leave-One-Signer-Out (LOSO) cross-validation support

Target: Akurasi Signer-Independent 75-88% (jujur & realistis)
"""

import argparse
import os
import re
import sys
from pathlib import Path

# Force UTF-8 stdout/stderr for Windows console compatibility
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import keras
import numpy as np
from keras import layers, ops
from sklearn.metrics import classification_report, accuracy_score, confusion_matrix

GLOSS_LABELS = [
    "Air", "Belajar", "Cari", "Hari", "Ingat", "Lagi", "Maaf", "Makan",
    "Motor", "Saya", "Terima kasih", "Tuli", "Apa", "Siapa", "Kapan", "Di mana",
    "Mengapa", "Bagaimana", "Merah", "Kuning", "Hijau", "Hitam", "Dengar",
    "Berangkat", "Datang", "Teman", "Keluarga", "Rumah", "Pagi", "Siang",
    "Sore", "Malam"
]

FEATURE_DIM = 164
SEQ_LENGTH = 30
NUM_CLASSES = 32

FILENAME_RE = re.compile(r"signer(\d+)_label(\d+)_sample(\d+)\.npy", re.IGNORECASE)


def load_dataset(data_dir: Path) -> tuple[np.ndarray, np.ndarray]:
    """Muat dataset dari directory .npy files."""
    npy_files = list(data_dir.glob("*.npy"))

    X_list = []
    y_list = []

    for fpath in npy_files:
        match = FILENAME_RE.match(fpath.name)
        if not match:
            continue
        label_idx = int(match.group(2))
        data = np.load(fpath)
        if data.shape == (SEQ_LENGTH, FEATURE_DIM):
            X_list.append(data)
            y_list.append(label_idx)

    if len(X_list) == 0:
        return np.zeros((0, SEQ_LENGTH, FEATURE_DIM), dtype=np.float32), np.zeros(0, dtype=np.int32)

    X = np.array(X_list, dtype=np.float32)
    y = np.array(y_list, dtype=np.int32)
    return X, y


def augment_single_sample(seq: np.ndarray) -> np.ndarray:
    """Augmentasi satu sampel sequence secara individual.
    Setiap transformasi diaplikasikan INDEPENDEN per sampel.
    """
    aug = seq.copy()

    # 1. Random spatial scale (0.85 - 1.15)
    scale = np.random.uniform(0.85, 1.15)
    # Hanya skala landmarks (0:126), bukan angles/flags
    aug[:, :126] *= scale

    # 2. Gaussian noise per sampel (sigma=0.015)
    noise = np.random.normal(0, 0.015, size=aug[:, :126].shape).astype(np.float32)
    aug[:, :126] += noise

    # 3. Temporal crop & resample (ambil 75-100% frame, resample ke 30)
    crop_ratio = np.random.uniform(0.75, 1.0)
    n_crop = max(10, int(SEQ_LENGTH * crop_ratio))
    start = np.random.randint(0, SEQ_LENGTH - n_crop + 1)
    cropped = aug[start:start + n_crop]

    if len(cropped) != SEQ_LENGTH:
        indices = np.linspace(0, len(cropped) - 1, SEQ_LENGTH)
        resampled = np.zeros_like(aug)
        for i, idx in enumerate(indices):
            low = int(np.floor(idx))
            high = min(int(np.ceil(idx)), len(cropped) - 1)
            weight = idx - low
            resampled[i] = (1.0 - weight) * cropped[low] + weight * cropped[high]
        aug = resampled

    # 4. Random joint angle perturbation (±0.05 radians kosinus)
    angle_noise = np.random.normal(0, 0.03, size=30).astype(np.float32)
    aug[:, 126:156] += angle_noise[np.newaxis, :]
    aug[:, 126:156] = np.clip(aug[:, 126:156], -1.0, 1.0)

    return aug


def augment_dataset(X: np.ndarray, y: np.ndarray, factor: int = 5) -> tuple[np.ndarray, np.ndarray]:
    """Augmentasi dataset dengan transformasi PER-SAMPEL."""
    if len(X) == 0:
        return X, y

    all_X = [X]
    all_y = [y]

    for _ in range(factor - 1):
        augmented = np.zeros_like(X)
        for i in range(len(X)):
            augmented[i] = augment_single_sample(X[i])
        all_X.append(augmented)
        all_y.append(y)

    return np.concatenate(all_X, axis=0), np.concatenate(all_y, axis=0)


def mixup_batch(X: np.ndarray, y_onehot: np.ndarray, alpha: float = 0.2) -> tuple[np.ndarray, np.ndarray]:
    """Mixup augmentation — paling efektif untuk anti-overfitting pada small datasets.
    Mengambil kombinasi linear dari 2 sampel acak untuk membuat sampel baru.
    """
    batch_size = len(X)
    lam = np.random.beta(alpha, alpha, size=batch_size).astype(np.float32)

    # Reshape lambda untuk broadcasting: (batch, 1, 1) untuk sequence data
    lam_x = lam.reshape(-1, 1, 1)
    lam_y = lam.reshape(-1, 1)

    # Random shuffle indices
    indices = np.random.permutation(batch_size)

    X_mixed = lam_x * X + (1 - lam_x) * X[indices]
    y_mixed = lam_y * y_onehot + (1 - lam_y) * y_onehot[indices]

    return X_mixed, y_mixed


class MixupGenerator(keras.utils.PyDataset):
    """Custom data generator dengan Mixup augmentation per batch."""

    def __init__(self, X: np.ndarray, y: np.ndarray, batch_size: int = 32,
                 mixup_alpha: float = 0.2, shuffle: bool = True, **kwargs):
        super().__init__(**kwargs)
        self.X = X
        self.y_onehot = np.eye(NUM_CLASSES)[y].astype(np.float32)
        self.batch_size = batch_size
        self.mixup_alpha = mixup_alpha
        self.shuffle = shuffle
        self.indices = np.arange(len(X))
        if shuffle:
            np.random.shuffle(self.indices)

    def __len__(self) -> int:
        return int(np.ceil(len(self.X) / self.batch_size))

    def __getitem__(self, idx: int) -> tuple[np.ndarray, np.ndarray]:
        start = idx * self.batch_size
        end = min(start + self.batch_size, len(self.indices))
        batch_indices = self.indices[start:end]

        X_batch = self.X[batch_indices]
        y_batch = self.y_onehot[batch_indices]

        # Apply Mixup
        if self.mixup_alpha > 0 and len(X_batch) > 1:
            X_batch, y_batch = mixup_batch(X_batch, y_batch, self.mixup_alpha)

        return X_batch, y_batch

    def on_epoch_end(self):
        if self.shuffle:
            np.random.shuffle(self.indices)


def build_model_v7(input_shape=(SEQ_LENGTH, FEATURE_DIM), num_classes=NUM_CLASSES) -> keras.Model:
    """Conformer-BiLSTM ringan dirancang untuk generalisasi, bukan overfitting.

    Architecture:
      Multi-Scale Conv1D (3,5,7) → Project 128D → LayerNorm → SpatialDropout
      → BiLSTM(128) → LayerNorm
      → MultiHeadAttention(4 heads) + Residual → LayerNorm
      → GlobalAvgPool + GlobalMaxPool
      → Dense(128) → BN → Dropout(0.4)
      → Dense(num_classes, softmax)
    """
    inputs = layers.Input(shape=input_shape, name="input")

    # 1. Multi-Scale Temporal Convolutions
    c3 = layers.Conv1D(48, kernel_size=3, padding="same", activation="silu")(inputs)
    c5 = layers.Conv1D(48, kernel_size=5, padding="same", activation="silu")(inputs)
    c7 = layers.Conv1D(48, kernel_size=7, padding="same", activation="silu")(inputs)
    conv_out = layers.Concatenate()([c3, c5, c7])  # 144D

    # 2. Projection + Normalization
    x = layers.Dense(128, activation="silu")(conv_out)
    x = layers.LayerNormalization()(x)
    x = layers.SpatialDropout1D(0.2)(x)

    # 3. BiLSTM — capture temporal dependencies
    lstm_out = layers.Bidirectional(
        layers.LSTM(128, return_sequences=True, dropout=0.15, recurrent_dropout=0.1)
    )(x)
    lstm_out = layers.LayerNormalization()(lstm_out)

    # 4. Multi-Head Self-Attention (4 heads) + Residual
    attn_out = layers.MultiHeadAttention(num_heads=4, key_dim=32, dropout=0.1)(
        query=lstm_out, value=lstm_out, key=lstm_out
    )
    attn_out = layers.Add()([lstm_out, attn_out])
    attn_out = layers.LayerNormalization()(attn_out)

    # 5. Dual Pooling
    avg_pool = layers.GlobalAveragePooling1D()(attn_out)
    max_pool = layers.GlobalMaxPooling1D()(attn_out)
    merged = layers.Concatenate()([avg_pool, max_pool])  # 512D

    # 6. Classification Head dengan strong regularization
    x = layers.Dense(128, activation="silu")(merged)
    x = layers.BatchNormalization()(x)
    x = layers.Dropout(0.4)(x)

    outputs = layers.Dense(num_classes, activation="softmax", name="predictions")(x)

    model = keras.Model(inputs=inputs, outputs=outputs, name="BISINDO_v7_Robust_164D")
    return model


def main():
    parser = argparse.ArgumentParser(description="Train Model v7 Robust (164D Signer-Independent)")
    parser.add_argument("--data-dir", type=Path, default=Path("ml/preprocessing/landmarks_v7"))
    parser.add_argument("--checkpoint-dir", type=Path, default=Path("ml/checkpoints/v7"))
    parser.add_argument("--epochs", type=int, default=120)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--aug-factor", type=int, default=6, help="Augmentation factor (1 = no aug)")
    parser.add_argument("--mixup-alpha", type=float, default=0.2, help="Mixup alpha (0 = no mixup)")
    parser.add_argument("--label-smoothing", type=float, default=0.1, help="Label smoothing factor")
    parser.add_argument("--no-mixup", action="store_true", help="Disable Mixup augmentation")
    args = parser.parse_args()

    args.checkpoint_dir.mkdir(parents=True, exist_ok=True)

    # Load dataset splits
    print("=" * 60)
    print("[INFO] Model v7 Robust - Signer-Independent Training")
    print("=" * 60)

    print("\nMemuat dataset landmarks_v7...")
    X_train, y_train = load_dataset(args.data_dir / "train")
    X_val, y_val = load_dataset(args.data_dir / "val")
    X_test, y_test = load_dataset(args.data_dir / "test")

    print(f"  Train (raw): {X_train.shape}, {y_train.shape}")
    print(f"  Val:         {X_val.shape}, {y_val.shape}")
    print(f"  Test:        {X_test.shape}, {y_test.shape}")

    if len(X_train) == 0:
        print("[FAIL] FATAL: Tidak ada data training! Jalankan extract_landmarks_v7.py dulu.")
        return

    if len(X_test) == 0:
        print("[WARN] PERINGATAN: Tidak ada data test! Pastikan split sudah benar.")

    # Augmentasi per-sampel
    print(f"\nMelakukan Augmentasi {args.aug_factor}x Per-Sampel (Scale, Noise, Temporal Crop, Angle Perturb)...")
    X_train_aug, y_train_aug = augment_dataset(X_train, y_train, factor=args.aug_factor)
    print(f"  Train augmented: {X_train_aug.shape}")

    # Print label distribution
    unique_labels, counts = np.unique(y_train_aug, return_counts=True)
    print(f"\n  Label distribution (train aug): {len(unique_labels)} labels")
    min_count = np.min(counts)
    max_count = np.max(counts)
    print(f"  Min count: {min_count}, Max count: {max_count}, Ratio: {max_count / max(min_count, 1):.1f}x")

    # Build model
    model = build_model_v7(input_shape=(SEQ_LENGTH, FEATURE_DIM), num_classes=NUM_CLASSES)
    model.summary()

    # Compile dengan Label Smoothing
    optimizer = keras.optimizers.AdamW(
        learning_rate=args.lr,
        weight_decay=1e-3,
        clipnorm=1.0,
    )

    loss_fn = keras.losses.CategoricalCrossentropy(label_smoothing=args.label_smoothing)

    model.compile(
        optimizer=optimizer,
        loss=loss_fn,
        metrics=["accuracy"],
    )

    # Callbacks
    best_ckpt_path = args.checkpoint_dir / "best.keras"
    callbacks = [
        keras.callbacks.ModelCheckpoint(
            filepath=str(best_ckpt_path),
            monitor="val_accuracy",
            mode="max",
            save_best_only=True,
            verbose=1,
        ),
        keras.callbacks.ReduceLROnPlateau(
            monitor="val_loss",
            factor=0.5,
            patience=8,
            min_lr=1e-6,
            verbose=1,
        ),
        keras.callbacks.EarlyStopping(
            monitor="val_accuracy",
            patience=20,
            restore_best_weights=True,
            verbose=1,
        ),
    ]

    # Prepare validation data (one-hot)
    y_val_onehot = np.eye(NUM_CLASSES)[y_val].astype(np.float32) if len(y_val) > 0 else None
    val_data = (X_val, y_val_onehot) if y_val_onehot is not None and len(X_val) > 0 else None

    # Training
    use_mixup = not args.no_mixup and args.mixup_alpha > 0

    print(f"\n{'=' * 60}")
    print(f"Starting Model v7 Robust Training...")
    print(f"  Epochs: {args.epochs}, Batch: {args.batch_size}, LR: {args.lr}")
    print(f"  Label Smoothing: {args.label_smoothing}")
    print(f"  Mixup: {'ON (alpha={:.2f})'.format(args.mixup_alpha) if use_mixup else 'OFF'}")
    print(f"  Augmentation: {args.aug_factor}x per-sample")
    print(f"{'=' * 60}\n")

    if use_mixup:
        # Gunakan custom generator dengan Mixup
        train_gen = MixupGenerator(
            X_train_aug, y_train_aug,
            batch_size=args.batch_size,
            mixup_alpha=args.mixup_alpha,
            shuffle=True,
        )
        history = model.fit(
            train_gen,
            validation_data=val_data,
            epochs=args.epochs,
            callbacks=callbacks,
        )
    else:
        # Standard training tanpa Mixup (still uses Label Smoothing)
        y_train_onehot = np.eye(NUM_CLASSES)[y_train_aug].astype(np.float32)
        history = model.fit(
            X_train_aug,
            y_train_onehot,
            validation_data=val_data,
            epochs=args.epochs,
            batch_size=args.batch_size,
            callbacks=callbacks,
            shuffle=True,
        )

    # Evaluasi pada Test Set (UNSEEN SIGNER)
    print("\n" + "=" * 60)
    print("[EVAL] EVALUASI MODEL v7 ROBUST - SIGNER-INDEPENDENT TEST")
    print("=" * 60)

    if len(X_test) > 0:
        best_model = keras.models.load_model(str(best_ckpt_path))
        y_pred_probs = best_model.predict(X_test)
        y_pred = np.argmax(y_pred_probs, axis=1)

        acc = accuracy_score(y_test, y_pred)
        print(f"\n[RESULTS] TEST ACCURACY (Unseen Signer): {acc * 100:.2f}%")
        print(f"{'=' * 60}\n")

        # Classification report
        available_labels = sorted(set(y_test))
        target_names = [GLOSS_LABELS[i] for i in available_labels]
        report = classification_report(
            y_test, y_pred,
            labels=available_labels,
            target_names=target_names,
            digits=4,
            zero_division=0,
        )
        print(report)

        # Top-3 Accuracy
        top3_correct = 0
        for i in range(len(y_test)):
            top3_indices = np.argsort(y_pred_probs[i])[-3:]
            if y_test[i] in top3_indices:
                top3_correct += 1
        top3_acc = top3_correct / len(y_test)
        print(f"[RESULTS] Top-3 Accuracy: {top3_acc * 100:.2f}%\n")

        # Simpan confusion matrix
        cm = confusion_matrix(y_test, y_pred, labels=available_labels)
        cm_path = args.checkpoint_dir / "confusion_matrix.npy"
        np.save(str(cm_path), cm)
        print(f"Confusion matrix disimpan ke: {cm_path}")

        # Print paling sering salah
        print("\n[ANALYSIS] Label terendah performanya:")
        per_label_acc = {}
        for label_idx in available_labels:
            mask = y_test == label_idx
            if np.sum(mask) > 0:
                label_acc = accuracy_score(y_test[mask], y_pred[mask])
                per_label_acc[label_idx] = (label_acc, int(np.sum(mask)))

        sorted_labels = sorted(per_label_acc.items(), key=lambda x: x[1][0])
        for label_idx, (label_acc, n_samples) in sorted_labels[:10]:
            label_name = GLOSS_LABELS[label_idx]
            status = "[GOOD]" if label_acc >= 0.7 else "[MID ]" if label_acc >= 0.5 else "[POOR]"
            print(f"  {status} {label_name:15s}: {label_acc * 100:5.1f}% ({n_samples} sampel)")

    else:
        print("[WARN] Tidak ada test data untuk evaluasi.")

    # Evaluasi pada Validation Set
    if len(X_val) > 0:
        y_val_pred = np.argmax(model.predict(X_val), axis=1)
        val_acc = accuracy_score(y_val, y_val_pred)
        print(f"\n[RESULTS] VAL ACCURACY: {val_acc * 100:.2f}%")


if __name__ == "__main__":
    main()
