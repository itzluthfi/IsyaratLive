"""Direct Keras to TFJS Exporter untuk Model v6 Supreme Pinnacle (320D).
Converts Model v6 Keras weights to group1-shard1of1.bin & model.json for TensorFlow.js.
"""

import json
from pathlib import Path
import keras
import numpy as np


def export_model_to_tfjs(model: keras.Model, out_dir: Path):
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"Exporting Model '{model.name}' to {out_dir}...")

    weights_bytes = bytearray()
    weights_meta = []

    for layer in model.layers:
        weights = layer.get_weights()
        if not weights:
            continue

        for i, w in enumerate(weights):
            w_float32 = w.astype(np.float32)

            w_name = f"{layer.name}/kernel" if i == 0 else f"{layer.name}/bias"
            if "layer_normalization" in layer.name or "batch_normalization" in layer.name:
                names = ["gamma", "beta", "moving_mean", "moving_variance"]
                w_name = f"{layer.name}/{names[i]}" if i < len(names) else f"{layer.name}/weight_{i}"
            elif "conv1d" in layer.name or "bidirectional" in layer.name or "multi_head_attention" in layer.name:
                w_name = f"{layer.name}/weight_{i}"

            weights_meta.append({
                "name": w_name,
                "shape": list(w_float32.shape),
                "dtype": "float32"
            })
            weights_bytes.extend(w_float32.tobytes())

    shard_path = out_dir / "group1-shard1of1.bin"
    with open(shard_path, "wb") as f:
        f.write(weights_bytes)

    config = json.loads(model.to_json())

    if "config" in config and "layers" in config["config"]:
        for layer in config["config"]["layers"]:
            if layer.get("class_name") == "InputLayer" and "config" in layer:
                c = layer["config"]
                if "batch_shape" in c:
                    c["batch_input_shape"] = c.pop("batch_shape")

    model_json = {
        "format": "layers-model",
        "generatedBy": "Keras 3 Supreme Exporter",
        "convertedBy": "Antigravity Exporter",
        "modelTopology": config,
        "weightsManifest": [
            {
                "paths": ["group1-shard1of1.bin"],
                "weights": weights_meta
            }
        ]
    }

    model_json_path = out_dir / "model.json"
    with open(model_json_path, "w") as f:
        json.dump(model_json, f, indent=2)

    print(f"Export Model v6 Supreme Pinnacle sukses: {model_json_path} ({shard_path.stat().st_size} bytes)")


if __name__ == "__main__":
    base_dir = Path(r"d:\Penyimpanan Utama\Documents\python\IsyaratLive")
    model_path = base_dir / "ml/checkpoints/v6/best.keras"
    model = keras.models.load_model(model_path, safe_mode=False)
    print("Loaded Model v6 successfully via safe_mode=False!")
    export_model_to_tfjs(
        model,
        base_dir / "frontend/public/models/gloss-classifier-v6"
    )
