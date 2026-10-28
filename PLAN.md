# Migrate Flask Body Measurement API to Hono TypeScript

## Goal
Port the existing Python/Flask application (`app.py`) into a TypeScript Hono application inside the existing `hono/` folder. The **primary focus** is faithfully porting the body-measurement calculation logic, because the pose-detection step is only a precursor to the complex geometry, calibration, correction factors, and contour-based width estimation that produce the final measurements.

## Current State
- **Python stack**: Flask + legacy `mediapipe==0.10.20` (`mp.solutions.pose` / `mp.solutions.holistic`) + `opencv-python` + `torch` (MiDaS) + NumPy.
- **Endpoint**: `POST /upload_images` accepts multipart form data with `front` image, optional `left_side` image, and optional `height_cm`.
- **Flow**: validate front image → detect pose → calibrate scale from height → run MiDaS depth → compute body measurements (chest, waist, hip, thigh, neck, arm/shirt/trouser lengths, circumferences).
- **Hono stack**: Hono 4.x, Bun runtime, strict TypeScript, no extra dependencies installed yet.

## MediaPipe Legacy vs Latest
The Python app uses the legacy `mediapipe` 0.10.20 Python solutions API (`mp.solutions.holistic` with `results.pose_landmarks.landmark[index]`). The migration target is the modern **@mediapipe/tasks-vision** `PoseLandmarker`, which:
- Returns `result.landmarks[poseIndex][index]` (33 normalized landmarks, same indices).
- Provides `NormalizedLandmark` with `x`, `y`, `z`, `visibility`, and `presence`.
- Uses `PoseLandmarker.createFromOptions(vision, { runningMode: "IMAGE", numPoses: 1, ... })`.
- Does not expose `Holistic`; use `PoseLandmarker` alone because the app only needs pose landmarks.
- Uses the same 0–1 normalized coordinate system and same BlazePose indices.

The `POSE_LANDMARKS` constant map from the latest skill reference is:

```ts
export const POSE_LANDMARKS = {
  NOSE: 0,
  LEFT_EAR: 7,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;
```

The model URL for the latest full model is:
```ts
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";
```

## Skills Applied
- **hono**: Hono app factory, route grouping, `zValidator`, `c.req.parseBody()`, `c.json()`, error handling with `app.onError`, and `app.request()` for testing.
- **mediapipe-usage** (latest): Use `@mediapipe/tasks-vision` `PoseLandmarker.createFromOptions`, `IMAGE` running mode, and 33 normalized landmarks. Landmarks are 0-1 normalized, so pixel conversion requires image width/height.
- **mediapipe-pose-detection**: Validate with `visibility >= 0.5`, use landmark indices for required upper-body points, and enforce full-body visibility.
- **typescript-advanced-types**: Define strict types for landmarks, measurements, and results; use `as const` landmark maps; avoid `any`.
- **python-type-safety**: Treat the Python functions as typed specs; port each function with explicit input/output types and null checks.
- **flask-api-development**: Keep the API surface identical (status codes, error keys `pose`/`code`/`error`, `measurements` and `debug_info` JSON shape).

## Architecture

```
hono/
├── src/
│   ├── index.ts                      # App setup, middleware, error handlers
│   ├── routes/
│   │   └── measurements.ts           # POST /upload_images route
│   ├── services/
│   │   ├── pose.ts                   # MediaPipe PoseLandmarker wrapper (latest JS API)
│   │   ├── image.ts                  # sharp decoding, raw-pixel helpers
│   │   ├── depth.ts                  # ONNX MiDaS depth estimation
│   │   └── measurements.ts           # Ported calculation logic (core focus)
│   ├── types/
│   │   └── index.ts                  # Landmark, Measurements, PoseResult types
│   ├── constants.ts                  # Correction factors, focal length, defaults
│   └── utils/
│       └── validators.ts             # Front-image validation helpers
├── models/                           # Downloaded ONNX models (MiDaS)
├── package.json
└── tsconfig.json
```

## Tech Stack

| Purpose | Python Dependency | TypeScript Replacement |
|---------|-------------------|------------------------|
| Web framework | Flask | `hono` (already installed) |
| Pose estimation | legacy `mediapipe` | `@mediapipe/tasks-vision` (latest `PoseLandmarker`) |
| Image I/O / resize | `opencv-python` | `sharp` |
| Raw pixel math | `numpy` / `cv2` | Typed arrays + plain functions |
| Depth estimation | `torch` (MiDaS) | `onnxruntime-node` + MiDaS ONNX (Phase 4) |
| Validation | manual | `zod` + `@hono/zod-validator` |
| DOM shim for MediaPipe | n/a | `@napi-rs/canvas` (fallback if needed) |

## Core Measurement Logic — Underlying Geometry

The calculation pipeline has four conceptual stages. Each stage must be ported carefully because small changes compound into large measurement errors.

### 1. Calibration (Pixels → cm)
The primary calibration uses the user's known height:
- `person_height_px = abs(max(ankle_y) - nose_y) * image_height`
- `scale_factor = user_height_cm / person_height_px` (cm per pixel)
- This is the **single most important value**; every measurement is multiplied by it.

The fallback object detection (A4 paper) is fragile in the original code and should be treated as a secondary, lower-confidence fallback only used when pose landmarks are unavailable.

### 2. Landmark-Based Widths
For each body region, the code estimates a front-view width in pixels:
- Shoulder: direct shoulder-landmark distance × 1.10
- Chest: shoulder width × 1.15 (chest is wider than shoulders)
- Waist: contour at 35% shoulder-to-hip, fallback 0.9 × hip width, × 1.16
- Hip: hip-landmark distance × 1.35 (landmarks are inside the hip joint, not the widest point)
- Thigh: 0.5 × hip width × 1.2
- Neck: nose-to-ear distance × 2.0

### 3. Contour-Based Widths
Where the raw image frame is available, the code scans horizontally across a thresholded grayscale image at a computed y-coordinate:
- Convert to grayscale, Gaussian blur, binary threshold.
- Start at the landmark center x and scan left/right for the first dark (background) pixel.
- Width = right edge − left edge, with a minimum guard of 10% of image width.
- This compensates for sparse landmarks not reaching the actual body silhouette.

### 4. Circumference (Ellipse Approximation)
For circumference outputs, the code treats the cross-section as an ellipse:
- `a = width_cm / 2`
- `b = (width_cm × depth_ratio × 0.7) / 2` (depth assumed 70% of width)
- `C = 2π × sqrt((a² + b²) / 2)`
- `depth_ratio` is normally 1.0; MiDaS adjusts it to 1.0–1.5 based on relative depth.

## Correction Factors Summary

| Body Part | Factor | Meaning |
|-----------|--------|---------|
| Shoulder | 1.10 | Shoulder landmarks are inside the deltoids; add 10% |
| Chest | 1.15 | Chest is ~15% wider than shoulder width |
| Waist | 1.16 | Detected waist contour is ~16% narrower than actual |
| Hip | 1.35 | Hip joints are well inside the widest hip point |
| Thigh | 0.5 × 1.2 = 0.6 | Thigh ≈ half hip width, then 20% correction |
| Neck | 2.0 | Nose-to-ear approximates half the neck width |
| Shirt length | 1.20 | Shoulder-to-hip + 20% extra below hip |
| Arm / Trouser | 1.0 | No correction |

## Implementation Plan

### Phase 1 — Foundation
1. **Install dependencies** in `hono/`:
   ```bash
   bun add hono @mediapipe/tasks-vision sharp onnxruntime-node zod @hono/zod-validator
   bun add -d @types/bun
   ```
2. **Configure `tsconfig.json`**:
   ```json
   {
     "compilerOptions": {
       "strict": true,
       "jsx": "react-jsx",
       "jsxImportSource": "hono/jsx",
       "esModuleInterop": true,
       "allowSyntheticDefaultImports": true,
       "moduleResolution": "bundler",
       "paths": {
         "@/*": ["src/*"]
       }
     }
   }
   ```
3. **Create `src/constants.ts`**:
   ```ts
   export const DEFAULT_HEIGHT_CM = 152.0;
   export const FOCAL_LENGTH = 600;
   export const KNOWN_OBJECT_WIDTH_CM = 21.0;
   export const DEPTH_TO_WIDTH_RATIO = 0.7;
   export const CORRECTIONS = {
     SHOULDER: 1.10,
     CHEST: 1.15,
     WAIST: 1.16,
     HIP: 1.35,
     THIGH: 1.2,
     SHIRT_LENGTH: 1.2,
   } as const;
   ```
4. **Create `src/types/index.ts`**:
   - `NormalizedLandmark`: `{ x: number; y: number; z: number; visibility: number; presence?: number }`.
   - `Measurements`: record of all output keys (shoulder_width, chest_width, chest_circumference, waist_width, waist, hip_width, hip, neck, neck_width, arm_length, shirt_length, thigh, thigh_circumference, trouser_length).
   - `PoseLandmarks` constant map (33 indices from latest reference).

### Phase 2 — Image and Pose Pipeline (Latest MediaPipe)
1. **Create `src/services/pose.ts`** using the latest `PoseLandmarker` API:
   ```ts
   import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
   import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

   const MODEL_URL =
     "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";

   let landmarker: PoseLandmarker | null = null;

   export async function getPoseLandmarker(): Promise<PoseLandmarker> {
     if (landmarker) return landmarker;
     const vision = await FilesetResolver.forVisionTasks(
       "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
     );
     landmarker = await PoseLandmarker.createFromOptions(vision, {
       baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
       runningMode: "IMAGE",
       numPoses: 1,
       minPoseDetectionConfidence: 0.5,
       minPosePresenceConfidence: 0.5,
       minTrackingConfidence: 0.5,
     });
     return landmarker;
   }

   export async function detectPose(
     imageData: ImageData
   ): Promise<NormalizedLandmark[] | null> {
     const lm = await getPoseLandmarker();
     const result = lm.detect(imageData);
     return result.landmarks?.[0] ?? null;
   }
   ```
2. **Create `src/services/image.ts`**:
   - `toImageData(input: Buffer | ArrayBuffer): Promise<ImageData>` — convert to RGBA raw pixels and return a native `ImageData` object compatible with `PoseLandmarker.detect()`:
     ```ts
     import sharp from "sharp";

     export async function toImageData(input: Buffer | ArrayBuffer): Promise<ImageData> {
       const { data, info } = await sharp(input)
         .raw()
         .ensureAlpha()
         .toBuffer({ resolveWithObject: true });
       return new ImageData(
         new Uint8ClampedArray(data),
         info.width,
         info.height
       );
     }
     ```
   - If `ImageData` is not defined globally in Bun/Node, import from `@napi-rs/canvas` or `canvas`.
   - `getBodyWidthAtHeight(imageData: ImageData, y: number, centerX: number): number` — grayscale, blur, threshold, scan horizontal line from center to find dark edges, apply 10% minimum width guard.
3. **Create `src/utils/validators.ts`**:
   - Port `validate_front_image` to TypeScript.
   - Required landmarks: NOSE, LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_ELBOW, RIGHT_ELBOW, LEFT_KNEE, RIGHT_KNEE.
   - Check `visibility >= 0.5` and coordinates inside [0, 1].
   - Reject selfies if `shoulder_width < head_to_shoulder * 1.2`.
   - Build missing-landmark labels from the `POSE_LANDMARKS` map (no `.name` property in JS).

### Phase 3 — Measurement Calculations (Core Focus)
Create `src/services/measurements.ts` and port each function with exact types and math:

1. **`calculateDistanceUsingHeight`**
   ```ts
   export function calculateDistanceUsingHeight(
     landmarks: NormalizedLandmark[],
     imageHeight: number,
     userHeightCm: number
   ): { distance: number; scaleFactor: number } {
     const topHead = landmarks[POSE_LANDMARKS.NOSE].y * imageHeight;
     const bottomFoot = Math.max(
       landmarks[POSE_LANDMARKS.LEFT_ANKLE].y,
       landmarks[POSE_LANDMARKS.RIGHT_ANKLE].y
     ) * imageHeight;
     const personHeightPx = Math.abs(bottomFoot - topHead);
     const distance = (userHeightCm * FOCAL_LENGTH) / personHeightPx;
     const scaleFactor = userHeightCm / personHeightPx;
     return { distance, scaleFactor };
   }
   ```

2. **`calculateCircumference(widthPx, depthRatio, scaleFactor)`**
   - `widthCm = widthPx * scaleFactor`
   - `depthCm = widthCm * depthRatio * DEPTH_TO_WIDTH_RATIO`
   - `a = widthCm / 2`, `b = depthCm / 2`
   - `C = 2 * π * sqrt((a² + b²) / 2)`
   - Round to 2 decimals.

3. **`getBodyWidthAtHeight(imageData, yPx, centerXNorm)`**
   - Convert imageData to grayscale, apply a lightweight Gaussian blur (3×3 or 5×5 approx).
   - Binary threshold at 50 (person brighter than background).
   - Scan the row `yPx` from `centerX` left and right until the first dark pixel.
   - `widthPx = right - left`; if `widthPx < 0.1 * imageWidth`, use `0.1 * imageWidth`.
   - Clamp y to image bounds.

4. **`calculateMeasurements(landmarks, scaleFactor, imageWidth, imageHeight, depthMap?, imageData?, userHeightCm?)`**
   - If `userHeightCm` is provided, recalculate `scaleFactor` from `calculateDistanceUsingHeight`.
   - Shoulder width: `(right_shoulder.x - left_shoulder.x) * imageWidth * 1.10`.
   - Chest: `chest_y = shoulder_y + (hip_y - shoulder_y) * 0.15`. Base width = shoulder width × 1.15. If `imageData` is available, scan at `chest_y` and take `max(baseWidth, detectedWidth)`. If depth map available, compute `depth_ratio` at chest center scaled to 384×384.
   - Waist: `waist_y = shoulder_y + (hip_y - shoulder_y) * 0.35`. Scan at `waist_y`; fallback to `hip_width * 0.9`. Apply `× 1.16`. Compute depth ratio if available.
   - Hip: `(right_hip.x - left_hip.x) * imageWidth * 1.35`. Scan 10% below hip toward knee; take `max(landmarkWidth, detectedWidth)`. Compute depth ratio if available.
   - Neck: `abs(nose.x - left_ear.x) * imageWidth * 2.0`. Circumference with `depth_ratio = 1.0`.
   - Arm length: `abs(left_shoulder.y - left_wrist.y) * imageHeight`.
   - Shirt length: `abs(left_shoulder.y - left_hip.y) * imageHeight * 1.2`.
   - Thigh: `thigh_y = hip_y + (knee_y - hip_y) * 0.2`. Base width = hip_width × 0.5 × 1.2. Scan at `thigh_y` if available and use detected width if `0 < detected < hip_width`. Compute depth ratio if available.
   - Trouser length: `abs(left_hip.y - left_ankle.y) * imageHeight`.
   - Return all 14 measurement keys.

5. **Depth-ratio helper**
   ```ts
   function computeDepthRatio(depthMap: Float32Array, x: number, y: number, width: number): number {
     const yScaled = Math.min(383, Math.max(0, Math.round(y * 384 / imageHeight)));
     const xScaled = Math.min(383, Math.max(0, Math.round(x * 384 / imageWidth)));
     const depth = depthMap[yScaled * 384 + xScaled];
     const maxDepth = Math.max(...depthMap);
     return 1.0 + 0.5 * (1.0 - depth / maxDepth);
   }
   ```

### Phase 4 — Depth Estimation (Optional but Recommended)
1. **Add `src/services/depth.ts`**:
   - Download a pre-converted MiDaS ONNX model (e.g., `midas_small.onnx`) into `hono/models/`.
   - Use `onnxruntime-node` to load and run inference:
     ```ts
     import * as ort from "onnxruntime-node";

     let session: ort.InferenceSession | null = null;

     export async function getDepthSession(): Promise<ort.InferenceSession> {
       if (session) return session;
       session = await ort.InferenceSession.create("./models/midas_small.onnx");
       return session;
     }
     ```
   - Preprocess: resize RGB image to 384×384, normalize to [0, 1], create tensor `[1, 3, 384, 384]`.
   - Postprocess: squeeze output, return 384×384 `Float32Array` depth map.
2. **Integrate depth ratios** in `calculateMeasurements` as described in Phase 3.

### Phase 5 — API Route
1. **Create `src/routes/measurements.ts`**:
   - Define Zod schema for multipart form:
     ```ts
     import { zValidator } from "@hono/zod-validator";
     import { z } from "zod";

     const schema = z.object({
       front: z.instanceof(File),
       left_side: z.instanceof(File).optional(),
       height_cm: z.string().optional().default("152"),
     });
     ```
   - `POST /upload_images` using `zValidator('form', schema)`.
   - Parse multipart form with `c.req.parseBody({ all: true })`.
   - Validate `front` image first; return `400` with `{ error, pose: "front", code: "INVALID_POSE" }` if invalid.
   - Parse `height_cm` as float (default `DEFAULT_HEIGHT_CM`).
   - For each provided image (`front`, `left_side`):
     - Read file as `ArrayBuffer`.
     - Decode with `sharp` and convert to `ImageData`.
     - Detect pose with `PoseLandmarker`.
     - If `front`, calibrate scale using `calculateDistanceUsingHeight`.
     - Optionally compute depth map.
     - If pose exists, compute measurements and merge into result.
   - Return JSON:
     ```json
     { "measurements": { ... }, "debug_info": { "scale_factor", "focal_length", "user_height_cm" } }
     ```
2. **Update `src/index.ts`**:
   ```ts
   import { Hono } from "hono";
   import { logger } from "hono/logger";
   import { cors } from "hono/cors";
   import measurementsRoute from "./routes/measurements";

   const app = new Hono();

   app.use(logger());
   app.use(cors());
   app.route("/", measurementsRoute);

   app.onError((err, c) => {
     console.error(err);
     return c.json({ error: "Internal Server Error" }, 500);
   });

   export default app;
   ```

## API Contract (Same as Flask)

- **Request**: `POST /upload_images`
  - `front`: File (required)
  - `left_side`: File (optional)
  - `height_cm`: string number (optional, default 152.0)
- **Success 200**: `{ measurements: { ... }, debug_info: { scale_factor, focal_length, user_height_cm } }`
- **Validation 400**: `{ error: string, pose: "front", code: "INVALID_POSE" }`

## Verification Strategy
1. **Unit tests with `app.request()`** (Hono built-in testing):
   - Test valid front image returns all 14 expected measurement keys.
   - Test missing `front` returns 400.
   - Test invalid/selfie image returns `INVALID_POSE`.
2. **Regression test**:
   - Run the existing Flask app and the new Hono app against `front.jpeg` and `left_side.jpeg` in the repo root.
   - Compare measurement values; small differences are expected due to runtime/model differences, but values should be within ±5%.
3. **Manual test**:
   - `bun run dev` then `curl -F front=@front.jpeg -F left_side=@left_side.jpeg -F height_cm=170 http://localhost:3000/upload_images`.

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| `@mediapipe/tasks-vision` expects browser APIs | Feed `ImageData` created from `sharp` raw pixels; if `ImageData` is missing globally, import from `canvas` or `@napi-rs/canvas`. If internal checks still fail, switch to ONNX BlazePose. |
| MiDaS ONNX model setup is complex | Phase 1–3 ship without depth (fixed ratios). Depth is added in Phase 4. |
| OpenCV contour logic missing | Reimplement using raw pixel arrays from `sharp`; fallback to landmark-based width if contour detection fails. |
| Bun compatibility with native deps | Test `sharp` and `onnxruntime-node` under Bun; if needed, run with Node.js via `@hono/node-server`. |
| Heavy model download on first request | Lazy-load and cache `PoseLandmarker` singleton; consider warming at startup. |
| Small errors in scale_factor multiply all outputs | Reuse the exact height-calibration formula; add unit tests with synthetic landmarks. |

## Next Steps
1. Run `bun install` for the new dependencies.
2. Implement Phases 1–3 to get a working measurement endpoint without depth.
3. Verify against the sample images and compare with Flask outputs.
4. Add Phase 4 depth estimation if required for accuracy.
