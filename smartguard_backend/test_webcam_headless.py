import cv2

print("Opening webcam index 0...")
cap = cv2.VideoCapture(0)

if not cap.isOpened():
    print("FAILED: cannot open webcam index 0")
    exit(1)

print("SUCCESS: webcam opened. Reading a few frames...")

ok_frames = 0
for i in range(30):
    ret, frame = cap.read()
    if not ret:
        print(f"Frame {i}: FAILED")
    else:
        ok_frames += 1
        print(f"Frame {i}: OK, shape={frame.shape}")

cap.release()
print(f"Done. {ok_frames} / 30 frames read successfully.")
