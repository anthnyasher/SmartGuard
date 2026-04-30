"""
detect.py - Minimal shoplifting-only detector for testing,
now wired to Django Alerts.
"""

import argparse
import os
import pathlib
from pathlib import Path
from datetime import datetime, timedelta
from ultralytics import YOLO


# --- WINDOWS PATH COMPATIBILITY PATCH START ---
#temp = pathlib.PosixPath
#pathlib.PosixPath = pathlib.WindowsPath

# --- WINDOWS PATH COMPATIBILITY PATCH END ---

import cv2
import numpy as np
import torch

# ========= Django integration =========
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "smartguard_backend.settings")

import django
django.setup()

from cameras.models import Camera
from alerts.models import Alert
# ======================================

INCIDENT_TIMEOUT_SECONDS = 30
active_incident = {}  # key: camera_id, value: dict with alert state

# Hardcode or pass from CLI: which Camera in DB this source belongs to
CAMERA_ID = 1  # TODO: later: make this a CLI arg if needed


def map_confidence_to_severity(behavior_type, c):
    """
    Very simple mapping: you can refine later.
    c is 0–1 float.
    """
    if behavior_type == "CONCEALMENT":
        if c >= 0.95:
            return "CRITICAL"
        if c >= 0.85:
            return "HIGH"
        if c >= 0.70:
            return "MEDIUM"
        return "LOW"
    # default for other behaviors
    if c >= 0.85:
        return "HIGH"
    if c >= 0.70:
        return "MEDIUM"
    return "LOW"


def create_alert_from_detection(camera_id, behavior_type, confidence):
    """
    Create an Alert row in Django using the detection info.
    confidence: 0–1 float from YOLO.
    """
    camera = Camera.objects.get(id=camera_id)
    severity = map_confidence_to_severity(behavior_type, confidence)

    alert = Alert.objects.create(
        camera=camera,
        behavior_type=behavior_type,      # e.g. "CONCEALMENT" for shoplifting
        confidence=confidence,            # store 0–1
        severity=severity,
        alert_category="SHOPLIFTING",
        status="NEW",
    )

    print(f"[ALERT] {behavior_type} at {camera.name}: {confidence*100:.0f}% → {severity}")
    return alert


def handle_detection(camera_id, behavior_type, confidence):
    now = datetime.utcnow()
    state = active_incident.get(camera_id)

    if state is None:
        # No active incident -> create a new Alert
        alert = create_alert_from_detection(camera_id, behavior_type, confidence)
        active_incident[camera_id] = {
            "alert_id": alert.id,
            "last_seen": now,
            "max_conf": confidence,
        }
        return

    # Incident already active for this camera -> update state, not create a new alert
    state["last_seen"] = now

    if confidence > state["max_conf"]:
        # Update DB row with higher confidence and severity
        alert = Alert.objects.get(id=state["alert_id"])
        alert.confidence = confidence
        alert.severity = map_confidence_to_severity(behavior_type, confidence)
        alert.save()
        state["max_conf"] = confidence


def cleanup_incidents():
    now = datetime.utcnow()
    to_delete = []
    for camera_id, state in active_incident.items():
        if (now - state["last_seen"]) > timedelta(seconds=INCIDENT_TIMEOUT_SECONDS):
            to_delete.append(camera_id)
    for camera_id in to_delete:
        del active_incident[camera_id]


def parse_args():
    p = argparse.ArgumentParser(
        description="Minimal YOLOv5 shoplifting detector (image/video)."
    )
    p.add_argument("--weights", required=True, help="Path to YOLOv5 weights (best.pt)")
    p.add_argument("--source", required=True, help="Path to image/video file, or camera index (0).")
    p.add_argument("--target_class", default="shoplifting",
                   help="Class name to treat as 'shoplifting' (default: shoplifting).")
    p.add_argument("--conf", type=float, default=0.4,
                   help="Confidence threshold for detections.")
    p.add_argument("--output", default=None,
                   help="If provided, save annotated image/video to this path.")
    return p.parse_args()


def load_model(weights_path, device=None):
    if device is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"
    # Ultralytics YOLO API
    model = YOLO(weights_path)
    model.to(device)
    return model


def run_on_image(model, img_path, target_class, conf_thresh, out_path=None):
    img = cv2.imread(img_path)
    if img is None:
        raise FileNotFoundError(f"Image not found: {img_path}")
    results = model(img)
    df = results.pandas().xyxy[0]
    hits = df[(df['confidence'] >= conf_thresh) &
              (df['name'].str.lower() == target_class.lower())]
    detected = len(hits) > 0

    # create alerts for image detections
    for _, row in hits.iterrows():
        conf = float(row['confidence'])
        handle_detection(
            camera_id=CAMERA_ID,
            behavior_type="CONCEALMENT",
            confidence=conf,
        )

    annotated = results.render()[0]
    if annotated.shape[:2] != img.shape[:2]:
        annotated = cv2.resize(annotated, (img.shape[1], img.shape[0]))
    if out_path:
        cv2.imwrite(out_path, annotated)

    detections = []
    for _, row in hits.iterrows():
        detections.append({
            "name": row['name'],
            "confidence": float(row['confidence']),
            "bbox": [float(row['xmin']), float(row['ymin']),
                     float(row['xmax']), float(row['ymax'])]
        })
    return detected, detections


def run_on_video(model, video_path, target_class, conf_thresh, out_path=None):
    
    cap = cv2.VideoCapture(video_path if not video_path.isdigit() else int(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video source: {video_path}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fourcc = cv2.VideoWriter_fourcc(*'mp4v') if out_path else None
    writer = cv2.VideoWriter(out_path, fourcc, fps, (width, height)) if out_path else None

    frame_idx = 0
    detections_log = []
    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            # YOLOv8 inference
            results = model(frame)
            r = results[0]
            boxes = r.boxes  # Boxes object

            # Collect detections matching target_class and conf_thresh
            hits = []
            if boxes is not None and len(boxes) > 0:
                clses = boxes.cls.cpu().numpy().astype(int)
                confs = boxes.conf.cpu().numpy()
                xyxy = boxes.xyxy.cpu().numpy()

                for cls_id, conf, (x1, y1, x2, y2) in zip(clses, confs, xyxy):
                    name = model.names[int(cls_id)].lower()
                    if name == target_class.lower() and conf >= conf_thresh:
                        hits.append((conf, [x1, y1, x2, y2]))

            if hits:
                t_sec = frame_idx / fps
                for conf, bbox in hits:
                    detections_log.append({
                        "time_sec": round(t_sec, 3),
                        "confidence": float(conf),
                        "bbox": [float(b) for b in bbox],
                    })
                    handle_detection(
                        camera_id=CAMERA_ID,
                        behavior_type="CONCEALMENT",
                        confidence=float(conf),
                    )

            # apply incident timeout each frame
            cleanup_incidents()

            # Render annotated frame from Ultralytics result
            annotated = r.plot()

            if annotated.shape[1] != width or annotated.shape[0] != height:
                annotated = cv2.resize(annotated, (width, height))
            if writer:
                writer.write(annotated)
            cv2.imshow("SmartGuard - Webcam", annotated)
            if cv2.waitKey(1) & 0xFF == ord('q'):
              break

            frame_idx += 1
    finally:
        cap.release()
        if writer:
            writer.release()
        cv2.destroyAllWindows()

    detected = len(detections_log) > 0
    duration = frame_idx / fps if fps else 0
    return detected, detections_log, duration



def main():
    args = parse_args()
    src = args.source
    is_image = False
    if os.path.isfile(src):
        _, ext = os.path.splitext(src.lower())
        if ext in (".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff"):
            is_image = True

    print(f"[INFO] Loading model from: {args.weights}")
    model = load_model(args.weights)
    model.conf = args.conf

    if is_image:
        print("[INFO] Running on image:", src)
        detected, dets = run_on_image(
            model, src, args.target_class, args.conf, out_path=args.output
        )
        if detected:
            print("[RESULT] Shoplifting DETECTED in image!")
            for i, d in enumerate(dets, 1):
                print(f"  - Hit {i}: conf={d['confidence']:.3f}, bbox={d['bbox']}")
        else:
            print("[RESULT] No shoplifting detected in image.")
        if args.output:
            print(f"[INFO] Annotated image saved to: {args.output}")
    else:
        print("[INFO] Running on video:", src)
        detected, log, duration = run_on_video(
            model, src, args.target_class, args.conf, out_path=args.output
        )
        if detected:
            print("[RESULT] Shoplifting DETECTED in video!")
            for i, entry in enumerate(log[:20], 1):
                print(
                    f"  - #{i} @ t={entry['time_sec']}s "
                    f"conf={entry['confidence']:.3f} bbox={entry['bbox']}"
                )
            if len(log) > 20:
                print(f"  ...and {len(log)-20} more detections (omitted).")
        else:
            print("[RESULT] No shoplifting detected in video.")
        print(f"[INFO] Video duration (s): {duration:.2f}")
        if args.output:
            print(f"[INFO] Annotated video saved to: {args.output}")


if __name__ == "__main__":
    main()
