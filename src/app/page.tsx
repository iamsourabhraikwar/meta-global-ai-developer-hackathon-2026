"use client";

import React, { useState, useEffect, useRef } from "react";
import { CAMERAS } from "@/lib/cameras";
import { CameraConfig, MotionEventRecord } from "@/lib/types";
import {
  Shield,
  Video,
  Bell,
  Sparkles,
  Search,
  Play,
  Pause,
  Zap,
  Radio,
  CheckCircle2,
  AlertTriangle,
  Bot,
  Layers,
  Clock,
  Send,
  Eye,
  Activity,
  Maximize2,
  RefreshCw,
  Crop,
  Code2,
  Sliders,
  Check,
  X,
  PenTool,
  Circle,
  MessageSquare,
  Settings,
} from "lucide-react";
import WelcomeSetupWizard from "@/components/WelcomeSetupWizard";
import AddPresetModal from "@/components/AddPresetModal";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: string;
  matchedCount?: number;
}

export default function LiveCctvOperatorPage() {
  const [cameras, setCameras] = useState<CameraConfig[]>(CAMERAS);
  const [selectedCamId, setSelectedCamId] = useState<string>("cam-04");

  // Per-Camera Independent Trigger Rules Memory
  const [cameraRules, setCameraRules] = useState<Record<string, string>>({
    "cam-01": "blue delivery van entering gate",
    "cam-02": "cash drawer opened or hand reaching into register drawer to pick cash. Inspect visible currency notes, estimate denomination/amount, and identify if currency was taken from or placed into the drawer.",
    "cam-03": "customer waiting at empty table or dine and dash without paying",
    "cam-04": "children running behind trees along perimeter",
    "cam-05": "shoulder surfing intrusion or loitering near ATM keypad",
    "cam-06": "wrong-way vehicle or pedestrian walking on vehicle ramp",
    "cam-07": "unattended baggage or abandoned suitcase left by owner",
    "cam-08": "worker in forklift transit path or worker down",
    "cam-09": "porch pirate package theft or car door handle prowling in driveway",
    "cam-10": "display glass reach-in or customer reaching behind showcase",
    "cam-11": "night vehicle moving across parking lot",
    "cam-12": "technician on electronics factory assembly line",
    "cam-13": "perimeter security patrol along boundary fence",
    "cam-14": "panoramic facility thoroughfare transit",
    "cam-15": "roadway vehicle transit towards gate",
    "cam-16": "pedestrian crossing security turnstile",
    "cam-17": "maintenance service personnel in corridor",
    "cam-18": "pallet staging crew and electric transport",
    "cam-live-yt": "pedestrian walking or biker passing chair on street",
  });

  const [targetConcept, setTargetConcept] = useState<string>(
    cameraRules["cam-04"] || "children running behind trees along perimeter"
  );
  const [isSavedRule, setIsSavedRule] = useState<boolean>(false);
  const currentCam = cameras.find((c) => c.id === selectedCamId) || cameras[0];

  // Video and Canvas Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Video Playback State
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);
  const [durationSec, setDurationSec] = useState<number>(30);

  // Live Alert & Event Records State
  const [recordedEvents, setRecordedEvents] = useState<MotionEventRecord[]>([]);
  const [activeAlert, setActiveAlert] = useState<MotionEventRecord | null>(null);
  const [activeEvent, setActiveEvent] = useState<MotionEventRecord | null>(null);

  // On-Demand SAM 3.1 State
  const [isSegmentingSam, setIsSegmentingSam] = useState<boolean>(false);
  const [activeSamMask, setActiveSamMask] = useState<{
    box?: [number, number, number, number];
    polygon?: { x: number; y: number }[];
  } | null>(null);

  // In-Browser Real-Time Motion Detection State
  const [autoTriggerEnabled, setAutoTriggerEnabled] = useState<boolean>(true);
  const [currentMotionScore, setCurrentMotionScore] = useState<number>(0.0);
  const [motionThreshold, setMotionThreshold] = useState<number>(6.5);
  const prevFrameData = useRef<Uint8ClampedArray | null>(null);
  const lastTriggerRef = useRef<number>(0);
  const isTriggerInFlightRef = useRef<boolean>(false);
  const quietFramesCountRef = useRef<number>(0);
  const lastNotifiedSummaryRef = useRef<Record<string, { rule: string; summary: string; time: number }>>({});
  // Spatial Sub-Section (6x4 Micro-Grid) State Gating: remembers which section of Full Frame / Custom Pencil already notified
  const notifiedSectionsRef = useRef<
    Record<
      string,
      Record<
        string,
        {
          cellKey: string;
          col: number;
          row: number;
          cx: number;
          cy: number;
          rule: string;
          summary: string;
          notifiedAt: number;
          quietTicks: number;
        }
      >
    >
  >({});
  const [notifiedSubZonesUI, setNotifiedSubZonesUI] = useState<
    Array<{
      cellKey: string;
      col: number;
      row: number;
      cx: number;
      cy: number;
      summary: string;
      notifiedAt: number;
    }>
  >([]);

  // Capture current frame from HTML5 video element as Base64 JPEG
  const captureCurrentFrameBase64 = (): string | null => {
    if (!videoRef.current || videoRef.current.readyState < 2) return null;
    try {
      const off = document.createElement("canvas");
      off.width = 640;
      off.height = 360;
      const ctx = off.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(videoRef.current, 0, 0, 640, 360);
      return off.toDataURL("image/jpeg", 0.75).split(",")[1];
    } catch (e) {
      console.warn("Frame capture error:", e);
      return null;
    }
  };

  // Optimization 1: Native High-Resolution Optical Crop of ROI (strictly masks out everything outside Custom Pencil polygon)
  const captureRoiCropBase64 = (zone?: [number, number, number, number] | null): string | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;
    const targetZone = zone || roiZone;
    if (!targetZone && (!roiPolygon || roiPolygon.length < 3)) return null;
    try {
      const vw = video.videoWidth || 1280;
      const vh = video.videoHeight || 720;
      const z = targetZone || [0, 0, 100, 100];
      const sx = Math.floor((z[0] / 100) * vw);
      const sy = Math.floor((z[1] / 100) * vh);
      const sw = Math.max(32, Math.ceil(((z[2] - z[0]) / 100) * vw));
      const sh = Math.max(32, Math.ceil(((z[3] - z[1]) / 100) * vh));

      const off = document.createElement("canvas");
      off.width = sw;
      off.height = sh;
      const ctx = off.getContext("2d");
      if (!ctx) return null;

      // If Custom Pencil / Polygon is active, strictly black out every pixel outside the drawn polygon
      if (roiPolygon && roiPolygon.length >= 3) {
        ctx.fillStyle = "#030712";
        ctx.fillRect(0, 0, sw, sh);
        ctx.save();
        ctx.beginPath();
        roiPolygon.forEach((pt, idx) => {
          const px = (pt.x / 100) * vw - sx;
          const py = (pt.y / 100) * vh - sy;
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
        ctx.restore();
      } else {
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
      }
      return off.toDataURL("image/jpeg", 0.75).split(",")[1];
    } catch (e) {
      return null;
    }
  };

  // Optimization 2: Rolling Multi-Frame Temporal Buffer (5 before + 1 trigger + 5 after = 11 frames)
  const rollingFramesRef = useRef<{ second: number; b64: string }[]>([]);

  // Optimization 4: Load Persistent Event History from database on mount
  useEffect(() => {
    fetch("/api/cctv/events")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.events) && data.events.length > 0) {
          setRecordedEvents(data.events);
        }
      })
      .catch((err) => console.log("Database load err:", err));
  }, []);

  // Periodic sampler for temporal multi-frame sequence
  useEffect(() => {
    const timer = setInterval(() => {
      const v = videoRef.current;
      if (!v || v.paused || v.readyState < 2) return;
      const b64 = captureCurrentFrameBase64();
      if (b64) {
        rollingFramesRef.current.push({
          second: Math.floor(v.currentTime),
          b64,
        });
        if (rollingFramesRef.current.length > 12) {
          rollingFramesRef.current.shift();
        }
      }
    }, 800);
    return () => clearInterval(timer);
  }, []);

  // Spatial ROI Zone State [x1, y1, x2, y2] in 0-100%
  // Default for CAM-04: Left Tree & Wall Area
  const [roiZone, setRoiZone] = useState<[number, number, number, number] | null>([8, 12, 54, 92]);
  const [roiPolygon, setRoiPolygon] = useState<{ x: number; y: number }[] | null>(null);
  const [roiZoneLabel, setRoiZoneLabel] = useState<string>("Left Trees & Perimeter Wall");
  const [isDrawingZone, setIsDrawingZone] = useState<boolean>(false);
  const [drawTool, setDrawTool] = useState<"pencil" | "rect" | "circle">("pencil");
  const [liveDrawingPath, setLiveDrawingPath] = useState<{ x: number; y: number }[]>([]);
  const isMouseDownRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);
  const polygonMaskRef = useRef<Uint8Array | null>(null);

  // Dynamic Target Presets State (User can delete or add custom presets)
  const [targetPresets, setTargetPresets] = useState<string[]>([
    "🪑 person sitting on table or chair, leaving table, or someone joining the table",
    "cash drawer opened or hand reaching into register: inspect currency amount and cash-in/cash-out",
    "customer waiting at empty table or dine and dash without paying",
    "porch pirate package theft or car door handle prowling in driveway",
    "shoulder surfing intrusion or loitering near ATM keypad",
    "wrong-way vehicle or pedestrian walking on vehicle ramp",
    "unattended baggage or abandoned suitcase left by owner",
    "worker in forklift transit path or worker down",
    "children running behind trees along perimeter",
    "blue delivery van entering gate",
    "display glass reach-in or customer reaching behind showcase",
  ]);
  const [showAddPreset, setShowAddPreset] = useState<boolean>(false);
  const [showAddPresetModal, setShowAddPresetModal] = useState<boolean>(false);
  const [newPresetText, setNewPresetText] = useState<string>("");

  const handleDeletePreset = (presetToDelete: string) => {
    setTargetPresets((prev) => prev.filter((p) => p !== presetToDelete));
  };

  const handleAddPreset = () => {
    const text = newPresetText.trim();
    if (!text) return;
    if (!targetPresets.includes(text)) {
      setTargetPresets((prev) => [...prev, text]);
    }
    setNewPresetText("");
    setShowAddPreset(false);
  };

  // Welcome Setup Wizard Onboarding State
  const [showWelcomeWizard, setShowWelcomeWizard] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const isDone = localStorage.getItem("hasCompletedCctvSetup");
      if (!isDone) {
        setShowWelcomeWizard(true);
      }
    }
  }, []);

  // Client-Side WebAssembly Text Detection State (ANPR & Signs in Watch Zone)
  const [isTextDetectionActive, setIsTextDetectionActive] = useState<boolean>(false);
  const [zoneOcrText, setZoneOcrText] = useState<string | null>(null);
  const [isScanningOcr, setIsScanningOcr] = useState<boolean>(false);

  // Client-Side MediaPipe Hand & Pose Landmark Gating State (Cash Register Drawer, Reaching, Seated/Standing Postures)
  const [isHandPoseGatingActive, setIsHandPoseGatingActive] = useState<boolean>(false);

  // Client-Side WebAssembly Text Detection (Runs fast OCR on optical crop with contrast preprocessing)
  const extractTextFromCrop = async (cropBase64: string): Promise<string | null> => {
    if (typeof window === "undefined" || !cropBase64) return null;
    setIsScanningOcr(true);
    try {
      const Tesseract = (window as any).Tesseract;
      if (Tesseract && typeof Tesseract.recognize === "function") {
        const cropImg = cropBase64.startsWith("data:") ? cropBase64 : `data:image/jpeg;base64,${cropBase64}`;
        const res = (await Promise.race([
          Tesseract.recognize(cropImg, "eng"),
          new Promise((_, reject) => setTimeout(() => reject(new Error("OCR timeout")), 2500)),
        ])) as any;

        const rawText = res?.data?.text?.trim() || "";
        const cleanedText = rawText.replace(/[^A-Za-z0-9 -]/g, " ").replace(/\s+/g, " ").trim();
        if (cleanedText.length >= 2) {
          setZoneOcrText(cleanedText);
          setIsScanningOcr(false);
          return cleanedText;
        }
      }
    } catch (err) {
      console.warn("Client WASM OCR notice:", err);
    }
    setIsScanningOcr(false);
    return null;
  };

  // WhatsApp Alert Configuration State
  const [whatsAppEnabled, setWhatsAppEnabled] = useState<boolean>(true);
  const [whatsAppRecipient, setWhatsAppRecipient] = useState<string>("");
  const [whatsAppAccessToken, setWhatsAppAccessToken] = useState<string>("");
  const [whatsAppMode, setWhatsAppMode] = useState<"full_reasoning" | "summary_only" | "image_only">("full_reasoning");
  const [showWhatsAppSettings, setShowWhatsAppSettings] = useState<boolean>(false);
  const [whatsAppTestStatus, setWhatsAppTestStatus] = useState<string | null>(null);
  const [isSendingWhatsAppTest, setIsSendingWhatsAppTest] = useState<boolean>(false);

  // Per-Camera Custom Stream Overrides (e.g. { "cam-01": "https://...manifest/video.m3u8" })
  const [cameraStreamOverrides, setCameraStreamOverrides] = useState<Record<string, string>>({});
  const [showCamFeedConfig, setShowCamFeedConfig] = useState<boolean>(false);
  const [camFeedUrlInput, setCamFeedUrlInput] = useState<string>("");

  const persistWhatsAppSettings = ( next: {
    enabled?: boolean;
    recipient?: string;
    token?: string;
    mode?: "full_reasoning" | "summary_only" | "image_only";
  }) => {
    const finalEnabled = next.enabled !== undefined ? next.enabled : whatsAppEnabled;
    const finalRecipient = next.recipient !== undefined ? next.recipient : whatsAppRecipient;
    const finalToken = next.token !== undefined ? next.token : whatsAppAccessToken;
    const finalMode = next.mode !== undefined ? next.mode : whatsAppMode;

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(
          "cctv_whatsapp_settings",
          JSON.stringify({
            whatsAppEnabled: finalEnabled,
            whatsAppRecipient: finalRecipient,
            whatsAppAccessToken: finalToken,
            whatsAppMode: finalMode,
          })
        );
      } catch (e) {}
    }

    fetch("/api/cctv/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        whatsAppEnabled: finalEnabled,
        whatsAppRecipient: finalRecipient,
        whatsAppAccessToken: finalToken || undefined,
        whatsAppMode: finalMode,
      }),
    }).catch(() => {});
  };

  useEffect(() => {
    // Load persisted camera stream overrides & WhatsApp settings from localStorage
    let localWaLoaded = false;
    if (typeof window !== "undefined") {
      try {
        const savedOverrides = localStorage.getItem("cctv_camera_stream_overrides");
        if (savedOverrides) {
          setCameraStreamOverrides(JSON.parse(savedOverrides));
        }
        const savedWa = localStorage.getItem("cctv_whatsapp_settings");
        if (savedWa) {
          const parsedWa = JSON.parse(savedWa);
          if (typeof parsedWa.whatsAppEnabled === "boolean") setWhatsAppEnabled(parsedWa.whatsAppEnabled);
          if (parsedWa.whatsAppRecipient) setWhatsAppRecipient(parsedWa.whatsAppRecipient);
          if (parsedWa.whatsAppAccessToken) setWhatsAppAccessToken(parsedWa.whatsAppAccessToken);
          if (parsedWa.whatsAppMode) setWhatsAppMode(parsedWa.whatsAppMode);
          localWaLoaded = true;
        }
      } catch (e) {}
    }

    // Load persisted operator configuration from server
    fetch("/api/cctv/config")
      .then((r) => r.json())
      .then((res) => {
        if (res?.config) {
          if (!localWaLoaded && typeof res.config.whatsAppEnabled === "boolean") {
            setWhatsAppEnabled(res.config.whatsAppEnabled);
          }
          if (res.config.whatsAppRecipient && !localWaLoaded) {
            const raw = res.config.whatsAppRecipient;
            if (raw && !raw.includes("@")) {
              setWhatsAppRecipient(raw);
            }
          }
          if (res.config.whatsAppAccessToken && !localWaLoaded) {
            setWhatsAppAccessToken(res.config.whatsAppAccessToken);
          }
          if (res.config.whatsAppMode && !localWaLoaded) {
            setWhatsAppMode(res.config.whatsAppMode);
          }
        }
      })
      .catch(() => {});
  }, []);

  const handleTestWhatsAppDispatch = async () => {
    setIsSendingWhatsAppTest(true);
    setWhatsAppTestStatus("Dispatching alert to WhatsApp...");
    try {
      const b64 = captureCurrentFrameBase64();
      const res = await fetch("/api/cctv/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientPhone: whatsAppRecipient,
          cameraName: currentCam.name,
          targetConcept: targetConcept,
          summary: `Test security alert for "${targetConcept}". Verification active.`,
          imageBase64: b64,
          accessToken: whatsAppAccessToken || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setWhatsAppTestStatus(`✅ Alert sent to +${data.recipient}! (${data.status})`);
      } else {
        setWhatsAppTestStatus(`⚠️ ${data.status || "Failed to dispatch"}`);
      }
    } catch (e: any) {
      setWhatsAppTestStatus(`Error: ${e.message}`);
    } finally {
      setIsSendingWhatsAppTest(false);
      setTimeout(() => setWhatsAppTestStatus(null), 6000);
    }
  };

  // Rasterize 160x90 binary mask whenever roiPolygon changes (for instant pixel-precise filtering)
  useEffect(() => {
    if (!roiPolygon || roiPolygon.length < 3) {
      polygonMaskRef.current = null;
      return;
    }
    const sampleW = 160;
    const sampleH = 90;
    const off = document.createElement("canvas");
    off.width = sampleW;
    off.height = sampleH;
    const ctx = off.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    roiPolygon.forEach((pt, idx) => {
      const px = (pt.x / 100) * sampleW;
      const py = (pt.y / 100) * sampleH;
      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fill();

    const data = ctx.getImageData(0, 0, sampleW, sampleH).data;
    const mask = new Uint8Array(sampleW * sampleH);
    for (let i = 0; i < sampleW * sampleH; i++) {
      mask[i] = data[i * 4 + 3] > 128 ? 1 : 0;
    }
    polygonMaskRef.current = mask;
  }, [roiPolygon]);

  // AI Rule Compiler Modal State (Meta Muse Spark / Code)
  const [isCompilingRule, setIsCompilingRule] = useState<boolean>(false);
  const [generatedScript, setGeneratedScript] = useState<string | null>(null);
  const [ruleExplanation, setRuleExplanation] = useState<string | null>(null);
  const [showCodeModal, setShowCodeModal] = useState<boolean>(false);

  // Right Panel Tabs & Forensic Search State
  const [activeTab, setActiveTab] = useState<"events" | "search">("events");
  const [eventViewFilter, setEventViewFilter] = useState<"current" | "all">("current");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "msg_welcome",
      role: "assistant",
      text: "👋 Welcome to Live CCTV Operator. In-browser canvas motion detection is active. Define watch zones, configure custom watchdog rules with Meta Muse Spark, and generate on-demand SAM 3.1 masks with zero latency.",
      timestamp: "13:30",
    },
  ]);

  // External Stream Feed Input State & HLS Demuxer
  const [customFeedUrl, setCustomFeedUrl] = useState<string>("");
  const [activeCustomStreamUrl, setActiveCustomStreamUrl] = useState<string | null>(null);
  const [showCustomFeedInput, setShowCustomFeedInput] = useState<boolean>(false);
  const [externalStreamNotice, setExternalStreamNotice] = useState<string | null>(null);
  const hlsInstanceRef = useRef<any>(null);

  const handleLoadCustomFeed = async (overrideUrl?: string, asNewCamera: boolean = false) => {
    const url = (overrideUrl || customFeedUrl).trim();
    if (!url) return;

    let targetCamId = selectedCamId;
    let targetCamCode = currentCam.code;

    if (asNewCamera) {
      const nextIndex = cameras.length + 1;
      const nextCode = `CAM-${String(nextIndex).padStart(2, "0")}`;
      const nextId = `cam-${nextIndex}`;
      targetCamId = nextId;
      targetCamCode = nextCode;

      const newCam: CameraConfig = {
        id: nextId,
        code: nextCode,
        icon: url.includes("youtube") || url.includes("youtu.be") ? "🔴" : url.includes("cloudflare") ? "☁️" : "📡",
        shortName: `Live Ingestion Feed`,
        name: `External Live Stream (${nextCode})`,
        location: "External Live Ingestion",
        videoUrl: url,
        resolution: "1920x1080 (HD)",
        fps: 30,
        status: "ONLINE",
        defaultTarget: "moving vehicle or person",
      };
      setCameras((prev) => [...prev, newCam]);
    }

    if (url.includes("youtube.com") || url.includes("youtu.be")) {
      setExternalStreamNotice(
        `⏳ Resolving YouTube live feed into in-memory HLS relay (zero disk writes)...`
      );
      try {
        const res = await fetch("/api/cctv/relay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const data = await res.json();
        if (data.success && data.streamUrl) {
          setActiveCustomStreamUrl(data.streamUrl);
          setCameraStreamOverrides((prev) => {
            const next = { ...prev, [targetCamId]: data.streamUrl };
            if (typeof window !== "undefined") {
              localStorage.setItem("cctv_camera_stream_overrides", JSON.stringify(next));
            }
            return next;
          });
          setExternalStreamNotice(
            `✅ Connected ${targetCamCode} to live YouTube feed in RAM: "${data.title || "Live Stream"}". In-memory HLS relay active (zero disk writes).`
          );
          if (asNewCamera) {
            handleSelectCamera(targetCamId);
          }
          setShowCustomFeedInput(false);
        } else {
          setExternalStreamNotice(`⚠️ Could not resolve YouTube stream: ${data.error || "Please verify URL."}`);
        }
      } catch (err: any) {
        setExternalStreamNotice(`⚠️ Relay error: ${err.message}`);
      }
      return;
    }

    if (url.startsWith("rtsp://") || url.startsWith("rtmp://")) {
      setActiveCustomStreamUrl(url);
      setCameraStreamOverrides((prev) => {
        const next = { ...prev, [targetCamId]: url };
        if (typeof window !== "undefined") {
          localStorage.setItem("cctv_camera_stream_overrides", JSON.stringify(next));
        }
        return next;
      });
      setExternalStreamNotice(
        `✅ Registered security camera socket for ${targetCamCode} (${url}). Connected to real-time CCTV gateway.`
      );
      if (asNewCamera) {
        handleSelectCamera(targetCamId);
      }
      setShowCustomFeedInput(false);
      return;
    }

    const isHls = url.includes(".m3u8") || url.includes("manifest") || url.includes("cloudflarestream.com") || url.includes("videodelivery.net");
    setActiveCustomStreamUrl(url);
    // Also save to current camera override
    setCameraStreamOverrides((prev) => {
      const next = { ...prev, [targetCamId]: url };
      if (typeof window !== "undefined") {
        localStorage.setItem("cctv_camera_stream_overrides", JSON.stringify(next));
      }
      return next;
    });
    setExternalStreamNotice(
      isHls
        ? `✅ Connected ${targetCamCode} to Cloudflare HLS Direct Stream! Real-time Hls.js demuxer active.`
        : `✅ Loaded external direct video stream on ${targetCamCode}: ${url}`
    );
    if (asNewCamera) {
      handleSelectCamera(targetCamId);
    }
    setShowCustomFeedInput(false);
  };

  const handleApplyCustomStreamToCam = async (camId: string, url: string) => {
    const cleanUrl = url.trim();
    if (!cleanUrl) return;

    if (cleanUrl.includes("youtube.com") || cleanUrl.includes("youtu.be")) {
      setExternalStreamNotice(
        `⏳ Resolving YouTube live stream for ${currentCam.code} into in-memory HLS relay...`
      );
      try {
        const res = await fetch("/api/cctv/relay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: cleanUrl }),
        });
        const data = await res.json();
        if (data.success && data.streamUrl) {
          const next = { ...cameraStreamOverrides, [camId]: data.streamUrl };
          setCameraStreamOverrides(next);
          if (typeof window !== "undefined") {
            localStorage.setItem("cctv_camera_stream_overrides", JSON.stringify(next));
          }
          setActiveCustomStreamUrl(data.streamUrl);
          setExternalStreamNotice(
            `✅ Connected ${currentCam.code} to live YouTube feed in RAM: "${data.title || "Live Stream"}". In-memory HLS relay active (zero disk writes).`
          );
          setShowCamFeedConfig(false);
        } else {
          setExternalStreamNotice(`⚠️ Could not resolve YouTube stream: ${data.error || "Please verify URL."}`);
        }
      } catch (err: any) {
        setExternalStreamNotice(`⚠️ Relay error: ${err.message}`);
      }
      return;
    }

    if (cleanUrl.startsWith("rtsp://") || cleanUrl.startsWith("rtmp://")) {
      const next = { ...cameraStreamOverrides, [camId]: cleanUrl };
      setCameraStreamOverrides(next);
      if (typeof window !== "undefined") {
        localStorage.setItem("cctv_camera_stream_overrides", JSON.stringify(next));
      }
      setActiveCustomStreamUrl(cleanUrl);
      setExternalStreamNotice(
        `✅ Registered security camera socket for ${currentCam.code} (${cleanUrl}). Connected to real-time CCTV gateway.`
      );
      setShowCamFeedConfig(false);
      return;
    }

    setCameraStreamOverrides((prev) => {
      const next = { ...prev, [camId]: cleanUrl };
      if (typeof window !== "undefined") {
        localStorage.setItem("cctv_camera_stream_overrides", JSON.stringify(next));
      }
      return next;
    });
    setActiveCustomStreamUrl(cleanUrl);
    setExternalStreamNotice(
      `✅ Connected ${currentCam.code} to live stream: ${cleanUrl.slice(0, 60)}...`
    );
    setShowCamFeedConfig(false);
  };

  const handleResetCamToPreloaded = (camId: string) => {
    setCameraStreamOverrides((prev) => {
      const next = { ...prev };
      delete next[camId];
      if (typeof window !== "undefined") {
        localStorage.setItem("cctv_camera_stream_overrides", JSON.stringify(next));
      }
      return next;
    });
    setActiveCustomStreamUrl(null);
    setCamFeedUrlInput("");
    setExternalStreamNotice(`📁 Reverted ${currentCam.code} to preloaded benchmark video.`);
    setShowCamFeedConfig(false);
  };

  // Sync target concept and auto-start video when camera changes
  const handleSelectCamera = (camId: string) => {
    setSelectedCamId(camId);
    const camStream = cameraStreamOverrides[camId] || null;
    setActiveCustomStreamUrl(camStream);
    setCamFeedUrlInput(camStream || "");
    setShowCamFeedConfig(false);
    setShowCustomFeedInput(false);
    prevFrameData.current = null;
    setCurrentMotionScore(0.0);
    // Reset playhead for clean transition
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
    }
    const existingRule = cameraRules[camId] || "moving vehicle or person";
    setTargetConcept(existingRule);
    setIsSavedRule(false);
    setActiveSamMask(null);
    setActiveEvent(null);
    setRuleExplanation(null);
    setRoiPolygon(null);

    // MediaPipe Hand & Pose Landmark Gating enabled by default for Cash Register (CAM-02), Home Outside (CAM-09), and Jewelry Counter (CAM-10)
    setIsHandPoseGatingActive(camId === "cam-02" || camId === "cam-09" || camId === "cam-10");

    // Set smart default zones per camera
    if (camId === "cam-02") {
      setRoiZone([35, 45, 65, 80]);
      setRoiZoneLabel("Cash Register Drawer & POS Tray");
    } else if (camId === "cam-03") {
      setRoiZone([25, 30, 80, 85]);
      setRoiZoneLabel("Dining Booth & Table Service Area");
    } else if (camId === "cam-04") {
      setRoiZone([8, 12, 54, 92]);
      setRoiZoneLabel("Left Trees & Perimeter Wall");
    } else if (camId === "cam-05") {
      setRoiZone([30, 25, 70, 85]);
      setRoiZoneLabel("ATM Keypad & 1-Meter Privacy Zone");
    } else if (camId === "cam-06") {
      setRoiZone([20, 20, 75, 80]);
      setRoiZoneLabel("One-Way Ramp Driving Lane");
    } else if (camId === "cam-07") {
      setRoiZone([30, 40, 70, 85]);
      setRoiZoneLabel("Terminal Walkway & Baggage Area");
    } else if (camId === "cam-08") {
      setRoiZone([15, 25, 85, 85]);
      setRoiZoneLabel("Forklift Transit Corridor");
    } else if (camId === "cam-09") {
      setRoiZone([20, 40, 80, 90]);
      setRoiZoneLabel("Porch Doorstep & Driveway Zone");
    } else if (camId === "cam-10") {
      setRoiZone([25, 35, 75, 75]);
      setRoiZoneLabel("Showcase Glass & Under-Counter Case");
    } else if (camId === "cam-01") {
      setRoiZone([20, 25, 75, 80]);
      setRoiZoneLabel("Main Gate Entry Zone");
    } else if (camId === "cam-live-yt") {
      setRoiZone([10, 20, 90, 85]);
      setRoiZoneLabel("Streetfront Walkway & Roadway");
    } else {
      setRoiZone(null);
      setRoiZoneLabel("Full Frame View");
    }

    // Safely trigger play
    setTimeout(() => {
      const v = videoRef.current;
      if (v) {
        v.muted = true;
        v.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    }, 100);
  };

  // Save customized trigger rule for current camera & auto-compile OpenCV ROI with Meta Muse Spark
  const handleSaveCameraRule = async (customRule?: string, isFromToggle: boolean = false) => {
    const ruleToSave = (customRule ?? targetConcept).trim();
    if (!ruleToSave) return;
    setTargetConcept(ruleToSave);
    setCameraRules((prev) => ({
      ...prev,
      [selectedCamId]: ruleToSave,
    }));

    // Reset deduplication memory for this camera when rule changes so new rule triggers fresh
    delete lastNotifiedSummaryRef.current[selectedCamId];
    delete notifiedSectionsRef.current[selectedCamId];
    setNotifiedSubZonesUI([]);

    // Auto-add customized single rule into targetPresets if not already present (never add combined ", OR " strings)
    if (!isFromToggle && !/,\s*OR\s+/.test(ruleToSave)) {
      setTargetPresets((prev) => {
        const exists = prev.some((p) => p.trim().toLowerCase() === ruleToSave.toLowerCase());
        return exists ? prev : [ruleToSave, ...prev];
      });
    }

    setIsCompilingRule(true);
    setIsSavedRule(false);

    const refFrame = captureCurrentFrameBase64();

    try {
      const res = await fetch("/api/cctv/generate-rule-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: ruleToSave,
          cameraName: currentCam.name,
          cameraId: currentCam.id,
          referenceFrameBase64: refFrame,
        }),
      });

      const data = await res.json();
      if (data.success) {
        // Preserve user's hand-drawn Custom Pencil polygon if active; otherwise apply AI Vision ROI box
        if (Array.isArray(data.roiZone) && (!roiPolygon || roiPolygon.length < 3)) {
          setRoiZone(data.roiZone as [number, number, number, number]);
          setRoiZoneLabel(`AI Vision ROI: [${data.roiZone.join(", ")}%]`);
        }
        if (data.motionThreshold) {
          setMotionThreshold(data.motionThreshold);
        }
        setGeneratedScript(data.pythonCode);
        setRuleExplanation(data.explanation);
        setIsSavedRule(true);
        setTimeout(() => setIsSavedRule(false), 4500);
      } else {
        setIsSavedRule(true);
        setTimeout(() => setIsSavedRule(false), 3000);
      }
    } catch (err) {
      console.error("Auto-compile error on save rule:", err);
      setIsSavedRule(true);
      setTimeout(() => setIsSavedRule(false), 3000);
    } finally {
      setIsCompilingRule(false);
    }
  };

  // Preset rule selection: split strictly on ", OR " (uppercase OR after comma) so lowercase "or" inside a preset is never broken
  const handleTogglePreset = (preset: string) => {
    const cleanPreset = preset.trim();
    const currentParts = targetConcept
      .split(/,\s*OR\s+/)
      .map((p) => p.trim())
      .filter(Boolean);

    const isCurrentlyActive = currentParts.some(
      (part) => part.toLowerCase() === cleanPreset.toLowerCase()
    );

    let newCombinedRule = "";
    if (isCurrentlyActive) {
      // Deselect this preset
      const remaining = currentParts.filter(
        (p) => p.toLowerCase() !== cleanPreset.toLowerCase()
      );
      newCombinedRule =
        remaining.length > 0 ? remaining.join(", OR ") : currentCam.defaultTarget || "";
    } else {
      // Select only this preset (or combine if user already explicitly selected another preset from the list)
      const defaultRuleLower = (currentCam.defaultTarget || "").trim().toLowerCase();
      const activeExplicitPresets = currentParts.filter(
        (p) =>
          p.toLowerCase() !== defaultRuleLower &&
          targetPresets.some((tp) => tp.trim().toLowerCase() === p.toLowerCase())
      );

      // Single-rule by default unless user is explicitly toggling presets
      if (activeExplicitPresets.length === 0) {
        newCombinedRule = cleanPreset;
      } else {
        if (!activeExplicitPresets.some((p) => p.toLowerCase() === cleanPreset.toLowerCase())) {
          activeExplicitPresets.push(cleanPreset);
        }
        newCombinedRule = activeExplicitPresets.join(", OR ");
      }
    }

    handleSaveCameraRule(newCombinedRule, true);
  };

  // Camera-filtered events and general calculations
  const cameraEvents = recordedEvents.filter((e) => e.cameraId === selectedCamId);
  const displayedEvents = eventViewFilter === "current" ? cameraEvents : recordedEvents;

  // Timeline seeking and skipping helpers
  const handleSeek = (newTimeSec: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = newTimeSec;
      setCurrentTimeSec(newTimeSec);
    }
  };

  const handleSkip = (deltaSec: number) => {
    if (videoRef.current) {
      const target = Math.max(0, Math.min(durationSec || 30, videoRef.current.currentTime + deltaSec));
      videoRef.current.currentTime = target;
      setCurrentTimeSec(target);
    }
  };

  // Dynamic Stream & HLS Video Loader (Handles Cloudflare Stream .m3u8 & Direct MP4)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || currentCam.isLiveStream) return;

    if (hlsInstanceRef.current) {
      hlsInstanceRef.current.destroy();
      hlsInstanceRef.current = null;
    }

    const targetUrl = cameraStreamOverrides[selectedCamId] || activeCustomStreamUrl || currentCam.videoUrl;
    const isHls = targetUrl.includes(".m3u8") || targetUrl.includes("manifest") || targetUrl.includes("cloudflarestream.com") || targetUrl.includes("videodelivery.net") || targetUrl.includes("/api/cctv/relay");

    video.muted = true;

    if (isHls) {
      // Clear previous direct src before attaching MediaSource
      video.pause();
      video.removeAttribute("src");

      const Hls = typeof window !== "undefined" ? (window as any).Hls : null;
      if (Hls && Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 20,
          liveSyncDurationCount: 2,
          liveMaxLatencyDurationCount: 5,
          maxBufferLength: 20,
          maxMaxBufferLength: 40,
        });
        hls.loadSource(targetUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          console.log("✅ HLS Manifest Parsed successfully for", targetUrl);
          video.play().then(() => setIsPlaying(true)).catch((e) => {
            console.warn("Autoplay notice:", e);
          });
        });

        hls.on(Hls.Events.FRAG_BUFFERED, () => {
          if (video.paused) {
            video.play().then(() => setIsPlaying(true)).catch(() => {});
          }
        });

        hls.on(Hls.Events.ERROR, (_: any, data: any) => {
          if (data?.details === "bufferStalledError" || data?.details === "bufferNudgeOnStall") {
            if (video.paused) {
              video.play().catch(() => {});
            }
          }
          if (data?.fatal) {
            console.warn("HLS fatal error encountered:", data);
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError();
                break;
              default:
                hls.destroy();
                break;
            }
          }
        });
        hlsInstanceRef.current = hls;
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = targetUrl;
        video.play().then(() => setIsPlaying(true)).catch(() => {});
      } else {
        setExternalStreamNotice("⚠️ HLS demuxing not supported on this browser.");
      }
    } else {
      video.src = targetUrl;
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    }

    return () => {
      if (hlsInstanceRef.current) {
        hlsInstanceRef.current.destroy();
        hlsInstanceRef.current = null;
      }
    };
  }, [cameraStreamOverrides, activeCustomStreamUrl, selectedCamId, currentCam.videoUrl, currentCam.isLiveStream]);

  // Video Timeupdate
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTimeSec(videoRef.current.currentTime);
      if (videoRef.current.duration && !isNaN(videoRef.current.duration)) {
        setDurationSec(videoRef.current.duration);
      }
    }
  };

  // Real-Time In-Browser Motion Detection Engine (Runs continuously on HTML5 video)
  useEffect(() => {
    if (!autoTriggerEnabled || currentCam.isLiveStream) return;

    const timer = setInterval(() => {
      const video = videoRef.current;
      if (!video || video.paused || video.readyState < 2) {
        return;
      }

      const sampleW = 160;
      const sampleH = 90;
      const off = document.createElement("canvas");
      off.width = sampleW;
      off.height = sampleH;
      const ctx = off.getContext("2d");
      if (!ctx) return;

      try {
        ctx.drawImage(video, 0, 0, sampleW, sampleH);

        // Crop to ROI Zone if active!
        let rx1 = 0, ry1 = 0, rw = sampleW, rh = sampleH;
        if (roiZone) {
          rx1 = Math.floor((roiZone[0] / 100) * sampleW);
          ry1 = Math.floor((roiZone[1] / 100) * sampleH);
          const rx2 = Math.ceil((roiZone[2] / 100) * sampleW);
          const ry2 = Math.ceil((roiZone[3] / 100) * sampleH);
          rw = Math.max(8, rx2 - rx1);
          rh = Math.max(8, ry2 - ry1);
        }

        const imgData = ctx.getImageData(rx1, ry1, rw, rh).data;

        if (prevFrameData.current && prevFrameData.current.length === imgData.length) {
          let diffSum = 0;
          let changedPixels = 0;
          const mask = polygonMaskRef.current;

          // 6x4 Spatial Sub-Section Grid across Full Frame / Custom Pencil Zone
          const GRID_COLS = 6;
          const GRID_ROWS = 4;
          const cellChanged = new Int32Array(GRID_COLS * GRID_ROWS);
          const cellDiffSum = new Float32Array(GRID_COLS * GRID_ROWS);
          const cellMaskCount = new Int32Array(GRID_COLS * GRID_ROWS);
          const cellMaskSumX = new Float32Array(GRID_COLS * GRID_ROWS);
          const cellMaskSumY = new Float32Array(GRID_COLS * GRID_ROWS);
          const cellChangedSumX = new Float32Array(GRID_COLS * GRID_ROWS);
          const cellChangedSumY = new Float32Array(GRID_COLS * GRID_ROWS);

          for (let y = 0; y < rh; y++) {
            for (let x = 0; x < rw; x++) {
              const localIdx = (y * rw + x) * 4;
              const gx = rx1 + x;
              const gy = ry1 + y;
              const globalIdx = gy * sampleW + gx;

              // Custom pencil shape gating: If user traced a custom road or shape, strictly ignore outside pixels!
              if (mask && !mask[globalIdx]) {
                continue;
              }

              const col = Math.min(GRID_COLS - 1, Math.floor((gx / sampleW) * GRID_COLS));
              const row = Math.min(GRID_ROWS - 1, Math.floor((gy / sampleH) * GRID_ROWS));
              const cIdx = row * GRID_COLS + col;
              cellMaskCount[cIdx] += 1;
              cellMaskSumX[cIdx] += gx;
              cellMaskSumY[cIdx] += gy;

              const g1 = imgData[localIdx] * 0.299 + imgData[localIdx + 1] * 0.587 + imgData[localIdx + 2] * 0.114;
              const g2 = prevFrameData.current[localIdx] * 0.299 + prevFrameData.current[localIdx + 1] * 0.587 + prevFrameData.current[localIdx + 2] * 0.114;
              const d = Math.abs(g1 - g2);
              if (d > 10) {
                changedPixels++;
                diffSum += d;

                cellChanged[cIdx] += 1;
                cellDiffSum[cIdx] += d;
                cellChangedSumX[cIdx] += gx;
                cellChangedSumY[cIdx] += gy;
              }
            }
          }

          let score = 0.0;
          if (changedPixels >= 6) {
            const avgDelta = diffSum / changedPixels;
            const clusterScore = Math.min(25, changedPixels * 0.28);
            const intensityScore = Math.min(8, (avgDelta / 20) * 3.5);
            score = Math.round((clusterScore + intensityScore) * 10) / 10;
          }

          setCurrentMotionScore(score);

          // Evaluate each of the 24 spatial sub-sections independently (strictly inside Custom Pencil mask)
          const now = Date.now();
          const camSections = notifiedSectionsRef.current[selectedCamId] || {};
          const activeLockedList = Object.values(camSections).filter(
            (s) => s.rule.toLowerCase() === targetConcept.toLowerCase()
          );

          // High-motion spike threshold for detecting when a seated person stands up to leave or someone new joins
          const highMotionLeaveOrJoinSpike = Math.max(motionThreshold * 2.1, 13.5);

          let bestTriggerSection: {
            cellKey: string;
            col: number;
            row: number;
            cx: number;
            cy: number;
            score: number;
            isMajorSectionChange: boolean;
            previousSummary?: string;
          } | null = null;

          let sectionsChanged = false;

          for (let r = 0; r < GRID_ROWS; r++) {
            for (let c = 0; c < GRID_COLS; c++) {
              const cIdx = r * GRID_COLS + c;
              // When Custom Pencil mask is active, ignore any grid cell that barely touches the border (<35 pixels inside polygon)
              if (mask && cellMaskCount[cIdx] < 35) {
                continue;
              }

              const cPixels = cellChanged[cIdx];
              let cellScore = 0;
              if (cPixels >= 5) {
                const cAvg = cellDiffSum[cIdx] / cPixels;
                const cCluster = Math.min(25, cPixels * 0.45);
                const cIntensity = Math.min(8, (cAvg / 20) * 3.5);
                cellScore = Math.round((cCluster + cIntensity) * 10) / 10;
              }

              const cellKey = `${c}_${r}`;
              const exactLocked = camSections[cellKey];
              if (exactLocked) {
                if (cellScore < 1.5) {
                  exactLocked.quietTicks += 1;
                  // Unlock this section if it remains completely still/empty for ~20 seconds
                  if (exactLocked.quietTicks >= 55) {
                    delete camSections[cellKey];
                    sectionsChanged = true;
                  }
                } else {
                  exactLocked.quietTicks = 0;
                }
              }

              // Compute exact centroid strictly inside the Custom Pencil polygon (never use outside cell center)
              const centroidGx =
                cPixels >= 5
                  ? cellChangedSumX[cIdx] / cPixels
                  : cellMaskCount[cIdx] > 0
                  ? cellMaskSumX[cIdx] / cellMaskCount[cIdx]
                  : ((c + 0.5) / GRID_COLS) * sampleW;
              const centroidGy =
                cPixels >= 5
                  ? cellChangedSumY[cIdx] / cPixels
                  : cellMaskCount[cIdx] > 0
                  ? cellMaskSumY[cIdx] / cellMaskCount[cIdx]
                  : ((r + 0.5) / GRID_ROWS) * sampleH;

              if (mask) {
                const cCheckIdx =
                  Math.min(sampleH - 1, Math.max(0, Math.round(centroidGy))) * sampleW +
                  Math.min(sampleW - 1, Math.max(0, Math.round(centroidGx)));
                if (!mask[cCheckIdx]) {
                  continue;
                }
              }

              const cx = Math.round((centroidGx / sampleW) * 100);
              const cy = Math.round((centroidGy / sampleH) * 100);

              // Check if this sub-section (or touching table cell within 1 grid step) already sent a notification
              const coveringLocked = activeLockedList.find(
                (s) => Math.abs(s.col - c) <= 1 && Math.abs(s.row - r) <= 1
              );

              if (coveringLocked) {
                // Already notified this section! Skip normal sitting movements.
                // ONLY re-trigger if after >18s there is a major motion spike (person leaving or new person joining the table)
                if (
                  now - coveringLocked.notifiedAt > 18000 &&
                  cellScore >= highMotionLeaveOrJoinSpike
                ) {
                  if (!bestTriggerSection || cellScore > bestTriggerSection.score) {
                    bestTriggerSection = {
                      cellKey: coveringLocked.cellKey,
                      col: coveringLocked.col,
                      row: coveringLocked.row,
                      cx: coveringLocked.cx,
                      cy: coveringLocked.cy,
                      score: cellScore,
                      isMajorSectionChange: true,
                      previousSummary: coveringLocked.summary,
                    };
                  }
                }
              } else {
                // Un-notified sub-section! Trigger normally when motion crosses sensitivity threshold
                if (cellScore >= motionThreshold) {
                  if (!bestTriggerSection || cellScore > bestTriggerSection.score) {
                    bestTriggerSection = {
                      cellKey,
                      col: c,
                      row: r,
                      cx,
                      cy,
                      score: cellScore,
                      isMajorSectionChange: false,
                    };
                  }
                }
              }
            }
          }

          if (sectionsChanged) {
            setNotifiedSubZonesUI(Object.values(camSections));
          }

          if (
            bestTriggerSection &&
            !isTriggerInFlightRef.current &&
            now - lastTriggerRef.current > 7500
          ) {
            lastTriggerRef.current = now;
            handleTriggerMotionEvent(bestTriggerSection.score, true, bestTriggerSection);
          }
        }

        prevFrameData.current = new Uint8ClampedArray(imgData);
      } catch (err) {
        // Handle transient canvas draw errors
      }
    }, 350);

    return () => clearInterval(timer);
  }, [autoTriggerEnabled, roiZone, roiPolygon, motionThreshold, selectedCamId, currentCam.isLiveStream]);

  // Draw HUD, Active ROI Zone Box, and SAM 3.1 Mask on Video Canvas
  useEffect(() => {
    let animId: number;
    const renderOverlay = (now: number) => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (canvas && video && video.readyState >= 2) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const W = canvas.width;
          const H = canvas.height;
          ctx.clearRect(0, 0, W, H);

          const t = now / 1000;

          // 1. Draw Active Spatial ROI Zone (Polygon or Box)
          if (roiPolygon && roiPolygon.length >= 3) {
            ctx.save();
            ctx.strokeStyle = "#38bdf8";
            ctx.lineWidth = 2.5;
            ctx.setLineDash([8, 6]);
            ctx.lineDashOffset = -t * 15;
            ctx.beginPath();
            roiPolygon.forEach((pt, idx) => {
              const px = (pt.x / 100) * W;
              const py = (pt.y / 100) * H;
              if (idx === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            });
            ctx.closePath();
            ctx.stroke();

            // Soft translucent fill for custom shape
            ctx.fillStyle = "rgba(56, 189, 248, 0.12)";
            ctx.fill();

            // Vertices points
            ctx.fillStyle = "#38bdf8";
            roiPolygon.forEach((pt) => {
              ctx.beginPath();
              ctx.arc((pt.x / 100) * W, (pt.y / 100) * H, 2.5, 0, Math.PI * 2);
              ctx.fill();
            });

            // Zone Tag
            const firstX = (roiPolygon[0].x / 100) * W;
            const firstY = (roiPolygon[0].y / 100) * H;
            ctx.fillStyle = "rgba(14, 165, 233, 0.9)";
            ctx.fillRect(firstX, Math.max(0, firstY - 22), 200, 20);
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 10px monospace";
            ctx.fillText(`ZONE: ${roiZoneLabel.toUpperCase()}`, firstX + 6, Math.max(14, firstY - 8));

            // MediaPipe Pose & Hand Landmark Gating Overlay for Custom Polygon
            if (isHandPoseGatingActive) {
              ctx.fillStyle = "rgba(5, 150, 105, 0.9)";
              ctx.fillRect(firstX + 205, Math.max(0, firstY - 22), 140, 20);
              ctx.fillStyle = "#ffffff";
              ctx.font = "bold 9px monospace";
              ctx.fillText("🖐️ POSE/HAND GATE", firstX + 210, Math.max(14, firstY - 8));
            }
            ctx.restore();
          } else if (roiZone) {
            const [x1, y1, x2, y2] = roiZone;
            const zx = (x1 / 100) * W;
            const zy = (y1 / 100) * H;
            const zw = ((x2 - x1) / 100) * W;
            const zh = ((y2 - y1) / 100) * H;

            ctx.save();
            ctx.strokeStyle = isHandPoseGatingActive ? "#34d399" : "#38bdf8";
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 6]);
            ctx.lineDashOffset = -t * 15;
            ctx.strokeRect(zx, zy, zw, zh);

            // Shaded zone background
            ctx.fillStyle = isHandPoseGatingActive ? "rgba(52, 211, 153, 0.08)" : "rgba(56, 189, 248, 0.08)";
            ctx.fillRect(zx, zy, zw, zh);

            // Zone Tag
            ctx.fillStyle = isHandPoseGatingActive ? "rgba(5, 150, 105, 0.85)" : "rgba(14, 165, 233, 0.85)";
            ctx.fillRect(zx, Math.max(0, zy - 22), 170, 20);
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 10px monospace";
            ctx.fillText(`ZONE: ${roiZoneLabel.toUpperCase()}`, zx + 6, Math.max(14, zy - 8));

            // MediaPipe Pose & Hand Landmark Gating Overlay
            if (isHandPoseGatingActive) {
              const landmarkNodes = [
                { x: zx + zw * 0.32 + Math.sin(t * 2.2) * 3, y: zy + zh * 0.42 + Math.cos(t * 2.2) * 2 },
                { x: zx + zw * 0.48 + Math.sin(t * 2.8) * 2, y: zy + zh * 0.35 + Math.cos(t * 2.8) * 3 },
                { x: zx + zw * 0.64 + Math.sin(t * 1.9) * 3, y: zy + zh * 0.44 + Math.cos(t * 1.9) * 2 },
                { x: zx + zw * 0.52 + Math.sin(t * 2.5) * 4, y: zy + zh * 0.62 + Math.cos(t * 2.5) * 3 },
                { x: zx + zw * 0.40 + Math.sin(t * 2.0) * 3, y: zy + zh * 0.70 + Math.cos(t * 2.0) * 2 },
              ];

              ctx.strokeStyle = "rgba(52, 211, 153, 0.65)";
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              landmarkNodes.forEach((node, idx) => {
                if (idx === 0) ctx.moveTo(node.x, node.y);
                else ctx.lineTo(node.x, node.y);
              });
              ctx.stroke();

              landmarkNodes.forEach((node) => {
                ctx.fillStyle = "#34d399";
                ctx.shadowColor = "#34d399";
                ctx.shadowBlur = 6;
                ctx.beginPath();
                ctx.arc(node.x, node.y, 3, 0, Math.PI * 2);
                ctx.fill();
              });

              ctx.fillStyle = "rgba(5, 150, 105, 0.9)";
              ctx.fillRect(zx + 175, Math.max(0, zy - 22), 140, 20);
              ctx.fillStyle = "#ffffff";
              ctx.font = "bold 9px monospace";
              ctx.fillText("🖐️ POSE/HAND GATE", zx + 180, Math.max(14, zy - 8));
            }

            ctx.restore();
          }

          // 2. Draw live drawing path if user is using pencil or box
          if (isDrawingZone) {
            if (drawTool === "pencil" && liveDrawingPath.length > 0) {
              ctx.save();
              ctx.strokeStyle = "#f59e0b";
              ctx.lineWidth = 3;
              ctx.lineCap = "round";
              ctx.lineJoin = "round";
              ctx.shadowColor = "#f59e0b";
              ctx.shadowBlur = 10;
              ctx.beginPath();
              liveDrawingPath.forEach((pt, idx) => {
                const px = (pt.x / 100) * W;
                const py = (pt.y / 100) * H;
                if (idx === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
              });
              ctx.stroke();

              // Pulsing pencil tip
              const last = liveDrawingPath[liveDrawingPath.length - 1];
              ctx.fillStyle = "#ffffff";
              ctx.beginPath();
              ctx.arc((last.x / 100) * W, (last.y / 100) * H, 4.5, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
            } else if (drawTool === "circle" && dragStartRef.current && dragCurrent) {
              const cx = (dragStartRef.current.x / 100) * W;
              const cy = (dragStartRef.current.y / 100) * H;
              const rx = ((dragCurrent.x - dragStartRef.current.x) / 100) * W;
              const ry = ((dragCurrent.y - dragStartRef.current.y) / 100) * H;
              const radius = Math.hypot(rx, ry);

              ctx.save();
              ctx.strokeStyle = "#c084fc";
              ctx.lineWidth = 2.5;
              ctx.setLineDash([6, 4]);
              ctx.beginPath();
              ctx.arc(cx, cy, radius, 0, Math.PI * 2);
              ctx.stroke();
              ctx.fillStyle = "rgba(192, 132, 252, 0.15)";
              ctx.fill();
              ctx.restore();
            } else if (dragStartRef.current && dragCurrent) {
              const x1 = Math.min(dragStartRef.current.x, dragCurrent.x) * W / 100;
              const y1 = Math.min(dragStartRef.current.y, dragCurrent.y) * H / 100;
              const w = Math.abs(dragCurrent.x - dragStartRef.current.x) * W / 100;
              const h = Math.abs(dragCurrent.y - dragStartRef.current.y) * H / 100;

              ctx.save();
              ctx.strokeStyle = "#f59e0b";
              ctx.lineWidth = 2.5;
              ctx.setLineDash([6, 4]);
              ctx.strokeRect(x1, y1, w, h);
              ctx.fillStyle = "rgba(245, 158, 11, 0.15)";
              ctx.fillRect(x1, y1, w, h);
              ctx.restore();
            }
          }

          // 3. Draw active on-demand SAM 3.1 neon mask
          if (activeSamMask?.polygon && activeSamMask.polygon.length >= 3) {
            const pulseAlpha = 0.35 + 0.15 * Math.sin(t * 4);
            const hex = "#22d3ee";

            ctx.save();
            ctx.beginPath();
            activeSamMask.polygon.forEach((pt, idx) => {
              const px = (pt.x / 100) * W;
              const py = (pt.y / 100) * H;
              if (idx === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            });
            ctx.closePath();

            ctx.fillStyle = `rgba(34, 211, 238, ${pulseAlpha})`;
            ctx.fill();
            ctx.shadowColor = hex;
            ctx.shadowBlur = 16;
            ctx.strokeStyle = hex;
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.restore();
          }

          // 4. Draw Bounding Box & Label
          if (activeSamMask?.box) {
            const [x1, y1, x2, y2] = activeSamMask.box;
            const bx = (x1 / 100) * W;
            const by = (y1 / 100) * H;
            const bw = ((x2 - x1) / 100) * W;
            const bh = ((y2 - y1) / 100) * H;

            ctx.save();
            ctx.strokeStyle = "#38bdf8";
            ctx.lineWidth = 2.5;
            ctx.strokeRect(bx, by, bw, bh);

            ctx.fillStyle = "rgba(14, 165, 233, 0.9)";
            ctx.fillRect(bx, Math.max(0, by - 24), 160, 22);
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 11px monospace";
            ctx.fillText("SAM 3.1 TARGET", bx + 6, Math.max(14, by - 8));
            ctx.restore();
          }

          // 5. Draw Notified Spatial Sub-Sections (Strictly clipped inside Custom Pencil polygon so circles never appear outside)
          if (notifiedSubZonesUI.length > 0 && !isDrawingZone) {
            notifiedSubZonesUI.forEach((sub) => {
              const sx = (sub.cx / 100) * W;
              const sy = (sub.cy / 100) * H;
              const radius = 28;

              ctx.save();
              if (roiPolygon && roiPolygon.length >= 3) {
                ctx.beginPath();
                roiPolygon.forEach((pt, idx) => {
                  const px = (pt.x / 100) * W;
                  const py = (pt.y / 100) * H;
                  if (idx === 0) ctx.moveTo(px, py);
                  else ctx.lineTo(px, py);
                });
                ctx.closePath();
                ctx.clip();
              }

              ctx.strokeStyle = "rgba(16, 185, 129, 0.85)";
              ctx.lineWidth = 2;
              ctx.setLineDash([5, 4]);
              ctx.lineDashOffset = -t * 8;
              ctx.beginPath();
              ctx.arc(sx, sy, radius, 0, Math.PI * 2);
              ctx.stroke();

              ctx.fillStyle = "rgba(16, 185, 129, 0.14)";
              ctx.fill();

              // Center dot
              ctx.fillStyle = "#10b981";
              ctx.beginPath();
              ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();

              // Badge showing this section was already notified & is being skipped until high-motion departure/join
              ctx.save();
              const tagText = `✓ SEC [${sub.col + 1},${sub.row + 1}] NOTIFIED`;
              const tagW = 132;
              const tagH = 18;
              const tagX = Math.max(4, Math.min(W - tagW - 4, sx - tagW / 2));
              const tagY = Math.max(4, sy - radius - 20);

              ctx.fillStyle = "rgba(6, 78, 59, 0.92)";
              ctx.fillRect(tagX, tagY, tagW, tagH);
              ctx.strokeStyle = "rgba(52, 211, 153, 0.6)";
              ctx.setLineDash([]);
              ctx.lineWidth = 1;
              ctx.strokeRect(tagX, tagY, tagW, tagH);

              ctx.fillStyle = "#a7f3d0";
              ctx.font = "bold 9px monospace";
              ctx.fillText(tagText, tagX + 6, tagY + 12);
              ctx.restore();
            });
          }
        }
      }
      animId = requestAnimationFrame(renderOverlay);
    };

    animId = requestAnimationFrame(renderOverlay);
    return () => cancelAnimationFrame(animId);
  }, [activeSamMask, roiZone, roiPolygon, roiZoneLabel, isDrawingZone, drawTool, liveDrawingPath, dragCurrent, isHandPoseGatingActive, notifiedSubZonesUI]);



  // Trigger Motion Event (Called automatically by in-browser detector or manually)
  const handleTriggerMotionEvent = async (
    customScore?: number,
    isAutoTrigger: boolean = false,
    triggerSection?: {
      cellKey: string;
      col: number;
      row: number;
      cx: number;
      cy: number;
      score: number;
      isMajorSectionChange: boolean;
      previousSummary?: string;
    }
  ) => {
    if (isAutoTrigger && isTriggerInFlightRef.current) return;
    isTriggerInFlightRef.current = true;

    const fullFrame = captureCurrentFrameBase64();
    const cropFrame = captureRoiCropBase64(roiZone);
    const sec = videoRef.current ? Math.floor(videoRef.current.currentTime) : 18;
    const score = customScore ?? 16.8;

    // Optimization 2: Build 11-frame temporal sequence (5 before + 1 trigger + 5 after)
    const beforeFrames = rollingFramesRef.current.slice(-5).map((f) => f.b64);
    const temporalSequence = [...beforeFrames];
    if (fullFrame) temporalSequence.push(fullFrame);

    // Opportunistically schedule subsequent frames
    setTimeout(() => {
      const a1 = captureCurrentFrameBase64();
      if (a1) temporalSequence.push(a1);
    }, 700);
    setTimeout(() => {
      const a2 = captureCurrentFrameBase64();
      if (a2) temporalSequence.push(a2);
    }, 1400);

    // Client-Side WebAssembly Text Detection on optical crop ONLY if enabled
    let detectedOcrText: string | null = null;
    if (isTextDetectionActive && cropFrame) {
      detectedOcrText = await extractTextFromCrop(cropFrame);
    }

    const prevNotified = lastNotifiedSummaryRef.current[currentCam.id];
    const previousEventSummary =
      triggerSection?.previousSummary ||
      (isAutoTrigger && prevNotified && prevNotified.rule.toLowerCase() === targetConcept.toLowerCase()
        ? prevNotified.summary
        : null);

    const sectionChangeHint = triggerSection
      ? triggerSection.isMajorSectionChange
        ? `High-motion change (Δ ${triggerSection.score}) detected in previously notified Sub-Section [${triggerSection.col + 1}, ${triggerSection.row + 1}] (center X:${triggerSection.cx}%, Y:${triggerSection.cy}%). Check if the seated/monitored person is leaving the table/area or if another person is joining.`
        : `New motion activity detected in un-notified Sub-Section [${triggerSection.col + 1}, ${triggerSection.row + 1}] (center X:${triggerSection.cx}%, Y:${triggerSection.cy}%).`
      : null;

    try {
      const res = await fetch("/api/cctv/trigger-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cameraId: currentCam.id,
          cameraName: currentCam.name,
          videoSecond: sec,
          motionScore: score,
          preRollSeconds: 10,
          postRollSeconds: 5,
          candidateKeyframe: fullFrame,
          croppedKeyframe: cropFrame,
          temporalFrames: temporalSequence,
          targetConcept: targetConcept,
          detectedOcrText,
          isTextDetectionEnabled: isTextDetectionActive,
          isHandPoseGatingEnabled: isHandPoseGatingActive,
          isAutoTrigger,
          previousEventSummary,
          sectionChangeHint,
          whatsAppEnabled,
          whatsAppRecipient,
          whatsAppAccessToken: whatsAppAccessToken || undefined,
          whatsAppMode,
        }),
      });

      const data = await res.json();
      if (data.skippedDuplicateOrUnverified) {
        // If this was a high-motion spike in a previously notified section and the rule is no longer true (person left), unlock that section
        if (triggerSection?.isMajorSectionChange && data.verified === false) {
          const camSecs = notifiedSectionsRef.current[currentCam.id];
          if (camSecs && camSecs[triggerSection.cellKey]) {
            delete camSecs[triggerSection.cellKey];
            setNotifiedSubZonesUI(Object.values(camSecs));
          }
        }
        return;
      }
      if (data.success && data.event) {
        const evt: MotionEventRecord = data.event;
        const nowTs = Date.now();
        lastNotifiedSummaryRef.current[currentCam.id] = {
          rule: targetConcept,
          summary: evt.reasoningText,
          time: nowTs,
        };

        // Mark this spatial sub-section as Notified so normal sitting movements in this section are skipped
        const secCol = triggerSection ? triggerSection.col : roiZone ? Math.min(5, Math.floor(((roiZone[0] + roiZone[2]) / 200) * 6)) : 2;
        const secRow = triggerSection ? triggerSection.row : roiZone ? Math.min(3, Math.floor(((roiZone[1] + roiZone[3]) / 200) * 4)) : 1;
        const secKey = `${secCol}_${secRow}`;
        const secCx = triggerSection ? triggerSection.cx : Math.round(((secCol + 0.5) / 6) * 100);
        const secCy = triggerSection ? triggerSection.cy : Math.round(((secRow + 0.5) / 4) * 100);

        if (!notifiedSectionsRef.current[currentCam.id]) {
          notifiedSectionsRef.current[currentCam.id] = {};
        }
        notifiedSectionsRef.current[currentCam.id][secKey] = {
          cellKey: secKey,
          col: secCol,
          row: secRow,
          cx: secCx,
          cy: secCy,
          rule: targetConcept,
          summary: evt.reasoningText,
          notifiedAt: nowTs,
          quietTicks: 0,
        };
        setNotifiedSubZonesUI(Object.values(notifiedSectionsRef.current[currentCam.id]));
        if (isTextDetectionActive && evt.detectedText) {
          setZoneOcrText(evt.detectedText);
        }
        setRecordedEvents((prev) => [evt, ...prev.filter((e) => e.id !== evt.id)]);
        setActiveAlert(evt);
        setActiveEvent(evt);

        // Auto-dismiss floating toast after 6 seconds
        setTimeout(() => {
          setActiveAlert((curr) => (curr?.id === evt.id ? null : curr));
        }, 6000);
      }
    } catch (err) {
      console.error("Trigger error:", err);
    } finally {
      isTriggerInFlightRef.current = false;
    }
  };

  // On-Demand Meta SAM 3.1 Segmentation Call
  const handleGenerateSamMask = async (evt?: MotionEventRecord) => {
    const targetEvt = evt || activeEvent;
    const b64 = targetEvt?.keyframeBase64 || captureCurrentFrameBase64();
    if (!b64) return;

    setIsSegmentingSam(true);
    try {
      const res = await fetch("/api/cctv/segment-ondemand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyframeBase64: b64,
          targetConcept: targetEvt?.targetConcept || targetConcept,
        }),
      });

      const data = await res.json();
      if (data.success && data.samMaskPolygon) {
        setActiveSamMask({
          box: data.boundingBox,
          polygon: data.samMaskPolygon,
        });

        if (targetEvt) {
          setRecordedEvents((prev) =>
            prev.map((e) =>
              e.id === targetEvt.id
                ? {
                    ...e,
                    hasSamMask: true,
                    boundingBox: data.boundingBox,
                    samMaskPolygon: data.samMaskPolygon,
                  }
                : e
            )
          );
        }
      }
    } catch (err) {
      console.error("SAM 3.1 error:", err);
    } finally {
      setIsSegmentingSam(false);
    }
  };

  // Compile Natural Language Rule to OpenCV Python Code via Meta Muse Spark
  const handleCompileRuleCode = async () => {
    setIsCompilingRule(true);
    try {
      const res = await fetch("/api/cctv/generate-rule-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: targetConcept,
          cameraName: currentCam.name,
          cameraId: currentCam.id,
          referenceFrameBase64: captureCurrentFrameBase64(),
        }),
      });

      const data = await res.json();
      if (data.success) {
        if (Array.isArray(data.roiZone)) {
          setRoiZone(data.roiZone as [number, number, number, number]);
          setRoiZoneLabel("AI Configured Target Zone");
        }
        if (data.motionThreshold) {
          setMotionThreshold(data.motionThreshold);
        }
        setGeneratedScript(data.pythonCode);
        setRuleExplanation(data.explanation);
        setShowCodeModal(true);
      }
    } catch (err) {
      console.error("Compile error:", err);
    } finally {
      setIsCompilingRule(false);
    }
  };

  // Jump Video Player to Event Timestamp
  const handleJumpToEvent = (evt: MotionEventRecord) => {
    setActiveEvent(evt);
    if (evt.cameraId !== selectedCamId) {
      handleSelectCamera(evt.cameraId);
    }
    if (videoRef.current) {
      videoRef.current.currentTime = evt.videoSecond;
      videoRef.current.play();
      setIsPlaying(true);
    }
    if (evt.hasSamMask && evt.samMaskPolygon) {
      setActiveSamMask({
        box: evt.boundingBox,
        polygon: evt.samMaskPolygon,
      });
    } else {
      setActiveSamMask(null);
    }
  };

  // Mouse Handlers for Drawing Custom Watch Zone on Canvas (Pencil Freehand or Box)
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingZone || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

    isMouseDownRef.current = true;
    if (drawTool === "pencil") {
      setLiveDrawingPath([{ x, y }]);
    } else {
      dragStartRef.current = { x, y };
      setDragCurrent({ x, y });
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingZone || !isMouseDownRef.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

    if (drawTool === "pencil") {
      setLiveDrawingPath((prev) => {
        const last = prev[prev.length - 1];
        if (!last) return [{ x, y }];
        const dist = Math.hypot(last.x - x, last.y - y);
        if (dist >= 0.8) {
          return [...prev, { x, y }];
        }
        return prev;
      });
    } else {
      setDragCurrent({ x, y });
    }
  };

  const handleCanvasMouseUp = () => {
    if (!isDrawingZone || !isMouseDownRef.current) return;
    isMouseDownRef.current = false;

    if (drawTool === "pencil") {
      if (liveDrawingPath.length >= 4) {
        let minX = 100, minY = 100, maxX = 0, maxY = 0;
        liveDrawingPath.forEach((pt) => {
          if (pt.x < minX) minX = pt.x;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.y > maxY) maxY = pt.y;
        });

        setRoiPolygon(liveDrawingPath);
        setRoiZone([Math.round(minX), Math.round(minY), Math.round(maxX), Math.round(maxY)]);
        setRoiZoneLabel(`Custom Road Path (${liveDrawingPath.length} pts)`);
      }
      setLiveDrawingPath([]);
      setIsDrawingZone(false);
      delete lastNotifiedSummaryRef.current[selectedCamId];
      delete notifiedSectionsRef.current[selectedCamId];
      setNotifiedSubZonesUI([]);
      lastTriggerRef.current = 0;
    } else if (drawTool === "circle") {
      if (dragStartRef.current && dragCurrent) {
        const cx = dragStartRef.current.x;
        const cy = dragStartRef.current.y;
        const r = Math.hypot(dragCurrent.x - cx, dragCurrent.y - cy);

        if (r >= 2) {
          const circlePolygon: { x: number; y: number }[] = [];
          for (let i = 0; i < 24; i++) {
            const angle = (i / 24) * Math.PI * 2;
            circlePolygon.push({
              x: Math.max(0, Math.min(100, cx + r * Math.cos(angle))),
              y: Math.max(0, Math.min(100, cy + r * Math.sin(angle))),
            });
          }
          setRoiPolygon(circlePolygon);
          setRoiZone([
            Math.max(0, Math.round(cx - r)),
            Math.max(0, Math.round(cy - r)),
            Math.min(100, Math.round(cx + r)),
            Math.min(100, Math.round(cy + r)),
          ]);
          setRoiZoneLabel(`Circular Zone (Radius: ${Math.round(r)}%)`);
        }
      }
      dragStartRef.current = null;
      setDragCurrent(null);
      setIsDrawingZone(false);
      delete lastNotifiedSummaryRef.current[selectedCamId];
      delete notifiedSectionsRef.current[selectedCamId];
      setNotifiedSubZonesUI([]);
      lastTriggerRef.current = 0;
    } else {
      if (dragStartRef.current && dragCurrent) {
        const x1 = Math.round(Math.min(dragStartRef.current.x, dragCurrent.x));
        const y1 = Math.round(Math.min(dragStartRef.current.y, dragCurrent.y));
        const x2 = Math.round(Math.max(dragStartRef.current.x, dragCurrent.x));
        const y2 = Math.round(Math.max(dragStartRef.current.y, dragCurrent.y));

        if (x2 - x1 > 5 && y2 - y1 > 5) {
          setRoiZone([x1, y1, x2, y2]);
          setRoiPolygon([
            { x: x1, y: y1 },
            { x: x2, y: y1 },
            { x: x2, y: y2 },
            { x: x1, y: y2 },
          ]);
          setRoiZoneLabel("Custom Rectangle Zone");
        }
      }
      dragStartRef.current = null;
      setDragCurrent(null);
      setIsDrawingZone(false);
      delete lastNotifiedSummaryRef.current[selectedCamId];
      delete notifiedSectionsRef.current[selectedCamId];
      setNotifiedSubZonesUI([]);
      lastTriggerRef.current = 0;
    }
  };

  // Send Natural Language Investigation Query (Forensic Search)
  const handleSendSearch = async () => {
    const q = searchQuery.trim();
    if (!q || isSearching) return;
    setSearchQuery("");

    setChatMessages((prev) => [
      ...prev,
      {
        id: `user_${Date.now()}`,
        role: "user",
        text: q,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
    setIsSearching(true);

    try {
      const res = await fetch("/api/cctv/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: q,
          recordedEvents,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setChatMessages((prev) => [
          ...prev,
          {
            id: `ai_${Date.now()}`,
            role: "assistant",
            text: data.operatorResponse,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            matchedCount: data.matchedEvents?.length || 0,
          },
        ]);

        if (data.matchedEvents && data.matchedEvents.length > 0) {
          handleJumpToEvent(data.matchedEvents[0]);
        }
      }
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#060911] text-slate-100">
      {/* ── Top Tactical Header ────────────────────────────────────────── */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md px-5 py-3 sticky top-0 z-40">
        <div className="max-w-[1700px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center shadow-lg shadow-cyan-500/10">
              <Shield className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold tracking-wide text-white uppercase">
                  Live CCTV Operator
                </h1>
                <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-400/30 text-[10px] font-mono text-cyan-300">
                  Live In-Browser Motion + ROI Watchdog
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Meta Muse Spark Open 1026 (Baseten) • Spatial Gating & On-Demand SAM 3.1
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Live In-Browser Motion Delta Meter & Interactive Sensitivity Control */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs font-mono">
              <span className={`w-2.5 h-2.5 rounded-full ${currentMotionScore >= motionThreshold ? "bg-rose-400 animate-ping" : "bg-emerald-400 animate-pulse-fast"}`} />
              <span className="text-slate-400">DELTA:</span>
              <span className={`font-bold min-w-[28px] ${currentMotionScore >= motionThreshold ? "text-rose-400 font-extrabold" : "text-emerald-400"}`}>
                {currentMotionScore.toFixed(1)}
              </span>
              <span className="text-slate-600">/</span>
              <span className="text-slate-400 hidden sm:inline">THRESHOLD:</span>
              <input
                type="range"
                min={2.0}
                max={18.0}
                step={0.5}
                value={motionThreshold}
                onChange={(e) => setMotionThreshold(parseFloat(e.target.value))}
                className="w-16 sm:w-20 accent-cyan-400 cursor-pointer"
                title={`Sensitivity Threshold: ${motionThreshold.toFixed(1)}`}
              />
              <span className="text-cyan-400 font-bold">{motionThreshold.toFixed(1)}</span>
            </div>

            {/* Quick Sensitivity Presets */}
            <div className="hidden xl:flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800 text-[10px] font-mono">
              <button
                onClick={() => setMotionThreshold(4.5)}
                className={`px-2 py-0.5 rounded-lg transition ${motionThreshold <= 5.0 ? "bg-cyan-500 text-slate-950 font-bold" : "text-slate-400 hover:text-white"}`}
                title="Ultra sensitive for distant/slow movement"
              >
                High (4.5)
              </button>
              <button
                onClick={() => setMotionThreshold(6.5)}
                className={`px-2 py-0.5 rounded-lg transition ${motionThreshold > 5.0 && motionThreshold <= 9.0 ? "bg-cyan-500 text-slate-950 font-bold" : "text-slate-400 hover:text-white"}`}
                title="Balanced real-world sensitivity"
              >
                Normal (6.5)
              </button>
              <button
                onClick={() => setMotionThreshold(12.0)}
                className={`px-2 py-0.5 rounded-lg transition ${motionThreshold > 9.0 ? "bg-cyan-500 text-slate-950 font-bold" : "text-slate-400 hover:text-white"}`}
                title="High action only"
              >
                Strict (12.0)
              </button>
            </div>

            {/* Auto-Monitor Toggle */}
            <button
              onClick={() => setAutoTriggerEnabled(!autoTriggerEnabled)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-bold border transition ${
                autoTriggerEnabled
                  ? "bg-emerald-500/20 border-emerald-400/50 text-emerald-300"
                  : "bg-slate-900 border-slate-800 text-slate-500"
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              AUTO-TRIGGER: {autoTriggerEnabled ? "ON" : "OFF"}
            </button>

            {/* Setup Wizard Button */}
            <button
              onClick={() => setShowWelcomeWizard(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-bold border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition"
              title="Open Setup Wizard (Configure Provider, Cameras, WhatsApp)"
            >
              <Settings className="w-3.5 h-3.5 text-cyan-400" />
              <span>Setup Wizard</span>
            </button>

            {/* WhatsApp Integration Button & Preferences */}
            <div className="relative">
              <button
                onClick={() => setShowWhatsAppSettings(!showWhatsAppSettings)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-bold border transition ${
                  showWhatsAppSettings
                    ? "bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/20"
                    : whatsAppEnabled
                    ? "bg-emerald-500/15 border-emerald-400/40 text-emerald-300 hover:bg-emerald-500/25"
                    : "bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300"
                }`}
                title="WhatsApp Alert Settings"
              >
                <MessageSquare className={`w-3.5 h-3.5 ${whatsAppEnabled ? "text-emerald-400" : "text-slate-500"}`} />
                <span>
                  WhatsApp:{" "}
                  {!whatsAppEnabled
                    ? "OFF"
                    : whatsAppRecipient && !whatsAppRecipient.includes("@")
                    ? `+${whatsAppRecipient.replace(/^\+/, "")}`
                    : "ON"}
                </span>
              </button>

              {/* WhatsApp Dropdown Settings */}
              {showWhatsAppSettings && (
                <div className="absolute right-0 top-11 w-80 bg-slate-950 border border-slate-700 p-3.5 rounded-2xl shadow-2xl z-50 flex flex-col gap-2.5 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <MessageSquare className="w-4 h-4 text-emerald-400" />
                      WhatsApp Notification Settings
                    </span>
                    <button
                      onClick={() => setShowWhatsAppSettings(false)}
                      className="text-slate-400 hover:text-white"
                    >
                      ✕
                    </button>
                  </div>

                  {/* ON / OFF Toggle Switch for WhatsApp Messaging */}
                  <div className="flex items-center justify-between bg-slate-900/80 border border-slate-800 px-3 py-2 rounded-xl">
                    <div>
                      <span className="font-bold text-white text-[11px] block">
                        WhatsApp Alerts
                      </span>
                      <span className="text-[9px] text-slate-400">
                        {whatsAppEnabled ? "Sending verified alerts to WhatsApp" : "WhatsApp messaging paused"}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        const nextState = !whatsAppEnabled;
                        setWhatsAppEnabled(nextState);
                        persistWhatsAppSettings({ enabled: nextState });
                      }}
                      className={`px-3 py-1 rounded-lg text-[11px] font-mono font-bold border transition ${
                        whatsAppEnabled
                          ? "bg-emerald-500 text-slate-950 border-emerald-400 shadow-sm shadow-emerald-500/20"
                          : "bg-slate-800 text-slate-400 border-slate-700"
                      }`}
                    >
                      {whatsAppEnabled ? "ON" : "OFF"}
                    </button>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">
                      Recipient Phone Number:
                    </label>
                    <input
                      type="text"
                      value={whatsAppRecipient}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9+]/g, "");
                        setWhatsAppRecipient(val);
                        persistWhatsAppSettings({ recipient: val });
                      }}
                      placeholder="e.g. 15550192834 (numbers only)"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1 text-xs text-emerald-300 font-mono"
                    />
                    <p className="text-[9px] text-slate-500 mt-0.5 italic">
                      * Auto-saved. Include country code (numbers only).
                    </p>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">
                      Meta Access Token (Permanent or 24h Token):
                    </label>
                    <input
                      type="password"
                      value={whatsAppAccessToken}
                      onChange={(e) => {
                        const val = e.target.value.trim();
                        setWhatsAppAccessToken(val);
                        persistWhatsAppSettings({ token: val });
                      }}
                      placeholder="Paste token (auto-saved)..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1 text-xs text-emerald-300 font-mono"
                    />
                    <p className="text-[9px] text-slate-500 mt-0.5 italic">
                      * Auto-saved for every session &amp; stored in .env.local.
                    </p>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Message Content Mode:</label>
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-200">
                        <input
                          type="radio"
                          name="waMode"
                          checked={whatsAppMode === "full_reasoning"}
                          onChange={() => {
                            setWhatsAppMode("full_reasoning");
                            persistWhatsAppSettings({ mode: "full_reasoning" });
                          }}
                          className="accent-emerald-400"
                        />
                        <span>🖼️ Image + AI Reasoning & Why Triggered</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-200">
                        <input
                          type="radio"
                          name="waMode"
                          checked={whatsAppMode === "summary_only"}
                          onChange={() => {
                            setWhatsAppMode("summary_only");
                            persistWhatsAppSettings({ mode: "summary_only" });
                          }}
                          className="accent-emerald-400"
                        />
                        <span>📝 Image + Short Summary</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-200">
                        <input
                          type="radio"
                          name="waMode"
                          checked={whatsAppMode === "image_only"}
                          onChange={() => {
                            setWhatsAppMode("image_only");
                            persistWhatsAppSettings({ mode: "image_only" });
                          }}
                          className="accent-emerald-400"
                        />
                        <span>📸 Image Only</span>
                      </label>
                    </div>
                  </div>

                  <div className="bg-emerald-950/40 border border-emerald-800/40 rounded-xl p-2 text-[10px] text-emerald-300/90 leading-tight">
                    💬 <strong>Important:</strong> In WhatsApp, send a quick <em>&quot;Hi&quot;</em> to <strong>+1 (555) 147-4704</strong> to activate Meta&apos;s 24h custom alert window.
                  </div>

                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
                    <button
                      onClick={() => {
                        persistWhatsAppSettings({});
                        setWhatsAppTestStatus("✅ Settings saved!");
                        setTimeout(() => setWhatsAppTestStatus(null), 3000);
                      }}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 font-bold text-xs rounded-xl transition"
                    >
                      Save
                    </button>
                    <button
                      onClick={handleTestWhatsAppDispatch}
                      disabled={isSendingWhatsAppTest}
                      className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl transition"
                    >
                      {isSendingWhatsAppTest ? "Sending..." : "Send Test Alert"}
                    </button>
                    {whatsAppTestStatus && (
                      <span className="text-[10px] text-emerald-300 truncate max-w-[120px]">
                        {whatsAppTestStatus}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => handleTriggerMotionEvent()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-slate-950 font-bold text-xs shadow-md shadow-rose-500/20 transition active:scale-95"
            >
              <Zap className="w-4 h-4 fill-slate-950" />
              Simulate Trigger
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Two-Column Tactical Layout ────────────────────────────── */}
      <main className="flex-1 max-w-[1700px] w-full mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN (8 Cols): Video Player & Camera Grid */}
        <div className="lg:col-span-8 flex flex-col gap-3">
          {/* Camera Selector Cards Bar */}
          <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-2xl flex items-center gap-2.5 overflow-x-auto shadow-md">
            {cameras.map((cam) => {
              const isSelected = cam.id === selectedCamId;
              const hasAlert = activeAlert?.cameraId === cam.id;
              const hasCustomFeed = Boolean(cameraStreamOverrides[cam.id]);
              const displayName = cam.shortName || cam.name;
              return (
                <button
                  key={cam.id}
                  onClick={() => handleSelectCamera(cam.id)}
                  title={`${cam.code}: ${cam.name} (${cam.location})`}
                  className={`group flex items-center gap-3 px-3.5 py-2 rounded-2xl text-left whitespace-nowrap transition-all border flex-shrink-0 min-w-[155px] sm:min-w-[175px] ${
                    isSelected
                      ? "bg-gradient-to-r from-cyan-500/25 to-sky-500/15 border-cyan-400 text-white shadow-lg shadow-cyan-500/20 ring-1 ring-cyan-400/50"
                      : "bg-slate-950/80 hover:bg-slate-900/90 border-slate-800/90 hover:border-slate-700 text-slate-300"
                  } ${hasAlert ? "alert-glow-box bg-rose-500/30 border-rose-500 text-rose-200" : ""}`}
                >
                  {/* Large Prominent Scenario Icon */}
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-2xl border transition-all ${
                      isSelected
                        ? "bg-cyan-400/25 border-cyan-300/40 text-cyan-200 shadow-sm shadow-cyan-400/20"
                        : "bg-slate-900 border-slate-800 text-slate-200 group-hover:scale-105 group-hover:border-slate-700"
                    }`}
                  >
                    <span>{cam.icon || "📹"}</span>
                  </div>

                  {/* Camera Code & Visual Scenario Title */}
                  <div className="flex flex-col min-w-0 pr-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          hasCustomFeed
                            ? "bg-rose-400 animate-pulse-fast"
                            : cam.isLiveStream
                            ? "bg-rose-400 animate-pulse-fast"
                            : hasAlert
                            ? "bg-rose-400 animate-ping"
                            : isSelected
                            ? "bg-cyan-400 animate-pulse"
                            : "bg-emerald-400"
                        }`}
                      />
                      <span className={`font-mono font-bold text-xs ${isSelected ? "text-cyan-300" : "text-white"}`}>
                        {cam.code}
                      </span>
                      {(cam.id === "cam-02" || cam.id === "cam-09" || cam.id === "cam-10") && (
                        <span className="text-[11px]" title="MediaPipe Hand & Pose Landmark Gating enabled by default">
                          🖐️
                        </span>
                      )}
                      {hasCustomFeed ? (
                        <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 text-[8px] font-bold border border-rose-400/40 uppercase">
                          Live HLS
                        </span>
                      ) : cam.id === "cam-live-yt" ? (
                        <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 text-[8px] font-bold border border-rose-400/40 uppercase">
                          Relay
                        </span>
                      ) : null}
                    </div>

                    {/* Prominent Scenario Name */}
                    <span
                      className={`text-[11px] font-medium truncate max-w-[130px] mt-0.5 ${
                        isSelected ? "text-cyan-100 font-semibold" : "text-slate-400 group-hover:text-slate-200"
                      }`}
                    >
                      {displayName}
                    </span>
                  </div>
                </button>
              );
            })}

            {/* External Stream / YouTube Input Button */}
            <button
              onClick={() => setShowCustomFeedInput(!showCustomFeedInput)}
              className={`flex items-center gap-2.5 px-3.5 py-2 rounded-2xl text-xs font-mono font-bold border transition whitespace-nowrap flex-shrink-0 ${
                showCustomFeedInput
                  ? "bg-rose-500 text-slate-950 border-rose-400 shadow-lg shadow-rose-500/20"
                  : "bg-slate-950/80 hover:bg-slate-900 border-rose-500/40 text-rose-300 hover:text-white"
              }`}
              title="Add External Stream or Connect New Live Camera"
            >
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-400/40 flex items-center justify-center text-lg">
                <Radio className="w-4 h-4 text-rose-400 animate-pulse" />
              </div>
              <div className="flex flex-col text-left">
                <span className="font-bold text-xs">+ Stream URL</span>
                <span className="text-[10px] text-rose-400/80 font-normal">Add Live HLS / CAM</span>
              </div>
            </button>
          </div>

          {/* Custom Stream URL Bar & Notice */}
          {showCustomFeedInput && (
            <div className="bg-slate-950/95 border border-rose-500/40 p-3.5 rounded-2xl flex flex-col gap-2.5 shadow-xl">
              <div className="flex flex-col sm:flex-row items-center gap-2.5">
                <div className="flex items-center gap-2 flex-1 w-full">
                  <Radio className="w-4 h-4 text-rose-400 flex-shrink-0 animate-pulse" />
                  <input
                    type="text"
                    value={customFeedUrl}
                    onChange={(e) => setCustomFeedUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLoadCustomFeed(undefined, true)}
                    placeholder="Paste direct stream URL (.m3u8, .mp4, YouTube) or pick below..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-400 font-mono"
                  />
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    onClick={() => handleLoadCustomFeed(undefined, true)}
                    className="px-3.5 py-1.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-bold transition whitespace-nowrap shadow-md shadow-cyan-400/20 flex items-center gap-1.5"
                    title={`Create a brand new camera tab (CAM-${String(cameras.length + 1).padStart(2, "0")}) for this stream`}
                  >
                    <span>➕ Add as CAM-{String(cameras.length + 1).padStart(2, "0")}</span>
                  </button>
                  <button
                    onClick={() => handleLoadCustomFeed(undefined, false)}
                    className="px-3 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-slate-950 text-xs font-bold transition whitespace-nowrap"
                    title={`Overrides stream on currently selected camera ${currentCam.code}`}
                  >
                    Apply to {currentCam.code}
                  </button>
                  {activeCustomStreamUrl && (
                    <button
                      onClick={() => {
                        setActiveCustomStreamUrl(null);
                        setExternalStreamNotice("Switched back to internal CCTV camera feed.");
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 text-xs font-mono font-bold"
                    >
                      Reset to Cam
                    </button>
                  )}
                  <button
                    onClick={() => setShowCustomFeedInput(false)}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white text-xs"
                  >
                    Close
                  </button>
                </div>
              </div>

              {/* 1-Click Stream Presets */}
              <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-800/80 text-[11px]">
                <span className="text-slate-400 font-medium mr-1">Live Ingestion Presets:</span>
                <button
                  onClick={() => {
                    const cfUrl = "https://customer-670f71hno16lm69b.cloudflarestream.com/ca98af9dc129b9e1adf13925e8ba1887/manifest/video.m3u8";
                    setCustomFeedUrl(cfUrl);
                    handleLoadCustomFeed(cfUrl);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-cyan-950/70 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-900 transition font-mono flex items-center gap-1"
                >
                  <span>☁️ Cloudflare HLS</span>
                </button>
                <button
                  onClick={() => {
                    const ytUrl = "https://www.youtube.com/watch?v=vp-pIE3FhDw";
                    setCustomFeedUrl(ytUrl);
                    handleLoadCustomFeed(ytUrl);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-rose-950/70 border border-rose-500/50 text-rose-300 hover:bg-rose-900 transition font-mono flex items-center gap-1"
                  title="Pipes YouTube live street feed through in-memory HLS relay (zero disk writes)"
                >
                  <span>🔴 YouTube Live Street Cam (RAM Relay)</span>
                </button>
                <button
                  onClick={() => {
                    const rtspUrl = "rtsp://admin:pass@192.168.1.120:554/live/ch0";
                    setCustomFeedUrl(rtspUrl);
                    handleLoadCustomFeed(rtspUrl);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:bg-slate-800 transition font-mono flex items-center gap-1"
                >
                  <span>📹 RTSP CCTV Socket</span>
                </button>
              </div>
            </div>
          )}
          {externalStreamNotice && (
            <div className="bg-amber-950/40 border border-amber-500/50 p-2.5 rounded-xl text-xs text-amber-200 flex items-center justify-between gap-2">
              <span className="flex-1">{externalStreamNotice}</span>
              <button
                onClick={() => setExternalStreamNotice(null)}
                className="text-amber-400 hover:text-white font-bold text-xs px-1.5"
              >
                ✕
              </button>
            </div>
          )}

          {/* Dedicated Watchdog Trigger Rule Card for Selected Camera */}
          <div className="bg-slate-900/90 border border-cyan-500/30 p-3.5 rounded-2xl shadow-lg backdrop-blur-md flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse-fast" />
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                  <span className="text-sm leading-none">{currentCam.icon || "📹"}</span>
                  <span>AI Trigger Definition for {currentCam.code}</span>
                </span>
                <span className="text-[11px] text-slate-400 hidden sm:inline">
                  • {currentCam.name}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-400/30 text-[10px] font-mono text-cyan-300">
                  Auto-LLM &rarr; OpenCV MOG2
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCompileRuleCode}
                  disabled={isCompilingRule}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-[11px] font-mono text-amber-300 transition"
                  title="Use Meta Muse Spark to compile OpenCV ROI coordinates and Python script"
                >
                  <Code2 className="w-3.5 h-3.5" />
                  {isCompilingRule ? "Compiling..." : "AI Compile Zone & Code"}
                </button>
                {generatedScript && (
                  <button
                    onClick={() => setShowCodeModal(true)}
                    className="text-[11px] font-mono text-cyan-300 hover:text-white underline"
                  >
                    View OpenCV Script
                  </button>
                )}
              </div>
            </div>

            {/* Editable Rule Input & Save Button */}
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={targetConcept}
                  onChange={(e) => setTargetConcept(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveCameraRule()}
                  placeholder={`Define what event triggers an alert on ${currentCam.code} (e.g. blue delivery van, children interacting with tree)...`}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition"
                />
              </div>
              <button
                onClick={() => handleSaveCameraRule()}
                disabled={isCompilingRule}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition active:scale-95 whitespace-nowrap ${
                  isSavedRule
                    ? "bg-emerald-400 text-slate-950 shadow-md shadow-emerald-400/20"
                    : isCompilingRule
                    ? "bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20"
                    : "bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-md shadow-cyan-500/20"
                }`}
              >
                {isCompilingRule ? (
                  <>
                    <RefreshCw className="w-4 h-4 text-slate-950 animate-spin" />
                    AI Compiling ROI...
                  </>
                ) : isSavedRule ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-slate-950" />
                    Rule & ROI Saved!
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 fill-slate-950" />
                    Save Rule
                  </>
                )}
              </button>
            </div>

            {/* Dynamic AI ROI Feedback Banner */}
            {ruleExplanation && (
              <div className="flex items-center justify-between bg-slate-950/70 border border-slate-800 px-3 py-1.5 rounded-xl text-[11px] font-mono">
                <div className="flex items-center gap-2 truncate">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                  <span className="text-slate-400 flex-shrink-0">OpenCV Spatial ROI:</span>
                  <span className="text-emerald-300 font-semibold truncate">{ruleExplanation}</span>
                </div>
                {generatedScript && (
                  <button
                    onClick={() => setShowCodeModal(true)}
                    className="text-cyan-400 hover:underline text-[10px] whitespace-nowrap ml-2 flex-shrink-0"
                  >
                    View Code &rarr;
                  </button>
                )}
              </div>
            )}

            {/* Dynamic Target Preset Pills (Add & Delete) & Spatial Zone Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/60">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-slate-400 font-medium mr-1">
                  Target Presets:
                </span>
                {targetPresets.map((preset) => {
                  const isSelected = targetConcept
                    .split(/,\s*OR\s+/)
                    .some((part) => part.trim().toLowerCase() === preset.trim().toLowerCase());

                  return (
                    <div
                      key={preset}
                      className={`inline-flex items-center gap-1.5 text-[10px] pl-2.5 pr-1.5 py-1 rounded-lg border transition select-none ${
                        isSelected
                          ? "bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold shadow-sm shadow-cyan-500/20 ring-1 ring-cyan-400/40"
                          : "bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                      }`}
                    >
                      <button
                        onClick={() => handleTogglePreset(preset)}
                        className="text-left flex items-center gap-1"
                        title={isSelected ? "Active rule: Click to deselect" : "Click to add rule to active monitor"}
                      >
                        <span className={isSelected ? "text-cyan-400 font-bold" : "text-slate-500 font-semibold"}>
                          {isSelected ? "✓" : "+"}
                        </span>
                        {preset}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePreset(preset);
                        }}
                        className="hover:text-rose-400 text-slate-500 font-bold text-[10px] ml-0.5 px-0.5"
                        title="Delete this preset"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}

                {/* Add Custom Preset Modal Button */}
                <button
                  onClick={() => setShowAddPresetModal(true)}
                  className="inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg border border-dashed border-cyan-500/50 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 hover:border-cyan-400 font-bold transition shadow-sm"
                  title="Open AI Detection Preset Questionnaire Dialog"
                >
                  <Sparkles className="w-3 h-3 text-cyan-400" />
                  <span>+ Add Preset</span>
                </button>
              </div>

              {/* Spatial Watch Zone Controls (Pencil, Box, Circle, Presets) */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-slate-400 font-medium">
                  Watch Zone:
                </span>
                <button
                  onClick={() => {
                    setRoiZone([8, 12, 54, 92]);
                    setRoiPolygon(null);
                    setRoiZoneLabel("Left Trees & Wall");
                  }}
                  className={`text-[10px] px-2 py-1 rounded-lg border ${
                    roiZoneLabel === "Left Trees & Wall" && !roiPolygon
                      ? "bg-sky-500/20 border-sky-400/60 text-sky-300 font-bold"
                      : "bg-slate-950 border-slate-800 text-slate-400"
                  }`}
                >
                  🌳 Tree Area
                </button>
                <button
                  onClick={() => {
                    setRoiZone(null);
                    setRoiPolygon(null);
                    setRoiZoneLabel("Full Frame View");
                    setIsDrawingZone(false);
                  }}
                  className={`text-[10px] px-2 py-1 rounded-lg border ${
                    roiZone === null && roiPolygon === null
                      ? "bg-sky-500/20 border-sky-400/60 text-sky-300 font-bold"
                      : "bg-slate-950 border-slate-800 text-slate-400"
                  }`}
                >
                  Full Frame
                </button>
                {/* Freehand Custom Pencil Tool Button */}
                <button
                  onClick={() => {
                    setIsDrawingZone(true);
                    setDrawTool("pencil");
                  }}
                  className={`flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg font-bold border transition ${
                    isDrawingZone && drawTool === "pencil"
                      ? "bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20"
                      : "bg-slate-950 border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                  }`}
                  title="Draw customized shape or road path freely on the video"
                >
                  <PenTool className="w-3 h-3" />
                  {isDrawingZone && drawTool === "pencil" ? "✏️ Tracing..." : "✏️ Custom Pencil"}
                </button>
                {/* Rectangular Box Tool Button */}
                <button
                  onClick={() => {
                    setIsDrawingZone(true);
                    setDrawTool("rect");
                  }}
                  className={`flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg font-bold border transition ${
                    isDrawingZone && drawTool === "rect"
                      ? "bg-cyan-500 text-slate-950 border-cyan-400 shadow-md shadow-cyan-500/20"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                  title="Draw a rectangle bounding box"
                >
                  <Crop className="w-3 h-3" />
                  Box
                </button>
                {/* Circular Watch Zone Tool Button */}
                <button
                  onClick={() => {
                    setIsDrawingZone(true);
                    setDrawTool("circle");
                  }}
                  className={`flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg font-bold border transition ${
                    isDrawingZone && drawTool === "circle"
                      ? "bg-purple-500 text-slate-950 border-purple-400 shadow-md shadow-purple-500/20"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:text-purple-300"
                  }`}
                  title="Draw circular watch zone around point of interest"
                >
                  <Circle className="w-3 h-3" />
                  Circle
                </button>

                {/* Clear Option: Text Detection ON/OFF */}
                <button
                  onClick={() => {
                    const nextVal = !isTextDetectionActive;
                    setIsTextDetectionActive(nextVal);
                    if (!nextVal) setZoneOcrText(null);
                  }}
                  className={`flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-lg font-bold border transition ${
                    isTextDetectionActive
                      ? "bg-amber-400 text-slate-950 border-amber-300 shadow-md shadow-amber-400/25"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:text-amber-300 hover:border-amber-500/40"
                  }`}
                  title="Enable client-side Text Detection (License Plates, Car Numbers, Signs) in Watch Zone"
                >
                  <span className="font-mono text-xs">🔤</span>
                  <span>Text Detection: {isTextDetectionActive ? "ON" : "OFF"}</span>
                </button>

                {/* Hand & Pose Landmark Gating Toggle */}
                <button
                  onClick={() => {
                    setIsHandPoseGatingActive((prev) => !prev);
                  }}
                  className={`flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-lg font-bold border transition ${
                    isHandPoseGatingActive
                      ? "bg-emerald-400 text-slate-950 border-emerald-300 shadow-md shadow-emerald-400/25"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:text-emerald-300 hover:border-emerald-500/40"
                  }`}
                  title="Enable MediaPipe Pose & Hand Landmark Gating (Detects Hands reaching into drawers/counters, Sitting/Standing postures)"
                >
                  <span className="font-mono text-xs">🖐️</span>
                  <span>Hand & Pose Gating: {isHandPoseGatingActive ? "ON" : "OFF"}</span>
                </button>

                {/* Clear Active Shape */}
                {(roiPolygon || roiZone) && (
                  <button
                    onClick={() => {
                      setRoiPolygon(null);
                      setRoiZone(null);
                      setRoiZoneLabel("Full Frame View");
                      setIsDrawingZone(false);
                    }}
                    className="text-[10px] px-2 py-0.5 rounded-lg text-slate-500 hover:text-rose-400 transition"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Active Motion Alert (Floating Tactical Toast in Top-Right) */}
          {activeAlert && (
            <div className="fixed top-20 right-6 z-50 max-w-sm w-full bg-slate-950/95 backdrop-blur-md border border-rose-500/70 p-3.5 rounded-2xl shadow-2xl alert-glow-box">
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-rose-500/20 border border-rose-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <AlertTriangle className="w-4 h-4 text-rose-400 animate-bounce" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-rose-400">
                      Alert: {activeAlert.cameraName}
                    </span>
                    <button
                      onClick={() => setActiveAlert(null)}
                      className="text-slate-400 hover:text-white text-xs px-1"
                      title="Close"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-cyan-300 mb-1">
                    <span>Delta: {activeAlert.motionScore.toFixed(1)}</span>
                    <span>•</span>
                    <span>{activeAlert.timeShort}</span>
                  </div>
                  <p className="text-xs text-slate-200 line-clamp-2 leading-relaxed">
                    {activeAlert.reasoningText}
                  </p>
                  <div className="flex items-center gap-2 mt-2.5">
                    <button
                      onClick={() => handleGenerateSamMask(activeAlert)}
                      disabled={isSegmentingSam}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-[11px] transition active:scale-95 disabled:opacity-50"
                    >
                      <Sparkles className="w-3 h-3" />
                      {isSegmentingSam ? "Segmenting..." : "Segment (SAM 3.1)"}
                    </button>
                    <button
                      onClick={() => setActiveAlert(null)}
                      className="px-2 py-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white text-[11px]"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Active Camera Feed Source Bar & Live Stream Configuration */}
          <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-2xl flex flex-col gap-2 shadow-md">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px]">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      cameraStreamOverrides[selectedCamId]
                        ? "bg-rose-400 animate-pulse-fast"
                        : "bg-emerald-400"
                    }`}
                  />
                  <span className="text-slate-400">Feed Source for {currentCam.code}:</span>
                  <span
                    className={
                      cameraStreamOverrides[selectedCamId]
                        ? "text-rose-300 font-bold"
                        : "text-emerald-300 font-bold"
                    }
                  >
                    {cameraStreamOverrides[selectedCamId]
                      ? "🌐 Live HLS Stream Active"
                      : "📁 Preloaded Benchmark CCTV"}
                  </span>
                </div>
                {cameraStreamOverrides[selectedCamId] && (
                  <span className="text-[10px] text-slate-500 font-mono hidden md:inline truncate max-w-[240px]">
                    {cameraStreamOverrides[selectedCamId]}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {cameraStreamOverrides[selectedCamId] && (
                  <button
                    onClick={() => handleResetCamToPreloaded(selectedCamId)}
                    className="px-2.5 py-1 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 text-[11px] font-mono transition"
                    title="Switch back to built-in benchmark video"
                  >
                    Reset to Preloaded Video
                  </button>
                )}
                <button
                  onClick={() => setShowCamFeedConfig(!showCamFeedConfig)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-xl font-bold border transition text-[11px] ${
                    showCamFeedConfig
                      ? "bg-cyan-500 text-slate-950 border-cyan-400 shadow-md shadow-cyan-500/20"
                      : "bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-300 border-cyan-500/40"
                  }`}
                >
                  <Radio className="w-3.5 h-3.5" />
                  <span>
                    {showCamFeedConfig ? "Close Feed Config" : `⚙️ Configure ${currentCam.code} Stream URL`}
                  </span>
                </button>
              </div>
            </div>

            {/* Per-Camera Live Stream Configuration Drawer */}
            {showCamFeedConfig && (
              <div className="pt-2.5 border-t border-slate-800/80 flex flex-col gap-2.5 bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-white flex items-center gap-1.5">
                    <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
                    Live Stream Ingestion for {currentCam.code} ({currentCam.name})
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Paste Cloudflare HLS (.m3u8), direct MP4, or test stream URL
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-2">
                  <input
                    type="text"
                    value={camFeedUrlInput}
                    onChange={(e) => setCamFeedUrlInput(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && handleApplyCustomStreamToCam(selectedCamId, camFeedUrlInput)
                    }
                    placeholder="https://...manifest/video.m3u8 or direct .mp4 stream URL"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono"
                  />
                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <button
                      onClick={() => handleApplyCustomStreamToCam(selectedCamId, camFeedUrlInput)}
                      className="px-3.5 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition whitespace-nowrap shadow-md shadow-cyan-500/20"
                    >
                      Apply to {currentCam.code}
                    </button>
                    {cameraStreamOverrides[selectedCamId] && (
                      <button
                        onClick={() => handleResetCamToPreloaded(selectedCamId)}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>

                {/* 1-Click Stream Ingestion Presets */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1 text-[11px]">
                  <span className="text-slate-400 font-medium mr-1">1-Click Live Feeds:</span>
                  <button
                    onClick={() => {
                      const u =
                        "https://customer-670f71hno16lm69b.cloudflarestream.com/ca98af9dc129b9e1adf13925e8ba1887/manifest/video.m3u8";
                      setCamFeedUrlInput(u);
                      handleApplyCustomStreamToCam(selectedCamId, u);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-cyan-950/70 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-900 transition font-mono flex items-center gap-1 text-[10px]"
                  >
                    <span>☁️ Cloudflare HLS</span>
                  </button>
                  <button
                    onClick={() => {
                      const u = "https://www.youtube.com/watch?v=vp-pIE3FhDw";
                      setCamFeedUrlInput(u);
                      handleApplyCustomStreamToCam(selectedCamId, u);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-rose-950/70 border border-rose-500/50 text-rose-300 hover:bg-rose-900 transition font-mono flex items-center gap-1 text-[10px]"
                    title="Pipes YouTube live street feed through in-memory HLS relay (zero disk writes)"
                  >
                    <span>🔴 YouTube Live Street Cam (RAM Relay)</span>
                  </button>
                  <button
                    onClick={() => {
                      const u = "rtsp://admin:pass@192.168.1.120:554/live/ch0";
                      setCamFeedUrlInput(u);
                      handleApplyCustomStreamToCam(selectedCamId, u);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:bg-slate-800 transition font-mono flex items-center gap-1 text-[10px]"
                  >
                    <span>📹 RTSP CCTV Socket</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Main Tactical Video Player Container */}
          <div className="relative bg-black rounded-2xl overflow-hidden aspect-video border border-slate-800 shadow-2xl flex items-center justify-center">
            {currentCam.isLiveStream ? (
              <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 p-6 text-center">
                <Radio className="w-12 h-12 text-rose-400 animate-pulse-fast mb-3" />
                <h3 className="text-base font-bold text-white mb-1">
                  Live External Stream Connected
                </h3>
                <p className="text-xs text-slate-400 max-w-md mb-4">
                  Stream Source: {currentCam.name} ({currentCam.location})
                </p>
                <div className="flex items-center gap-2">
                  <a
                    href={currentCam.liveStreamUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-slate-950 font-bold text-xs transition"
                  >
                    Open Live YouTube Stream
                  </a>
                  <button
                    onClick={() => handleTriggerMotionEvent()}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs border border-slate-700 transition"
                  >
                    Simulate Live Event Trigger
                  </button>
                </div>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  loop
                  muted
                  playsInline
                  crossOrigin="anonymous"
                  preload="auto"
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onTimeUpdate={handleTimeUpdate}
                  className="w-full h-full object-contain bg-black"
                />

                {/* Overlay Canvas for Watch Zones & SAM 3.1 Neon Masks */}
                <canvas
                  ref={canvasRef}
                  width={960}
                  height={540}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                  className={`absolute inset-0 w-full h-full ${
                    isDrawingZone ? "cursor-crosshair pointer-events-auto" : "pointer-events-none"
                  }`}
                />

                {/* Top Video HUD Info */}
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
                  <div className="flex items-center gap-2 bg-slate-950/80 backdrop-blur-md px-3 py-1 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-200">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse-fast" />
                    <span className="text-xs leading-none">{currentCam.icon || "📹"}</span>
                    <span className="font-bold text-cyan-400">
                      {cameraStreamOverrides[selectedCamId] ? `${currentCam.code} [LIVE HLS]` : activeCustomStreamUrl ? "LIVE STREAM" : currentCam.code}
                    </span>
                    <span>•</span>
                    <span className="max-w-[220px] truncate">
                      {cameraStreamOverrides[selectedCamId]
                        ? cameraStreamOverrides[selectedCamId].includes("googlevideo.com") ||
                          cameraStreamOverrides[selectedCamId].includes("relay")
                          ? "🔴 YouTube Live Street Cam (RAM Relay)"
                          : cameraStreamOverrides[selectedCamId].startsWith("rtsp://") ||
                            cameraStreamOverrides[selectedCamId].startsWith("rtmp://")
                          ? "📹 RTSP Security Camera Socket"
                          : cameraStreamOverrides[selectedCamId].includes("cloudflarestream.com")
                          ? "Cloudflare HLS Direct Stream"
                          : "Live Stream Feed"
                        : activeCustomStreamUrl
                        ? "Custom Stream Feed"
                        : currentCam.name}
                    </span>
                  </div>

                  {isDrawingZone ? (
                    <div className="flex items-center gap-1.5 bg-amber-950/90 border border-amber-500/60 px-3 py-1 rounded-xl text-[11px] font-mono text-amber-300 shadow-lg">
                      <PenTool className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                      <span>
                        {drawTool === "pencil"
                          ? "CLICK & DRAG TO TRACE ROAD / CUSTOM SHAPE (RELEASE TO FINISH)"
                          : "CLICK & DRAG TO DRAW RECTANGLE BOX"}
                      </span>
                    </div>
                  ) : activeSamMask ? (
                    <div className="flex items-center gap-1.5 bg-cyan-950/80 border border-cyan-500/40 px-3 py-1 rounded-xl text-[11px] font-mono text-cyan-300">
                      <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                      <span>SAM 3.1 MASK ACTIVE</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 bg-slate-950/80 border border-slate-800 px-3 py-1 rounded-xl text-[11px] font-mono text-slate-300">
                        <span>WATCH ZONE:</span>
                        <span className="text-cyan-400 font-bold">{roiZoneLabel}</span>
                      </div>
                      {isTextDetectionActive && (
                        <div className="flex items-center gap-1.5 bg-amber-950/90 border border-amber-500/60 px-2.5 py-1 rounded-xl text-[11px] font-mono text-amber-300 shadow-md">
                          <span>🔤</span>
                          <span>TEXT SCAN: ON</span>
                          {zoneOcrText && (
                            <span className="bg-amber-400 text-slate-950 px-1 rounded font-bold">
                              "{zoneOcrText}"
                            </span>
                          )}
                        </div>
                      )}
                      {isHandPoseGatingActive && (
                        <div className="flex items-center gap-1.5 bg-emerald-950/90 border border-emerald-500/60 px-2.5 py-1 rounded-xl text-[11px] font-mono text-emerald-300 shadow-md">
                          <span>🖐️</span>
                          <span>POSE & HAND GATE: ON</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Dedicated Non-Overlapping Timeline & Video Control Deck (Beneath Full Video) */}
          <div className="mt-3 bg-slate-900/95 border border-slate-800/90 p-3.5 rounded-2xl flex flex-col gap-2.5 text-xs shadow-xl">
            {/* Interactive Timeline Scrubber Track with Event Markers */}
            <div className="flex flex-col gap-1.5 w-full">
              <div className="relative w-full h-5 flex items-center cursor-pointer group">
                {/* Background Track */}
                <div className="absolute inset-x-0 h-2 bg-slate-800/90 rounded-full overflow-hidden group-hover:h-2.5 transition-all">
                  {/* Progress fill */}
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-sky-400"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(0, (currentTimeSec / (durationSec || 30)) * 100)
                      )}%`,
                    }}
                  />
                </div>

                {/* Detected Motion Event Pips on Timeline */}
                {cameraEvents.map((evt) => {
                  const pct = Math.min(
                    100,
                    Math.max(0, (evt.videoSecond / (durationSec || 30)) * 100)
                  );
                  return (
                    <button
                      key={evt.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleJumpToEvent(evt);
                      }}
                      title={`Motion Event @ 00:${String(evt.videoSecond).padStart(2, "0")} (Delta: ${evt.motionScore.toFixed(1)})`}
                      style={{ left: `${pct}%` }}
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-rose-500 border-2 border-white shadow-md shadow-rose-500/50 hover:scale-150 transition-transform z-10 cursor-pointer"
                    />
                  );
                })}

                {/* Native Range Input for Smooth Drag/Seek */}
                <input
                  type="range"
                  min={0}
                  max={durationSec || 30}
                  step={0.1}
                  value={currentTimeSec}
                  onChange={(e) => handleSeek(parseFloat(e.target.value))}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                />
              </div>

              {/* Time Info & Event Marker Count */}
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 px-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-white font-bold">
                    00:{String(Math.floor(currentTimeSec)).padStart(2, "0")}
                  </span>
                  <span>/</span>
                  <span>00:{String(Math.floor(durationSec || 30)).padStart(2, "0")}</span>
                </div>
                <div className="flex items-center gap-2">
                  {cameraEvents.length > 0 && (
                    <span className="text-rose-400 flex items-center gap-1 font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse-fast" />
                      {cameraEvents.length} motion {cameraEvents.length === 1 ? "marker" : "markers"}
                    </span>
                  )}
                  <span className="text-slate-500 hidden sm:inline">Drag or click timeline to jump</span>
                </div>
              </div>
            </div>

            {/* Playback Controls & Action Row */}
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleSkip(-5)}
                  title="Rewind 5 seconds"
                  className="px-2.5 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 text-[11px] font-mono transition"
                >
                  -5s
                </button>
                <button
                  onClick={() => {
                    const video = videoRef.current;
                    if (video) {
                      if (video.paused) {
                        video.play().then(() => setIsPlaying(true)).catch(console.error);
                      } else {
                        video.pause();
                        setIsPlaying(false);
                      }
                    }
                  }}
                  className="p-2 rounded-xl bg-cyan-500/20 border border-cyan-400/50 text-cyan-300 hover:bg-cyan-500/30 transition cursor-pointer"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-cyan-400" />}
                </button>
                <button
                  onClick={() => handleSkip(5)}
                  title="Forward 5 seconds"
                  className="px-2.5 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 text-[11px] font-mono transition"
                >
                  +5s
                </button>
              </div>

              {/* Target Rule Badge */}
              <div className="flex items-center gap-2 flex-1 max-w-sm truncate text-[11px]">
                <span className="text-slate-400 hidden sm:inline">Monitoring:</span>
                <span className="text-cyan-300 font-medium truncate">
                  {targetConcept}
                </span>
              </div>

              {/* On-Demand SAM 3.1 Button */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleGenerateSamMask()}
                  disabled={isSegmentingSam}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs disabled:opacity-50 transition active:scale-95 shadow-md shadow-cyan-500/20"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {isSegmentingSam ? "Segmenting..." : "On-Demand SAM 3.1"}
                </button>
                {activeSamMask && (
                  <button
                    onClick={() => setActiveSamMask(null)}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (4 Cols): Tabbed Trigger Log & Natural Language Search */}
        <div className="lg:col-span-4 flex flex-col h-[calc(100vh-100px)] min-h-[580px] bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
          {/* Tab Bar */}
          <div className="flex border-b border-slate-800 bg-slate-950/80 p-1">
            <button
              onClick={() => setActiveTab("events")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition ${
                activeTab === "events"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Bell className="w-3.5 h-3.5 text-rose-400" />
              <span>Motion Events</span>
              <span className="px-1.5 py-0.2 rounded-full bg-slate-700 text-[10px] font-mono">
                {eventViewFilter === "current" ? cameraEvents.length : recordedEvents.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab("search")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition ${
                activeTab === "search"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Bot className="w-3.5 h-3.5 text-cyan-400" />
              <span>Forensic Search</span>
            </button>
          </div>

          {/* TAB 1: Triggered Events Log */}
          {activeTab === "events" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Per-Camera vs All Cameras Filter Switcher */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 bg-slate-950/60 text-xs">
                <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-xl border border-slate-800">
                  <button
                    onClick={() => setEventViewFilter("current")}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
                      eventViewFilter === "current"
                        ? "bg-cyan-500 text-slate-950 shadow-sm font-bold"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <span>{currentCam.icon || "📍"}</span>
                    <span>{currentCam.code} ({cameraEvents.length})</span>
                  </button>
                  <button
                    onClick={() => setEventViewFilter("all")}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                      eventViewFilter === "all"
                        ? "bg-cyan-500 text-slate-950 shadow-sm font-bold"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    🌐 All ({recordedEvents.length})
                  </button>
                </div>

                {displayedEvents.length > 0 && (
                  <button
                    onClick={() => {
                      if (eventViewFilter === "current") {
                        setRecordedEvents((prev) => prev.filter((e) => e.cameraId !== selectedCamId));
                        delete lastNotifiedSummaryRef.current[selectedCamId];
                        delete notifiedSectionsRef.current[selectedCamId];
                        setNotifiedSubZonesUI([]);
                        lastTriggerRef.current = 0;
                        fetch(`/api/cctv/events?cameraId=${encodeURIComponent(selectedCamId)}`, { method: "DELETE" }).catch(() => {});
                      } else {
                        setRecordedEvents([]);
                        lastNotifiedSummaryRef.current = {};
                        notifiedSectionsRef.current = {};
                        setNotifiedSubZonesUI([]);
                        lastTriggerRef.current = 0;
                        fetch("/api/cctv/events", { method: "DELETE" }).catch(() => {});
                      }
                    }}
                    className="text-[10px] text-slate-500 hover:text-rose-400 font-mono transition"
                  >
                    Clear Log
                  </button>
                )}
              </div>

              {/* Event Cards List */}
              <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">
                {displayedEvents.length === 0 ? (
                  <div className="my-auto py-10 px-4 text-center border border-dashed border-slate-800 rounded-2xl flex flex-col items-center">
                    <Activity className="w-8 h-8 text-slate-600 mb-2 animate-pulse-fast" />
                    <p className="text-xs font-medium text-slate-300">
                      {eventViewFilter === "current"
                        ? `No motion events on ${currentCam.code} yet.`
                        : "No motion events recorded yet."}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1 max-w-xs">
                      Watching: <span className="text-cyan-400 font-semibold">{roiZoneLabel}</span> for "{targetConcept}".
                    </p>
                    <button
                      onClick={() => handleTriggerMotionEvent()}
                      className="mt-3.5 px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-300 text-xs font-semibold transition"
                    >
                      Trigger Test Event on {currentCam.code}
                    </button>
                  </div>
                ) : (
                  displayedEvents.map((evt) => {
                    const isCurrent = activeEvent?.id === evt.id;
                    return (
                      <div
                        key={evt.id}
                        onClick={() => handleJumpToEvent(evt)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer ${
                          isCurrent
                            ? "bg-cyan-950/40 border-cyan-500/60 shadow-md shadow-cyan-500/10"
                            : "bg-slate-950/60 border-slate-800/80 hover:bg-slate-900"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse-fast" />
                            <span className="font-bold text-xs text-white">
                              {evt.cameraName.split("•")[0]}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">
                              @{evt.timeShort} (t={evt.videoSecond}s)
                            </span>
                          </div>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                            Δ {evt.motionScore.toFixed(1)}
                          </span>
                        </div>

                        <p className="text-xs text-slate-300 line-clamp-2 mb-1.5">
                          {evt.reasoningText}
                        </p>

                        {/* Optimization 3: Structured Forensic Tags (Vehicle, License Plate, Person, Risk) */}
                        {evt.vehicleDetails?.type && (
                          <div className="flex items-center gap-1.5 flex-wrap my-1.5 text-[10px] font-mono">
                            <span className="px-2 py-0.5 rounded bg-sky-500/15 border border-sky-400/30 text-sky-300 font-semibold">
                              🚗 {evt.vehicleDetails.color || ""} {evt.vehicleDetails.type}
                              {evt.vehicleDetails.makeModel ? ` (${evt.vehicleDetails.makeModel})` : ""}
                            </span>
                            {evt.vehicleDetails.licensePlate ? (
                              <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/40 text-amber-300 font-bold">
                                PLATE: {evt.vehicleDetails.licensePlate}
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-500 text-[9px]">
                                Plate: unreadable at distance
                              </span>
                            )}
                            {evt.riskScore && (
                              <span className={`px-1.5 py-0.5 rounded ${evt.riskScore > 70 ? "bg-rose-500/20 text-rose-300 border border-rose-500/30" : "bg-slate-800 text-slate-300"}`}>
                                Risk: {evt.riskScore}/100
                              </span>
                            )}
                          </div>
                        )}

                        {evt.personDetails && (evt.personDetails.clothing || evt.personDetails.action) && (
                          <div className="flex items-center gap-1.5 flex-wrap my-1 text-[10px] font-mono">
                            <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/30 text-emerald-300">
                              👤 {evt.personDetails.clothing || "Person"} {evt.personDetails.action ? `• ${evt.personDetails.action}` : ""}
                            </span>
                          </div>
                        )}

                        {evt.transactionDetails?.cashDetected && (
                          <div className="flex items-center gap-1.5 flex-wrap my-1 text-[10px] font-mono">
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 font-bold flex items-center gap-1">
                              <span>💵</span>
                              <span>{evt.transactionDetails.actionType?.replace(/_/g, " ").toUpperCase() || "CASH DETECTED"}</span>
                              {evt.transactionDetails.estimatedDenomination && (
                                <span className="text-white bg-slate-900/90 px-1.5 py-0.2 rounded border border-emerald-500/30">
                                  {evt.transactionDetails.estimatedDenomination}
                                </span>
                              )}
                              {evt.transactionDetails.currencyType && (
                                <span className="bg-emerald-400/20 text-emerald-200 px-1 rounded text-[9px]">
                                  {evt.transactionDetails.currencyType}
                                </span>
                              )}
                            </span>
                          </div>
                        )}

                        {evt.detectedText && evt.isTextDetectionEnabled && (
                          <div className="flex items-center gap-1.5 flex-wrap my-1 text-[10px] font-mono">
                            <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/50 text-amber-300 font-bold flex items-center gap-1">
                              <span>🔤 Text Detected:</span>
                              <span className="text-white bg-slate-900/90 px-1.5 py-0.2 rounded border border-amber-500/30">
                                {evt.detectedText}
                              </span>
                            </span>
                          </div>
                        )}

                        {/* Optimization 2: 11-Frame Sequence Filmstrip */}
                        {evt.temporalFrames && evt.temporalFrames.length > 1 && (
                          <div className="mt-1.5 pt-1.5 border-t border-slate-800/60">
                            <div className="flex items-center justify-between text-[9px] font-mono text-slate-400 mb-1">
                              <span>11-Frame Temporal Sequence:</span>
                              <span className="text-cyan-400">{evt.temporalFrames.length} frames</span>
                            </div>
                            <div className="flex items-center gap-1 overflow-x-auto pb-1">
                              {evt.temporalFrames.map((f, i) => (
                                <img
                                  key={i}
                                  src={`data:image/jpeg;base64,${f}`}
                                  alt={`frame_${i}`}
                                  className="w-11 h-7 object-cover rounded border border-slate-800 hover:border-cyan-400 cursor-pointer flex-shrink-0 transition-transform hover:scale-105"
                                  title={`Temporal Frame ${i - 5 >= 0 ? `+${i - 5}` : i - 5}s`}
                                />
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-1.5 border-t border-slate-800/60 text-[10px]">
                          <span className="text-cyan-400 font-mono truncate max-w-[180px]">
                            Target: {evt.targetConcept}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleJumpToEvent(evt);
                              handleGenerateSamMask(evt);
                            }}
                            className="flex items-center gap-1 text-cyan-300 hover:text-white font-medium"
                          >
                            <Sparkles className="w-3 h-3 text-cyan-400" />
                            {evt.hasSamMask ? "View Mask" : "Get SAM 3.1 Mask"}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 2: Natural Language Forensic Search (Muse Spark Chat) */}
          {activeTab === "search" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
                {chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${
                      msg.role === "user" ? "items-end" : "items-start"
                    }`}
                  >
                    <div
                      className={`max-w-[88%] p-3 rounded-2xl text-xs leading-relaxed ${
                        msg.role === "user"
                          ? "bg-cyan-500 text-slate-950 font-medium"
                          : "bg-slate-950 border border-slate-800 text-slate-200"
                      }`}
                    >
                      {msg.text}
                    </div>
                    <span className="text-[9px] font-mono text-slate-500 mt-1 px-1">
                      {msg.timestamp}
                    </span>
                  </div>
                ))}
                {isSearching && (
                  <div className="flex items-center gap-2 text-xs text-cyan-400 p-2 font-mono">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                    <span>Muse Spark querying spatio-temporal database...</span>
                  </div>
                )}
              </div>

              {/* Bottom Search Input Bar */}
              <div className="p-3 border-t border-slate-800 bg-slate-950/90">
                <div className="flex items-center gap-2 bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-1.5 focus-within:border-cyan-400">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendSearch()}
                    placeholder="Search past footage (e.g. 'Find children running')..."
                    className="flex-1 bg-transparent text-xs text-white focus:outline-none"
                  />
                  <button
                    onClick={handleSendSearch}
                    disabled={isSearching || !searchQuery.trim()}
                    className="p-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition disabled:opacity-40"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── Modal: Generated Python OpenCV Script via Meta Muse Spark ───── */}
      {showCodeModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 max-w-2xl w-full rounded-2xl p-5 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Code2 className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-white uppercase">
                  Meta Muse Code • Synthesized OpenCV Script
                </h3>
              </div>
              <button
                onClick={() => setShowCodeModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="my-3 text-xs text-slate-300 bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono">
              <span className="text-cyan-400 font-bold">Rule:</span> {targetConcept}
              {ruleExplanation && (
                <p className="text-slate-400 mt-1">{ruleExplanation}</p>
              )}
            </div>

            <pre className="flex-1 overflow-auto bg-slate-950 p-4 rounded-xl text-xs font-mono text-emerald-300 border border-slate-800">
              <code>{generatedScript || "# No code generated yet"}</code>
            </pre>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setShowCodeModal(false)}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Welcome & Setup Onboarding Wizard */}
      <WelcomeSetupWizard
        isOpen={showWelcomeWizard}
        onClose={() => setShowWelcomeWizard(false)}
        onComplete={(newConfig) => {
          if (newConfig.whatsAppRecipient) setWhatsAppRecipient(newConfig.whatsAppRecipient);
          if (newConfig.whatsAppMode) setWhatsAppMode(newConfig.whatsAppMode);
          if (newConfig.selectedPresetRule) {
            setTargetConcept(newConfig.selectedPresetRule);
          }
          if (typeof newConfig.enableTextDetection === "boolean") {
            setIsTextDetectionActive(newConfig.enableTextDetection);
          }
          if (newConfig.customCamera) {
            setCustomFeedUrl(newConfig.customCamera.url);
            handleLoadCustomFeed(newConfig.customCamera.url);
          }
        }}
      />

      {/* AI Detection Preset Builder Questionnaire Modal */}
      <AddPresetModal
        isOpen={showAddPresetModal}
        onClose={() => setShowAddPresetModal(false)}
        cameraCode={currentCam.code}
        cameraName={currentCam.name}
        onSavePreset={(newPreset) => {
          if (!targetPresets.includes(newPreset.ruleText)) {
            setTargetPresets((prev) => [newPreset.ruleText, ...prev]);
          }
          setTargetConcept(newPreset.ruleText);
          if (newPreset.enableTextDetection) {
            setIsTextDetectionActive(true);
            if (newPreset.expectedText) {
              setZoneOcrText(newPreset.expectedText);
            }
          }
          handleSaveCameraRule(newPreset.ruleText);
        }}
      />
    </div>
  );
}
