"""Ekstrak 256D Champion Feature Dataset (Model v5) untuk Lomba Nasional BISINDO.
Fitur:
1. 126D Normalized Hand Landmarks (Left 63 + Right 63)
2. 42D Instantaneous Velocity (Delta Position)
3. 21D Instantaneous Acceleration (Delta Velocity)
4. 30D Joint Angle Flexion Cosines (Kemiringan/Sudut Sendi Jari)
5. 24D Inter-Fingertip Distance Matrix
6. 13D Palm Plane Orientation & Global Motion Vector
Total: 256-Dimensi
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
FEATURE_DIM = 256


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


def extract_frame_landmarks(hand_result) -> tuple[np.ndarray, np.ndarray]:
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


def compute_joint_angles(hand: np.ndarray) -> np.ndarray:
    """Hitung cosinus sudut tekukan sendi jari (15 sudut per tangan)"""
    # Pasangan sendi: (wrist-mcp, mcp-pip, pip-dip)
    finger_joints = [
        (0, 1, 2), (1, 2, 3), (2, 3, 4),      # Thumb
        (0, 5, 6), (5, 6, 7), (6, 7, 8),      # Index
        (0, 9, 10), (9, 10, 11), (10, 11, 12),# Middle
        (0, 13, 14), (13, 14, 15), (14, 15, 16),# Ring
        (0, 17, 18), (17, 18, 19), (18, 19, 20)# Pinky
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


def build_256d_vector(
    left_hand: np.ndarray,
    right_hand: np.ndarray,
    prev_left: np.ndarray | None,
    prev_right: np.ndarray | None,
    prev_vel_left: np.ndarray | None,
    prev_vel_right: np.ndarray | None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    vector = np.zeros(FEATURE_DIM, dtype=np.float32)

    def extract_hand_features(
        hand: np.ndarray,
        prev_h: np.ndarray | None,
        prev_v: np.ndarray | None,
        offset: int,
    ) -> tuple[np.ndarray, np.ndarray]:
        wrist = hand[0]
        middle_mcp = hand[9]
        scale = np.linalg.norm(middle_mcp - wrist)
        if scale < 1e-4:
            scale = 1.0

        # 1. 63D Normalized Landmarks
        norm_pts = (hand - wrist) / scale
        vector[offset : offset + 63] = norm_pts.flatten()

        # 2. 21D Velocity Vectors (Keypoints: 0, 4, 8, 12, 16, 20, 5)
        key_indices = [0, 4, 8, 12, 16, 20, 5]
        vel = (hand - prev_h) if prev_h is not None else np.zeros((21, 3), dtype=np.float32)
        key_vel = vel[key_indices].flatten()
        vector[offset + 63 : offset + 84] = key_vel

        # 3. 10D Acceleration (Delta Velocity untuk Wrist & 4 Fingertips)
        acc = (vel - prev_v) if prev_v is not None else np.zeros((21, 3), dtype=np.float32)
        key_acc_indices = [0, 4, 8, 12, 16]
        # Ambil magnitude percepatan 5 titik utama (5 floats) + 5 x-velocity component = 10 floats
        acc_mags = np.linalg.norm(acc[key_acc_indices], axis=1)
        vector[offset + 84 : offset + 89] = acc_mags
        vector[offset + 89 : offset + 94] = acc[key_acc_indices, 0]

        # 4. 15D Joint Angle Flexion Cosines
        angles = compute_joint_angles(hand)
        vector[offset + 94 : offset + 109] = angles

        # 5. 12D Fingertip Topology Distance Matrix
        tips = [4, 8, 12, 16, 20]
        dist_list = []
        for i in range(len(tips)):
            for j in range(i + 1, len(tips)):
                d = np.linalg.norm(hand[tips[i]] - hand[tips[j]]) / scale
                dist_list.append(d)
        dist_list.append(np.linalg.norm(hand[4] - hand[12]) / scale)
        dist_list.append(np.linalg.norm(hand[8] - hand[20]) / scale)
        vector[offset + 109 : offset + 121] = np.array(dist_list[:12], dtype=np.float32)

        # 6. 7D Palm Normal Vector & Speed
        v1 = hand[5] - hand[0]
        v2 = hand[17] - hand[0]
        normal = np.cross(v1, v2)
        norm_len = np.linalg.norm(normal)
        if norm_len > 1e-4:
            normal = normal / norm_len
        vector[offset + 121 : offset + 124] = normal
        speed = np.linalg.norm(vel[0])
        vector[offset + 124 : offset + 128] = speed  # 4 floats

        return vel, acc

    vel_l, _ = extract_hand_features(left_hand, prev_left, prev_vel_left, 0)
    vel_r, _ = extract_hand_features(right_hand, prev_right, prev_vel_right, 128)

    return vector, vel_l, vel_r


def process_video(
    video_path: Path, hand_landmarker
) -> tuple[np.ndarray | None, tuple[int, int, int] | None]:
    match = FILENAME_RE.match(video_path.name)
    if not match:
        return None, None

    signer_id = int(match.group(1))
    label_id = int(match.group(2))
    sample_id = int(match.group(3))

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return None, None

    frames_vectors = []
    prev_left = None
    prev_right = None
    prev_vel_l = None
    prev_vel_r = None
    frame_idx = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        hand_result = hand_landmarker.detect(mp_image)
        left_hand, right_hand = extract_frame_landmarks(hand_result)

        vec, vel_l, vel_r = build_256d_vector(
            left_hand, right_hand, prev_left, prev_right, prev_vel_l, prev_vel_r
        )
        frames_vectors.append(vec)

        prev_left = left_hand.copy()
        prev_right = right_hand.copy()
        prev_vel_l = vel_l.copy()
        prev_vel_r = vel_r.copy()

    cap.release()

    if len(frames_vectors) == 0:
        return None, None

    raw_seq = np.array(frames_vectors, dtype=np.float32)
    resampled_seq = resample_sequence(raw_seq, target_length=30)
    return resampled_seq, (signer_id, label_id, sample_id)


def main():
    parser = argparse.ArgumentParser(description="Extract 256D Champion Feature Dataset v5")
    parser.add_argument(
        "--dataset-dir",
        type=Path,
        default=Path("ml/dataset/raw"),
        help="Path ke dataset WL-BISINDO",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("ml/preprocessing/landmarks_v5"),
        help="Output directory v5",
    )
    parser.add_argument(
        "--hand-model",
        type=Path,
        default=Path("hand_landmarker.task"),
        help="MediaPipe Hand Landmarker task file",
    )
    args = parser.parse_args()

    hand_model_path = args.hand_model
    if not hand_model_path.exists():
        print(f"Downloading hand_landmarker.task...")
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

        train_files = [f for f in video_files if not f.name.startswith("signer5_")]
        test_files = [f for f in video_files if f.name.startswith("signer5_")]

        print(f"Train samples: {len(train_files)}, Test samples: {len(test_files)}")

        for split_name, files in [("train", train_files), ("test", test_files)]:
            split_dir = args.output_dir / split_name
            split_dir.mkdir(parents=True, exist_ok=True)

            print(f"\nMemproses split '{split_name}' ({len(files)} video)...")
            count = 0
            for vid_path in tqdm(files):
                out_name = f"{vid_path.stem}.npy"
                out_path = split_dir / out_name

                if out_path.exists() and out_path.stat().st_size > 1000:
                    count += 1
                    continue

                seq, meta = process_video(vid_path, landmarker)
                if seq is not None:
                    np.save(out_path, seq)
                    count += 1

            print(f"Selesai split '{split_name}': {count} file tersimpan.")


if __name__ == "__main__":
    main()
