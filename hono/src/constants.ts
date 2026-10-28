export const DEFAULT_HEIGHT_CM = 152.0;
export const FOCAL_LENGTH = 600;
export const KNOWN_OBJECT_WIDTH_CM = 21.0;
export const DEPTH_TO_WIDTH_RATIO = 0.7;

export const CORRECTIONS = {
  SHOULDER: 1.1,
  CHEST: 1.15,
  WAIST: 1.16,
  HIP: 1.35,
  THIGH: 1.2,
  SHIRT_LENGTH: 1.2,
} as const;

export const MIN_BODY_WIDTH_RATIO = 0.1;
export const BINARY_THRESHOLD = 50;

export const DEPTH_MAP_SIZE = 384;
