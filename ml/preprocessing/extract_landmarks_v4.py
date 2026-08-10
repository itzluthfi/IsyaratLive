"""Ekstrak 210D Hand Dynamics, Motion Velocity & Topology Features dari dataset BISINDO.
126D Hand Landmarks + 42D Velocity Vectors + 24D Fingertip Distance Topology + 18D Palm Normal Vectors = 210D.
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
FEATURE_DIM = 210


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


def extract_frame_landmarks(hand_result) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Ekstrak (left_hand 21x3, right_hand 21x3, raw_wrists 2x2)"""
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

    if left_hand is None and right_hand is not None:
        left_hand = right_hand.copy()
    elif right_hand is None and left_hand is not None:
        right_hand = left_hand.copy()

    if left_hand is None:
        left_hand = np.zeros((21, 3), dtype=np.float32)
    if right_hand is None:
        right_hand = np.zeros((21, 3), dtype=np.float32)

    raw_wrists = np.array(
        [[left_hand[0, 0], left_hand[0, 1]], [right_hand[0, 0], right_hand[0, 1]]],
        dtype=np.float32,
    )

    return left_hand, right_hand, raw_wrists


def build_210d_vector(
    left_hand: np.ndarray,
    right_hand: np.ndarray,
    prev_left: np.ndarray,
    prev_right: np.ndarray,
) -> np.ndarray:
    vector = np.zeros(FEATURE_DIM, dtype=np.float32)

    def normalize_and_extract(hand: np.ndarray, prev_hand: np.ndarray, offset: number):
        wrist = hand[0]
        middle_mcp = hand[9]
        scale = np.linalg.norm(middle_mcp - wrist)
        if scale < 0.001:
            scale = 1.0

        # 1. Normalized Landmarks (63 floats)
        norm_pts = (hand - wrist) / scale
        vector[offset : offset + 63] = norm_pts.flatten()

        # 2. Velocity Vectors (21 floats)
        vel = (hand - prev_hand) if prev_hand is not None else np.zeros((21, 3))
        # Take key points velocity: wrist (0), thumb_tip (4), index_tip (8), middle_tip (12), ring_tip (16), pinky_tip (20), index_mcp (5)
        key_indices = [0, 4, 8, 12, 16, 20, 5]
        key_vel = vel[key_indices].flatten()  # 21 floats
        vector[offset + 63 : offset + 84] = key_vel

        # 3. Fingertip Topology Distance Matrix (12 floats)
        tips = [4, 8, 12, 16, 20]
        dist_list = []
        for i in range(len(tips)):
            for j in range(i + 1, len(tips)):
                d = np.linalg.norm(hand[tips[i]] - hand[tips[j]]) / scale
                dist_list.append(d)
        # 10 pair distances + 2 extra (thumb-middle, index-pinky)
        dist_list.append(np.linalg.norm(hand[4] - hand[12]) / scale)
        dist_list.append(np.linalg.norm(hand[8] - hand[20]) / scale)
        vector[offset + 84 : offset + 96] = np.array(dist_list, dtype=np.float32)

        # 4. Palm Normal Vector (3 floats) + Hand Speed (6 floats) = 9 floats
        v1 = hand[5] - hand[0]
        v2 = hand[17] - hand[0]
        normal = np.cross(v1, v2)
        norm_len = np.linalg.norm(normal)
        if norm_len > 0.001:
            normal = normal / norm_len
        vector[offset + 96 : offset + 99] = normal

        # Palm Speed magnitude (6 floats)
        speed = np.linalg.norm(vel[0])
        vector[offset + 99 : offset + 105] = speed

    # Left Hand (0..104) -> 105 floats
    normalize_and_extract(left_hand, prev_left, 0)
    # Right Hand (105..209) -> 105 floats
    normalize_and_extract(right_hand, prev_right, 105)

    return vector


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

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        timestamp_ms = int(cap.get(cv2.CAP_PROP_POS_MSEC))

        hand_result = hand_landmarker.detect_for_video(mp_image, timestamp_ms)
        left_hand, right_hand, _ = extract_frame_landmarks(hand_result)

        vec = build_210d_vector(left_hand, right_hand, prev_left, prev_right)
        frames_vectors.append(vec)

        prev_left = left_hand.copy()
        prev_right = right_hand.copy()

    cap.release()

    if len(frames_vectors) == 0:
        return None, None

    raw_seq = np.array(frames_vectors, dtype=np.float32)
    resampled_seq = resample_sequence(raw_seq, target_length=30)
    return resampled_seq, (signer_id, label_id, sample_id)


def main():
    parser = argparse.ArgumentParser(description="Extract 210D Hand Dynamics Dataset")
    parser.add_argument(
        "--dataset-dir",
        type=Path,
        default=Path("ml/dataset/WL-BISINDO"),
        help="Path ke dataset WL-BISINDO",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("ml/preprocessing/landmarks_v4"),
        help="Output directory",
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
        print(f"Downloading hand_landmarker.task to {hand_model_path}...")
        url = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
        import urllib.request
        urllib.request.urlretrieve(url, str(hand_model_path))

    BaseOptions = mp.tasks.BaseOptions
    HandLandmarker = mp.tasks.vision.HandLandmarker
    HandLandmarkerOptions = mp.tasks.vision.HandLandmarkerOptions
    RunningMode = mp.tasks.vision.RunningMode

    options = HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(hand_model_path)),
        running_mode=RunningMode.VIDEO,
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

                if out_path.exists():
                    count += 1
                    continue

                seq, meta = process_video(vid_path, landmarker)
                if seq is not None:
                    np.save(out_path, seq)
                    count += 1

            print(f"Selesai split '{split_name}': {count} file tersimpan.")


if __name__ == "__main__":
    main()
