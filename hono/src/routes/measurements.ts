import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { DEFAULT_HEIGHT_CM, FOCAL_LENGTH } from "@/constants";
import { detectPose } from "@/services/pose";
import {
  calculateDistanceUsingHeight,
  calculateMeasurements,
} from "@/services/measurements";
import { toImageData } from "@/services/image";
import type { RawImageData } from "@/services/image";
import { validateFrontImage } from "@/utils/validators";
import type { Measurements, UploadImagesResponse } from "@/types";

const schema = z.object({
  front: z.instanceof(File),
  left_side: z.instanceof(File).optional(),
  height_cm: z.string().optional().default(String(DEFAULT_HEIGHT_CM)),
});

const route = new Hono();

route.post(
  "/upload_images",
  zValidator("form", schema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: "Missing front image for reference.",
          pose: "front",
          code: "INVALID_POSE",
        },
        400
      );
    }
  }),
  async (c) => {
  const body = c.req.valid("form");
  const frontFile = body.front;

  let userHeightCm: number;
  try {
    userHeightCm = parseFloat(body.height_cm ?? String(DEFAULT_HEIGHT_CM));
    if (Number.isNaN(userHeightCm)) {
      userHeightCm = DEFAULT_HEIGHT_CM;
    }
  } catch {
    userHeightCm = DEFAULT_HEIGHT_CM;
  }

  const frontBuffer = await frontFile.arrayBuffer();
  const {
    landmarks: frontLandmarks,
    width: imageWidth,
    height: imageHeight,
  } = await detectPose(frontBuffer);
  const frontImageData = await toImageData(frontBuffer);

  const validation = validateFrontImage(frontLandmarks, imageWidth, imageHeight);
  if (!validation.valid) {
    return c.json(
      {
        error: validation.message,
        pose: "front",
        code: "INVALID_POSE",
      },
      400
    );
  }

  const results: Record<
    string,
    {
      landmarks: NonNullable<typeof frontLandmarks>;
      imageData: RawImageData;
      width: number;
      height: number;
    }
  > = {
    front: {
      landmarks: frontLandmarks!,
      imageData: frontImageData,
      width: imageWidth,
      height: imageHeight,
    },
  };

  if (body.left_side) {
    const leftBuffer = await body.left_side.arrayBuffer();
    const leftPose = await detectPose(leftBuffer);
    if (leftPose.landmarks) {
      const leftImageData = await toImageData(leftBuffer);
      results.left_side = {
        landmarks: leftPose.landmarks,
        imageData: leftImageData,
        width: leftPose.width,
        height: leftPose.height,
      };
    }
  }

  let scaleFactor: number | null = null;
  const measurements: Partial<Measurements> = {};

  for (const [poseName, result] of Object.entries(results)) {
    if (poseName === "front") {
      const { scaleFactor: sf } = calculateDistanceUsingHeight(
        result.landmarks,
        result.height,
        userHeightCm
      );
      scaleFactor = sf;

      const calibrated = calculateMeasurements(
        result.landmarks,
        scaleFactor,
        result.width,
        result.height,
        undefined,
        result.imageData,
        userHeightCm
      );
      Object.assign(measurements, calibrated);
    }
  }

  const response: UploadImagesResponse = {
    measurements,
    debug_info: {
      scale_factor: scaleFactor,
      focal_length: FOCAL_LENGTH,
      user_height_cm: userHeightCm,
    },
  };

  return c.json(response, 200);
});

export default route;
