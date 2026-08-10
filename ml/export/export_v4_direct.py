"""Direct modern Keras to TFJS Exporter.
Converts Keras model weights directly to group1-shard1of1.bin & model.json for TensorFlow.js.
"""

import json
from pathlib import Path
import keras
import numpy as np

def export_to_tfjs(model_path: Path, out_dir: Path):
    out_dir.mkdir(parents=True, exist_ok=True)
    model = keras.models.load_model(model_path)
    print(f"Loaded model '{model.name}' from {model_path}")

    weights_bytes = bytearray()
    weights_meta = []

    for layer in model.layers:
        weights = layer.get_weights()
        if not weights:
            continue
        
        for i, w in enumerate(weights):
            w_float32 = w.astype(np.float32)
            
            # Default weight naming schema for TFJS
            w_name = f"{layer.name}/kernel" if i == 0 else f"{layer.name}/bias"
            if "layer_normalization" in layer.name or "batch_normalization" in layer.name:
                names = ["gamma", "beta", "moving_mean", "moving_variance"]
                w_name = f"{layer.name}/{names[i]}" if i < len(names) else f"{layer.name}/weight_{i}"
            elif "bidirectional" in layer.name:
                w_name = f"{layer.name}/weight_{i}"
            elif "multi_head_attention" in layer.name:
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

    # Build model.json topology
    config = json.loads(model.to_json())
    
    # Patch input layer batch_shape to batch_input_shape for TFJS
    if "config" in config and "layers" in config["config"]:
        for layer in config["config"]["layers"]:
            if layer.get("class_name") == "InputLayer" and "config" in layer:
                c = layer["config"]
                if "batch_shape" in c:
                    c["batch_input_shape"] = c.pop("batch_shape")

    model_json = {
        "format": "layers-model",
        "generatedBy": "Keras 3 Direct Exporter",
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

    print(f"Export sukses: {model_json_path} & {shard_path}")


if __name__ == "__main__":
    export_to_tfjs(
        Path("ml/checkpoints/v4/best.keras"),
        Path("frontend/public/models/gloss-classifier-v4")
    )
