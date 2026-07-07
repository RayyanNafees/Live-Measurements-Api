# MediaPipe Pose Landmarker Reference

## Landmark Indices (33 points)

| Index | Name             |
| ----- | ---------------- |
| 0     | NOSE             |
| 1     | LEFT_EYE_INNER   |
| 2     | LEFT_EYE         |
| 3     | LEFT_EYE_OUTER   |
| 4     | RIGHT_EYE_INNER  |
| 5     | RIGHT_EYE        |
| 6     | RIGHT_EYE_OUTER  |
| 7     | LEFT_EAR         |
| 8     | RIGHT_EAR        |
| 9     | MOUTH_LEFT       |
| 10    | MOUTH_RIGHT      |
| 11    | LEFT_SHOULDER    |
| 12    | RIGHT_SHOULDER   |
| 13    | LEFT_ELBOW       |
| 14    | RIGHT_ELBOW      |
| 15    | LEFT_WRIST       |
| 16    | RIGHT_WRIST      |
| 17    | LEFT_PINKY       |
| 18    | RIGHT_PINKY      |
| 19    | LEFT_INDEX       |
| 20    | RIGHT_INDEX      |
| 21    | LEFT_THUMB       |
| 22    | RIGHT_THUMB      |
| 23    | LEFT_HIP         |
| 24    | RIGHT_HIP        |
| 25    | LEFT_KNEE        |
| 26    | RIGHT_KNEE       |
| 27    | LEFT_ANKLE       |
| 28    | RIGHT_ANKLE      |
| 29    | LEFT_HEEL        |
| 30    | RIGHT_HEEL       |
| 31    | LEFT_FOOT_INDEX  |
| 32    | RIGHT_FOOT_INDEX |

## POSE_LANDMARKS constant (TypeScript)

```ts
export const POSE_LANDMARKS = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,
  RIGHT_THUMB: 22,
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

## Skeleton connections (for drawing)

```ts
export const POSE_CONNECTIONS: [number, number][] = [
  [11, 12],
  [11, 23],
  [12, 24],
  [23, 24], // Torso
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16], // Arms
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28], // Legs
  [7, 2],
  [8, 5],
  [2, 0],
  [5, 0],
  [9, 10], // Face
];
```

Indices above match POSE_LANDMARKS (e.g. 11 = LEFT_SHOULDER, 12 = RIGHT_SHOULDER).

## NormalizedLandmark

From `@mediapipe/tasks-vision`:

- **x**, **y**: Normalized image coordinates in [0, 1] (x by width, y by height). Origin top-left; y increases downward.
- **z**: Relative depth with origin at hip midpoint. Smaller z = closer to camera. Scale roughly similar to x.
- **visibility**: Likelihood the landmark is visible in the image [0, 1]. Use for filtering.

## World landmarks

When using `result.worldLandmarks`: same 33 indices, coordinates in meters (x, y, z), origin at hip center. Useful for 3D pose or scale-invariant logic.

## Model URLs (Pose Landmarker .task)

| Variant | URL                                                                                                                        |
| ------- | -------------------------------------------------------------------------------------------------------------------------- |
| lite    | https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task   |
| full    | https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task   |
| heavy   | https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task |

Lite is fastest and lightest; heavy is most accurate and heaviest.

## Configuration options (createFromOptions)

| Option                     | Description                               | Default   |
| -------------------------- | ----------------------------------------- | --------- |
| runningMode                | `"IMAGE"` or `"VIDEO"`                    | `"IMAGE"` |
| numPoses                   | Max poses to detect                       | 1         |
| minPoseDetectionConfidence | Min confidence for pose detection [0, 1]  | 0.5       |
| minPosePresenceConfidence  | Min presence in landmark detection [0, 1] | 0.5       |
| minTrackingConfidence      | Min confidence for tracking [0, 1]        | 0.5       |
| outputSegmentationMasks    | Output segmentation mask per pose         | false     |

baseOptions:

| Option         | Description                                                   |
| -------------- | ------------------------------------------------------------- |
| modelAssetPath | URL or path to .task model                                    |
| delegate       | `"GPU"` or `"CPU"`; GPU may fallback to CPU on some platforms |

## Official docs

- [Pose Landmarker Web JS](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js)
- [Setup guide for web](https://ai.google.dev/edge/mediapipe/solutions/setup_web)
