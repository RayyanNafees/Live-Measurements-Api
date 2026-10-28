import sys
import json
import cv2
import mediapipe as mp


def detect_pose(image_path: str):
    mp_holistic = mp.solutions.holistic

    image = cv2.imread(image_path)
    if image is None:
        raise ValueError(f"Could not load image: {image_path}")

    image_height, image_width = image.shape[:2]
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

    with mp_holistic.Holistic(
        static_image_mode=True,
        model_complexity=1,
        enable_segmentation=False,
        refine_face_landmarks=False,
    ) as holistic:
        results = holistic.process(rgb)

    if not results.pose_landmarks:
        return {
            "success": False,
            "error": "No pose detected",
            "image_width": image_width,
            "image_height": image_height,
        }

    landmarks = [
        {
            "x": lm.x,
            "y": lm.y,
            "z": lm.z,
            "visibility": lm.visibility,
        }
        for lm in results.pose_landmarks.landmark
    ]

    return {
        "success": True,
        "landmarks": landmarks,
        "image_width": image_width,
        "image_height": image_height,
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Missing image path"}), file=sys.stderr)
        sys.exit(1)

    image_path = sys.argv[1]
    try:
        result = detect_pose(image_path)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}), file=sys.stderr)
        sys.exit(1)
