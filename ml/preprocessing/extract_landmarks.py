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
        for h, hand_landmarks in enumerate(result.hand_landmarks[:NUM_HANDS]):
            for i, point in enumerate(hand_landmarks[:NUM_POINTS]):
                offset = (h * NUM_POINTS + i) * 3
                vector[offset : offset + 3] = [point.x, point.y, point.z]
        frames.append(vector)

    cap.release()
    return np.stack(frames) if frames else np.zeros((0, NUM_HANDS * NUM_POINTS * 3), dtype=np.float32)


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
