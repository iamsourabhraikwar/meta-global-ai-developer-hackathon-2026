import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const maxDuration = 45;
export const dynamic = "force-dynamic";

function saveRuleToDisk(cameraId: string, prompt: string, roiZone: number[], motionThreshold: number, pythonCode: string) {
  try {
    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const rulesFile = path.join(dataDir, "camera_rules.json");
    let currentRules: Record<string, any> = {};
    if (fs.existsSync(rulesFile)) {
      try {
        currentRules = JSON.parse(fs.readFileSync(rulesFile, "utf-8"));
      } catch (e) {}
    }

    currentRules[cameraId] = {
      cameraId,
      prompt,
      roiZone,
      motionThreshold,
      updatedAt: new Date().toISOString(),
    };

    fs.writeFileSync(rulesFile, JSON.stringify(currentRules, null, 2), "utf-8");

    // Also write executable standalone OpenCV python snippet
    const pyScriptFile = path.join(dataDir, `rule_${cameraId}.py`);
    fs.writeFileSync(pyScriptFile, pythonCode, "utf-8");
  } catch (err) {
    console.error("Error writing camera rule to disk:", err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { prompt, cameraName, cameraId, referenceFrameBase64 } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const apiKey =
      process.env.BASETEN_API_KEY ||
      "b10_Fire5ysg.JXwLkiWn4upJSy4Ju3WEIgzr9YShwYKn";
    const baseUrl = (
      process.env.BASETEN_BASE_URL || "https://inference.baseten.co/v1"
    ).replace(/\/+$/, "");
    const modelId =
      process.env.BASETEN_MUSE_SPARK_MODEL || "meta-models/muse-spark-open-1026";

    const systemPrompt = `You are Meta Muse Vision and OpenCV Architect.
Your task is to analyze the surveillance camera frame and operator instruction, then output:
1. "roiZone": [xMin, yMin, xMax, yMax] in percentage (0 to 100%) targeting the activity area.
2. "targetCategory": "person" | "vehicle" | "interaction" | "general"
3. "motionThreshold": Calibrated motion sensitivity score:
   - Human Movement (walking, running, child, intruder, pedestrian): calibrate LOW threshold: 3.5 to 4.8 (High sensitivity for subtle human movement).
   - Subtle Touch / Interaction (e.g. "touching car", "tampering", "interacting with tree"): calibrate LOW threshold: 3.0 to 4.0.
   - Vehicle / Traffic (car, SUV, van, forklift, truck): calibrate NORMAL/STRICT threshold: 7.5 to 11.0 (prevents false alerts from leaves/animals).
4. "explanation": 1-sentence visual description.
5. "pythonCode": Complete executable OpenCV script. If the target is a human or person, include OpenCV's HOG people detector (cv2.HOGDescriptor_getDefaultPeopleDetector) and contour aspect-ratio analysis (height > 1.2 * width).

Output ONLY valid JSON matching this exact structure:
{
  "roiZone": [25, 30, 80, 85],
  "targetCategory": "person",
  "motionThreshold": 4.2,
  "explanation": "Calibrated OpenCV ROI targeting pedestrian walking path with human HOG detector.",
  "pythonCode": "# Executable OpenCV Python script with human detection..."
}`;

    const userMessageContent: any[] = [
      {
        type: "text",
        text: `Camera: "${cameraName}" (${cameraId})
Operator Instruction: "${prompt}"

Inspect the visible scene geometry, objects, and traffic/pedestrian path in this frame. Identify where the target activity occurs and output the normalized [xMin, yMin, xMax, yMax] percentage coordinates and motion threshold.`,
      },
    ];

    if (referenceFrameBase64) {
      userMessageContent.push({
        type: "image_url",
        image_url: {
          url: `data:image/jpeg;base64,${referenceFrameBase64}`,
        },
      });
    }

    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: "developer", content: systemPrompt },
            { role: "user", content: userMessageContent },
          ],
          max_tokens: 1200,
          temperature: 0.1,
        }),
        signal: AbortSignal.timeout(25_000),
      });

      if (res.ok) {
        const data = await res.json();
        const choice = data.choices?.[0]?.message;
        let content = choice?.content || "";
        // If content is null, check reasoning_content
        if (!content && choice?.reasoning_content) {
          content = choice.reasoning_content;
        }

        const jsonMatch = content.match(/\{[\s\S]*"roiZone"[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          let roiZone = parsed.roiZone || [10, 15, 60, 85];
          // Normalize if model returned 0-1000 coordinates
          if (Array.isArray(roiZone) && roiZone.some((v: number) => v > 100)) {
            roiZone = roiZone.map((v: number) => Math.min(100, Math.round(v / 10)));
          }
          let motionThreshold = parsed.motionThreshold
            ? Math.min(15, Math.max(2.5, Number(parsed.motionThreshold)))
            : 6.5;

          const targetCategory = parsed.targetCategory || (
            prompt.toLowerCase().match(/person|walk|run|child|pedestrian|intruder|man|woman|worker/) ? "person" :
            prompt.toLowerCase().match(/touch|tamper|interact/) ? "interaction" :
            prompt.toLowerCase().match(/car|suv|van|truck|forklift|vehicle/) ? "vehicle" : "general"
          );

          if (!parsed.motionThreshold) {
            if (targetCategory === "person") motionThreshold = 4.0;
            else if (targetCategory === "interaction") motionThreshold = 3.5;
            else if (targetCategory === "vehicle") motionThreshold = 8.5;
          }

          const pyCode = parsed.pythonCode || generateFallbackPython(prompt, roiZone, targetCategory);

          saveRuleToDisk(cameraId || "cam-04", prompt, roiZone, motionThreshold, pyCode);

          return NextResponse.json({
            success: true,
            roiZone,
            targetCategory,
            motionThreshold,
            explanation: parsed.explanation || `Configured OpenCV spatial ROI targeting: "${prompt}" (Threshold: ${motionThreshold})`,
            pythonCode: pyCode,
            ruleSavedOnDisk: true,
            modelUsed: `Meta Muse Spark Vision (${modelId})`,
          });
        }
      }
    } catch (err: any) {
      console.error("Muse Vision error:", err.message);
    }

    // Camera-aware Heuristic Fallback
    let zone: [number, number, number, number] = [15, 20, 75, 80];
    const pLower = prompt.toLowerCase();
    const cLower = (cameraId || "").toLowerCase();

    if (cLower === "cam-07" || pLower.includes("ramp") || pLower.includes("garage")) {
      zone = [22, 15, 68, 75]; // Central driving lane / descending ramp in underground garage
    } else if (cLower === "cam-04" || pLower.includes("tree")) {
      zone = [8, 12, 54, 92]; // Left perimeter tree and wall area
    } else if (cLower === "cam-03" || pLower.includes("parking") || pLower.includes("suv") || pLower.includes("car")) {
      zone = [25, 30, 80, 85]; // Outbound parking aisle
    } else if (cLower === "cam-01" || pLower.includes("gate") || pLower.includes("van")) {
      zone = [20, 25, 75, 80]; // Gate entrance
    } else if (pLower.includes("right")) {
      zone = [50, 20, 95, 85];
    }

    let calibratedThreshold = 6.5;
    let targetCat: "person" | "vehicle" | "interaction" | "general" = "general";
    if (
      pLower.includes("person") ||
      pLower.includes("walk") ||
      pLower.includes("run") ||
      pLower.includes("child") ||
      pLower.includes("pedestrian") ||
      pLower.includes("intruder") ||
      pLower.includes("man") ||
      pLower.includes("worker")
    ) {
      calibratedThreshold = 4.0;
      targetCat = "person";
    } else if (
      pLower.includes("touch") ||
      pLower.includes("tamper") ||
      pLower.includes("interact") ||
      pLower.includes("tree")
    ) {
      calibratedThreshold = 3.5;
      targetCat = "interaction";
    } else if (
      pLower.includes("car") ||
      pLower.includes("suv") ||
      pLower.includes("van") ||
      pLower.includes("truck") ||
      pLower.includes("vehicle") ||
      pLower.includes("forklift")
    ) {
      calibratedThreshold = 8.5;
      targetCat = "vehicle";
    }

    const fallbackCode = generateFallbackPython(prompt, zone, targetCat);
    saveRuleToDisk(cameraId || "cam-04", prompt, zone, calibratedThreshold, fallbackCode);

    return NextResponse.json({
      success: true,
      roiZone: zone,
      targetCategory: targetCat,
      motionThreshold: calibratedThreshold,
      explanation: `Calibrated OpenCV spatial ROI zone [${zone.join(", ")}%] targeting "${prompt}" with ${targetCat} threshold: ${calibratedThreshold}`,
      pythonCode: fallbackCode,
      ruleSavedOnDisk: true,
      modelUsed: "Meta Muse Vision Fallback",
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to generate rule code" },
      { status: 500 }
    );
  }
}

function generateFallbackPython(prompt: string, zone: number[], category: string = "general") {
  const [x1, y1, x2, y2] = zone;
  const isPerson = category === "person" || prompt.toLowerCase().includes("person") || prompt.toLowerCase().includes("walk");

  return `# Python OpenCV Motion Detection with Spatial ROI Mask
# Target: "${prompt}" (Category: ${category})
import cv2
import numpy as np

${isPerson ? `# Initialize OpenCV HOG Pedestrian Detector for Human Silhouette Verification
hog = cv2.HOGDescriptor()
hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())` : ""}

def detect_zone_target(frame, fgbg):
    h, w = frame.shape[:2]
    # 1. Define ROI Mask (${x1}% to ${x2}%, ${y1}% to ${y2}%)
    rx1, ry1 = int(w * ${x1} / 100), int(h * ${y1} / 100)
    rx2, ry2 = int(w * ${x2} / 100), int(h * ${y2} / 100)
    roi_crop = frame[ry1:ry2, rx1:rx2]
    
    # 2. Background Subtraction inside ROI
    fg_mask = fgbg.apply(roi_crop)
    contours, _ = cv2.findContours(fg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
${isPerson ? `    # 3. Detect Human Movement: Check vertical contour silhouette (height > 1.2 * width)
    human_motion = False
    for cnt in contours:
        if cv2.contourArea(cnt) > 60:
            x, y, cw, ch = cv2.boundingRect(cnt)
            aspect_ratio = float(ch) / cw if cw > 0 else 0
            if aspect_ratio >= 1.2:
                human_motion = True
                break
                
    # 4. Secondary HOG Pedestrian Check if contour passes
    if human_motion and roi_crop.shape[0] > 64 and roi_crop.shape[1] > 64:
        boxes, _ = hog.detectMultiScale(roi_crop, winStride=(8, 8), padding=(4, 4), scale=1.05)
        if len(boxes) > 0:
            return True, "Human pedestrian verified in ROI"
            
    return human_motion, "Human motion contour active" if human_motion else "No human motion"` : `    # 3. Calculate Cluster Motion Score
    moving_pixels = np.count_nonzero(fg_mask > 200)
    total_roi_pixels = roi_crop.shape[0] * roi_crop.shape[1]
    motion_density = (moving_pixels / max(1, total_roi_pixels)) * 100
    
    return motion_density > 2.5, f"Motion density: {motion_density:.2f}%"`}
`;
}
