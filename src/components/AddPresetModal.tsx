"use client";

import React, { useState } from "react";
import { Sparkles, Shield, AlertTriangle, Eye, Crosshair, X, Type, CheckCircle2 } from "lucide-react";

interface AddPresetModalProps {
  isOpen: boolean;
  onClose: () => void;
  cameraCode: string;
  cameraName: string;
  onSavePreset: (preset: {
    ruleText: string;
    targetObject: string;
    environmentContext: string;
    triggerCondition: string;
    riskPriority: "critical" | "high" | "normal";
    enableTextDetection: boolean;
    expectedText?: string;
  }) => void;
}

export default function AddPresetModal({
  isOpen,
  onClose,
  cameraCode,
  cameraName,
  onSavePreset,
}: AddPresetModalProps) {
  if (!isOpen) return null;

  // Environment & Scene Context
  const [environmentContext, setEnvironmentContext] = useState<string>(
    cameraName.toLowerCase().includes("gate")
      ? "Main Vehicle Checkpoint & Entry Gate"
      : cameraName.toLowerCase().includes("pallet") || cameraName.toLowerCase().includes("dock")
      ? "Loading Dock & Freight Storage Bay"
      : cameraName.toLowerCase().includes("counter") || cameraName.toLowerCase().includes("register")
      ? "Cash Register & POS Counter"
      : "Perimeter Security Zone"
  );

  // Target Subject & Action
  const [targetObject, setTargetObject] = useState<string>("");
  const [targetAction, setTargetAction] = useState<string>("");

  // Trigger Condition (When & Why to fire)
  const [triggerCondition, setTriggerCondition] = useState<string>("");

  // Risk & Alert Urgency
  const [riskPriority, setRiskPriority] = useState<"critical" | "high" | "normal">("high");

  // Optical Text Detection (OCR)
  const [enableTextDetection, setEnableTextDetection] = useState<boolean>(false);
  const [expectedText, setExpectedText] = useState<string>("");

  // Quick preset templates
  const quickTemplates = [
    {
      label: "💵 Cash Register / Counter (MediaPipe Hand Gate)",
      obj: "cash drawer and hand transactions",
      action: "cash drawer opened or hand reaching into register drawer to pick cash",
      condition: "trigger when cash drawer is pulled open or currency is handled unattended",
      env: "Retail POS & Cash Register Counter",
      ocr: true,
      text: "CASH / RECEIPT",
      priority: "critical" as const,
    },
    {
      label: "🏡 Home Outside Porch & Driveway",
      obj: "porch pirate or prowler checking car handles",
      action: "approaching front doorstep or touching car door handle in driveway",
      condition: "trigger when person reaches for package on porch or prowls near parked vehicle",
      env: "Residential Sector • Front Porch & Driveway",
      ocr: false,
      text: "",
      priority: "critical" as const,
    },
    {
      label: "🍽️ Restaurant Dining Floor",
      obj: "customer leaving dining table or booth",
      action: "customer waiting at empty table or dine and dash without paying",
      condition: "trigger when customer leaves booth rapidly without settling check",
      env: "Restaurant Floor & Dining Booths",
      ocr: false,
      text: "",
      priority: "high" as const,
    },
    {
      label: "🏧 24/7 ATM Keypad Zone",
      obj: "secondary person encroaching behind user",
      action: "shoulder surfing intrusion or loitering near ATM keypad",
      condition: "trigger when second person encroaches while customer conducts transaction",
      env: "24/7 ATM Lobby & Cash Dispenser",
      ocr: false,
      text: "",
      priority: "critical" as const,
    },
    {
      label: "🚗 Parking Garage Driving Ramp",
      obj: "wrong-way vehicle or pedestrian",
      action: "wrong-way vehicle or pedestrian walking on vehicle ramp",
      condition: "trigger immediately upon wrong-way vehicle movement or pedestrian in lane",
      env: "Underground Parking Garage & Drive Lane",
      ocr: true,
      text: "LICENSE PLATE",
      priority: "high" as const,
    },
    {
      label: "🧳 Passenger Terminal Concourse",
      obj: "unattended baggage or abandoned suitcase",
      action: "unattended baggage or abandoned suitcase left by owner",
      condition: "trigger when luggage remains stationary with owner departed",
      env: "Passenger Terminal & Seating Concourse",
      ocr: false,
      text: "",
      priority: "critical" as const,
    },
    {
      label: "🚜 Industrial Warehouse Safety Zone",
      obj: "worker in forklift transit path",
      action: "worker in forklift transit path or worker down",
      condition: "trigger when worker steps into active heavy equipment corridor",
      env: "Industrial Warehouse & Forklift Safety Zone",
      ocr: false,
      text: "",
      priority: "critical" as const,
    },
    {
      label: "💎 Jewelry Showcase Counter",
      obj: "unauthorized arm reach across glass counter",
      action: "display glass reach-in or customer reaching behind showcase",
      condition: "trigger when customer arm crosses showcase barrier without employee present",
      env: "Luxury Jewelry Showcase Counter",
      ocr: false,
      text: "",
      priority: "critical" as const,
    },
    {
      label: "🚚 Delivery Van at Gate",
      obj: "delivery van or unauthorized vehicle",
      action: "entering through gate barrier without stopping",
      condition: "trigger if vehicle enters perimeter gate without security badge inspection",
      env: "North Gate Perimeter Entry",
      ocr: true,
      text: "LICENSE PLATE",
      priority: "high" as const,
    },
    {
      label: "🧗 Perimeter Intrusion",
      obj: "person wearing hoodie or dark clothing",
      action: "children running behind trees or scaling perimeter wall",
      condition: "trigger immediately if motion is detected in restricted fence buffer zone",
      env: "Perimeter Security Zone",
      ocr: false,
      text: "",
      priority: "critical" as const,
    },
  ];

  // Synthesize complete vision prompt for Meta Muse Spark
  const getSynthesizedRule = () => {
    const parts: string[] = [];
    if (targetObject || targetAction) {
      parts.push(`${targetObject} ${targetAction}`.trim());
    }
    if (triggerCondition) {
      parts.push(`trigger condition: ${triggerCondition}`);
    }
    if (environmentContext) {
      parts.push(`scene: ${environmentContext}`);
    }
    if (enableTextDetection && expectedText) {
      parts.push(`verify text: "${expectedText}"`);
    }
    return parts.join(" • ") || "unusual motion or target activity in watch zone";
  };

  const handleApplyTemplate = (tmpl: typeof quickTemplates[0]) => {
    setTargetObject(tmpl.obj);
    setTargetAction(tmpl.action);
    setTriggerCondition(tmpl.condition);
    setEnvironmentContext(tmpl.env);
    setEnableTextDetection(tmpl.ocr);
    setExpectedText(tmpl.text);
    setRiskPriority(tmpl.priority);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalRule = getSynthesizedRule();
    onSavePreset({
      ruleText: finalRule,
      targetObject: targetObject || "target activity",
      environmentContext,
      triggerCondition: triggerCondition || "motion detected in active zone",
      riskPriority,
      enableTextDetection,
      expectedText: enableTextDetection ? expectedText : undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-cyan-500/40 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-400/40 flex items-center justify-center text-cyan-400 shadow-md shadow-cyan-500/10">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">
                  Define AI Detection Trigger Preset
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-mono font-bold border border-cyan-500/30">
                  {cameraCode}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Configure contextual details so Meta Muse Spark & OpenCV understand why & when to alert.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {/* Quick Scenario Templates */}
          <div>
            <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider block mb-1.5">
              ⚡ Quick Scenario Templates (1-Click Fill)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {quickTemplates.map((tmpl) => (
                <button
                  type="button"
                  key={tmpl.label}
                  onClick={() => handleApplyTemplate(tmpl)}
                  className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-cyan-500/50 hover:bg-slate-800/60 text-left transition text-slate-300 hover:text-cyan-300 flex flex-col gap-0.5"
                >
                  <span className="font-bold text-xs">{tmpl.label}</span>
                  <span className="text-[10px] text-slate-500 truncate">{tmpl.condition}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Section 1: Camera Context & Environment */}
          <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/80 space-y-2">
            <div className="flex items-center gap-1.5 text-cyan-400 font-bold text-xs">
              <Eye className="w-3.5 h-3.5" />
              <span>1. Camera Environment & Surveillance Context</span>
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">
                Where is this camera monitoring? (e.g. Checkpoint gate, cash counter, loading bay)
              </label>
              <input
                type="text"
                value={environmentContext}
                onChange={(e) => setEnvironmentContext(e.target.value)}
                placeholder="e.g. Cash Register POS Counter, Sector A North Gate..."
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
                required
              />
            </div>
          </div>

          {/* Section 2: What to Search & Detect */}
          <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/80 space-y-3">
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs">
              <Crosshair className="w-3.5 h-3.5" />
              <span>2. What to Search & Recognize</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">
                  Target Object / Subject
                </label>
                <input
                  type="text"
                  value={targetObject}
                  onChange={(e) => setTargetObject(e.target.value)}
                  placeholder="e.g. cash drawer, delivery van, person in dark hoodie..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-400"
                  required
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">
                  Target Action / Behavior
                </label>
                <input
                  type="text"
                  value={targetAction}
                  onChange={(e) => setTargetAction(e.target.value)}
                  placeholder="e.g. opened drawer, entering gate, touching parked vehicle..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-400"
                  required
                />
              </div>
            </div>
          </div>

          {/* Section 3: Why & When to Trigger Alert */}
          <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/80 space-y-2">
            <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>3. Trigger Criteria: When & Why Should an Alert Fire?</span>
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">
                Detailed Condition for Security Verification (Used by Meta Muse Spark)
              </label>
              <textarea
                rows={2}
                value={triggerCondition}
                onChange={(e) => setTriggerCondition(e.target.value)}
                placeholder="e.g. Trigger when cash drawer is opened while unattended, or when vehicle passes without stopping for security clearance..."
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400 resize-none"
                required
              />
            </div>
          </div>

          {/* Section 4: Urgency Priority & Optical Text Scan (OCR) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Risk Priority */}
            <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/80 space-y-2">
              <label className="text-[10px] text-slate-400 block">
                Alert Priority Level
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setRiskPriority("critical")}
                  className={`flex-1 py-1.5 rounded-xl font-bold border transition ${
                    riskPriority === "critical"
                      ? "bg-rose-500 text-slate-950 border-rose-400 shadow-md shadow-rose-500/20"
                      : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white"
                  }`}
                >
                  🔴 CRITICAL
                </button>
                <button
                  type="button"
                  onClick={() => setRiskPriority("high")}
                  className={`flex-1 py-1.5 rounded-xl font-bold border transition ${
                    riskPriority === "high"
                      ? "bg-amber-400 text-slate-950 border-amber-300 shadow-md shadow-amber-400/20"
                      : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white"
                  }`}
                >
                  🟡 HIGH
                </button>
                <button
                  type="button"
                  onClick={() => setRiskPriority("normal")}
                  className={`flex-1 py-1.5 rounded-xl font-bold border transition ${
                    riskPriority === "normal"
                      ? "bg-cyan-500 text-slate-950 border-cyan-400 shadow-md shadow-cyan-500/20"
                      : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white"
                  }`}
                >
                  🟢 NORMAL
                </button>
              </div>
            </div>

            {/* Optical Text Detection (OCR) */}
            <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-slate-400 flex items-center gap-1">
                  <Type className="w-3.5 h-3.5 text-amber-400" />
                  <span>Text / Plate Scan (OCR)</span>
                </label>
                <input
                  type="checkbox"
                  checked={enableTextDetection}
                  onChange={(e) => setEnableTextDetection(e.target.checked)}
                  className="rounded border-slate-700 text-amber-500 focus:ring-0 cursor-pointer"
                />
              </div>
              {enableTextDetection ? (
                <input
                  type="text"
                  value={expectedText}
                  onChange={(e) => setExpectedText(e.target.value)}
                  placeholder="Expected plate or sign (e.g. DL-01, RESTRICTED)..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-amber-300 placeholder-slate-500 focus:outline-none focus:border-amber-400 text-[11px]"
                />
              ) : (
                <p className="text-[10px] text-slate-500 italic">
                  Enable if you need to read license plates, cashier receipts, or warning signs.
                </p>
              )}
            </div>
          </div>

          {/* Live Synthesized Rule Preview */}
          <div className="p-3 rounded-2xl bg-cyan-950/40 border border-cyan-500/40 flex flex-col gap-1">
            <span className="text-[10px] font-mono uppercase text-cyan-400 font-bold flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Synthesized Meta Muse Spark Vision Rule:
            </span>
            <p className="font-mono text-cyan-200 text-xs leading-relaxed bg-slate-950/60 p-2 rounded-xl border border-cyan-500/20">
              "{getSynthesizedRule()}"
            </p>
          </div>

          {/* Footer Controls */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-sky-400 hover:from-cyan-400 hover:to-sky-300 text-slate-950 font-bold shadow-lg shadow-cyan-500/20 flex items-center gap-1.5 transition active:scale-95"
            >
              <CheckCircle2 className="w-4 h-4 text-slate-950" />
              <span>Apply Preset to {cameraCode}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
