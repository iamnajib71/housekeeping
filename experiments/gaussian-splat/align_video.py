"""Bounded COLMAP trial; no app writes or credentials required.

Run with NumPy, OpenCV and pycolmap 3.12.6 in an isolated environment.
Personal inputs and outputs must stay outside Git.
"""
import argparse
import json
from pathlib import Path
import time

import cv2
import pycolmap


def extract_frames(video, images, seconds, fps):
    capture = cv2.VideoCapture(str(video))
    source_fps = capture.get(cv2.CAP_PROP_FPS)
    if not capture.isOpened() or source_fps <= 0:
        raise ValueError("Cannot decode the recording")
    duration = capture.get(cv2.CAP_PROP_FRAME_COUNT) / source_fps
    if duration <= 0:
        capture.release()
        raise ValueError("The recording has no readable frames")
    count = 0
    previews = []
    targets = {round(i * source_fps / fps): i for i in range(int(min(duration, seconds) * fps))}
    try:
        for index in range(max(targets) + 1):
            if not capture.grab():
                break
            if index not in targets:
                continue
            ok, frame = capture.retrieve()
            if not ok:
                raise ValueError("Unreadable sampled frame")
            height, width = frame.shape[:2]
            frame = cv2.resize(frame, (1280, round(height * 1280 / width)))
            name = f"frame_{count + 1:06d}.jpg"
            if not cv2.imwrite(str(images / name), frame, [cv2.IMWRITE_JPEG_QUALITY, 95]):
                raise ValueError("Cannot save sampled frame")
            if count % (5 * fps) == 0 and len(previews) < 6:
                import numpy as np
                ratio = min(480 / frame.shape[1], 270 / frame.shape[0])
                resized = cv2.resize(frame, (round(frame.shape[1] * ratio), round(frame.shape[0] * ratio)))
                thumb = np.zeros((270, 480, 3), dtype=np.uint8)
                y = (270 - resized.shape[0]) // 2
                x = (480 - resized.shape[1]) // 2
                thumb[y:y+resized.shape[0], x:x+resized.shape[1]] = resized
                cv2.putText(thumb, f"{count / fps:g}s", (12, 28), cv2.FONT_HERSHEY_SIMPLEX, .7, (255, 255, 255), 2)
                previews.append(thumb)
            count += 1
    finally:
        capture.release()
    if len(previews) == 6:
        import numpy as np
        cv2.imwrite(str(images.parent / "contact-sheet.jpg"), np.vstack([np.hstack(previews[i:i+2]) for i in range(0, 6, 2)]))
    return count, duration


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--seconds", type=int, default=30, choices=(30, 60, 90))
    parser.add_argument("--fps", type=int, default=4, choices=(2, 4))
    parser.add_argument("--matching", default="sequential", choices=("sequential", "exhaustive"))
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError("Use a fresh output folder to preserve earlier results")
    args.output.mkdir(parents=True)
    images = args.output / "images"
    images.mkdir()
    sparse = args.output / "sparse"
    sparse.mkdir()
    report = {"state": "running", "secondsRequested": args.seconds,
              "fps": args.fps, "width": 1280, "matching": args.matching,
              "pycolmapVersion": pycolmap.__version__}
    status = args.output / "report.json"
    status.write_text(json.dumps(report, indent=2))
    started = time.monotonic()
    try:
        total, duration = extract_frames(args.video, images, args.seconds, args.fps)
        report.update(extractedFrames=total, sourceDuration=duration, stage="features")
        status.write_text(json.dumps(report, indent=2))
        db = str(args.output / "database.db")
        pycolmap.extract_features(db, str(images), camera_mode=pycolmap.CameraMode.SINGLE,
                                 camera_model="OPENCV", device=pycolmap.Device.cpu,
                                 sift_options={"num_threads": 2, "max_image_size": 1280, "max_num_features": 8192})
        report.update(stage="matching")
        status.write_text(json.dumps(report, indent=2))
        if args.matching == "sequential":
            pycolmap.match_sequential(db, device=pycolmap.Device.cpu,
                                     sift_options={"num_threads": 2}, matching_options={"overlap": 20, "num_threads": 2})
        else:
            pycolmap.match_exhaustive(db, device=pycolmap.Device.cpu, sift_options={"num_threads": 2})
        report.update(stage="mapping")
        status.write_text(json.dumps(report, indent=2))
        pycolmap.incremental_mapping(db, str(images), str(sparse),
                                    options={"num_threads": 2, "ba_global_function_tolerance": .000001})
        models = []
        for folder in sorted(sparse.iterdir()):
            if not folder.is_dir() or not (folder / "images.bin").exists():
                continue
            rec = pycolmap.Reconstruction(str(folder))
            errors = [float(point.error) for point in rec.points3D.values()]
            names = sorted(image.name for image in rec.images.values())
            models.append({"model": folder.name, "registered": len(names),
                           "points": len(errors), "meanReprojectionError": sum(errors) / len(errors) if errors else None,
                           "firstFrame": names[0] if names else None, "lastFrame": names[-1] if names else None})
        models.sort(key=lambda model: model["registered"], reverse=True)
        best = models[0] if models else None
        fraction = best["registered"] / total if best and total else 0
        # A diagnostic gate, not a calibrated accuracy guarantee. Always
        # inspect trajectory and held-out images before accepting geometry.
        eligible = bool(best and fraction >= .8 and best["registered"] >= 60
                        and best["meanReprojectionError"] is not None
                        and best["meanReprojectionError"] <= 2)
        report.update(state="complete", extractedFrames=total, components=models,
                      largestComponentFraction=round(fraction, 4), trainingEligible=eligible,
                      elapsedSeconds=round(time.monotonic() - started, 2))
    except Exception as exc:
        report.update(state="failed", error=type(exc).__name__ + ": " + str(exc),
                      elapsedSeconds=round(time.monotonic() - started, 2))
        raise
    finally:
        status.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
