"""
Real-Time Motion Trigger & Pre/Post-Roll Worker for Live CCTV Operator
Supports:
  1. Local stored video files (e.g. public/cctv/cam-04/perimeter-security-zone.mp4)
  2. YouTube live streams (via yt-dlp or direct stream URL)
  3. RTSP / IP camera streams
"""

import os
import sys
import time
import json
import base64
import argparse
from collections import deque
import urllib.request
import urllib.error
import cv2

# Ensure UTF-8 output on Windows consoles
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

def get_stream_url(source):
    if "youtube.com" in source or "youtu.be" in source:
        try:
            import subprocess
            print(f"[Worker] Resolving live YouTube stream URL using yt-dlp: {source}")
            cmd = ["yt-dlp", "-g", "-f", "best", source]
            out = subprocess.check_output(cmd, universal_newlines=True).strip()
            if out.startswith("http"):
                print("[Worker] Resolved direct HLS stream link successfully.")
                return out
        except Exception as e:
            print(f"[Worker] Error extracting YouTube link with yt-dlp: {e}")
            print("[Worker] Please ensure yt-dlp is installed: pip install yt-dlp")
    return source

def run_motion_worker(
    video_source,
    camera_id="cam-04",
    target_concept="children running",
    api_endpoint="http://localhost:3001/api/cctv/trigger-event",
    motion_threshold=14.0,
    cooldown_sec=5.0,
    pre_roll_sec=10,
    post_roll_sec=5,
    loop_video=True
):
    resolved_source = get_stream_url(video_source)
    print(f"[Worker] Initializing camera [{camera_id}] on: {resolved_source}", flush=True)
    cap = cv2.VideoCapture(resolved_source)
    if not cap.isOpened():
        print(f"[Worker] Error: Could not open video source: {resolved_source}", flush=True)
        return

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    frame_interval = max(1, int(fps)) # Sample approx 1 frame per second
    
    # 10-second Pre-roll Ring Buffer in RAM
    pre_roll_buffer = deque(maxlen=pre_roll_sec)
    
    fgbg = cv2.createBackgroundSubtractorMOG2(history=300, varThreshold=25, detectShadows=True)
    
    frame_idx = 0
    last_trigger_time = 0

    print(f"[Worker] Active monitoring started! Pre-roll buffer: {pre_roll_sec}s | Post-roll: {post_roll_sec}s", flush=True)
    print(f"[Worker] Target Concept: '{target_concept}' | Motion Threshold: {motion_threshold}", flush=True)

    while True:
        ret, frame = cap.read()
        if not ret:
            if loop_video and not ("http" in str(video_source)):
                # Rewind local video
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                frame_idx = 0
                continue
            else:
                print("[Worker] Stream ended or connection lost. Retrying in 2 seconds...")
                time.sleep(2)
                cap = cv2.VideoCapture(resolved_source)
                continue

        current_second = int(frame_idx / fps)
        
        # 1. Process 1 frame per second
        if frame_idx % frame_interval == 0:
            # Check for dynamically saved camera rule updates from Web UI
            rules_path = os.path.join(os.path.dirname(__file__), "..", "data", "camera_rules.json")
            active_roi = None
            if os.path.exists(rules_path):
                try:
                    with open(rules_path, "r", encoding="utf-8") as rf:
                        rdata = json.load(rf)
                        if camera_id in rdata:
                            active_roi = rdata[camera_id].get("roiZone")
                            target_concept = rdata[camera_id].get("prompt", target_concept)
                            motion_threshold = float(rdata[camera_id].get("motionThreshold", motion_threshold))
                except Exception:
                    pass

            small = cv2.resize(frame, (640, 360))
            sh, sw = small.shape[:2]

            # Apply ROI Mask if active
            if active_roi and len(active_roi) == 4:
                import numpy as np
                x1, y1, x2, y2 = active_roi
                rx1, ry1 = int(sw * x1 / 100), int(sh * y1 / 100)
                rx2, ry2 = int(sw * x2 / 100), int(sh * y2 / 100)
                roi_mask = np.zeros((sh, sw), dtype=np.uint8)
                cv2.rectangle(roi_mask, (rx1, ry1), (rx2, ry2), 255, -1)
                raw_fg = fgbg.apply(small)
                fgmask = cv2.bitwise_and(raw_fg, raw_fg, mask=roi_mask)
            else:
                fgmask = fgbg.apply(small)
            
            # Remove shadows & noise
            _, thresh = cv2.threshold(fgmask, 200, 255, cv2.THRESH_BINARY)
            motion_score = float(thresh.mean())

            # Store in pre-roll RAM buffer
            pre_roll_buffer.append({
                "second": current_second,
                "motion_score": round(motion_score, 2),
                "image": small
            })

            now = time.time()
            # 2. Check for Motion Trigger
            if motion_score >= motion_threshold and (now - last_trigger_time) > cooldown_sec:
                last_trigger_time = now
                print(f"[Worker] [ALERT] MOTION TRIGGER at t={current_second}s (Delta Score: {motion_score:.1f} >= {motion_threshold})", flush=True)

                # Grab pre-roll (10s before) from RAM buffer
                pre_frames_count = len(pre_roll_buffer)
                
                # Compress trigger keyframe to Base64
                _, buf = cv2.imencode('.jpg', small, [cv2.IMWRITE_JPEG_QUALITY, 75])
                b64_keyframe = base64.b64encode(buf).decode('utf-8')

                # Prepare payload
                payload = {
                    "cameraId": camera_id,
                    "videoSecond": current_second,
                    "motionScore": round(motion_score, 2),
                    "preRollSeconds": pre_frames_count,
                    "postRollSeconds": post_roll_sec,
                    "candidateKeyframe": b64_keyframe,
                    "targetConcept": target_concept
                }

                # Send async event to Next.js API in < 15ms
                try:
                    req_data = json.dumps(payload).encode('utf-8')
                    req = urllib.request.Request(
                        api_endpoint,
                        data=req_data,
                        headers={"Content-Type": "application/json"}
                    )
                    with urllib.request.urlopen(req, timeout=12) as res:
                        resp_body = json.loads(res.read().decode('utf-8'))
                        if resp_body.get("success"):
                            evt = resp_body.get("event", {})
                            print(f"[Worker] -> Event Registered! ID: {evt.get('id')} | Alert: {evt.get('alertLevel')} | Latency: {resp_body.get('metrics', {}).get('latencyMs')}ms", flush=True)
                            print(f"[Worker]    Muse Spark: \"{evt.get('reasoningText')}\"", flush=True)
                except Exception as api_err:
                    print(f"[Worker] Warning: Failed to deliver to {api_endpoint}: {api_err}", flush=True)

        frame_idx += 1
        time.sleep(1.0 / (fps * 2.0)) # Smooth reading

    cap.release()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Live Motion Worker with Ring Buffer for CCTV")
    parser.add_argument("--source", default="public/cctv/cam-04/perimeter-security-zone.mp4", help="Video file or live YouTube stream URL")
    parser.add_argument("--camera", default="cam-04", help="Camera ID")
    parser.add_argument("--target", default="children running behind trees", help="Target concept to detect")
    parser.add_argument("--port", default="3001", help="Next.js server port (default 3001)")
    parser.add_argument("--threshold", type=float, default=12.0, help="Motion delta threshold")
    args = parser.parse_args()

    api_url = f"http://localhost:{args.port}/api/cctv/trigger-event"
    run_motion_worker(
        video_source=args.source,
        camera_id=args.camera,
        target_concept=args.target,
        api_endpoint=api_url,
        motion_threshold=args.threshold
    )
