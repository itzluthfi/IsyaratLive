"""Konversi model Keras terlatih ke format TensorFlow.js untuk di-serve dari
frontend/public/models/gloss-classifier/.
"""

import argparse
from pathlib import Path

import tensorflowjs as tfjs
from tensorflow import keras


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, type=Path, help="Path .keras checkpoint")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    model = keras.models.load_model(args.model)
    args.output.mkdir(parents=True, exist_ok=True)
    tfjs.converters.save_keras_model(model, str(args.output))
    print(f"Model TFJS disimpan di {args.output}")


if __name__ == "__main__":
    main()
