"""
fps_probe.py — pinpoint the SmartGuard FPS bottleneck.

Measures, for ONE camera source, three things independently:
  1. Raw cap.read() decode FPS (no processing at all)
  2. The resolution actually being delivered (reveals full-res RTSP streams)
  3. Capture + YOLO inference FPS

This isolates whether the limit is the CAMERA (decode/network) or the
PIPELINE (inference/processing).

Usage:
    # Against a specific source (USB index or RTSP/HTTP URL):
    python fps_probe.py 0
    python fps_probe.py "rtsp://user:pass@192.168.1.50:554/stream1"

    # If the DB is up, probe the first active camera automatically:
    python fps_probe.py
"""
import sys
import time
import warnings
warnings.filterwarnings("ignore")

import cv2


def resolve_source():
    if len(sys.argv) > 1:
        s = sys.argv[1]
        return int(s) if s.isdigit() else s
    # No arg: try to pull the first active camera from the DB.
    import os
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "smartguard_backend.settings")
    import django
    django.setup()
    from cameras.models import Camera
    cam = Camera.objects.filter(is_active=True).exclude(rtsp_url="").first()
    if not cam:
        sys.exit("No active camera in DB. Pass a source explicitly: python fps_probe.py <url-or-index>")
    print(f"Using DB camera id={cam.id} name={cam.name!r}")
    src = cam.rtsp_url
    return int(src) if src.isdigit() else src


def open_capture(source):
    if isinstance(source, int):
        cap = cv2.VideoCapture(source, cv2.CAP_DSHOW)
        cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
        cap.set(cv2.CAP_PROP_FPS, 30.0)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    else:
        cap = cv2.VideoCapture(source)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    return cap


def measure_raw(cap, seconds=8):
    n, t0 = 0, time.time()
    w = h = 0
    while time.time() - t0 < seconds:
        ret, frame = cap.read()
        if not ret or frame is None:
            continue
        if w == 0:
            h, w = frame.shape[:2]
        n += 1
    dt = time.time() - t0
    return n / dt, w, h


def measure_with_yolo(cap, seconds=8):
    from ultralytics import YOLO
    import torch
    import os
    model_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "best.pt")
    m = YOLO(model_path)
    m.to("cuda:0" if torch.cuda.is_available() else "cpu")
    # Warm up: the first inference pays one-time CUDA/cuDNN init (several
    # seconds) which would otherwise dominate a short timing window.
    ok, warm = cap.read()
    if ok and warm is not None:
        for _ in range(5):
            m(warm, imgsz=416, half=True, verbose=False)
    n, t0 = 0, time.time()
    while time.time() - t0 < seconds:
        ret, frame = cap.read()
        if not ret or frame is None:
            continue
        m(frame, imgsz=416, half=True, verbose=False)
        n += 1
    dt = time.time() - t0
    return n / dt


def main():
    source = resolve_source()
    print(f"Source: {source!r}")
    cap = open_capture(source)
    if not cap.isOpened():
        sys.exit(f"Could not open source {source!r}")

    print("\n[1/2] Measuring RAW capture FPS (decode only, no YOLO)...")
    raw_fps, w, h = measure_raw(cap)
    print(f"      -> {raw_fps:5.1f} FPS  at  {w}x{h}")

    print("\n[2/2] Measuring capture + YOLO FPS...")
    yolo_fps = measure_with_yolo(cap)
    print(f"      -> {yolo_fps:5.1f} FPS")

    cap.release()

    print("\n================ DIAGNOSIS ================")
    print(f"Resolution received : {w}x{h}")
    print(f"Raw decode FPS      : {raw_fps:.1f}")
    print(f"Decode + YOLO FPS   : {yolo_fps:.1f}")
    if raw_fps < 10:
        print("\n>>> BOTTLENECK = CAMERA CAPTURE/DECODE (not YOLO).")
        if w * h > 640 * 480:
            print(f">>> You're decoding {w}x{h} frames on the CPU. Use the camera's")
            print(">>> low-res SUB-STREAM (e.g. stream2) — usually a 5-10x speedup.")
        else:
            print(">>> Low-res but still slow: likely network/RTSP transport or USB bandwidth.")
    elif yolo_fps < raw_fps * 0.6:
        print("\n>>> Capture is fine; YOLO/processing is the limiter on this machine.")
    else:
        print("\n>>> Both healthy — your low in-app FPS is elsewhere (e.g. per-frame work / many cameras).")
    print("===========================================")


if __name__ == "__main__":
    main()
