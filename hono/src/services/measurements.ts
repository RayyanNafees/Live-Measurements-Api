import {
  CORRECTIONS,
  DEFAULT_HEIGHT_CM,
  DEPTH_MAP_SIZE,
  DEPTH_TO_WIDTH_RATIO,
  FOCAL_LENGTH,
} from "@/constants";
import { getBodyWidthAtHeight } from "@/services/image";
import type { RawImageData } from "@/services/image";
import type { Measurements, NormalizedLandmark } from "@/types";
import { POSE_LANDMARKS } from "@/types";

export function calculateDistanceUsingHeight(
  landmarks: NormalizedLandmark[],
  imageHeight: number,
  userHeightCm: number
): { distance: number; scaleFactor: number } {
  const topHead = landmarks[POSE_LANDMARKS.NOSE].y * imageHeight;
  const bottomFoot =
    Math.max(
      landmarks[POSE_LANDMARKS.LEFT_ANKLE].y,
      landmarks[POSE_LANDMARKS.RIGHT_ANKLE].y
    ) * imageHeight;
  const personHeightPx = Math.abs(bottomFoot - topHead);
  const distance = (userHeightCm * FOCAL_LENGTH) / personHeightPx;
  const scaleFactor = userHeightCm / personHeightPx;
  return { distance, scaleFactor };
}

export function calculateCircumference(
  widthPx: number,
  scaleFactor: number,
  depthRatio = 1.0
): number {
  const widthCm = widthPx * scaleFactor;
  const estimatedDepthCm = widthCm * depthRatio * DEPTH_TO_WIDTH_RATIO;
  const halfWidth = widthCm / 2;
  const halfDepth = estimatedDepthCm / 2;
  return round(
    2 * Math.PI * Math.sqrt((halfWidth ** 2 + halfDepth ** 2) / 2),
    2
  );
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function pixelToCm(value: number, scaleFactor: number): number {
  return round(value * scaleFactor, 2);
}

function computeDepthRatio(
  depthMap: Float32Array,
  imageWidth: number,
  imageHeight: number,
  x: number,
  y: number
): number {
  const scaleX = DEPTH_MAP_SIZE / imageWidth;
  const scaleY = DEPTH_MAP_SIZE / imageHeight;
  const xScaled = Math.min(
    DEPTH_MAP_SIZE - 1,
    Math.max(0, Math.round(x * scaleX))
  );
  const yScaled = Math.min(
    DEPTH_MAP_SIZE - 1,
    Math.max(0, Math.round(y * scaleY))
  );
  const depth = depthMap[yScaled * DEPTH_MAP_SIZE + xScaled];
  const maxDepth = Math.max(...depthMap);
  if (maxDepth === 0) return 1.0;
  return 1.0 + 0.5 * (1.0 - depth / maxDepth);
}

export function calculateMeasurements(
  landmarks: NormalizedLandmark[],
  initialScaleFactor: number,
  imageWidth: number,
  imageHeight: number,
  depthMap?: Float32Array,
  imageData?: RawImageData,
  userHeightCm?: number
): Measurements {
  let scaleFactor = initialScaleFactor;
  if (userHeightCm) {
    const calibrated = calculateDistanceUsingHeight(
      landmarks,
      imageHeight,
      userHeightCm
    );
    scaleFactor = calibrated.scaleFactor;
  }

  const leftShoulder = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
  const rightShoulder = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
  const leftHip = landmarks[POSE_LANDMARKS.LEFT_HIP];
  const rightHip = landmarks[POSE_LANDMARKS.RIGHT_HIP];
  const leftKnee = landmarks[POSE_LANDMARKS.LEFT_KNEE];
  const leftWrist = landmarks[POSE_LANDMARKS.LEFT_WRIST];
  const leftAnkle = landmarks[POSE_LANDMARKS.LEFT_ANKLE];
  const nose = landmarks[POSE_LANDMARKS.NOSE];
  const leftEar = landmarks[POSE_LANDMARKS.LEFT_EAR];

  const measurements: Partial<Measurements> = {};

  // Shoulder width
  const shoulderWidthPx =
    Math.abs(leftShoulder.x - rightShoulder.x) * imageWidth *
    CORRECTIONS.SHOULDER;
  measurements.shoulder_width = pixelToCm(shoulderWidthPx, scaleFactor);

  // Chest
  const chestYRatio = 0.15;
  const chestY =
    leftShoulder.y + (leftHip.y - leftShoulder.y) * chestYRatio;
  let chestWidthPx =
    Math.abs(rightShoulder.x - leftShoulder.x) * imageWidth *
    CORRECTIONS.CHEST;

  if (imageData) {
    const chestYPx = Math.round(chestY * imageHeight);
    const centerX = (leftShoulder.x + rightShoulder.x) / 2;
    const detectedWidth = getBodyWidthAtHeight(imageData, chestYPx, centerX);
    if (detectedWidth > 0) {
      chestWidthPx = Math.max(chestWidthPx, detectedWidth);
    }
  }

  let chestDepthRatio = 1.0;
  if (depthMap) {
    const chestX = ((leftShoulder.x + rightShoulder.x) / 2) * imageWidth;
    const chestYPx = chestY * imageHeight;
    chestDepthRatio = computeDepthRatio(
      depthMap,
      imageWidth,
      imageHeight,
      chestX,
      chestYPx
    );
  }

  measurements.chest_width = pixelToCm(chestWidthPx, scaleFactor);
  measurements.chest_circumference = calculateCircumference(
    chestWidthPx,
    scaleFactor,
    chestDepthRatio
  );

  // Waist
  const waistYRatio = 0.35;
  const waistY =
    leftShoulder.y + (leftHip.y - leftShoulder.y) * waistYRatio;
  let waistWidthPx: number;

  if (imageData) {
    const waistYPx = Math.round(waistY * imageHeight);
    const centerX = (leftHip.x + rightHip.x) / 2;
    const detectedWidth = getBodyWidthAtHeight(imageData, waistYPx, centerX);
    if (detectedWidth > 0) {
      waistWidthPx = detectedWidth;
    } else {
      waistWidthPx =
        Math.abs(rightHip.x - leftHip.x) * imageWidth * 0.9;
    }
  } else {
    waistWidthPx =
      Math.abs(rightHip.x - leftHip.x) * imageWidth * 0.9;
  }
  waistWidthPx *= CORRECTIONS.WAIST;

  let waistDepthRatio = 1.0;
  if (depthMap) {
    const waistX = ((leftHip.x + rightHip.x) / 2) * imageWidth;
    const waistYPx = waistY * imageHeight;
    waistDepthRatio = computeDepthRatio(
      depthMap,
      imageWidth,
      imageHeight,
      waistX,
      waistYPx
    );
  }

  measurements.waist_width = pixelToCm(waistWidthPx, scaleFactor);
  measurements.waist = calculateCircumference(
    waistWidthPx,
    scaleFactor,
    waistDepthRatio
  );

  // Hip
  const hipWidthPx =
    Math.abs(leftHip.x - rightHip.x) * imageWidth * CORRECTIONS.HIP;
  let finalHipWidthPx = hipWidthPx;

  if (imageData) {
    const hipYOffset = 0.1;
    const hipY =
      leftHip.y + (leftKnee.y - leftHip.y) * hipYOffset;
    const hipYPx = Math.round(hipY * imageHeight);
    const centerX = (leftHip.x + rightHip.x) / 2;
    const detectedWidth = getBodyWidthAtHeight(imageData, hipYPx, centerX);
    if (detectedWidth > 0) {
      finalHipWidthPx = Math.max(hipWidthPx, detectedWidth);
    }
  }

  let hipDepthRatio = 1.0;
  if (depthMap) {
    const hipX = ((leftHip.x + rightHip.x) / 2) * imageWidth;
    const hipYPx = leftHip.y * imageHeight;
    hipDepthRatio = computeDepthRatio(
      depthMap,
      imageWidth,
      imageHeight,
      hipX,
      hipYPx
    );
  }

  measurements.hip_width = pixelToCm(finalHipWidthPx, scaleFactor);
  measurements.hip = calculateCircumference(
    finalHipWidthPx,
    scaleFactor,
    hipDepthRatio
  );

  // Neck
  const neckWidthPx =
    Math.abs(nose.x - leftEar.x) * imageWidth * 2.0;
  measurements.neck = calculateCircumference(neckWidthPx, scaleFactor, 1.0);
  measurements.neck_width = pixelToCm(neckWidthPx, scaleFactor);

  // Arm length
  const sleeveLengthPx =
    Math.abs(leftShoulder.y - leftWrist.y) * imageHeight;
  measurements.arm_length = pixelToCm(sleeveLengthPx, scaleFactor);

  // Shirt length
  const shirtLengthPx =
    Math.abs(leftShoulder.y - leftHip.y) * imageHeight *
    CORRECTIONS.SHIRT_LENGTH;
  measurements.shirt_length = pixelToCm(shirtLengthPx, scaleFactor);

  // Thigh
  const thighYRatio = 0.2;
  const thighY = leftHip.y + (leftKnee.y - leftHip.y) * thighYRatio;
  let thighWidthPx = finalHipWidthPx * 0.5 * CORRECTIONS.THIGH;

  if (imageData) {
    const thighYPx = Math.round(thighY * imageHeight);
    const thighX = leftHip.x * 0.9;
    const detectedWidth = getBodyWidthAtHeight(imageData, thighYPx, thighX);
    if (detectedWidth > 0 && detectedWidth < finalHipWidthPx) {
      thighWidthPx = detectedWidth;
    }
  }

  let thighDepthRatio = 1.0;
  if (depthMap) {
    const thighXPx = leftHip.x * imageWidth;
    const thighYPx = thighY * imageHeight;
    thighDepthRatio = computeDepthRatio(
      depthMap,
      imageWidth,
      imageHeight,
      thighXPx,
      thighYPx
    );
  }

  measurements.thigh = pixelToCm(thighWidthPx, scaleFactor);
  measurements.thigh_circumference = calculateCircumference(
    thighWidthPx,
    scaleFactor,
    thighDepthRatio
  );

  // Trouser length
  const trouserLengthPx =
    Math.abs(leftHip.y - leftAnkle.y) * imageHeight;
  measurements.trouser_length = pixelToCm(trouserLengthPx, scaleFactor);

  return measurements as Measurements;
}
