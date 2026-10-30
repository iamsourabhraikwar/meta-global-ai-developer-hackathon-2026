"use client";

import React, { useState, useEffect } from "react";
import {
  Shield,
  Video,
  Sparkles,
  Zap,
  CheckCircle2,
  Radio,
  Sliders,
  X,
  ArrowRight,
  ArrowLeft,
  MessageSquare,
  Lock,
  Globe,
  Settings,
  Server,
  Key,
  Layers,
  CircleDot,
  Check,
  AlertTriangle,
} from "lucide-react";

interface WelcomeSetupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (config: any) => void;
  initialConfig?: any;
}

export default function WelcomeSetupWizard({
  isOpen,
  onClose,
  onComplete,
  initialConfig,
}: WelcomeSetupWizardProps) {
  const [step, setStep] = useState<number>(1);
  const [provider, setProvider] = useState<string>("baseten");
  const [apiKey, setApiKey] = useState<string>(
    initialConfig?.basetenApiKey || "b10_Fire5ysg.JXwLkiWn4upJSy4Ju3WEIgzr9YShwYKn"
  );
  const [baseUrl, setBaseUrl] = useState<string>(
    initialConfig?.baseUrl || "https://inference.baseten.co/v1"
  );
  const [modelId, setModelId] = useState<string>(
    initialConfig?.modelId || "meta-models/muse-spark-open-1026"
  );

  // WhatsApp Config (Optional)
  const [enableWhatsApp, setEnableWhatsApp] = useState<boolean>(true);
  const [waPhoneId, setWaPhoneId] = useState<string>(initialConfig?.whatsAppPhoneNumberId || "");
  const [waToken, setWaToken] = useState<string>(initialConfig?.whatsAppAccessToken || "");
  const [waRecipient, setWaRecipient] = useState<string>(
    initialConfig?.whatsAppRecipient && !initialConfig.whatsAppRecipient.includes("@")
      ? initialConfig.whatsAppRecipient
      : "15550192834"
  );
  const [waMode, setWaMode] = useState<string>("full_reasoning");

  // Custom Camera Ingestion (Optional)
  const [useCustomStream, setUseCustomStream] = useState<boolean>(false);
  const [customCamName, setCustomCamName] = useState<string>("Camera Front");
  const [customCamUrl, setCustomCamUrl] = useState<string>(
    "https://customer-670f71hno16lm69b.cloudflarestream.com/ca98af9dc129b9e1adf13925e8ba1887/manifest/video.m3u8"
  );
  const [customCamLocation, setCustomCamLocation] = useState<string>("Building A Entry");

  // Text Detection (ANPR) Toggle
  const [enableTextDetection, setEnableTextDetection] = useState<boolean>(true);

  // Preset Selection
  const [selectedPresetRule, setSelectedPresetRule] = useState<string>(
    "cash drawer opened or transaction at checkout register counter"
  );

  useEffect(() => {
    if (provider === "baseten") {
      setBaseUrl("https://inference.baseten.co/v1");
      setModelId("meta-models/muse-spark-open-1026");
    } else if (provider === "dev_meta") {
      setBaseUrl("https://api.dev.meta.ai/v1");
      setModelId("meta-models/muse-spark-open-1026");
    } else if (provider === "fireworks") {
      setBaseUrl("https://api.fireworks.ai/inference/v1");
      setModelId("accounts/fireworks/models/llama-v3p2-11b-vision-instruct");
    } else if (provider === "together") {
      setBaseUrl("https://api.together.xyz/v1");
      setModelId("meta-llama/Llama-Vision-Free");
    }
  }, [provider]);

  if (!isOpen) return null;

  const handleFinish = async () => {
    const finalConfig = {
      provider,
      basetenApiKey: apiKey,
      baseUrl,
      modelId,
      whatsAppPhoneNumberId: waPhoneId,
      whatsAppAccessToken: waToken,
      whatsAppRecipient: waRecipient,
      whatsAppMode: waMode,
      enableTextDetection,
      selectedPresetRule,
      customCamera: useCustomStream
        ? {
            name: customCamName,
            url: customCamUrl,
            location: customCamLocation,
          }
        : null,
      hasCompletedSetup: true,
    };

    try {
      await fetch("/api/cctv/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalConfig),
      });
      if (typeof window !== "undefined") {
        localStorage.setItem("hasCompletedCctvSetup", "true");
      }
    } catch (e) {
      console.warn("Could not persist config API:", e);
    }

    onComplete(finalConfig);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xl p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-slate-950 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Top Header / Progress Indicator */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-600 to-sky-400 p-0.5 flex items-center justify-center">
              <Shield className="w-4 h-4 text-slate-950" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
                <span>CCTV CONTROL ROOM OPERATOR</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  Meta Hackathon 2026
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">System Onboarding & Hardware Setup</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white p-1 rounded-lg transition"
            title="Close Setup Wizard"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Indicator Tabs */}
        <div className="flex items-center justify-between px-8 py-3 bg-slate-900/20 border-b border-slate-800/60 text-xs font-mono">
          <div className={`flex items-center gap-2 ${step >= 1 ? "text-cyan-400 font-bold" : "text-slate-600"}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 1 ? "bg-cyan-400 text-slate-950 font-bold" : "bg-slate-800"}`}>1</span>
            <span>Welcome</span>
          </div>
          <div className="w-8 h-px bg-slate-800" />
          <div className={`flex items-center gap-2 ${step >= 2 ? "text-cyan-400 font-bold" : "text-slate-600"}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 2 ? "bg-cyan-400 text-slate-950 font-bold" : "bg-slate-800"}`}>2</span>
            <span>AI Provider</span>
          </div>
          <div className="w-8 h-px bg-slate-800" />
          <div className={`flex items-center gap-2 ${step >= 3 ? "text-cyan-400 font-bold" : "text-slate-600"}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 3 ? "bg-cyan-400 text-slate-950 font-bold" : "bg-slate-800"}`}>3</span>
            <span>Cameras</span>
          </div>
          <div className="w-8 h-px bg-slate-800" />
          <div className={`flex items-center gap-2 ${step >= 4 ? "text-cyan-400 font-bold" : "text-slate-600"}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 4 ? "bg-cyan-400 text-slate-950 font-bold" : "bg-slate-800"}`}>4</span>
            <span>Events & Alerts</span>
          </div>
        </div>

        {/* Wizard Body Content */}
        <div className="p-6 overflow-y-auto max-h-[65vh]">
          {/* STEP 1: WELCOME SCREEN */}
          {step === 1 && (
            <div className="flex flex-col gap-5">
              <div className="text-center py-4">
                <div className="inline-flex p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 mb-3 shadow-lg shadow-cyan-500/10">
                  <Video className="w-8 h-8 animate-pulse" />
                </div>
                <h3 className="text-lg font-bold text-white mb-1">
                  Welcome to Autonomous Live CCTV Operator
                </h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                  Engineered for the <strong>Meta Global AI Developer Hackathon 2026</strong>. 
                  Delivers real-time in-browser motion detection, spatial watch zones, client-side text recognition, and automated Meta Muse Spark verification.
                </p>
              </div>

              {/* Core Features Grid */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-cyan-400 font-bold">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Meta Muse Spark 1026</span>
                  </div>
                  <p className="text-[11px] text-slate-400">Zero fine-tuning spatial & rule verification on Baseten.</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                    <span>🔤</span>
                    <span>Text Detection (ANPR)</span>
                  </div>
                  <p className="text-[11px] text-slate-400">Client-side WebAssembly OCR for vehicle plates & signs.</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-purple-400 font-bold">
                    <Layers className="w-3.5 h-3.5" />
                    <span>Spatial Gating & SAM 3.1</span>
                  </div>
                  <p className="text-[11px] text-slate-400">Custom Pencil, Box & Circle watch zones with on-demand segmentation.</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>WhatsApp Dispatch</span>
                  </div>
                  <p className="text-[11px] text-slate-400">Direct Method B photo upload with rich reason captions.</p>
                </div>
              </div>

              {/* Quick Jump for Judges */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-800/80">
                <button
                  onClick={handleFinish}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
                >
                  ⚡ Instant Demo Mode (1-Click Launch)
                </button>
                <button
                  onClick={() => setStep(2)}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-xs transition shadow-lg shadow-cyan-400/20"
                >
                  <span>Begin Guided Setup</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: AI PROVIDER CONFIGURATION */}
          {step === 2 && (
            <div className="flex flex-col gap-4">
              <div>
                <h4 className="text-sm font-bold text-white mb-1">Select AI Vision Model Provider</h4>
                <p className="text-xs text-slate-400">
                  Choose the model inference backend for zero-shot CCTV verification.
                </p>
              </div>

              {/* Provider Selection Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: "baseten", name: "Baseten", badge: "Recommended", icon: "⚡" },
                  { id: "dev_meta", name: "dev.meta.ai", badge: "Meta Platform", icon: "🌐" },
                  { id: "fireworks", name: "Fireworks AI", badge: "Fast Vision", icon: "🎆" },
                  { id: "together", name: "Together AI", badge: "Cloud", icon: "🤝" },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setProvider(item.id)}
                    className={`p-3 rounded-xl border text-left flex flex-col justify-between transition ${
                      provider === item.id
                        ? "bg-cyan-500/15 border-cyan-400 text-white shadow-md shadow-cyan-500/10"
                        : "bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <span className="text-base mb-1">{item.icon}</span>
                    <span className="font-bold text-xs text-slate-200">{item.name}</span>
                    <span className="text-[10px] text-cyan-400 font-mono mt-0.5">{item.badge}</span>
                  </button>
                ))}
              </div>

              {/* API Key & Model Inputs */}
              <div className="bg-slate-900/70 border border-slate-800 p-4 rounded-2xl flex flex-col gap-3 text-xs">
                <div>
                  <label className="text-[11px] text-slate-400 font-mono flex items-center justify-between mb-1">
                    <span>API KEY ({provider.toUpperCase()}):</span>
                    <span className="text-[10px] text-cyan-400 font-bold">Auto-persisted to .env.local</span>
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter API key..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-400 font-mono block mb-1">BASE URL:</label>
                    <input
                      type="text"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-300 font-mono focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 font-mono block mb-1">MODEL IDENTIFIER:</label>
                    <input
                      type="text"
                      value={modelId}
                      onChange={(e) => setModelId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-cyan-300 font-mono focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-xs transition"
                >
                  <span>Next: Cameras & Streams</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: CAMERAS & STREAMS SETUP */}
          {step === 3 && (
            <div className="flex flex-col gap-4">
              <div>
                <h4 className="text-sm font-bold text-white mb-1">Surveillance Feeds & Stream Setup</h4>
                <p className="text-xs text-slate-400">
                  Select your surveillance inputs or connect your direct HLS / Cloudflare streams.
                </p>
              </div>

              {/* Mode A vs Mode B Tabs */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setUseCustomStream(false)}
                  className={`flex-1 py-2 px-3 rounded-xl border text-xs font-semibold transition ${
                    !useCustomStream
                      ? "bg-cyan-500/20 border-cyan-400 text-cyan-300"
                      : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                  }`}
                >
                  📹 10 Core CCTV Scenarios (Preloaded)
                </button>
                <button
                  onClick={() => setUseCustomStream(true)}
                  className={`flex-1 py-2 px-3 rounded-xl border text-xs font-semibold transition ${
                    useCustomStream
                      ? "bg-rose-500/20 border-rose-400 text-rose-300"
                      : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                  }`}
                >
                  📡 Custom HLS / Cloudflare Stream
                </button>
              </div>

              {!useCustomStream ? (
                <div className="bg-slate-900/50 border border-slate-800 p-3.5 rounded-2xl flex flex-col gap-2 max-h-56 overflow-y-auto text-xs font-mono">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    Included Core Surveillance Hub (10 Scenarios):
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
                      <span className="text-cyan-400 font-bold">CAM-01:</span> Main Gate Barrier
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
                      <span className="text-cyan-400 font-bold">CAM-02:</span> Industrial Loading Bay
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
                      <span className="text-cyan-400 font-bold">CAM-03:</span> Parking Lot Outbound
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
                      <span className="text-cyan-400 font-bold">CAM-04:</span> Perimeter Fence Watch
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
                      <span className="text-cyan-400 font-bold">CAM-05:</span> Freight Dispatch Bay
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
                      <span className="text-cyan-400 font-bold">CAM-06:</span> Underground Garage
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
                      <span className="text-cyan-400 font-bold">CAM-07:</span> Garage Access Ramp
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
                      <span className="text-cyan-400 font-bold">CAM-08:</span> Warehouse Inventory
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
                      <span className="text-cyan-400 font-bold">CAM-09:</span> Safety Transit Corridor
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950 border border-amber-500/40 text-amber-300 font-bold">
                      <span className="text-amber-400">CAM-10:</span> Retail Cash Counter
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-900/70 border border-slate-800 p-4 rounded-2xl flex flex-col gap-3 text-xs font-mono">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">CAMERA LABEL / NAME:</label>
                    <input
                      type="text"
                      value={customCamName}
                      onChange={(e) => setCustomCamName(e.target.value)}
                      placeholder="e.g. Camera 20, Front Gate, Cash Register..."
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">DIRECT HLS / CLOUDFLARE STREAM URL (.m3u8):</label>
                    <input
                      type="text"
                      value={customCamUrl}
                      onChange={(e) => setCustomCamUrl(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-cyan-300"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">LOCATION TAG:</label>
                    <input
                      type="text"
                      value={customCamLocation}
                      onChange={(e) => setCustomCamLocation(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-300"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                <button
                  onClick={() => setStep(2)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </button>
                <button
                  onClick={() => setStep(4)}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-xs transition"
                >
                  <span>Next: Events & WhatsApp</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: EVENTS, TEXT DETECTION & WHATSAPP (OPTIONAL) */}
          {step === 4 && (
            <div className="flex flex-col gap-4">
              <div>
                <h4 className="text-sm font-bold text-white mb-1">Target Rules & Incident Alerts</h4>
                <p className="text-xs text-slate-400">
                  Select target preset, enable text/license plate detection, and configure optional WhatsApp dispatch.
                </p>
              </div>

              {/* Event Preset Selector */}
              <div className="bg-slate-900/60 border border-slate-800 p-3 rounded-2xl flex flex-col gap-2 text-xs">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Target Watchdog Presets:
                </span>
                <div className="flex flex-col gap-1.5">
                  {[
                    "cash drawer opened or transaction at checkout register counter",
                    "silver SUV and outbound traffic on exit ramp",
                    "children running behind trees along perimeter",
                    "person interacting with parked car or perimeter",
                    "blue delivery van entering gate",
                  ].map((rule) => (
                    <button
                      key={rule}
                      onClick={() => setSelectedPresetRule(rule)}
                      className={`px-3 py-2 rounded-xl text-left text-xs transition flex items-center justify-between ${
                        selectedPresetRule === rule
                          ? "bg-cyan-500/20 border border-cyan-400 text-cyan-300 font-bold"
                          : "bg-slate-950/70 border border-slate-800 text-slate-300 hover:bg-slate-900"
                      }`}
                    >
                      <span>{rule}</span>
                      {selectedPresetRule === rule && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Text Detection (ANPR) Toggle */}
              <div className="bg-slate-900/60 border border-slate-800 p-3.5 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="font-bold text-xs text-white flex items-center gap-1.5">
                    <span>🔤</span>
                    <span>Text Detection (License Plates & Signs)</span>
                  </span>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Client-side WebAssembly OCR scans optical crops drawn with Custom Pencil or Circle.
                  </p>
                </div>
                <button
                  onClick={() => setEnableTextDetection(!enableTextDetection)}
                  className={`px-3 py-1 rounded-xl text-xs font-bold border transition ${
                    enableTextDetection
                      ? "bg-amber-400 text-slate-950 border-amber-300 shadow-md shadow-amber-400/20"
                      : "bg-slate-800 text-slate-400 border-slate-700"
                  }`}
                >
                  {enableTextDetection ? "ENABLED" : "DISABLED"}
                </button>
              </div>

              {/* WhatsApp Notification Details (Optional) */}
              <div className="bg-slate-900/60 border border-slate-800 p-3.5 rounded-2xl flex flex-col gap-2.5 text-xs">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                    <MessageSquare className="w-4 h-4" />
                    <span>WhatsApp Incident Alerts (Method B Direct)</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">Optional</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[10px] text-slate-400 font-mono block mb-1">
                      PHONE NUMBER ID (FROM META DEVELOPER):
                    </label>
                    <input
                      type="text"
                      value={waPhoneId}
                      onChange={(e) => setWaPhoneId(e.target.value)}
                      placeholder="e.g. 104829185718294 (Optional)"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1 text-xs text-emerald-300 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 font-mono block mb-1">
                      RECIPIENT PHONE (DEMO: 15550192834):
                    </label>
                    <input
                      type="text"
                      value={waRecipient}
                      onChange={(e) => setWaRecipient(e.target.value.replace(/[^0-9+]/g, ""))}
                      placeholder="e.g. 15550192834 (numbers only)"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1 text-xs text-white font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 font-mono block mb-1">
                    META GRAPH API ACCESS TOKEN:
                  </label>
                  <input
                    type="password"
                    value={waToken}
                    onChange={(e) => setWaToken(e.target.value)}
                    placeholder="Permanent or 24h Meta token (leave blank to log in terminal)..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1 text-xs text-slate-300 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                <button
                  onClick={() => setStep(3)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </button>
                <button
                  onClick={handleFinish}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-bold text-xs transition shadow-lg shadow-emerald-500/20"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Save & Enter Control Room</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
