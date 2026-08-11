"""Ekstrak 164D Robust Feature Dataset (Model v7) — Dirancang Khusus untuk Akurasi Kamera Live.
Fitur 164D (Robust, Camera-Invariant):
  1. 126D Normalized Hand Landmarks (Left 63D + Right 63D)
  2.  30D Joint Angle Flexion Cosines (Left 15D + Right 15D)
  3.   8D Dual Hand Wrist Interaction & Handedness Flags

PERBAIKAN KRITIS vs v5/v6:
  - Proper Signer-Independent split (signer0-3 train, signer4 test)
  - Menghilangkan velocity/acceleration (terlalu noisy di live camera)
  - Normalisasi yang robust (max-distance dari wrist, bukan wrist-to-MCP)
  - Mendukung Leave-One-Signer-Out (LOSO) cross-validation
"""

import argparse
import re
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from tqdm import tqdm

FILENAME_RE = re.compile(r"signer(\d+)_label(\d+)_sample(\d+)\.mp4", re.IGNORECASE)
NUM_HANDS = 2
NUM_POINTS = 21
FEATURE_DIM = 164
TARGET_LENGTH = 30

# Dataset WL-BISINDO: signer0 (label 0-11), signer1-4 (label 0-31)
# Default LOSO: train=signer0,1,2,3  test=signer4
DEFAULT_TEST_SIGNER = 4


def resample_sequence(sequence: np.ndarray, target_length: int = TARGET_LENGTH) -> np.ndarray:
    """Resample temporal sequence ke fixed-length menggunakan interpolasi linear."""
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


def extract_frame_landmarks(hand_result) -> tuple[np.ndarray, np.ndarray]:
    """Ekstrak landmark tangan kiri & kanan dari hasil MediaPipe."""
    left_hand = None
    right_hand = None

    if hand_result and hand_result.hand_landmarks and hand_result.handedness:
        for hand_landmarks, handedness in zip(
            hand_result.hand_landmarks[:NUM_HANDS],
            hand_result.handedness[:NUM_HANDS],
        ):
            label = handedness[0].category_name if len(handedness) > 0 else "Left"
            pts = np.array([[p.x, p.y, p.z] for p in hand_landmarks], dtype=np.float32)
            if label == "Left":
                left_hand = pts
            else:
                right_hand = pts

    if left_hand is None:
        left_hand = np.zeros((21, 3), dtype=np.float32)
    if right_hand is None:
        right_hand = np.zeros((21, 3), dtype=np.float32)

    return left_hand, right_hand


def hand_is_active(hand: np.ndarray) -> bool:
    """Cek apakah hand landmark aktif (bukan semua nol)."""
    return np.any(hand != 0)


def normalize_hand(hand: np.ndarray) -> np.ndarray:
    """Normalisasi tangan relatif ke wrist, skala = max distance dari wrist.
    Lebih robust daripada wrist-to-MCP karena tidak bergantung pada 1 titik.
    """
    if not hand_is_active(hand):
        return np.zeros(63, dtype=np.float32)

    wrist = hand[0]
    centered = hand - wrist

    # Skala = max distance dari wrist (lebih robust dari single wrist-to-MCP distance)
    distances = np.linalg.norm(centered, axis=1)
    max_dist = np.max(distances)
    if max_dist < 1e-4:
        max_dist = 1.0

    normalized = centered / max_dist
    return normalized.flatten().astype(np.float32)


def compute_joint_angles(hand: np.ndarray) -> np.ndarray:
    """Hitung 15 cosinus sudut tekukan sendi jari.
    Fitur ini INVARIANT terhadap posisi/rotasi kamera — ideal untuk generalisasi.
    """
    if not hand_is_active(hand):
        return np.ones(15, dtype=np.float32)

    finger_joints = [
        (0, 1, 2), (1, 2, 3), (2, 3, 4),        # Thumb
        (0, 5, 6), (5, 6, 7), (6, 7, 8),        # Index
        (0, 9, 10), (9, 10, 11), (10, 11, 12),  # Middle
        (0, 13, 14), (13, 14, 15), (14, 15, 16),  # Ring
        (0, 17, 18), (17, 18, 19), (18, 19, 20)  # Pinky
    ]
    angles = []
    for a, b, c in finger_joints:
        v1 = hand[a] - hand[b]
        v2 = hand[c] - hand[b]
        norm1 = np.linalg.norm(v1)
        norm2 = np.linalg.norm(v2)
        if norm1 > 1e-4 and norm2 > 1e-4:
            cos_angle = np.dot(v1, v2) / (norm1 * norm2)
            angles.append(np.clip(cos_angle, -1.0, 1.0))
        else:
            angles.append(1.0)
    return np.array(angles, dtype=np.float32)


def build_164d_vector(
    left_hand: np.ndarray,
    right_hand: np.ndarray,
) -> np.ndarray:
    """Build 164D feature vector (camera-invariant, no velocity/acceleration).

    Layout:
      [0:63]    Left hand normalized landmarks (63D)
      [63:126]  Right hand normalized landmarks (63D)
      [126:141] Left hand joint angles (15D)
      [141:156] Right hand joint angles (15D)
      [156:159] Relative wrist position L-R (3D)
      [159]     Wrist distance L-R (1D)
      [160]     Left hand wrist Y position (1D)
      [161]     Right hand wrist Y position (1D)
      [162]     Left hand presence flag (1D)
      [163]     Right hand presence flag (1D)
    """
    vector = np.zeros(FEATURE_DIM, dtype=np.float32)

    has_l = hand_is_active(left_hand)
    has_r = hand_is_active(right_hand)

    # 1. Normalized Landmarks (126D)
    vector[0:63] = normalize_hand(left_hand)
    vector[63:126] = normalize_hand(right_hand)

    # 2. Joint Angles (30D) — invariant terhadap posisi/rotasi kamera
    vector[126:141] = compute_joint_angles(left_hand)
    vector[141:156] = compute_joint_angles(right_hand)

    # 3. Dual Hand Wrist Interaction (8D)
    if has_l and has_r:
        rel_wrist = left_hand[0] - right_hand[0]
        dist_wrist = np.linalg.norm(rel_wrist)
        vector[156:159] = rel_wrist
        vector[159] = dist_wrist

    # Wrist Y positions (positional context tanpa velocity noise)
    vector[160] = left_hand[0, 1] if has_l else 0.0
    vector[161] = right_hand[0, 1] if has_r else 0.0

    # Handedness flags
    vector[162] = 1.0 if has_l else 0.0
    vector[163] = 1.0 if has_r else 0.0

    return vector


def process_video(video_path: Path, hand_landmarker) -> np.ndarray | None:
    """Proses 1 video → sequence of 164D vectors → resample ke 30 frame."""
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return None

    frames_vectors = []

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        hand_result = hand_landmarker.detect(mp_image)
        left_hand, right_hand = extract_frame_landmarks(hand_result)

        vec = build_164d_vector(left_hand, right_hand)
        frames_vectors.append(vec)

    cap.release()

    if len(frames_vectors) == 0:
        return None

    raw_seq = np.array(frames_vectors, dtype=np.float32)
    return resample_sequence(raw_seq, target_length=TARGET_LENGTH)


def main():
    parser = argparse.ArgumentParser(
        description="Extract 164D Robust Feature Dataset v7 (Signer-Independent)"
    )
    parser.add_argument(
        "--dataset-dir", type=Path, default=Path("ml/dataset/raw"),
        help="Path ke dataset WL-BISINDO raw videos"
    )
    parser.add_argument(
        "--output-dir", type=Path, default=Path("ml/preprocessing/landmarks_v7"),
        help="Output directory v7"
    )
    parser.add_argument(
        "--hand-model", type=Path, default=Path("hand_landmarker.task"),
        help="MediaPipe Hand Landmarker task file"
    )
    parser.add_argument(
        "--test-signer", type=int, default=DEFAULT_TEST_SIGNER,
        help="Signer ID yang disisakan untuk test set (default: 4)"
    )
    parser.add_argument(
        "--val-signer", type=int, default=3,
        help="Signer ID yang disisakan untuk validation set (default: 3)"
    )
    args = parser.parse_args()

    hand_model_path = args.hand_model
    if not hand_model_path.exists():
        print("Downloading hand_landmarker.task...")
        url = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
        import urllib.request
        urllib.request.urlretrieve(url, str(hand_model_path))

    BaseOptions = mp.tasks.BaseOptions
    HandLandmarker = mp.tasks.vision.HandLandmarker
    HandLandmarkerOptions = mp.tasks.vision.HandLandmarkerOptions
    RunningMode = mp.tasks.vision.RunningMode

    options = HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(hand_model_path)),
        running_mode=RunningMode.IMAGE,
        num_hands=2,
    )

    with HandLandmarker.create_from_options(options) as landmarker:
        video_files = list(args.dataset_dir.glob("*.mp4"))
        print(f"Total video ditemukan: {len(video_files)}")

        # Proper Signer-Independent split
        test_prefix = f"signer{args.test_signer}_"
        val_prefix = f"signer{args.val_signer}_"

        train_files = [
            f for f in video_files
            if not f.name.startswith(test_prefix)
            and not f.name.startswith(val_prefix)
        ]
        val_files = [f for f in video_files if f.name.startswith(val_prefix)]
        test_files = [f for f in video_files if f.name.startswith(test_prefix)]

        print(f"\n=== SIGNER-INDEPENDENT SPLIT (v7) ===")
        print(f"Test signer:  signer{args.test_signer} ({len(test_files)} videos)")
        print(f"Val signer:   signer{args.val_signer} ({len(val_files)} videos)")
        print(f"Train signers: sisanya ({len(train_files)} videos)")
        print(f"Total: {len(train_files) + len(val_files) + len(test_files)} videos\n")

        if len(test_files) == 0:
            print(f"⚠️  PERINGATAN: Tidak ada file test untuk signer{args.test_signer}!")
            print(f"    Pastikan file video bernama 'signer{args.test_signer}_labelX_sampleY.mp4'")
            return

        for split_name, files in [("train", train_files), ("val", val_files), ("test", test_files)]:
            split_dir = args.output_dir / split_name
            split_dir.mkdir(parents=True, exist_ok=True)

            print(f"Memproses split '{split_name}' ({len(files)} video)...")
            count = 0
            skipped = 0
            for vid_path in tqdm(files, desc=split_name):
                match = FILENAME_RE.match(vid_path.name)
                if not match:
                    skipped += 1
                    continue

                out_name = f"{vid_path.stem}.npy"
                out_path = split_dir / out_name

                # Skip jika sudah ada dan valid
                if out_path.exists() and out_path.stat().st_size > 1000:
                    count += 1
                    continue

                seq = process_video(vid_path, landmarker)
                if seq is not None and seq.shape == (TARGET_LENGTH, FEATURE_DIM):
                    np.save(out_path, seq)
                    count += 1
                else:
                    skipped += 1

            print(f"  Selesai '{split_name}': {count} file tersimpan, {skipped} dilewati.\n")

        # Cetak statistik per split per label
        print("=== STATISTIK DATASET v7 ===")
        for split_name in ["train", "val", "test"]:
            split_dir = args.output_dir / split_name
            npy_files = list(split_dir.glob("*.npy"))
            label_counts = {}
            for f in npy_files:
                match = FILENAME_RE.match(f.name)
                if match:
                    label_id = int(match.group(2))
                    label_counts[label_id] = label_counts.get(label_id, 0) + 1
            total = sum(label_counts.values())
            n_labels = len(label_counts)
            print(f"  {split_name}: {total} sampel, {n_labels} label")
            if n_labels > 0 and n_labels < 33:
                min_count = min(label_counts.values())
                max_count = max(label_counts.values())
                print(f"    Min per label: {min_count}, Max per label: {max_count}")


if __name__ == "__main__":
    main()
