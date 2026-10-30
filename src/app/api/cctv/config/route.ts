import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const CONFIG_PATH = path.join(process.cwd(), "data", "operator_config.json");

export async function GET() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
      return NextResponse.json({ success: true, config: data });
    }
    // Default config from environment
    return NextResponse.json({
      success: true,
      config: {
        provider: "baseten",
        basetenApiKey: process.env.BASETEN_API_KEY || "",
        baseUrl: process.env.BASETEN_BASE_URL || "https://inference.baseten.co/v1",
        modelId: process.env.BASETEN_MUSE_SPARK_MODEL || "meta-models/muse-spark-open-1026",
        whatsAppPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
        whatsAppAccessToken: process.env.WHATSAPP_ACCESS_TOKEN || "",
        whatsAppRecipient: process.env.WHATSAPP_RECIPIENT_PHONE || "",
        hasCompletedSetup: false,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const currentConfig = fs.existsSync(CONFIG_PATH)
      ? JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"))
      : {};

    const updatedConfig = {
      ...currentConfig,
      ...body,
      updatedAt: new Date().toISOString(),
      hasCompletedSetup: true,
    };

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(updatedConfig, null, 2), "utf-8");

    // Also safely update .env.local if keys are provided
    try {
      const envPath = path.join(process.cwd(), ".env.local");
      let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : "";

      const setEnvVar = (key: string, val: string) => {
        if (!val) return;
        const regex = new RegExp(`^${key}=.*$`, "m");
        if (regex.test(envContent)) {
          envContent = envContent.replace(regex, `${key}="${val}"`);
        } else {
          envContent += `\n${key}="${val}"`;
        }
      };

      if (body.basetenApiKey) setEnvVar("BASETEN_API_KEY", body.basetenApiKey);
      if (body.baseUrl) setEnvVar("BASETEN_BASE_URL", body.baseUrl);
      if (body.modelId) setEnvVar("BASETEN_MUSE_SPARK_MODEL", body.modelId);
      if (body.whatsAppPhoneNumberId) setEnvVar("WHATSAPP_PHONE_NUMBER_ID", body.whatsAppPhoneNumberId);
      if (body.whatsAppAccessToken) setEnvVar("WHATSAPP_ACCESS_TOKEN", body.whatsAppAccessToken);
      if (body.whatsAppRecipient) setEnvVar("WHATSAPP_RECIPIENT_PHONE", body.whatsAppRecipient);

      fs.writeFileSync(envPath, envContent.trim() + "\n", "utf-8");
    } catch (e) {
      console.warn("Could not write .env.local, persisted to operator_config.json:", e);
    }

    return NextResponse.json({ success: true, config: updatedConfig });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
