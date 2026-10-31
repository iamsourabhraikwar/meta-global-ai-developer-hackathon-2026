export interface SamMaskPoint {
  x: number; // 0-100% of frame width
  y: number; // 0-100% of frame height
}

export interface CameraConfig {
  id: string;
  code: string;
  icon?: string;
  shortName?: string;
  name: string;
  location: string;
  videoUrl: string;
  isLiveStream?: boolean;
  liveStreamUrl?: string;
  resolution: string;
  fps: number;
  status: "ONLINE" | "MONITORING" | "ALERT";
  defaultTarget?: string;
}

export interface MotionEventRecord {
  id: string;
  cameraId: string;
  cameraName: string;
  timestamp: string; // ISO 8601
  timeShort: string; // HH:MM:SS
  videoSecond: number; // Second offset in video
  motionScore: number;
  preRollSeconds: number; // Available seconds before trigger (up to 10s)
  postRollSeconds: number; // Available seconds after trigger (3s, 5s, or 10s)
  targetConcept: string; // e.g. "red shirt delivery rider", "blue van", "children running"
  verified: boolean; // Verified by Meta Muse Spark
  reasoningText: string; // Muse Spark analysis
  alertLevel: "normal" | "watch" | "critical";
  keyframeBase64?: string; // Full surveillance frame
  croppedKeyframeBase64?: string; // Native high-res optical crop of ROI
  temporalFrames?: string[]; // 11-frame sequence: 5 before, 1 trigger, 5 after
  vehicleDetails?: {
    type?: string;
    color?: string;
    licensePlate?: string | null;
    makeModel?: string;
  };
  personDetails?: {
    clothing?: string;
    carriedObjects?: string;
    action?: string;
  };
  transactionDetails?: {
    cashDetected?: boolean;
    currencyType?: string | null;
    estimatedDenomination?: string | null;
    actionType?: "cash_taken" | "cash_placed" | "inspecting_drawer" | null;
  };
  riskScore?: number;
  detectedText?: string | null; // Extracted on-screen text or car plate from Watch Zone
  isTextDetectionEnabled?: boolean;
  // On-demand SAM 3.1 fields (populated when operator inspects / searches)
  hasSamMask?: boolean;
  boundingBox?: [number, number, number, number]; // [xMin, yMin, xMax, yMax] in %
  samMaskPolygon?: SamMaskPoint[];
  segmentedAt?: string;
}

export interface SearchQueryResult {
  query: string;
  matchedEvents: MotionEventRecord[];
  operatorSummary: string;
  generatedPythonCode?: string;
}
