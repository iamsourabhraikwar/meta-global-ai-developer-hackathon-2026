/**
 * Meta WhatsApp Cloud API Service (Method B: Direct Binary Upload)
 * 
 * Uses Meta Graph API v21.0
 */

export interface WhatsAppAlertPayload {
  cameraName: string;
  targetConcept: string;
  summary: string;
  triggerReason?: string;
  detailedReasoning?: string;
  riskScore?: number;
  alertLevel?: string;
  timeShort: string;
  imageBase64?: string;
  recipientPhone?: string;
  mode?: "full_reasoning" | "summary_only" | "image_only";
}

/**
 * Upload screenshot directly to Meta WhatsApp Media Endpoint (Method B)
 */
export async function uploadMediaToWhatsApp(
  base64Image: string,
  phoneNumberId: string,
  accessToken: string
): Promise<string | null> {
  try {
    const rawB64 = base64Image.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(rawB64, "base64");

    const formData = new FormData();
    const blob = new Blob([buffer], { type: "image/jpeg" });
    formData.append("file", blob, "cctv_alert_keyframe.jpg");
    formData.append("type", "image/jpeg");
    formData.append("messaging_product", "whatsapp");

    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/media`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      console.warn("WhatsApp Media upload failed:", errJson || res.statusText);
      return null;
    }

    const data = await res.json();
    return data.id || null;
  } catch (err: any) {
    console.warn("WhatsApp media upload error:", err.message);
    return null;
  }
}

/**
 * Dispatch WhatsApp Alert Message using uploaded mediaId (Method B)
 */
export async function sendWhatsAppImageAlert(payload: WhatsAppAlertPayload): Promise<{
  success: boolean;
  messageId?: string;
  mediaId?: string;
  status: string;
  recipient: string;
  captionSent: string;
}> {
  const recipient = (payload.recipientPhone || process.env.WHATSAPP_RECIPIENT_PHONE || "").replace(/\D/g, "");
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || "";
  const mode = payload.mode || "full_reasoning";

  let caption = "";
  if (mode === "image_only") {
    caption = `🚨 *CCTV ALERT: ${payload.cameraName}* @ ${payload.timeShort}`;
  } else if (mode === "summary_only") {
    caption = [
      `🚨 *CCTV ALERT: ${payload.cameraName}*`,
      `🎯 *Target Rule:* ${payload.targetConcept}`,
      `🧠 *Summary:* ${payload.summary}`,
      `🕒 *Time:* ${payload.timeShort}`,
    ].join("\n");
  } else {
    // Mode: full_reasoning (Default rich operator alert)
    const lines = [
      `🚨 *CCTV VERIFIED SECURITY ALERT: ${payload.cameraName}*`,
      `🎯 *Target Rule:* ${payload.targetConcept}`,
      ``,
      `👁️ *What is happening in this image:*`,
      `${payload.summary}`,
      ``,
      `⚡ *Why this was triggered:*`,
      `${payload.triggerReason || "Motion activity detected in active watch zone and confirmed by Meta Muse Spark vision analysis."}`,
    ];

    if (payload.riskScore) {
      lines.push(``, `⚠️ *Risk Assessment:* ${payload.riskScore}/100 [${(payload.alertLevel || "WATCH").toUpperCase()}]`);
    }

    lines.push(``, `🕒 *Captured at:* ${payload.timeShort}`);
    caption = lines.join("\n");
  }

  // Check if live Meta credentials are provided
  if (!phoneNumberId || !accessToken) {
    console.log(`[WHATSAPP NOTIFICATION SIMULATED - Method B] Dispatching to ${recipient ? `+${recipient}` : "configured recipient"}:\n${caption}`);
    return {
      success: true,
      status: "SIMULATED_LOGGED",
      recipient,
      captionSent: caption,
      messageId: `wamid.simulated_${Date.now()}`,
    };
  }

  try {
    let mediaId: string | null = null;
    if (payload.imageBase64) {
      mediaId = await uploadMediaToWhatsApp(payload.imageBase64, phoneNumberId, accessToken);
    }

    const messageBody: any = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipient,
    };

    if (mediaId) {
      messageBody.type = "image";
      messageBody.image = {
        id: mediaId,
        caption,
      };
    } else {
      messageBody.type = "text";
      messageBody.text = { body: caption };
    }

    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(messageBody),
    });

    const data = await res.json();
    if (res.ok && data.messages?.[0]?.id) {
      return {
        success: true,
        status: "DISPATCHED",
        recipient,
        mediaId: mediaId || undefined,
        messageId: data.messages[0].id,
        captionSent: caption,
      };
    }

    console.warn("Meta WhatsApp API error response:", data);
    return {
      success: false,
      status: data.error?.message || "WhatsApp dispatch error",
      recipient,
      captionSent: caption,
    };
  } catch (err: any) {
    console.error("WhatsApp dispatch network error:", err.message);
    return {
      success: false,
      status: err.message,
      recipient,
      captionSent: caption,
    };
  }
}
