"""Konversi model Keras terlatih ke format TensorFlow.js untuk di-serve dari
frontend/public/models/gloss-classifier/.
"""

import argparse
from pathlib import Path
import sys
import unittest.mock

# Mock optional packages for tensorflowjs compatibility
for mod in ["tensorflow_decision_forests", "jax", "jax.experimental"]:
    if mod not in sys.modules:
        sys.modules[mod] = unittest.mock.MagicMock()

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

    # Patch Keras 3 metadata for TFJS compatibility
    model_json_path = args.output / "model.json"
    if model_json_path.exists():
        import json

        data = json.loads(model_json_path.read_text())
        layers = data.get("modelTopology", {}).get("model_config", {}).get("config", {}).get("layers", [])
        for layer in layers:
            # 1. Patch batch_shape -> batch_input_shape
            if layer.get("class_name") == "InputLayer" and "batch_shape" in layer.get("config", {}):
                layer["config"]["batch_input_shape"] = layer["config"].pop("batch_shape")

        # 2. Patch Keras 3 weightsManifest: remove '/lstm_cell/' from weight names if present
        manifests = data.get("weightsManifest", [])
        for manifest in manifests:
            for weight in manifest.get("weights", []):
                if "name" in weight and "/lstm_cell/" in weight["name"]:
                    weight["name"] = weight["name"].replace("/lstm_cell/", "/")

        model_json_path.write_text(json.dumps(data, indent=2))

    print(f"Model TFJS berhasil dikonversi dan dipatch untuk TFJS di {args.output}")


if __name__ == "__main__":
    main()



