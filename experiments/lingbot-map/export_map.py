"""Bounded LingBot-Map benchmark/exporter. Runs on a GPU, outside Vercel.

The notebook pins upstream source and weights. This adapter does not execute
pickled model code, open a server, access the household DB, or label rooms.
"""
import argparse
import json
import math
from pathlib import Path
import sys
import tempfile
import time

UPSTREAM_REVISION = "8fdf984a7f9caf391622ea5843a8410900d27ef2"
MODEL_REVISION = "204754b"


def extract_frames(video, folder, fps=2, limit=120, clip_seconds=30):
    import cv2
    cap = cv2.VideoCapture(str(video))
    source_fps = cap.get(cv2.CAP_PROP_FPS)
    total = cap.get(cv2.CAP_PROP_FRAME_COUNT)
    if not cap.isOpened() or not math.isfinite(source_fps) or source_fps <= 0 or total <= 0:
        cap.release()
        raise ValueError("Cannot decode video duration; use a supported MP4 recording.")
    source_duration = total / source_fps
    if not 0 < source_duration <= 180 or not 0 < clip_seconds <= 60:
        cap.release()
        raise ValueError("Use a recording up to 3 minutes and a trial segment up to 60 seconds.")
    # The browser accepts at most 120 cameras; report only the sampled segment.
    duration = min(source_duration, clip_seconds, limit / fps)
    paths, times = [], []
    try:
        for i in range(min(limit, math.ceil(duration * fps))):
            seconds = i / fps
            cap.set(cv2.CAP_PROP_POS_MSEC, seconds * 1000)
            ok, frame = cap.read()
            if not ok:
                break
            path = folder / f"{i:04d}.jpg"
            if not cv2.imwrite(str(path), frame):
                raise ValueError("Could not prepare a video frame.")
            paths.append(str(path))
            times.append(seconds)
    finally:
        cap.release()
    if len(paths) < 2:
        raise ValueError("Use a continuous clip with at least two readable frames.")
    return paths, times, duration


def compact_map(points, confidence, colors, camera_positions, times, duration, metrics, maximum=20000):
    import numpy as np
    points = np.asarray(points).reshape(-1, 3)
    confidence = np.asarray(confidence).reshape(-1)
    colors = np.asarray(colors).reshape(-1, 3)
    cameras = np.asarray(camera_positions)
    if points.shape != colors.shape or len(confidence) != len(points) or cameras.shape != (len(times), 3):
        raise ValueError("Unexpected prediction shapes from the model.")
    valid = np.isfinite(points).all(axis=1) & np.isfinite(confidence)
    if not valid.any() or not np.isfinite(cameras).all():
        raise ValueError("Reconstruction contains no finite geometry.")
    valid &= confidence >= np.percentile(confidence[valid], 60)
    points, colors = points[valid], colors[valid]
    # Relative coordinates only: monocular scale is not a measured floor plan.
    center = np.median(points, axis=0)
    radius = np.linalg.norm(points - center, axis=1)
    valid = radius <= np.percentile(radius, 98)
    points, colors = points[valid], colors[valid]
    scale = max(float(np.percentile(radius, 90)), 1e-6)
    # Uniform sampling avoids regular stripes from flattened image rows.
    indices = np.random.default_rng(42).choice(len(points), min(maximum, len(points)), replace=False)
    points = np.round((points[indices] - center) / scale, 4)
    colors = np.clip(colors[indices], 0, 255).astype(int)
    cameras = np.round((cameras - center) / scale, 4)
    if not len(points) or not np.isfinite(points).all() or np.max(np.abs(cameras)) > 100000:
        raise ValueError("The reconstruction collapsed. Try a slower continuous recording.")
    return {
        "format": "housekeeping-map-v1", "model": "lingbot-map",
        "revision": UPSTREAM_REVISION, "duration": round(duration, 4),
        "points": np.column_stack((points, colors)).tolist(),
        "cameras": [{"seconds": round(t, 4), "position": p.tolist()} for t, p in zip(times, cameras)],
        "metrics": metrics,
    }


def run(args):
    import numpy as np
    import torch
    if not torch.cuda.is_available():
        raise RuntimeError("A GPU runtime is required for this trial; no CPU fallback is started.")
    repo = Path(args.repo).resolve()
    import subprocess
    revision = subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD"], text=True).strip()
    if revision != UPSTREAM_REVISION:
        raise RuntimeError("Use the pinned LingBot-Map source revision from the trial notebook.")
    sys.path.insert(0, str(repo))
    from lingbot_map.models.gct_stream import GCTStream
    from lingbot_map.utils.load_fn import load_and_preprocess_images
    from lingbot_map.utils.pose_enc import pose_encoding_to_extri_intri
    from lingbot_map.utils.geometry import unproject_depth_map_to_point_map
    with tempfile.TemporaryDirectory(prefix="mapping-frames-") as folder:
        paths, times, duration = extract_frames(args.video, Path(folder), args.fps,
                                               clip_seconds=getattr(args, "clip_seconds", 30))
        images = load_and_preprocess_images(paths, mode="crop", image_size=args.image_size, patch_size=14)
        detailed = getattr(args, "profile", "fast") == "detailed"
        scale_frames = min(8 if detailed else 2, len(paths))
        cache_window = 32 if detailed else 16
        iterations = 4 if detailed else 1
        keyframe_interval = 1 if detailed else 2
        model = GCTStream(img_size=518, patch_size=14, enable_3d_rope=True,
                          max_frame_num=1024, kv_cache_sliding_window=cache_window,
                          kv_cache_scale_frames=scale_frames, kv_cache_cross_frame_special=True,
                          kv_cache_include_scale_frames=True, use_sdpa=True, camera_num_iterations=iterations)
        checkpoint = torch.load(args.weights, map_location="cpu", weights_only=True)
        state = checkpoint.get("model", checkpoint)
        model.load_state_dict(state, strict=True)
        del checkpoint, state
        dtype = torch.bfloat16 if torch.cuda.get_device_capability()[0] >= 8 else torch.float16
        model.aggregator.to(dtype=dtype)
        model = model.to("cuda").eval()
        images = images.to("cuda")
        torch.cuda.reset_peak_memory_stats()
        torch.cuda.synchronize()
        started = time.perf_counter()
        with torch.inference_mode(), torch.amp.autocast("cuda", dtype=dtype):
            result = model.inference_streaming(images, num_scale_frames=scale_frames, keyframe_interval=keyframe_interval,
                                               output_device=torch.device("cpu"))
        torch.cuda.synchronize()
        elapsed = time.perf_counter() - started
        peak = torch.cuda.max_memory_allocated() / (1024 * 1024)
        pose = result["pose_enc"].float().cpu()
        extrinsic, intrinsic = pose_encoding_to_extri_intri(pose, images.shape[-2:])
        extrinsic = extrinsic.cpu().numpy().reshape(-1, 3, 4)
        intrinsic = intrinsic.cpu().numpy().reshape(-1, 3, 3)
        world_to_camera = np.tile(np.eye(4), (len(extrinsic), 1, 1))
        world_to_camera[:, :3, :4] = extrinsic
        positions = np.linalg.inv(world_to_camera)[:, :3, 3]
        colors = images.detach().float().cpu().permute(0, 2, 3, 1).numpy() * 255
        # The pinned streaming checkpoint predicts depth, not a direct point map.
        # Match the upstream viewer's depth-to-world reconstruction path.
        depth = result["depth"].float().cpu().numpy().reshape(len(times), *images.shape[-2:], 1)
        points = unproject_depth_map_to_point_map(depth, extrinsic, intrinsic)
        confidence = result["depth_conf"].float().cpu().numpy()
        metrics = {"inferenceSeconds": round(elapsed, 3), "peakGpuMb": round(peak, 1), "frames": len(times)}
        output = compact_map(points, confidence, colors, positions, times, duration, metrics,
                             maximum=30000 if detailed else 20000)
        encoded = json.dumps(output, separators=(",", ":"), allow_nan=False)
        if len(encoded.encode("utf-8")) > 4 * 1024 * 1024:
            raise RuntimeError("Export exceeds the bounded browser import size.")
        Path(args.output).write_text(encoded, encoding="utf-8")
        report = {"gpu": torch.cuda.get_device_name(), "sourceRevision": revision,
                  "modelRevision": MODEL_REVISION, "reconstruction": "depth_unprojected",
                  "profile": getattr(args, "profile", "fast"), "imageSize": args.image_size,
                  "sampleFps": args.fps, "segmentSeconds": duration,
                  "scaleFrames": scale_frames, "cameraIterations": iterations,
                  "cacheWindow": cache_window, "keyframeInterval": keyframe_interval,
                  **metrics, "points": len(output["points"]), "bytes": len(encoded)}
        Path(args.output).with_suffix(".benchmark.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(json.dumps(report, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video", required=True)
    parser.add_argument("--repo", required=True)
    parser.add_argument("--weights", required=True)
    parser.add_argument("--output", default="housekeeping-map.json")
    parser.add_argument("--fps", type=float, default=2, choices=[1, 2, 4])
    parser.add_argument("--profile", default="fast", choices=["fast", "detailed"])
    parser.add_argument("--image-size", type=int, default=336, choices=[252, 336, 518])
    parser.add_argument("--clip-seconds", type=float, default=30)
    options = parser.parse_args()
    try:
        run(options)
    except Exception as error:
        print(f"Mapping trial failed: {error}", file=sys.stderr)
        raise SystemExit(1)
