# Python OpenCV Motion Detection with Spatial ROI Mask
# Target: "we need to detect the text or motion graphics" (Category: general)
import cv2
import numpy as np



def detect_zone_target(frame, fgbg):
    h, w = frame.shape[:2]
    # 1. Define ROI Mask (8% to 54%, 12% to 92%)
    rx1, ry1 = int(w * 8 / 100), int(h * 12 / 100)
    rx2, ry2 = int(w * 54 / 100), int(h * 92 / 100)
    roi_crop = frame[ry1:ry2, rx1:rx2]
    
    # 2. Background Subtraction inside ROI
    fg_mask = fgbg.apply(roi_crop)
    contours, _ = cv2.findContours(fg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    # 3. Calculate Cluster Motion Score
    moving_pixels = np.count_nonzero(fg_mask > 200)
    total_roi_pixels = roi_crop.shape[0] * roi_crop.shape[1]
    motion_density = (moving_pixels / max(1, total_roi_pixels)) * 100
    
    return motion_density > 2.5, f"Motion density: {motion_density:.2f}%"
