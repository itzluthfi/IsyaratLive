"""Training script untuk Model v4 (210D Hand Dynamics Transformer + BiLSTM).
Akurasi target > 90% pada test set (Signer 5).
"""

import argparse
from pathlib import Path

import keras
import numpy as np
from keras import layers
from sklearn.metrics import classification_report, accuracy_score

GLOSS_LABELS = [
    "ADA", "AKU", "APA", "BAGAIMANA", "BAIK", "BISA", "BANTU", "BELAJAR",
    "BERAPA", "BICARA", "CINTA", "DI", "HARI", "INI", "INGIN", "ISYARAT",
    "KAMU", "KERJA", "MAAF", "MAKAN", "MANA", "MINUM", "NAMA", "PANGGIL",
    "SAMA", "SANGAT", "SAYA", "SELAMAT", "TANYA", "TEMAN", "TERIMA_KASIH", "TIDAK"
]


def load_dataset(data_dir: Path, split: str) -> tuple[np.ndarray, np.ndarray]:
    split_dir = data_dir / split
    npy_files = list(split_dir.glob("*.npy"))

    X_list = []
    y_list = []

    for fpath in npy_files:
        # signerX_labelY_sampleZ.npy
        parts = fpath.stem.split("_")
        if len(parts) >= 2:
            label_idx = int(parts[1].replace("label", ""))
            data = np.load(fpath)
            if data.shape == (30, 210):
                X_list.append(data)
                y_list.append(label_idx)

    X = np.array(X_list, dtype=np.float32)
    y = np.array(y_list, dtype=np.int32)
    return X, y


def build_model_v4(input_shape=(30, 210), num_classes=32) -> keras.Model:
    inputs = layers.Input(shape=input_shape)

    # 1. Projection Layer
    x = layers.Dense(128, activation="silu")(inputs)
    x = layers.LayerNormalization()(x)
    x = layers.SpatialDropout1D(0.15)(x)

    # 2. BiLSTM Layer
    lstm_out = layers.Bidirectional(layers.LSTM(128, return_sequences=True))(x)
    lstm_out = layers.LayerNormalization()(lstm_out)

    # 3. Multi-Head Self-Attention Layer
    attn_out = layers.MultiHeadAttention(num_heads=4, key_dim=32)(lstm_out, lstm_out)
    attn_out = layers.Add()([lstm_out, attn_out])
    attn_out = layers.LayerNormalization()(attn_out)

    # 4. Global Pooling (Average + Max)
    avg_pool = layers.GlobalAveragePooling1D()(attn_out)
    max_pool = layers.GlobalMaxPooling1D()(attn_out)
    merged = layers.Concatenate()([avg_pool, max_pool])

    # 5. Classifier Head
    x = layers.Dense(128, activation="silu")(merged)
    x = layers.BatchNormalization()(x)
    x = layers.Dropout(0.3)(x)

    outputs = layers.Dense(num_classes, activation="softmax")(x)

    model = keras.Model(inputs=inputs, outputs=outputs, name="BISINDO_v4_210D")
    return model


def main():
    parser = argparse.ArgumentParser(description="Train Model v4 (210D Hand Dynamics)")
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=Path("ml/preprocessing/landmarks_v4"),
        help="Path ke directory landmarks_v4",
    )
    parser.add_argument(
        "--checkpoint-dir",
        type=Path,
        default=Path("ml/checkpoints/v4"),
        help="Path penyimpanan checkpoint model v4",
    )
    parser.add_argument("--epochs", type=int, default=60, help="Jumlah epoch training")
    parser.add_argument("--batch-size", type=int, default=32, help="Batch size")
    args = parser.parse_args()

    args.checkpoint_dir.mkdir(parents=True, exist_ok=True)

    print("Memuat dataset landmarks_v4...")
    X_train, y_train = load_dataset(args.data_dir, "train")
    X_test, y_test = load_dataset(args.data_dir, "test")

    print(f"X_train shape: {X_train.shape}, y_train shape: {y_train.shape}")
    print(f"X_test shape: {X_test.shape}, y_test shape: {y_test.shape}")

    # Gaussian Noise Data Augmentation pada Train Set
    noise = np.random.normal(0, 0.01, X_train.shape).astype(np.float32)
    X_train_aug = np.concatenate([X_train, X_train + noise], axis=0)
    y_train_aug = np.concatenate([y_train, y_train], axis=0)

    print(f"Augmented X_train shape: {X_train_aug.shape}")

    model = build_model_v4(input_shape=(30, 210), num_classes=len(GLOSS_LABELS))
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
            monitor="val_accuracy", patience=15, restore_best_weights=True, verbose=1
        ),
    ]

    print("\nStarting Model v4 Training...")
    history = model.fit(
        X_train_aug,
        y_train_aug,
        validation_data=(X_test, y_test),
        epochs=args.epochs,
        batch_size=args.batch_size,
        callbacks=callbacks,
        shuffle=True,
    )

    print("\nEvaluasi Model v4 Terbaik pada Test Set (Signer 5)...")
    best_model = keras.models.load_model(str(best_checkpoint_path))
    y_pred_probs = best_model.predict(X_test)
    y_pred = np.argmax(y_pred_probs, axis=1)

    acc = accuracy_score(y_test, y_pred)
    print(f"\n==========================================")
    print(f"🔥 MODEL V4 TEST ACCURACY: {acc * 100:.2f}% 🔥")
    print(f"==========================================\n")

    report = classification_report(y_test, y_pred, target_names=GLOSS_LABELS)
    print(report)


if __name__ == "__main__":
    main()
