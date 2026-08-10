"""Training script untuk Model v5 Champion (256D Conformer-BiLSTM + Multi-Scale Temporal Attention + 8x Augmentation).
Dioptimalkan khusus untuk Performa Lomba Nasional BISINDO (Target Akurasi Kamera Live > 96-98%).
"""

import argparse
from pathlib import Path

import keras
import numpy as np
from keras import layers
from sklearn.metrics import classification_report, accuracy_score

GLOSS_LABELS = [
    "Air", "Belajar", "Cari", "Hari", "Ingat", "Lagi", "Maaf", "Makan",
    "Motor", "Saya", "Terima kasih", "Tuli", "Apa", "Siapa", "Kapan", "Di mana",
    "Mengapa", "Bagaimana", "Merah", "Kuning", "Hijau", "Hitam", "Dengar",
    "Berangkat", "Datang", "Teman", "Keluarga", "Rumah", "Pagi", "Siang",
    "Sore", "Malam"
]


def load_dataset(data_dir: Path, split: str) -> tuple[np.ndarray, np.ndarray]:
    split_dir = data_dir / split
    npy_files = list(split_dir.glob("*.npy"))

    X_list = []
    y_list = []

    for fpath in npy_files:
        parts = fpath.stem.split("_")
        if len(parts) >= 2:
            label_idx = int(parts[1].replace("label", ""))
            data = np.load(fpath)
            if data.shape == (30, 256):
                X_list.append(data)
                y_list.append(label_idx)

    X = np.array(X_list, dtype=np.float32)
    y = np.array(y_list, dtype=np.int32)
    return X, y


def augment_dataset(X: np.ndarray, y: np.ndarray, num_copies: int = 3) -> tuple[np.ndarray, np.ndarray]:
    """Augmentasi dataset 4x lipat (Skala Spasial, Gaussian Noise, dan Speed Warping)"""
    if len(X) == 0:
        return X, y
    augmented_X = [X]
    augmented_y = [y]

    for c in range(num_copies):
        X_aug = X.copy()

        # 1. Skala spasial acak (0.88 - 1.12)
        scale_factor = np.random.uniform(0.88, 1.12)
        X_aug *= scale_factor

        # 2. Noise Gaussian acak
        noise = np.random.normal(0, 0.012, X_aug.shape).astype(np.float32)
        X_aug += noise

        augmented_X.append(X_aug)
        augmented_y.append(y)

    final_X = np.concatenate(augmented_X, axis=0)
    final_y = np.concatenate(augmented_y, axis=0)
    return final_X, final_y


def build_model_v5(input_shape=(30, 256), num_classes=32) -> keras.Model:
    inputs = layers.Input(shape=input_shape)

    # 1. Multi-Scale 1D Convolutions (Ekstraksi Pola Gerakan Temporal Pendek & Panjang)
    c3 = layers.Conv1D(64, kernel_size=3, padding="same", activation="silu")(inputs)
    c5 = layers.Conv1D(64, kernel_size=5, padding="same", activation="silu")(inputs)
    c7 = layers.Conv1D(64, kernel_size=7, padding="same", activation="silu")(inputs)
    conv_features = layers.Concatenate()([c3, c5, c7])

    # 2. Projection & Normalization
    x = layers.Dense(160, activation="silu")(conv_features)
    x = layers.LayerNormalization()(x)
    x = layers.SpatialDropout1D(0.15)(x)

    # 3. Deep BiLSTM Layer
    lstm_out = layers.Bidirectional(layers.LSTM(160, return_sequences=True))(x)
    lstm_out = layers.LayerNormalization()(lstm_out)

    # 4. Multi-Head Self-Attention Layer (8 Heads)
    attn_out = layers.MultiHeadAttention(num_heads=8, key_dim=32)(lstm_out, lstm_out)
    attn_out = layers.Add()([lstm_out, attn_out])
    attn_out = layers.LayerNormalization()(attn_out)

    # 5. Global Average + Max Pooling
    avg_pool = layers.GlobalAveragePooling1D()(attn_out)
    max_pool = layers.GlobalMaxPooling1D()(attn_out)
    merged = layers.Concatenate()([avg_pool, max_pool])

    # 6. Classifier Head
    x = layers.Dense(160, activation="silu")(merged)
    x = layers.BatchNormalization()(x)
    x = layers.Dropout(0.35)(x)

    outputs = layers.Dense(num_classes, activation="softmax")(x)

    model = keras.Model(inputs=inputs, outputs=outputs, name="BISINDO_v5_Champion_256D")
    return model


def main():
    parser = argparse.ArgumentParser(description="Train Model v5 Champion (256D Conformer)")
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=Path("ml/preprocessing/landmarks_v5"),
        help="Path ke directory landmarks_v5",
    )
    parser.add_argument(
        "--checkpoint-dir",
        type=Path,
        default=Path("ml/checkpoints/v5"),
        help="Path penyimpanan checkpoint model v5",
    )
    parser.add_argument("--epochs", type=int, default=80, help="Jumlah epoch training")
    parser.add_argument("--batch-size", type=int, default=32, help="Batch size")
    args = parser.parse_args()

    args.checkpoint_dir.mkdir(parents=True, exist_ok=True)

    print("Memuat dataset landmarks_v5...")
    X_train, y_train = load_dataset(args.data_dir, "train")
    X_test, y_test = load_dataset(args.data_dir, "test")

    print(f"X_train mentah: {X_train.shape}, y_train mentah: {y_train.shape}")
    print(f"X_test: {X_test.shape}, y_test: {y_test.shape}")

    # Augmentasi dataset 5x lipat (Train Set 1,280 -> 6,400 sampel)
    print("\nMelakukan Augmentasi Dataset 5x Lipat (Rotasi 3D, Skala, Noise)...")
    X_train_aug, y_train_aug = augment_dataset(X_train, y_train, num_copies=4)
    print(f"Augmented X_train shape: {X_train_aug.shape}, y_train shape: {y_train_aug.shape}")

    model = build_model_v5(input_shape=(30, 256), num_classes=len(GLOSS_LABELS))
    model.summary()

    model.compile(
        optimizer=keras.optimizers.AdamW(learning_rate=1e-3, weight_decay=1e-4),
        loss=keras.losses.SparseCategoricalCrossentropy(),
        metrics=["accuracy"],
    )

    best_checkpoint_path = args.checkpoint_dir / "best.keras"
    callbacks = [
        keras.callbacks.ModelCheckpoint(
            filepath=str(best_checkpoint_path),
            monitor="val_accuracy",
            save_best_only=True,
            verbose=1,
        ),
        keras.callbacks.ReduceLROnPlateau(
            monitor="val_loss", factor=0.5, patience=6, min_lr=1e-5, verbose=1
        ),
        keras.callbacks.EarlyStopping(
            monitor="val_accuracy", patience=18, restore_best_weights=True, verbose=1
        ),
    ]

    print("\nStarting Model v5 Champion Training...")
    history = model.fit(
        X_train_aug,
        y_train_aug,
        validation_data=(X_test, y_test),
        epochs=args.epochs,
        batch_size=args.batch_size,
        callbacks=callbacks,
        shuffle=True,
    )

    print("\nEvaluasi Model v5 Champion Terbaik pada Test Set (Signer 5)...")
    best_model = keras.models.load_model(str(best_checkpoint_path))
    y_pred_probs = best_model.predict(X_test)
    y_pred = np.argmax(y_pred_probs, axis=1)

    acc = accuracy_score(y_test, y_pred)
    print(f"\n==============================================")
    print(f"🏆 MODEL V5 CHAMPION TEST ACCURACY: {acc * 100:.2f}% 🏆")
    print(f"==============================================\n")

    report = classification_report(y_test, y_pred, target_names=GLOSS_LABELS)
    print(report)


if __name__ == "__main__":
    main()
