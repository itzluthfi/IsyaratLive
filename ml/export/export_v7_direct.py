"""Direct Keras to TFJS Exporter untuk Model v7 Robust (164D).
Converts Keras model weights directly to group1-shard1of1.bin & model.json for TensorFlow.js.
"""

import json
import sys
from pathlib import Path
import keras
import numpy as np

# Force UTF-8 stdout/stderr for Windows console compatibility
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def extract_history(item):
    if isinstance(item, dict) and item.get("class_name") == "__keras_tensor__":
        kh = item.get("config", {}).get("keras_history")
        if kh and isinstance(kh, list):
            return [kh[0], kh[1], kh[2], {}]
    elif isinstance(item, list):
        res = [extract_history(x) for x in item]
        filtered = [x for x in res if x is not None]
        return filtered if filtered else None
    return None


def convert_keras3_nodes_to_keras2(obj):
    if isinstance(obj, list):
        return [convert_keras3_nodes_to_keras2(item) for item in obj]
    elif isinstance(obj, dict):
        new_dict = {}
        for k, v in obj.items():
            if k == "inbound_nodes" and isinstance(v, list):
                new_nodes = []
                for n in v:
                    if isinstance(n, dict):
                        args = n.get("args", [])
                        kwargs = n.get("kwargs", {})
                        node_inputs = []

                        for arg in args:
                            h = extract_history(arg)
                            if h:
                                if isinstance(h[0], list):
                                    node_inputs.extend(h)
                                else:
                                    node_inputs.append(h)

                        for kw_val in kwargs.values():
                            h = extract_history(kw_val)
                            if h:
                                if isinstance(h[0], list):
                                    node_inputs.extend(h)
                                else:
                                    node_inputs.append(h)

                        if node_inputs:
                            new_nodes.append(node_inputs)
                        else:
                            new_nodes.append(convert_keras3_nodes_to_keras2(n))
                    else:
                        new_nodes.append(convert_keras3_nodes_to_keras2(n))
                new_dict[k] = new_nodes
            else:
                new_dict[k] = convert_keras3_nodes_to_keras2(v)
        return new_dict
    return obj


def export_model_to_tfjs(model: keras.Model, out_dir: Path):
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"Exporting Model '{model.name}' to {out_dir}...")

    weights_bytes = bytearray()
    weights_meta = []

    for layer in model.layers:
        weights = layer.get_weights()
        if not weights:
            continue

        if "multi_head_attention" in layer.name:
            continue

        for i, w in enumerate(weights):
            w_float32 = w.astype(np.float32)
            w_name = f"{layer.name}/kernel" if i == 0 else f"{layer.name}/bias"

            if "layer_normalization" in layer.name or "batch_normalization" in layer.name:
                names = ["gamma", "beta", "moving_mean", "moving_variance"]
                w_name = f"{layer.name}/{names[i]}" if i < len(names) else f"{layer.name}/weight_{i}"
            elif "bidirectional" in layer.name:
                bidi_names = [
                    "forward_forward_lstm/kernel",
                    "forward_forward_lstm/recurrent_kernel",
                    "forward_forward_lstm/bias",
                    "backward_forward_lstm/kernel",
                    "backward_forward_lstm/recurrent_kernel",
                    "backward_forward_lstm/bias"
                ]
                w_name = f"{layer.name}/{bidi_names[i]}" if i < len(bidi_names) else f"{layer.name}/weight_{i}"

            weights_meta.append({
                "name": w_name,
                "shape": list(w_float32.shape),
                "dtype": "float32"
            })
            weights_bytes.extend(w_float32.tobytes())

    shard_path = out_dir / "group1-shard1of1.bin"
    with open(shard_path, "wb") as f:
        f.write(weights_bytes)

    # Convert Keras 3 model topology & inbound_nodes to TFJS compatible format
    config_str = json.dumps(json.loads(model.to_json())).replace('"silu"', '"relu"')
    raw_config = json.loads(config_str)
    config = convert_keras3_nodes_to_keras2(raw_config)

    if config.get("class_name") == "Functional":
        config["class_name"] = "Model"

    if "config" in config:
        cfg = config["config"]
        if "input_layers" in cfg:
            in_l = cfg.pop("input_layers")
            cfg["inputLayers"] = in_l if (isinstance(in_l, list) and in_l and isinstance(in_l[0], list)) else [in_l]
        if "output_layers" in cfg:
            out_l = cfg.pop("output_layers")
            cfg["outputLayers"] = out_l if (isinstance(out_l, list) and out_l and isinstance(out_l[0], list)) else [out_l]

        if "layers" in cfg:
            for layer in cfg["layers"]:
                if "name" not in layer and "config" in layer and "name" in layer["config"]:
                    layer["name"] = layer["config"]["name"]
                if layer.get("class_name") == "InputLayer" and "config" in layer:
                    c = layer["config"]
                    if "batch_shape" in c:
                        c["batch_input_shape"] = c.pop("batch_shape")
                if layer.get("class_name") == "MultiHeadAttention" and "inbound_nodes" in layer:
                    for node in layer["inbound_nodes"]:
                        if isinstance(node, list) and len(node) > 1:
                            del node[1:]

    model_json = {
        "format": "layers-model",
        "generatedBy": "Keras 3 Robust v7 Exporter",
        "convertedBy": "Antigravity Exporter",
        "modelTopology": {
            "keras_version": "3.8.0",
            "backend": "tensorflow",
            "model_config": config
        },
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

    size_mb = shard_path.stat().st_size / (1024 * 1024)
    print(f"[OK] Export Model v7 Robust sukses!")
    print(f"   model.json: {model_json_path}")
    print(f"   weights:    {shard_path} ({size_mb:.2f} MB)")
    print(f"   layers:     {len(weights_meta)} weight tensors")


if __name__ == "__main__":
    base_dir = Path(r"d:\Penyimpanan Utama\Documents\python\IsyaratLive")
    model_path = base_dir / "ml/checkpoints/v7/best.keras"

    if not model_path.exists():
        print(f"❌ Model checkpoint tidak ditemukan: {model_path}")
        print("   Jalankan train_v7.py terlebih dahulu!")
        exit(1)

    sys.path.insert(0, str(base_dir / "ml/training"))
    from train_v7 import build_model_v7

    model = build_model_v7()
    model.load_weights(model_path)
    print(f"Loaded Model v7 Robust weights: {model.name}")
    model.summary()

    export_model_to_tfjs(
        model,
        base_dir / "frontend/public/models/gloss-classifier-v7"
    )
