import { NextRequest, NextResponse } from "next/server";
import { segmentOnDemandWithSam } from "@/lib/meta-ai";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { keyframeBase64, targetConcept } = await req.json();

    if (!keyframeBase64) {
      return NextResponse.json(
        { error: "keyframeBase64 image is required for SAM 3.1 segmentation" },
        { status: 400 }
      );
    }

    const concept = (targetConcept || "moving entity").trim();
    const result = await segmentOnDemandWithSam(keyframeBase64, concept);

    return NextResponse.json({
      success: true,
      boundingBox: result.boundingBox,
      samMaskPolygon: result.polygon,
      confidence: result.confidence,
      metrics: {
        latencyMs: result.latencyMs,
        modelUsed: result.modelUsed,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to generate SAM 3.1 mask" },
      { status: 500 }
    );
  }
}
