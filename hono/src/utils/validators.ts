import type { NormalizedLandmark, PoseLandmarkName } from "@/types";
import { POSE_LANDMARKS } from "@/types";

const REQUIRED_LANDMARKS: PoseLandmarkName[] = [
  "NOSE",
  "LEFT_SHOULDER",
  "RIGHT_SHOULDER",
  "LEFT_ELBOW",
  "RIGHT_ELBOW",
  "LEFT_KNEE",
  "RIGHT_KNEE",
];

const LANDMARK_LABELS: Record<PoseLandmarkName, string> = {
  NOSE: "nose",
  LEFT_EYE_INNER: "left eye inner",
  LEFT_EYE: "left eye",
  LEFT_EYE_OUTER: "left eye outer",
  RIGHT_EYE_INNER: "right eye inner",
  RIGHT_EYE: "right eye",
  RIGHT_EYE_OUTER: "right eye outer",
  LEFT_EAR: "left ear",
  RIGHT_EAR: "right ear",
  MOUTH_LEFT: "mouth left",
  MOUTH_RIGHT: "mouth right",
  LEFT_SHOULDER: "left shoulder",
  RIGHT_SHOULDER: "right shoulder",
  LEFT_ELBOW: "left elbow",
  RIGHT_ELBOW: "right elbow",
  LEFT_WRIST: "left wrist",
  RIGHT_WRIST: "right wrist",
  LEFT_PINKY: "left pinky",
  RIGHT_PINKY: "right pinky",
  LEFT_INDEX: "left index",
  RIGHT_INDEX: "right index",
  LEFT_THUMB: "left thumb",
  RIGHT_THUMB: "right thumb",
  LEFT_HIP: "left hip",
  RIGHT_HIP: "right hip",
  LEFT_KNEE: "left knee",
  RIGHT_KNEE: "right knee",
  LEFT_ANKLE: "left ankle",
  RIGHT_ANKLE: "right ankle",
  LEFT_HEEL: "left heel",
  RIGHT_HEEL: "right heel",
  LEFT_FOOT_INDEX: "left foot index",
  RIGHT_FOOT_INDEX: "right foot index",
};

export function validateFrontImage(
  landmarks: NormalizedLandmark[] | null,
  imageWidth: number,
  imageHeight: number
): { valid: boolean; message: string } {
  if (!landmarks) {
    return {
      valid: false,
      message:
        "No person detected. Please make sure you're clearly visible in the frame.",
    };
  }

  const missing: string[] = [];
  for (const name of REQUIRED_LANDMARKS) {
    const idx = POSE_LANDMARKS[name];
    const landmark = landmarks[idx];
    if (
      !landmark ||
      (landmark.visibility ?? 1) < 0.5 ||
      landmark.x < 0 ||
      landmark.x > 1 ||
      landmark.y < 0 ||
      landmark.y > 1
    ) {
      missing.push(LANDMARK_LABELS[name]);
    }
  }

  if (missing.length > 0) {
    return {
      valid: false,
      message: "Couldn't detect full body. Please make sure your full body is visible.",
    };
  }

  const nose = landmarks[POSE_LANDMARKS.NOSE];
  const leftShoulder = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
  const rightShoulder = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];

  const shoulderWidth =
    Math.abs(leftShoulder.x - rightShoulder.x) * imageWidth;
  const headToShoulder =
    Math.abs(leftShoulder.y - nose.y) * imageHeight;

  if (shoulderWidth < headToShoulder * 1.2) {
    return {
      valid: false,
      message:
        "Please step back to show more of your upper body, not just your face.",
    };
  }

  return {
    valid: true,
    message: "Validation passed - proceeding with measurements",
  };
}
