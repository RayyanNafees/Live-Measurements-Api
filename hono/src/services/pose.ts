import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import type { NormalizedLandmark } from "@/types";

function toBuffer(input: ArrayBuffer | Buffer): Buffer {
  if (Buffer.isBuffer(input)) return input;
  return Buffer.from(input);
}

const PYTHON_EXE = "D:\\NeoMeta\\Live-Measurements-Api\\.venv\\Scripts\\python.exe";
const DETECT_SCRIPT = "D:\\NeoMeta\\Live-Measurements-Api\\hono\\scripts\\detect_pose.py";

export async function detectPose(
  imageBuffer: ArrayBuffer | Buffer
): Promise<{
  landmarks: NormalizedLandmark[] | null;
  width: number;
  height: number;
}> {
  const tmpFile = path.join(os.tmpdir(), `pose-${Date.now()}.jpg`);
  await fs.writeFile(tmpFile, toBuffer(imageBuffer));

  try {
    const output = await new Promise<string>((resolve, reject) => {
      let stdout = "";
      let stderr = "";

      const proc = spawn(PYTHON_EXE, [DETECT_SCRIPT, tmpFile], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`Python bridge failed: ${stderr || stdout}`));
        } else {
          resolve(stdout);
        }
      });

      proc.on("error", reject);
    });

    const result = JSON.parse(output);
    if (!result.success) {
      return {
        landmarks: null,
        width: result.image_width,
        height: result.image_height,
      };
    }

    return {
      landmarks: result.landmarks.map((lm: any) => ({
        x: lm.x,
        y: lm.y,
        z: lm.z,
        visibility: lm.visibility,
      })),
      width: result.image_width,
      height: result.image_height,
    };
  } finally {
    await fs.unlink(tmpFile).catch(() => {});
  }
}
