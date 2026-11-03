import { NextRequest, NextResponse } from "next/server";
import { sendWhatsAppImageAlert } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const recipientPhone = body.recipientPhone || process.env.WHATSAPP_RECIPIENT_PHONE || "";
    const cameraName = body.cameraName || "Perimeter Security Zone (CAM-04)";
    const targetConcept = body.targetConcept || "children running behind trees";
    const summary = body.summary || "Verified activity matching operator target.";
    const imageBase64 = body.imageBase64;
    const accessToken = body.accessToken || process.env.WHATSAPP_ACCESS_TOKEN || "";
    const phoneNumberId = body.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || "";

    const result = await sendWhatsAppImageAlert({
      cameraName,
      targetConcept,
      summary,
      riskScore: 75,
      alertLevel: "critical",
      timeShort: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      imageBase64,
      recipientPhone,
      accessToken,
      phoneNumberId,
    });

    return NextResponse.json({
      success: result.success,
      status: result.status,
      recipient: result.recipient,
      messageId: result.messageId,
      mediaId: result.mediaId,
      hasLiveCredentials: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
