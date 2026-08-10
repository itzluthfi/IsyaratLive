"""Ekstrak landmark Tangan (HandLandmarker) + Pose Body/Face Anchors (PoseLandmarker) dari tiap video WL-BISINDO.
Simpan sebagai sequence .npy 160-dimensi (126 Hand + 34 Pose Spatial Anchors).
"""

import argparse
import re
import urllib.request
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from tqdm import tqdm

FILENAME_RE = re.compile(r"signer(\d+)_label(\d+)_sample(\d+)\.mp4", re.IGNORECASE)
NUM_HANDS = 2
NUM_POINTS = 21
FEATURE_DIM = 160
POSE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"


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


def extract_frame_vector(hand_result, pose_result) -> np.ndarray:
    vector = np.zeros(FEATURE_DIM, dtype=np.float32)

    # 1. Extract Hands (0..125)
    left_hand = None
    right_hand = None

    if hand_result and hand_result.hand_landmarks and hand_result.handedness:
        for hand_landmarks, handedness in zip(hand_result.hand_landmarks[:NUM_HANDS], hand_result.handedness[:NUM_HANDS]):
            label = handedness[0].category_name if len(handedness) > 0 else "Left"
            if label == "Left":
                left_hand = hand_landmarks
            else:
                right_hand = hand_landmarks

    # Single hand slot fallback
    if left_hand and not right_hand:
        right_hand = left_hand
    elif right_hand and not left_hand:
        left_hand = right_hand

    left_wrist_raw = None
    right_wrist_raw = None

    # Slot 0: Left Hand (0..62)
    if left_hand and len(left_hand) > 0:
        wrist = left_hand[0]
        left_wrist_raw = wrist
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

    # Slot 1: Right Hand (63..125)
    if right_hand and len(right_hand) > 0:
        wrist = right_hand[0]
        right_wrist_raw = wrist
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

    # 2. Extract Pose Spatial Anchors (126..159)
    if pose_result and pose_result.pose_landmarks and len(pose_result.pose_landmarks) > 0:
        pose_lms = pose_result.pose_landmarks[0]
        # Key Pose Points
        nose = pose_lms[0] if len(pose_lms) > 0 else None
        left_ear = pose_lms[7] if len(pose_lms) > 7 else None
        right_ear = pose_lms[8] if len(pose_lms) > 8 else None
        left_shoulder = pose_lms[11] if len(pose_lms) > 11 else None
        right_shoulder = pose_lms[12] if len(pose_lms) > 12 else None

        shoulder_scale = 1.0
        chest_x, chest_y, chest_z = 0.5, 0.5, 0.0
        if left_shoulder and right_shoulder:
            chest_x = (left_shoulder.x + right_shoulder.x) * 0.5
            chest_y = (left_shoulder.y + right_shoulder.y) * 0.5
            chest_z = (left_shoulder.z + right_shoulder.z) * 0.5
            dx = left_shoulder.x - right_shoulder.x
            dy = left_shoulder.y - right_shoulder.y
            dz = left_shoulder.z - right_shoulder.z
            dist = (dx * dx + dy * dy + dz * dz) ** 0.5
            if dist > 0.001:
                shoulder_scale = dist

        nose_x = nose.x if nose else chest_x
        nose_y = nose.y if nose else chest_y - 0.2
        nose_z = nose.z if nose else chest_z

        ear_x = ((left_ear.x + right_ear.x) * 0.5) if (left_ear and right_ear) else nose_x
        ear_y = ((left_ear.y + right_ear.y) * 0.5) if (left_ear and right_ear) else nose_y
        ear_z = ((left_ear.z + right_ear.z) * 0.5) if (left_ear and right_ear) else nose_z

        # Left Wrist Spatial Anchors (126..134)
        if left_wrist_raw:
            vector[126:129] = [(left_wrist_raw.x - chest_x) / shoulder_scale, (left_wrist_raw.y - chest_y) / shoulder_scale, (left_wrist_raw.z - chest_z) / shoulder_scale]
            vector[129:132] = [(left_wrist_raw.x - nose_x) / shoulder_scale, (left_wrist_raw.y - nose_y) / shoulder_scale, (left_wrist_raw.z - nose_z) / shoulder_scale]
            vector[132:135] = [(left_wrist_raw.x - ear_x) / shoulder_scale, (left_wrist_raw.y - ear_y) / shoulder_scale, (left_wrist_raw.z - ear_z) / shoulder_scale]

        # Right Wrist Spatial Anchors (135..143)
        if right_wrist_raw:
            vector[135:138] = [(right_wrist_raw.x - chest_x) / shoulder_scale, (right_wrist_raw.y - chest_y) / shoulder_scale, (right_wrist_raw.z - chest_z) / shoulder_scale]
            vector[138:141] = [(right_wrist_raw.x - nose_x) / shoulder_scale, (right_wrist_raw.y - nose_y) / shoulder_scale, (right_wrist_raw.z - nose_z) / shoulder_scale]
            vector[141:144] = [(right_wrist_raw.x - ear_x) / shoulder_scale, (right_wrist_raw.y - ear_y) / shoulder_scale, (right_wrist_raw.z - ear_z) / shoulder_scale]

        # Inter-wrist distance (144..147)
        if left_wrist_raw and right_wrist_raw:
            vector[144:147] = [
                (left_wrist_raw.x - right_wrist_raw.x) / shoulder_scale,
                (left_wrist_raw.y - right_wrist_raw.y) / shoulder_scale,
                (left_wrist_raw.z - right_wrist_raw.z) / shoulder_scale,
            ]

        # Metadata (147..150)
        vector[147] = 1.0 if left_hand else 0.0
        vector[148] = 1.0 if right_hand else 0.0
        vector[149] = shoulder_scale

    return vector


def extract_video_landmarks(video_path: Path, landmarker, pose_landmarker) -> np.ndarray:
    cap = cv2.VideoCapture(str(video_path))
    frames = []

    while True:
        ok, frame = cap.read()
        if not ok:
            break

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        hand_result = landmarker.detect(mp_image)
        pose_result = pose_landmarker.detect(mp_image)

        vector = extract_frame_vector(hand_result, pose_result)
        frames.append(vector)

    cap.release()
    if not frames:
        return np.zeros((30, FEATURE_DIM), dtype=np.float32)
    raw_seq = np.stack(frames)
    return resample_sequence(raw_seq, 30)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path, help="Folder hasil organize_dataset.py")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument(
        "--hand-model",
        type=Path,
        default=Path("hand_landmarker.task"),
        help="Path model .task HandLandmarker",
    )
    parser.add_argument(
        "--pose-model",
        type=Path,
        default=Path("pose_landmarker.task"),
        help="Path model .task PoseLandmarker",
    )
    args = parser.parse_args()

    # Download pose_landmarker.task if missing
    pose_model_path = args.pose_model
    if not pose_model_path.exists():
        print(f"Mengunduh model PoseLandmarker dari {POSE_MODEL_URL}...")
        urllib.request.urlretrieve(POSE_MODEL_URL, pose_model_path)

    hand_base_options = mp.tasks.BaseOptions(model_asset_path=str(args.hand_model))
    hand_options = mp.tasks.vision.HandLandmarkerOptions(
        base_options=hand_base_options,
        running_mode=mp.tasks.vision.RunningMode.IMAGE,
        num_hands=NUM_HANDS,
    )

    pose_base_options = mp.tasks.BaseOptions(model_asset_path=str(pose_model_path))
    pose_options = mp.tasks.vision.PoseLandmarkerOptions(
        base_options=pose_base_options,
        running_mode=mp.tasks.vision.RunningMode.IMAGE,
    )

    with mp.tasks.vision.HandLandmarker.create_from_options(hand_options) as landmarker:
        with mp.tasks.vision.PoseLandmarker.create_from_options(pose_options) as pose_landmarker:
            for split in ("train", "test"):
                split_dir = args.input / split
                if not split_dir.exists():
                    continue

                out_split = args.output / split
                out_split.mkdir(parents=True, exist_ok=True)

                videos = sorted(split_dir.glob("*.mp4"))
                for video_path in tqdm(videos, desc=f"v3 {split}"):
                    match = FILENAME_RE.match(video_path.name)
                    if not match:
                        continue

                    out_path = out_split / f"{video_path.stem}.npy"
                    if out_path.exists():
                        continue

                    sequence = extract_video_landmarks(video_path, landmarker, pose_landmarker)
                    np.save(out_path, sequence)


if __name__ == "__main__":
    main()
