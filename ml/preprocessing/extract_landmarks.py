"""Ekstrak landmark tangan (MediaPipe) dari tiap video WL-BISINDO dan simpan
sebagai sequence .npy — input untuk training/train.py.

Vector per frame: 2 tangan x 21 titik x (x, y, z) = 126 nilai, tangan yang
tidak terdeteksi diisi nol. Ini harus sama persis dengan
`landmarksToVector` di frontend/src/components/GlossClassifier.tsx supaya
model yang diekspor kompatibel dengan pipeline inferensi di browser.
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


def resample_sequence(sequence: np.ndarray, target_length: int = 30) -> np.ndarray:
    n_frames = len(sequence)
    if n_frames == 0:
        return np.zeros((target_length, NUM_HANDS * NUM_POINTS * 3), dtype=np.float32)
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


def extract_video_landmarks(video_path: Path, landmarker) -> np.ndarray:
    cap = cv2.VideoCapture(str(video_path))
    frames = []

    while True:
        ok, frame = cap.read()
        if not ok:
            break

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = landmarker.detect(mp_image)

        vector = np.zeros(NUM_HANDS * NUM_POINTS * 3, dtype=np.float32)
        if result.hand_landmarks and result.handedness:
            left_hand = None
            right_hand = None
            for hand_landmarks, handedness in zip(result.hand_landmarks[:NUM_HANDS], result.handedness[:NUM_HANDS]):
                label = handedness[0].category_name if len(handedness) > 0 else "Left"
                if label == "Left":
                    left_hand = hand_landmarks
                else:
                    right_hand = hand_landmarks

            # Slot 0: Left Hand
            if left_hand and len(left_hand) > 0:
                wrist = left_hand[0]
                middle_mcp = left_hand[9] if len(left_hand) > 9 else None
                scale = 1.0
                if wrist and middle_mcp:
                    dx = middle_mcp.x - wrist.x
                    dy = middle_mcp.y - wrist.y
                    dz = middle_mcp.z - wrist.z
                    dist = (dx * dx + dy * dy + dz * dz) ** 0.5
                    if dist > 0.001:
                        scale = dist

                for i, pt in enumerate(left_hand[:NUM_POINTS]):
                    vector[i * 3 : i * 3 + 3] = [
                        (pt.x - wrist.x) / scale,
                        (pt.y - wrist.y) / scale,
                        (pt.z - wrist.z) / scale,
                    ]

            # Slot 1: Right Hand
            if right_hand and len(right_hand) > 0:
                wrist = right_hand[0]
                middle_mcp = right_hand[9] if len(right_hand) > 9 else None
                scale = 1.0
                if wrist and middle_mcp:
                    dx = middle_mcp.x - wrist.x
                    dy = middle_mcp.y - wrist.y
                    dz = middle_mcp.z - wrist.z
                    dist = (dx * dx + dy * dy + dz * dz) ** 0.5
                    if dist > 0.001:
                        scale = dist

                for i, pt in enumerate(right_hand[:NUM_POINTS]):
                    offset = 63 + i * 3
                    vector[offset : offset + 3] = [
                        (pt.x - wrist.x) / scale,
                        (pt.y - wrist.y) / scale,
                        (pt.z - wrist.z) / scale,
                    ]

        frames.append(vector)

    cap.release()
    if not frames:
        return np.zeros((30, NUM_HANDS * NUM_POINTS * 3), dtype=np.float32)
    raw_seq = np.stack(frames)
    return resample_sequence(raw_seq, 30)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path, help="Folder hasil organize_dataset.py")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument(
        "--model",
        type=Path,
        default=Path("hand_landmarker.task"),
        help="Path model .task HandLandmarker (unduh dari MediaPipe model zoo)",
    )
    args = parser.parse_args()

    base_options = mp.tasks.BaseOptions(model_asset_path=str(args.model))
    options = mp.tasks.vision.HandLandmarkerOptions(
        base_options=base_options,
        running_mode=mp.tasks.vision.RunningMode.IMAGE,
        num_hands=NUM_HANDS,
    )

    with mp.tasks.vision.HandLandmarker.create_from_options(options) as landmarker:
        for split in ("train", "test"):
            split_dir = args.input / split
            if not split_dir.exists():
                continue

            out_split = args.output / split
            out_split.mkdir(parents=True, exist_ok=True)

            videos = sorted(split_dir.glob("*.mp4"))
            for video_path in tqdm(videos, desc=split):
                match = FILENAME_RE.match(video_path.name)
                if not match:
                    continue

                sequence = extract_video_landmarks(video_path, landmarker)
                out_path = out_split / f"{video_path.stem}.npy"
                np.save(out_path, sequence)


if __name__ == "__main__":
    main()
