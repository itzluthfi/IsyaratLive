"""Ekstrak 320D Supreme Pinnacle Feature Dataset (Model v6) untuk Lomba Nasional BISINDO.
Fitur 320D:
1. 126D Normalized Hand Landmarks (Left 63D + Right 63D)
2. 63D Instantaneous Velocity Left
3. 63D Instantaneous Velocity Right
4. 30D Joint Angle Flexion Cosines (Left 15D + Right 15D)
5. 30D Inter-Fingertip Distance Matrix (Left 15D + Right 15D)
6. 8D Dual Hand Wrists Interaction & Speed Matrix
Total: 320-Dimensi
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
FEATURE_DIM = 320


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
    finger_joints = [
        (0, 1, 2), (1, 2, 3), (2, 3, 4),        # Thumb
        (0, 5, 6), (5, 6, 7), (6, 7, 8),        # Index
        (0, 9, 10), (9, 10, 11), (10, 11, 12),  # Middle
        (0, 13, 14), (13, 14, 15), (14, 15, 16),# Ring
        (0, 17, 18), (17, 18, 19), (18, 19, 20) # Pinky
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


def build_320d_vector(
    left_hand: np.ndarray,
    right_hand: np.ndarray,
    prev_left: np.ndarray | None,
    prev_right: np.ndarray | None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    vector = np.zeros(FEATURE_DIM, dtype=np.float32)

    # 1. Normalized Landmarks (126D)
    norm_left = left_hand.copy()
    norm_right = right_hand.copy()
    if np.any(left_hand != 0):
        norm_left -= left_hand[0]
        max_dist = np.max(np.linalg.norm(norm_left, axis=1))
        if max_dist > 1e-4:
            norm_left /= max_dist
    if np.any(right_hand != 0):
        norm_right -= right_hand[0]
        max_dist = np.max(np.linalg.norm(norm_right, axis=1))
        if max_dist > 1e-4:
            norm_right /= max_dist

    vector[0:63] = norm_left.flatten()
    vector[63:126] = norm_right.flatten()

    # 2. Velocities (63D + 63D = 126D)
    vel_left = np.zeros((21, 3), dtype=np.float32)
    vel_right = np.zeros((21, 3), dtype=np.float32)

    if prev_left is not None and np.any(left_hand != 0) and np.any(prev_left != 0):
        vel_left = left_hand - prev_left
    if prev_right is not None and np.any(right_hand != 0) and np.any(prev_right != 0):
        vel_right = right_hand - prev_right

    vector[126:189] = vel_left.flatten()
    vector[189:252] = vel_right.flatten()

    # 3. Joint Angles (30D)
    angles_left = compute_joint_angles(left_hand) if np.any(left_hand != 0) else np.ones(15, dtype=np.float32)
    angles_right = compute_joint_angles(right_hand) if np.any(right_hand != 0) else np.ones(15, dtype=np.float32)
    vector[252:267] = angles_left
    vector[267:282] = angles_right

    # 4. Inter-Fingertip Distance Matrix (30D)
    fingertip_indices = [4, 8, 12, 16, 20]
    pairs = [(0, 1), (0, 2), (0, 3), (0, 4), (1, 2), (1, 3), (1, 4), (2, 3), (2, 4), (3, 4), (0, 0), (1, 1), (2, 2), (3, 3), (4, 4)]

    def calc_tips(hand):
        if not np.any(hand != 0):
            return np.zeros(15, dtype=np.float32)
        tips = hand[fingertip_indices]
        dists = []
        for i1, i2 in pairs[:15]:
            dists.append(np.linalg.norm(tips[i1] - tips[i2]))
        return np.array(dists, dtype=np.float32)

    vector[282:297] = calc_tips(left_hand)
    vector[297:312] = calc_tips(right_hand)

    # 5. Dual Hand Wrists Interaction & Speed (8D)
    speed_l = np.linalg.norm(vel_left[0])
    speed_r = np.linalg.norm(vel_right[0])
    has_l = 1.0 if np.any(left_hand != 0) else 0.0
    has_r = 1.0 if np.any(right_hand != 0) else 0.0

    if has_l > 0 and has_r > 0:
        rel_wrist = left_hand[0] - right_hand[0]
        dist_wrist = np.linalg.norm(rel_wrist)
        vector[312:315] = rel_wrist
        vector[315] = dist_wrist
    vector[316] = speed_l
    vector[317] = speed_r
    vector[318] = has_l
    vector[319] = has_r

    return vector, vel_left, vel_right


def process_video(video_path: Path, landmarker) -> np.ndarray:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return np.zeros((30, FEATURE_DIM), dtype=np.float32)

    frames_landmarks = []
    prev_left = None
    prev_right = None

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

        hand_result = landmarker.detect(mp_image)
        left_hand, right_hand = extract_frame_landmarks(hand_result)

        vec, vel_l, vel_r = build_320d_vector(
            left_hand, right_hand, prev_left, prev_right
        )

        frames_landmarks.append(vec)
        prev_left = left_hand
        prev_right = right_hand

    cap.release()

    if len(frames_landmarks) == 0:
        return np.zeros((30, FEATURE_DIM), dtype=np.float32)

    arr = np.array(frames_landmarks, dtype=np.float32)
    return resample_sequence(arr, target_length=30)


def main():
    parser = argparse.ArgumentParser(description="Ekstrak 320D Supreme Landmarks Model v6")
    parser.add_argument("--dataset-dir", type=Path, default=Path("ml/dataset/raw"))
    parser.add_argument("--output-dir", type=Path, default=Path("ml/preprocessing/landmarks_v6"))
    parser.add_argument("--hand-model", type=Path, default=Path("hand_landmarker.task"))
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

                seq = process_video(vid_path, landmarker)
                if seq is not None:
                    np.save(out_path, seq)
                    count += 1

            print(f"Selesai split '{split_name}': {count} file tersimpan.")


if __name__ == "__main__":
    main()
