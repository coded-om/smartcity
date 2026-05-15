import sys, time
import cv2, numpy as np

def get_corners(gray):
    pts = cv2.goodFeaturesToTrack(gray, maxCorners=150, qualityLevel=0.01,
                                   minDistance=10, blockSize=7)
    return pts

def calc_flow(prev_gray, curr_gray, prev_pts):
    if prev_pts is None or len(prev_pts) < 20:
        return None
    curr_pts, status, _ = cv2.calcOpticalFlowPyrLK(
        prev_gray, curr_gray, prev_pts, None,
        winSize=(21,21), maxLevel=3,
        criteria=(cv2.TERM_CRITERIA_EPS|cv2.TERM_CRITERIA_COUNT, 20, 0.01))
    if curr_pts is None:
        return None
    gp = prev_pts[status==1]
    gc = curr_pts[status==1]
    if len(gc) < 10:
        return None
    delta = gc - gp
    mags = np.sqrt(delta[:,0]**2 + delta[:,1]**2)
    angles = np.arctan2(delta[:,1], delta[:,0])
    mean_mag = float(np.mean(mags))
    var = float(1.0 - abs(np.mean(np.exp(1j*angles))))
    return mean_mag, var, len(gc)

source = sys.argv[1] if len(sys.argv) > 1 else 0
try:
    source = int(source)
except ValueError:
    pass

cap = cv2.VideoCapture(source)
if not cap.isOpened():
    print(f"[ERROR] Cannot open: {source}")
    sys.exit(1)

print("=" * 60)
print("حرّك بشكل عادي  لاحظ MAG و VAR")
print("حرّك بشكل عنيف (ضرب/هرولة)  لاحظ الفرق")
print("اضغط Q للخروج")
print("=" * 60)
print(f"{'MAG':>8} {'VAR':>6} {'PTS':>5}  {'تقييم':>20}")
print("-" * 50)

prev_gray = None
prev_pts  = None
frame_n   = 0

while True:
    ret, frame = cap.read()
    if not ret:
        break
    frame_n += 1
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    if prev_gray is not None and frame_n % 3 == 0:
        result = calc_flow(prev_gray, gray, prev_pts)
        if result:
            mag, var, pts = result
            if mag >= 15.0 and var >= 0.30:
                label = " FIGHTING"
            elif mag >= 8.0:
                label = " SUSPICIOUS"
            else:
                label = " Normal"
            print(f"{mag:>8.2f} {var:>6.3f} {pts:>5}  {label}")

    prev_gray = gray
    prev_pts  = get_corners(gray)

    if prev_gray is not None and frame_n % 3 == 0:
        result = calc_flow(prev_gray, gray, prev_pts)
        if result:
            mag, var, pts = result
            if mag >= 8.0 and var >= 0.55:
                label = " FIGHTING"
            elif mag >= 5.0:
                label = " SUSPICIOUS"
            else:
                label = " Normal"
            print(f"{mag:>8.2f} {var:>6.3f} {pts:>5}  {label}", flush=True)

cap.release()
print("\nالقيم الحالية في threat_detector.py:")
print("  FIGHT_MAG = 8.0  (رفّعها لو كثير false positives)")
print("  FIGHT_VAR = 0.55 (رفّعها لو كثير false positives)")
print("  RUN_MAG   = 5.0")
