"""Split WL-BISINDO ke train/test.

Format nama file dataset: [signerID]_[labelID]_[sampleID].mp4
(lihat PRD bagian 9), contoh: signer0_label0_sample10.mp4

Skema:
- SD (Signer-Dependent): semua signer muncul di train & test, split per sampel.
- SI (Signer-Independent): signer test sama sekali tidak muncul di train,
  mensimulasikan pengguna baru (lebih relevan untuk IsyaratLive).
"""

import argparse
import json
import re
import shutil
from pathlib import Path

FILENAME_RE = re.compile(r"signer(\d+)_label(\d+)_sample(\d+)\.mp4", re.IGNORECASE)

# Default: sisakan 1 dari 5 signer untuk test pada skema SI.
DEFAULT_SI_TEST_SIGNERS = [4]


def parse_filename(path: Path) -> tuple[int, int, int] | None:
    m = FILENAME_RE.match(path.name)
    if not m:
        return None
    signer_id, label_id, sample_id = (int(g) for g in m.groups())
    return signer_id, label_id, sample_id


def split_signer_independent(files: list[Path], test_signers: list[int]):
    train, test = [], []
    for f in files:
        parsed = parse_filename(f)
        if parsed is None:
            continue
        signer_id, _, _ = parsed
        (test if signer_id in test_signers else train).append(f)
    return train, test


def split_signer_dependent(files: list[Path], test_ratio: float = 0.2):
    by_label: dict[int, list[Path]] = {}
    for f in files:
        parsed = parse_filename(f)
        if parsed is None:
            continue
        _, label_id, _ = parsed
        by_label.setdefault(label_id, []).append(f)

    train, test = [], []
    for label_files in by_label.values():
        label_files.sort()
        n_test = max(1, int(len(label_files) * test_ratio))
        test.extend(label_files[:n_test])
        train.extend(label_files[n_test:])
    return train, test


def copy_split(files: list[Path], out_dir: Path):
    out_dir.mkdir(parents=True, exist_ok=True)
    for f in files:
        shutil.copy2(f, out_dir / f.name)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--scheme", choices=["SI", "SD"], default="SI")
    parser.add_argument(
        "--test-signers",
        type=int,
        nargs="*",
        default=DEFAULT_SI_TEST_SIGNERS,
        help="Signer ID yang dipakai untuk test set pada skema SI",
    )
    args = parser.parse_args()

    files = sorted(args.input.rglob("*.mp4"))
    if not files:
        raise SystemExit(f"Tidak ada file .mp4 ditemukan di {args.input}")

    if args.scheme == "SI":
        train, test = split_signer_independent(files, args.test_signers)
    else:
        train, test = split_signer_dependent(files)

    copy_split(train, args.output / "train")
    copy_split(test, args.output / "test")

    metadata = {
        "scheme": args.scheme,
        "train_count": len(train),
        "test_count": len(test),
        "test_signers": args.test_signers if args.scheme == "SI" else None,
    }
    (args.output / f"{args.scheme}_split_metadata.json").write_text(
        json.dumps(metadata, indent=2)
    )
    print(f"Split {args.scheme}: {len(train)} train, {len(test)} test")


if __name__ == "__main__":
    main()
