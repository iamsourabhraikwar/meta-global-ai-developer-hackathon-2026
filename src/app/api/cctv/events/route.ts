import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { MotionEventRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const dataDir = path.join(process.cwd(), "data");
    const dbPath = path.join(dataDir, "cctv_events_db.json");

    if (!fs.existsSync(dbPath)) {
      return NextResponse.json({ success: true, events: [] });
    }

    const data = fs.readFileSync(dbPath, "utf-8");
    const records: MotionEventRecord[] = JSON.parse(data);

    return NextResponse.json({
      success: true,
      events: records,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to load events database" },
      { status: 500 }
    );
  }
}
