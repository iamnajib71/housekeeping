"""Temporary Linux/T4 rendering comparison using Nerfstudio 1.1.5.

Partial-component training is explicitly labelled and cannot establish a
continuous home reconstruction. This script never calls the cleaning app.
"""
import argparse
import importlib.metadata
import json
import os
from pathlib import Path
import subprocess
import sys
import time


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--alignment", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--partial", action="store_true", help="Explicitly permit a labelled partial-component experiment")
    args = parser.parse_args()
    report = json.loads((args.alignment / "report.json").read_text())
    if report["state"] != "complete" or not report.get("components"):
        raise ValueError("A completed camera reconstruction is required")
    if not report["trainingEligible"] and not args.partial:
        raise ValueError("Full-clip alignment failed its gate; no automatic training")
    best = report["components"][0]
    if best["registered"] < 20 or best["points"] < 1000 or best["meanReprojectionError"] > 2:
        raise ValueError("Insufficient geometry even for a partial rendering trial")
    if args.output.exists():
        raise ValueError("Use a fresh training folder")
    import torch
    if not torch.cuda.is_available():
        raise RuntimeError("A CUDA GPU is required")
    args.output.mkdir(parents=True)
    started = time.monotonic()
    status = {"state": "running", "stage": "prepare", "gpu": torch.cuda.get_device_name(0),
              "partial": not report["trainingEligible"], "component": best,
              "sampledFrames": report["extractedFrames"], "iterations": 3000,
              "torch": torch.__version__, "python": sys.version,
              "nerfstudio": importlib.metadata.version("nerfstudio"),
              "gsplat": importlib.metadata.version("gsplat")}
    status_path = args.output / "report.json"
    major, minor = torch.cuda.get_device_capability(0)
    bin_dir = Path(sys.executable).parent
    env = {**os.environ, "MAX_JOBS": "2", "TORCH_CUDA_ARCH_LIST": f"{major}.{minor}",
           "PATH": str(bin_dir) + os.pathsep + os.environ.get("PATH", "")}
    def run(command, timeout=1800):
        status_path.write_text(json.dumps(status, indent=2))
        with (args.output / (status["stage"] + ".log")).open("w") as log:
            subprocess.run([str(bin_dir / command[0]), *command[1:]], check=True,
                           env=env, timeout=timeout, stdout=log, stderr=subprocess.STDOUT)
    try:
        data = args.output / "data"
        model = args.alignment / "sparse" / best["model"]
        run(["ns-process-data", "images", "--data", str(args.alignment / "images"),
             "--output-dir", str(data), "--skip-colmap", "--colmap-model-path", str(model.resolve()),
             "--num-downscales", "2"])
        transforms = json.loads((data / "transforms.json").read_text())
        if len(transforms["frames"]) != best["registered"]:
            raise ValueError("Prepared camera count does not match the selected component")
        status.update(stage="train")
        run(["ns-train", "splatfacto", "--data", str(data), "--output-dir", str(args.output / "outputs"),
             "--max-num-iterations", "3000", "--steps-per-save", "1000", "--vis", "tensorboard",
             "nerfstudio-data", "--downscale-factor", "2"])
        config = next((args.output / "outputs").rglob("config.yml"))
        status.update(stage="render", config=str(config))
        run(["ns-render", "dataset", "--load-config", str(config), "--output-path", str(args.output / "renders"),
             "--split", "test", "--image-format", "png", "--rendered-output-names", "rgb", "gt-rgb"])
        status.update(stage="export")
        run(["ns-export", "gaussian-splat", "--load-config", str(config), "--output-dir", str(args.output / "export")])
        status.update(state="complete", stage="complete", elapsedSeconds=round(time.monotonic()-started, 2))
    except Exception as exc:
        status.update(state="failed", error=type(exc).__name__ + ": " + str(exc))
        raise
    finally:
        status_path.write_text(json.dumps(status, indent=2))
    print(json.dumps(status, indent=2))


if __name__ == "__main__":
    main()
