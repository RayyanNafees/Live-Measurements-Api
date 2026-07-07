# MediaPipe Pose Landmarker Examples

## 1. Minimal: load model and run detection on webcam

```ts
import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";

async function run() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
  );
  const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  const video = document.createElement("video");
  video.srcObject = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, facingMode: "user" },
    audio: false,
  });
  await video.play();

  let lastTime = 0;
  function loop() {
    if (video.readyState >= 2 && performance.now() - lastTime > 33) {
      lastTime = performance.now();
      const result = poseLandmarker.detectForVideo(video, lastTime);
      if (result.landmarks?.length) {
        const landmarks = result.landmarks[0];
        console.log("nose", landmarks[0].x, landmarks[0].y);
      }
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
run();
```

## 2. Draw skeleton overlay on video (Canvas)

Use the same `landmarks` and `POSE_CONNECTIONS` from [reference.md](reference.md). Draw after each detection frame (e.g. in the same loop as above).

```ts
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

const POSE_CONNECTIONS: [number, number][] = [
  [11, 12],
  [11, 23],
  [12, 24],
  [23, 24],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
  [7, 2],
  [8, 5],
  [2, 0],
  [5, 0],
  [9, 10],
];

function getConfidenceColor(visibility: number): string {
  if (visibility > 0.8) return "#22c55e";
  if (visibility > 0.5) return "#eab308";
  return "#ef4444";
}

function drawPose(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  width: number,
  height: number,
) {
  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = 2;
  for (const [i, j] of POSE_CONNECTIONS) {
    const a = landmarks[i];
    const b = landmarks[j];
    if (!a || !b) continue;
    const vis = ((a.visibility ?? 1) + (b.visibility ?? 1)) / 2;
    if (vis < 0.3) continue;
    ctx.strokeStyle = getConfidenceColor(vis);
    ctx.globalAlpha = Math.max(0.3, vis);
    ctx.beginPath();
    ctx.moveTo(a.x * width, a.y * height);
    ctx.lineTo(b.x * width, b.y * height);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < landmarks.length; i++) {
    const p = landmarks[i];
    const vis = p.visibility ?? 1;
    if (vis < 0.3) continue;
    ctx.fillStyle = getConfidenceColor(vis);
    ctx.beginPath();
    ctx.arc(p.x * width, p.y * height, 5, 0, 2 * Math.PI);
    ctx.fill();
  }
}
```

Resize canvas to `video.videoWidth` / `video.videoHeight` and call `drawPose(ctx, result.landmarks[0], canvas.width, canvas.height)` each time you get a new result.

## 3. Landmarks to control values (simplified)

Example: derive **pitch** (arms up/down), **bank** (wrist line tilt), and **boost** (hands forward) from landmarks. Use indices from [reference.md](reference.md) (e.g. 11/12 shoulders, 15/16 wrists).

```ts
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

const LEFT_SHOULDER = 11,
  RIGHT_SHOULDER = 12;
const LEFT_WRIST = 15,
  RIGHT_WRIST = 16;

function getLandmark(
  landmarks: NormalizedLandmark[],
  index: number,
  minVis: number,
): NormalizedLandmark | null {
  const p = landmarks[index];
  if (!p || (p.visibility ?? 1) < minVis) return null;
  return p;
}

// Arm angle from horizontal (degrees). Positive = up.
function armAngle(
  shoulder: NormalizedLandmark,
  wrist: NormalizedLandmark,
): number {
  const dy = shoulder.y - wrist.y;
  const dx = Math.abs(wrist.x - shoulder.x);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

// Bank: angle of line left wrist -> right wrist (degrees). Positive = right hand higher.
function wristLineAngle(
  left: NormalizedLandmark,
  right: NormalizedLandmark,
): number {
  const dy = right.y - left.y;
  const dx = right.x - left.x;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

function landmarksToControl(
  landmarks: NormalizedLandmark[],
  minVis = 0.5,
): { pitch: number; bank: number; boost: boolean } {
  const ls = getLandmark(landmarks, LEFT_SHOULDER, minVis);
  const rs = getLandmark(landmarks, RIGHT_SHOULDER, minVis);
  const lw = getLandmark(landmarks, LEFT_WRIST, minVis);
  const rw = getLandmark(landmarks, RIGHT_WRIST, minVis);

  let pitch = 0;
  let bank = 0;
  let boost = false;

  if (ls && rs && lw && rw) {
    const leftArm = armAngle(ls, lw);
    const rightArm = armAngle(rs, rw);
    pitch = (leftArm + rightArm) / 2 / 45; // normalize by 45°
    pitch = Math.max(-1, Math.min(1, pitch));

    bank = wristLineAngle(lw, rw) / 30; // normalize by 30°
    bank = Math.max(-1, Math.min(1, bank));

    const shoulderZ = (ls.z + rs.z) / 2;
    const wristZ = (lw.z + rw.z) / 2;
    const handsForward = wristZ < shoulderZ - 0.05;
    const chestLevel = Math.abs((lw.y + rw.y) / 2 - (ls.y + rs.y) / 2) < 0.15;
    boost = handsForward && chestLevel;
  }

  return { pitch, bank, boost };
}
```

For full smoothing, dead zones, and gesture toggles (e.g. hands overhead), see this project’s [pose-to-flight.ts](src/lib/pose-to-flight.ts).
