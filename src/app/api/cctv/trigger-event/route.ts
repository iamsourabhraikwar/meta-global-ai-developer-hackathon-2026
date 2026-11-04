import { NextRequest, NextResponse } from "next/server";
import { verifyEventWithMuseSpark, MetaVerifyResult } from "@/lib/meta-ai";
import { CAMERAS } from "@/lib/cameras";
import { MotionEventRecord } from "@/lib/types";
import { sendWhatsAppImageAlert } from "@/lib/whatsapp";
import fs from "fs";
import path from "path";

export const maxDuration = 35;
export const dynamic = "force-dynamic";

function persistEventRecord(event: MotionEventRecord) {
  try {
    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const dbPath = path.join(dataDir, "cctv_events_db.json");
    let records: MotionEventRecord[] = [];
    if (fs.existsSync(dbPath)) {
      try {
        records = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
      } catch (e) {}
    }
    // Prepend new event
    records.unshift(event);
    // Keep max 200 events in database
    if (records.length > 200) {
      records = records.slice(0, 200);
    }
    fs.writeFileSync(dbPath, JSON.stringify(records, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to persist event record:", err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      cameraId,
      cameraName,
      videoSecond,
      motionScore,
      preRollSeconds = 10,
      postRollSeconds = 5,
      candidateKeyframe,
      croppedKeyframe,
      temporalFrames = [],
      targetConcept,
      detectedOcrText,
      isTextDetectionEnabled,
      isAutoTrigger,
      previousEventSummary,
      sectionChangeHint,
    } = body;

    const existingCam = CAMERAS.find((c) => c.id === cameraId);
    const cam = existingCam || {
      id: cameraId || "cam-custom",
      name: cameraName || (cameraId ? `Camera ${String(cameraId).toUpperCase()}` : "External Live Feed"),
      code: String(cameraId || "CAM-LIVE").toUpperCase(),
      defaultTarget: targetConcept || "moving vehicle or person",
      videoUrl: body.videoUrl || "",
    };
    const concept = targetConcept || cam.defaultTarget || "moving vehicle or person";

    // 1. Verification with Meta Muse Spark on Baseten ($100 credits) across multi-frame temporal sequence
    const museResult: MetaVerifyResult = candidateKeyframe
      ? await verifyEventWithMuseSpark(candidateKeyframe, concept, cam.name, croppedKeyframe, detectedOcrText, {
          isTextDetectionEnabled: Boolean(isTextDetectionEnabled),
          previousEventSummary: previousEventSummary || null,
          sectionChangeHint: sectionChangeHint || null,
          temporalFrames: Array.isArray(temporalFrames) ? temporalFrames : [],
        })
      : {
          verified: true,
          description: `Motion trigger detected ${concept} on ${cam.name}`,
          alertLevel: "watch" as const,
          latencyMs: 15,
          modelUsed: "Edge Fast Trigger",
          detectedText: isTextDetectionEnabled ? detectedOcrText || null : null,
        };

    const confidencePercent = museResult.confidencePercent ?? (museResult.verified ? 85 : 0);
    const isHighConfidenceVerified = Boolean(museResult.verified) && confidencePercent >= 75;

    // Suppress duplicate, low-confidence (<75%), or unverified auto-triggers so standing passersby or same sitting scene do not trigger alerts
    if (Boolean(isAutoTrigger) && (!isHighConfidenceVerified || museResult.isDuplicateOngoing)) {
      return NextResponse.json({
        success: true,
        skippedDuplicateOrUnverified: true,
        verified: isHighConfidenceVerified,
        confidencePercent,
        isDuplicateOngoing: Boolean(museResult.isDuplicateOngoing),
        metrics: {
          latencyMs: museResult.latencyMs,
          modelUsed: museResult.modelUsed,
        },
      });
    }

    const sec = Math.max(0, Math.round(Number(videoSecond) || 0));
    const now = new Date();
    const timeShort = `${String(now.getHours()).padStart(2, "0")}:${String(
      now.getMinutes()
    ).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

    const eventRecord: MotionEventRecord = {
      id: `evt_${cam.id}_${Date.now()}`,
      cameraId: cam.id,
      cameraName: cam.name,
      timestamp: now.toISOString(),
      timeShort,
      videoSecond: sec,
      motionScore: Number(motionScore) || 15.5,
      preRollSeconds: Number(preRollSeconds) || 10,
      postRollSeconds: Number(postRollSeconds) || 5,
      targetConcept: concept,
      verified: museResult.verified,
      reasoningText: museResult.description,
      alertLevel: museResult.alertLevel,
      keyframeBase64: candidateKeyframe || undefined,
      croppedKeyframeBase64: croppedKeyframe || undefined,
      temporalFrames: Array.isArray(temporalFrames) && temporalFrames.length > 0 ? temporalFrames : undefined,
      vehicleDetails: museResult.vehicleDetails,
      personDetails: museResult.personDetails,
      transactionDetails: museResult.transactionDetails,
      riskScore: museResult.riskScore,
      detectedText: museResult.detectedText || (isTextDetectionEnabled ? detectedOcrText : null) || null,
      isTextDetectionEnabled: Boolean(isTextDetectionEnabled),
      hasSamMask: false, // Lazy SAM 3.1: Generated on-demand when inspected
    };

    // Save to persistent storage on disk
    persistEventRecord(eventRecord);

    // Option 2 (Intelligent Guard): Send WhatsApp alert with Method B image upload ONLY when enabled & verified with >=75% confidence by Meta Muse Spark!
    const isWhatsAppEnabled = body.whatsAppEnabled !== undefined ? Boolean(body.whatsAppEnabled) : true;
    let whatsAppResult: any = null;
    if (isHighConfidenceVerified && isWhatsAppEnabled) {
      let triggerReason = `Motion delta ${eventRecord.motionScore.toFixed(1)} crossed threshold in watch zone and was verified matching rule "${concept}".`;
      if (eventRecord.vehicleDetails?.type) {
        const vInfo = [
          eventRecord.vehicleDetails.color,
          eventRecord.vehicleDetails.type,
          eventRecord.vehicleDetails.makeModel ? `(${eventRecord.vehicleDetails.makeModel})` : "",
        ]
          .filter(Boolean)
          .join(" ");
        const plateInfo = eventRecord.vehicleDetails.licensePlate
          ? ` | Plate: ${eventRecord.vehicleDetails.licensePlate}`
          : " | Plate: Unmounted/Occluded in frame";
        triggerReason += `\n🚗 Vehicle: ${vInfo}${plateInfo}`;
      }
      if (eventRecord.detectedText) {
        triggerReason += `\n🔤 Detected Text / Markings: [${eventRecord.detectedText}]`;
      }
      whatsAppResult = await sendWhatsAppImageAlert({
        cameraName: cam.name,
        targetConcept: concept,
        summary: eventRecord.reasoningText,
        triggerReason,
        detailedReasoning: eventRecord.reasoningText,
        riskScore: eventRecord.riskScore,
        alertLevel: eventRecord.alertLevel,
        timeShort,
        imageBase64: candidateKeyframe,
        recipientPhone: body.whatsAppRecipient || process.env.WHATSAPP_RECIPIENT_PHONE || "",
        accessToken: body.whatsAppAccessToken || process.env.WHATSAPP_ACCESS_TOKEN || "",
        mode: body.whatsAppMode || "full_reasoning",
      });
    }

    return NextResponse.json({
      success: true,
      event: eventRecord,
      whatsApp: whatsAppResult,
      metrics: {
        latencyMs: museResult.latencyMs,
        modelUsed: museResult.modelUsed,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to process motion event" },
      { status: 500 }
    );
  }
}
