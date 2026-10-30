# Autonomous Live CCTV Operator • Meta Global AI Developer Hackathon 2026

[![Meta](https://img.shields.io/badge/Meta%20AI-Muse%20Spark%20Open%201026-blue)](https://baseten.co)
[![SAM 3.1](https://img.shields.io/badge/Meta%20AI-SAM%203.1%20Segmentation-cyan)](https://ai.meta.com/sam2/)
[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-Cloud%20API%20Method%20B-25D366)](https://developers.facebook.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

An **Autonomous AI CCTV Control Room Operator** engineered for the **Meta Global AI Developer Hackathon 2026**. Inspired by real-world physical security operations, this platform monitors live surveillance streams, detects motion in custom spatial watch zones, extracts on-screen text & license plates, validates suspicious incidents using **Meta Muse Spark Open 1026**, segments entities via **Meta SAM 3.1**, and dispatches instant rich visual alerts to **WhatsApp**.

---

## 🌟 Key Innovations & Architecture

```
 ┌────────────────────────────────────────────────────────┐
 │           Live Video Stream / Cloudflare HLS           │
 └──────────────────────────┬─────────────────────────────┘
                            ▼
 ┌────────────────────────────────────────────────────────┐
 │  Stage 1: Real-Time In-Browser OpenCV & Spatial Gating │
 │  • MOG2 / Frame-differencing canvas watchdog (10-20ms) │
 │  • Freehand Custom Pencil, Rectangle Box & Circle ROI  │
 └──────────┬─────────────────────────────────┬───────────┘
            │                                 │
     (Motion Delta Breached)        (Text Detection Active)
            │                                 │
            ▼                                 ▼
 ┌──────────────────────┐      ┌──────────────────────────┐
 │ Rolling Multi-Frame  │      │ Client-Side WebAssembly  │
 │ Buffer (11 Frames)   │      │ OCR (tesseract.js WASM)  │
 └──────────┬───────────┘      └──────────────┬───────────┘
            │                                 │
            └────────────────┬────────────────┘
                             ▼
 ┌────────────────────────────────────────────────────────┐
 │  Stage 2: Meta Muse Spark Open 1026 Multimodal AI      │
 │  • Zero fine-tuning operator rule verification         │
 │  • Vehicle / person / text / license plate transcription│
 │  • Risk assessment scoring (1 - 100)                   │
 └──────────────────────────┬─────────────────────────────┘
                            ▼
 ┌────────────────────────────────────────────────────────┐
 │  Stage 3: Automated Dispatch & Forensic Storage        │
 │  • WhatsApp Cloud API Method B direct binary upload    │
 │  • Local persistent disk database (cctv_events_db.json)│
 │  • On-Demand Meta SAM 3.1 Neon Mask Segmentation       │
 │  • Spatio-Temporal Forensic Natural Language Search    │
 └────────────────────────────────────────────────────────┘
```

---

## ✨ Features

1. **Guided Welcome & Setup Wizard:**
   - Multi-step onboarding setup for first-time operators.
   - Configure AI Providers: **Baseten (Meta Muse Spark Open 1026)**, **dev.meta.ai**, **Fireworks AI**, **Together AI**, or Custom Base URLs.
   - 1-Click Instant Demo launch for hackathon judges.

2. **Multi-Camera Surveillance Hub (10 Core Scenarios + Custom Streams):**
   - **CAM-01:** Main Vehicle Gate Barrier
   - **CAM-02:** Industrial Loading Bay & Pallet Staging
   - **CAM-03:** Commercial Parking Lot & Outbound Ramp
   - **CAM-04:** Perimeter Security Wall & Foliage Watch
   - **CAM-05:** Freight Dispatch Bay 2
   - **CAM-06:** Underground Parking Driving Lanes
   - **CAM-07:** Multi-Level Garage Entry Ramp
   - **CAM-08:** Warehouse Inventory Corridor
   - **CAM-09:** Safety Corridor & Forklift Transit
   - **CAM-10:** Retail Checkout & Cash Register Counter *(Tracks cash drawer opening & cash handling)*
   - **Choice B Ingestion:** Connect any direct HLS stream (`.m3u8`), Cloudflare Stream, or local video with custom names and location tags.

3. **Spatial Watch Zone Gating:**
   - **✏️ Custom Pencil:** Trace custom roadways, footpaths, or irregular boundaries.
   - **▢ Rectangle Box:** Define geometric intrusion gates.
   - **🔵 Circle Tool:** Drag-to-expand circular watch zones.

4. **🔤 Client-Side WebAssembly Text Detection (ANPR):**
   - Fast, local WebAssembly OCR engine (`tesseract.js`).
   - Runs exclusively on user-drawn optical crops (under 250ms), reading car license plate numbers and on-screen signage without bogging down the browser.

5. **📱 WhatsApp Incident Dispatch (Method B Direct Binary Upload):**
   - Directly uploads keyframe screenshots to Meta Graph API (`/v21.0/{PHONE_ID}/media`) and dispatches image messages to WhatsApp (configured recipient number).
   - 3 selectable notification modes:
     - `Image + AI Reasoning & Why Triggered`
     - `Image + Short Summary`
     - `Image Only`
   - Built-in safe simulation fallback when credentials are left blank.

6. **🎨 On-Demand Meta SAM 3.1 Segmentation:**
   - Generates exact 24-point neon segmentation polygons around detected vehicles, suspects, or items on demand.

7. **🔎 Spatio-Temporal Forensic Natural Language Search:**
   - Search historical incidents using plain English (e.g. *"find silver vehicles exiting after 6 PM"*).
   - Generates executable OpenCV Python scripts matching the query.

---

## 🚀 Quickstart Guide

### 1. Clone & Install
```bash
git clone https://github.com/iamsourabhraikwar/meta-global-ai-developer-hackathon-2026.git
cd meta-global-ai-developer-hackathon-2026
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env.local` or simply configure it visually using the built-in **Welcome Setup Wizard**:
```bash
cp .env.example .env.local
```

### 3. Run Development Server
```bash
npm run dev
```
Open **`http://localhost:3000`** (or **`http://localhost:3001`**) in Google Chrome or Microsoft Edge.

---

## 🛠️ Tech Stack
- **Framework:** Next.js 14 (App Router, Server Actions, Dynamic Streams)
- **AI Models:** Meta Muse Spark Open 1026, Meta SAM 3.1
- **Computer Vision:** In-browser Canvas OpenCV differencing, WebAssembly OCR (`tesseract.js`), `hls.js` demuxer
- **Styling:** Tailwind CSS, Lucide React icons
- **Notifications:** Meta WhatsApp Cloud API (Method B)
- **Persistence:** Local disk JSON event logging & `.env.local` synchronization

---

## 👥 Built For
**Meta Global AI Developer Hackathon 2026**
*Developed by Sourabh Raikwar ([@iamsourabhraikwar](https://github.com/iamsourabhraikwar))*
