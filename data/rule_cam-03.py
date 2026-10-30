# Python OpenCV Motion Detection with Spatial ROI Mask
# Target: "person walking"
import cv2
import numpy as np

def detect_zone_motion(frame, fgbg):
    h, w = frame.shape[:2]
    # 1. Define ROI Mask (25% to 80%, 30% to 85%)
    rx1, ry1 = int(w * 25 / 100), int(h * 30 / 100)
    rx2, ry2 = int(w * 80 / 100), int(h * 85 / 100)
    
    roi_mask = np.zeros((h, w), dtype=np.uint8)
    cv2.rectangle(roi_mask, (rx1, ry1), (rx2, ry2), 255, -1)
    
    # 2. Apply Background Subtraction inside ROI only
    fg_mask = fgbg.apply(frame)
    zone_fg = cv2.bitwise_and(fg_mask, fg_mask, mask=roi_mask)
    
    # 3. Calculate Motion Delta
    motion_score = float(zone_fg.mean())
    return motion_score > 14.0, motion_score
