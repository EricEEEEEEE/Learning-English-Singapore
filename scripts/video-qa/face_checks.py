#!/usr/bin/env python3
"""C14-4 offline face checks for one generated video segment.

Run it isolated, never from inside a downloaded or media directory:

    python3 -I scripts/video-qa/face_checks.py --fetch-model      # one-off: official model into the local cache
    python3 -I scripts/video-qa/face_checks.py --probe            # are the libraries and the model usable?
    python3 -I scripts/video-qa/face_checks.py --video SEGMENT.mp4 --learner-windows '[{"start":6,"end":7.7}]'

Dependencies are pinned in scripts/video-qa/requirements.txt (MediaPipe, OpenCV headless, PySceneDetect).
The model is Google's official MediaPipe Face Landmarker .task bundle, kept in a local cache directory
(LES_VIDEO_QA_CACHE, default ~/.cache/les-video-qa) and checked against a pinned SHA-256. It is never committed
and only --fetch-model downloads it.

Two backends run the same official model:
  mediapipe   MediaPipe Tasks FaceLandmarker (IMAGE mode), preferred.
  opencv-dnn  the detector and landmark .tflite files from that same .task bundle, run with OpenCV DNN, used when
              the MediaPipe native library cannot load (mediapipe 1.1.1 needs the system libEGL.so.1/libGLESv2.so.2;
              without them it raises OSError). BlazeFace short-range decoding, weighted NMS and the 1.5x rotated face
              crop follow MediaPipe's published face landmarker graph.

Output is one JSON object on stdout:
  {"status": "measured", ...}                 measurements only; lib/video-quality-gate.ts applies the thresholds;
  {"status": "not_checked", "reason": "..."}  missing dependency or model, unreadable video, any error.
This script never says "passed".
"""
import argparse
import hashlib
import io
import json
import math
import os
import sys
import tempfile
import urllib.request
import zipfile

MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
MODEL_NAME = 'face_landmarker.task'
MODEL_SHA256 = '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff'
# Face mesh points: inner upper lip, inner lower lip, mouth corners.
UPPER_LIP, LOWER_LIP, MOUTH_LEFT, MOUTH_RIGHT = 13, 14, 61, 291
# C15-4f: eyelids and eye corners (both eyes) and the nose tip, for the fixed reference frame measurements.
EYES = ((159, 145, 33, 133), (386, 374, 362, 263))
NOSE_TIP = 1
MAX_FACES = 5
MIN_DETECTION_SCORE = 0.5  # MediaPipe default min_face_detection_confidence
NMS_IOU = 0.3


def emit(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n')
    sys.stdout.flush()


def not_checked(reason):
    emit({'status': 'not_checked', 'reason': str(reason)[:300]})
    sys.exit(0)


def cache_dir(explicit):
    return explicit or os.environ.get('LES_VIDEO_QA_CACHE') or os.path.join(os.path.expanduser('~'), '.cache', 'les-video-qa')


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        for block in iter(lambda: handle.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()


def cached_model(directory):
    path = os.path.join(directory, MODEL_NAME)
    if not os.path.isfile(path):
        return None, 'face model not in the local cache (run face_checks.py --fetch-model)'
    if sha256_file(path) != MODEL_SHA256:
        return None, 'face model in the cache does not match the pinned SHA-256'
    return path, None


def fetch_model(directory):
    path, _ = cached_model(directory)
    if not path:
        try:
            os.makedirs(directory, exist_ok=True)
            handle, temporary = tempfile.mkstemp(dir=directory, prefix='.download-')
            with os.fdopen(handle, 'wb') as out, urllib.request.urlopen(MODEL_URL, timeout=60) as response:
                for block in iter(lambda: response.read(1 << 20), b''):
                    out.write(block)
            if sha256_file(temporary) != MODEL_SHA256:
                os.unlink(temporary)
                not_checked('downloaded face model does not match the pinned SHA-256')
            os.replace(temporary, os.path.join(directory, MODEL_NAME))
        except SystemExit:
            raise
        except Exception as error:
            not_checked(f'face model download failed: {type(error).__name__}')
        path = os.path.join(directory, MODEL_NAME)
    emit({'status': 'model_ready', 'path': path, 'sha256': MODEL_SHA256})


def windows_from(text):
    value = json.loads(text)
    if not isinstance(value, list) or len(value) > 200:
        raise ValueError('learner windows must be a list')
    windows = []
    for item in value:
        start, end = item.get('start'), item.get('end')
        if not all(isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x) for x in (start, end)) or start < 0 or end < start:
            raise ValueError('bad learner window')
        windows.append((float(start), float(end)))
    return windows


class MediapipeBackend:
    name = 'mediapipe'

    def __init__(self, model):
        import mediapipe as mp
        from mediapipe.tasks.python import vision
        from mediapipe.tasks.python.core.base_options import BaseOptions
        self.mp = mp
        options = vision.FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=model), running_mode=vision.RunningMode.IMAGE,
                                               num_faces=MAX_FACES, min_face_detection_confidence=MIN_DETECTION_SCORE)
        self.landmarker = vision.FaceLandmarker.create_from_options(options)  # OSError when libEGL/libGLESv2 are missing

    def faces(self, frame, cv2):
        height, width = frame.shape[:2]
        image = self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        return [[(point.x * width, point.y * height) for point in landmarks] for landmarks in self.landmarker.detect(image).face_landmarks]

    def close(self):
        self.landmarker.close()


class OpencvDnnBackend:
    """The official detector + landmark models of the same .task bundle, run with OpenCV DNN."""
    name = 'opencv-dnn'

    def __init__(self, model, cv2, np):
        self.cv2, self.np = cv2, np
        self.directory = tempfile.TemporaryDirectory(prefix='les-face-model-')
        with zipfile.ZipFile(model) as bundle:
            for member in ('face_detector.tflite', 'face_landmarks_detector.tflite'):
                with open(os.path.join(self.directory.name, member), 'wb') as out:
                    out.write(bundle.read(member))
        self.detector = cv2.dnn.readNetFromTFLite(os.path.join(self.directory.name, 'face_detector.tflite'))
        self.landmarks = cv2.dnn.readNetFromTFLite(os.path.join(self.directory.name, 'face_landmarks_detector.tflite'))
        # BlazeFace short-range SSD anchors: 16x16 grid x2 (stride 8) then 8x8 grid x6 (strides 16,16,16), 896 in all.
        anchors = []
        for stride, count in ((8, 2), (16, 6)):
            grid = 128 // stride
            for y in range(grid):
                for x in range(grid):
                    anchors.extend([((x + 0.5) / grid, (y + 0.5) / grid)] * count)
        self.anchors = np.array(anchors, np.float32)

    def run(self, net, tensor, output):
        net.setInput(tensor.copy())
        return net.forward(output).copy()

    def detect(self, frame):
        cv2, np = self.cv2, self.np
        height, width = frame.shape[:2]
        side = max(height, width)
        left, top = (side - width) // 2, (side - height) // 2
        square = np.zeros((side, side, 3), np.uint8)
        square[top:top + height, left:left + width] = frame
        tensor = (cv2.cvtColor(cv2.resize(square, (128, 128), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2RGB).astype(np.float32) / 127.5 - 1.0).transpose(2, 0, 1)[None]
        boxes = self.run(self.detector, tensor, 'regressors')[0]
        logits = self.run(self.detector, tensor, 'classificators')[0, :, 0]
        scores = 1.0 / (1.0 + np.exp(-np.clip(logits, -80, 80)))
        candidates = []
        for index in np.where(scores >= MIN_DETECTION_SCORE)[0]:
            raw = boxes[index] / 128.0
            ax, ay = self.anchors[index]
            values = [(raw[0] + ax) * side - left, (raw[1] + ay) * side - top, raw[2] * side, raw[3] * side]
            values += [(raw[4 + 2 * k] + ax) * side - left if axis == 0 else (raw[5 + 2 * k] + ay) * side - top for k in range(6) for axis in (0, 1)]
            candidates.append((float(scores[index]), np.array(values, np.float64)))
        candidates.sort(key=lambda item: item[0], reverse=True)
        return weighted_nms(candidates, np)[:MAX_FACES]

    def faces(self, frame, cv2):
        np = self.np
        found = []
        for _, values in self.detect(frame):
            cx, cy, w, h = values[:4]
            right_eye, left_eye = values[4:6], values[6:8]
            angle = math.atan2(left_eye[1] - right_eye[1], left_eye[0] - right_eye[0])
            size = max(w, h) * 1.5
            ux, uy, vx, vy = math.cos(angle), math.sin(angle), -math.sin(angle), math.cos(angle)
            corner = lambda dx, dy: (cx + size * (dx * ux + dy * vx), cy + size * (dx * uy + dy * vy))
            matrix = cv2.getAffineTransform(np.float32([corner(-0.5, -0.5), corner(0.5, -0.5), corner(-0.5, 0.5)]), np.float32([[0, 0], [256, 0], [0, 256]]))
            crop = cv2.warpAffine(frame, matrix, (256, 256), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
            tensor = (cv2.cvtColor(crop, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0).transpose(2, 0, 1)[None]
            points = self.run(self.landmarks, tensor, 'Identity').reshape(-1, 3)[:, :2]
            inverse = cv2.invertAffineTransform(matrix)
            mapped = np.hstack([points, np.ones((len(points), 1))]) @ inverse.T
            found.append([(float(x), float(y)) for x, y in mapped])
        return found

    def close(self):
        self.directory.cleanup()


def weighted_nms(candidates, np):
    def iou(a, b):
        ax0, ay0, ax1, ay1 = a[0] - a[2] / 2, a[1] - a[3] / 2, a[0] + a[2] / 2, a[1] + a[3] / 2
        bx0, by0, bx1, by1 = b[0] - b[2] / 2, b[1] - b[3] / 2, b[0] + b[2] / 2, b[1] + b[3] / 2
        inter = max(0.0, min(ax1, bx1) - max(ax0, bx0)) * max(0.0, min(ay1, by1) - max(ay0, by0))
        union = a[2] * a[3] + b[2] * b[3] - inter
        return inter / union if union > 0 else 0.0
    kept, remaining = [], list(candidates)
    while remaining:
        best = remaining[0]
        group = [item for item in remaining if iou(best[1], item[1]) > NMS_IOU]
        remaining = [item for item in remaining if iou(best[1], item[1]) <= NMS_IOU]
        weights = np.array([item[0] for item in group])
        kept.append((best[0], (np.stack([item[1] for item in group]) * weights[:, None]).sum(axis=0) / weights.sum()))
    return kept


def open_backend(model, cv2, np):
    try:
        return MediapipeBackend(model), None
    except Exception as error:
        note = f'mediapipe runtime unavailable ({type(error).__name__}), same model run with OpenCV DNN'
    return OpencvDnnBackend(model, cv2, np), note


def mouth_open(points):
    (ux, uy), (lx, ly), (ax, ay), (bx, by) = points[UPPER_LIP], points[LOWER_LIP], points[MOUTH_LEFT], points[MOUTH_RIGHT]
    mouth_width = math.hypot(bx - ax, by - ay)
    return math.hypot(lx - ux, ly - uy) / mouth_width if mouth_width > 0 else None


def eye_open(points):
    # The less open eye: lid gap / eye width (a blink in either eye counts as closed).
    values = []
    for upper, lower, inner, outer in EYES:
        width = math.hypot(points[outer][0] - points[inner][0], points[outer][1] - points[inner][1])
        if width <= 0:
            return None
        values.append(math.hypot(points[lower][0] - points[upper][0], points[lower][1] - points[upper][1]) / width)
    return min(values)


def yaw(points):
    # Nose tip offset from the middle of the outer eye corners, as a share of their distance (0 = facing the camera).
    left, right = points[33][0], points[263][0]
    return (points[NOSE_TIP][0] - (left + right) / 2) / abs(right - left) if right != left else None


def sharpness(frame, xs, ys, cv2):
    # Variance of the Laplacian of the face box in gray (higher = sharper).
    height, width = frame.shape[:2]
    x0, y0, x1, y1 = max(0, int(min(xs))), max(0, int(min(ys))), min(width, int(max(xs))), min(height, int(max(ys)))
    if x1 - x0 < 8 or y1 - y0 < 8:
        return None
    return float(cv2.Laplacian(cv2.cvtColor(frame[y0:y1, x0:x1], cv2.COLOR_BGR2GRAY), cv2.CV_64F).var())


def scene_cuts(video):
    from scenedetect import ContentDetector, detect
    return [round(start.seconds, 3) for start, _ in detect(video, ContentDetector())[1:]]


def measure(args):
    try:
        windows = windows_from(args.learner_windows)
    except Exception:
        not_checked('learner windows are not valid JSON [{"start","end"}]')
    if not (0 < args.fps <= 30) or not (0 < args.min_face_height < 1) or not (0 < args.mouth_delta < 1):
        not_checked('invalid sampling parameters')
    try:
        import cv2
        import numpy as np
        import mediapipe
    except Exception as error:
        not_checked(f'face detection libraries are not installed: {type(error).__name__}')
    model, problem = cached_model(cache_dir(args.model_dir))
    if not model:
        not_checked(problem)
    capture = cv2.VideoCapture(args.video)
    if not capture.isOpened():
        not_checked('video could not be opened')
    source_fps = capture.get(cv2.CAP_PROP_FPS)
    if not source_fps or not math.isfinite(source_fps) or source_fps <= 0:
        not_checked('video frame rate unknown')
    backend, note = open_backend(model, cv2, np)
    frames = []
    try:
        index, next_time = 0, 0.0
        while capture.grab():
            time = index / source_fps
            index += 1
            if time + 1e-6 < next_time:
                continue
            next_time += 1.0 / args.fps
            ok, frame = capture.retrieve()
            if not ok:
                break
            height = frame.shape[0]
            faces = []
            for points in backend.faces(frame, cv2):
                xs, ys = [p[0] for p in points], [p[1] for p in points]
                if (max(ys) - min(ys)) / height >= args.min_face_height:
                    faces.append(((max(xs) - min(xs)) * (max(ys) - min(ys)), mouth_open(points), (max(ys) - min(ys)) / height, points, xs, ys))
            faces.sort(key=lambda face: face[0], reverse=True)
            row = {'t': round(time, 3), 'faces': len(faces), 'open': faces[0][1] if faces else None, 'height': faces[0][2] if faces else None}
            if args.anchor and len(faces) == 1:
                _, opening, face_height, points, xs, ys = faces[0]
                row['anchor'] = {'t': round(time, 3), 'face_height': face_height, 'mouth_open': opening, 'eye_open': eye_open(points), 'yaw': yaw(points), 'sharpness': sharpness(frame, xs, ys, cv2)}
            frames.append(row)
    finally:
        capture.release()
        backend.close()
    if not frames:
        not_checked('no frames could be decoded')
    single = [frame for frame in frames if frame['faces'] == 1]
    # C15-4f: median face height (landmark box / frame height) over the one-face frames, for the framing drift check.
    heights = sorted(frame['height'] for frame in single)
    median_height = None if not heights else (heights[len(heights) // 2] if len(heights) % 2 else (heights[len(heights) // 2 - 1] + heights[len(heights) // 2]) / 2)
    # Mouth movement: the largest face's opening (lip gap / mouth width) changes by at least mouth_delta between two
    # consecutive sampled frames; counted only for frames inside learner line windows.
    inside = lambda t: any(start <= t <= end for start, end in windows)
    counted, moving = 0, []
    for previous, frame in zip(frames, frames[1:]):
        if not inside(frame['t']) or frame['open'] is None or previous['open'] is None:
            continue
        counted += 1
        if abs(frame['open'] - previous['open']) >= args.mouth_delta:
            moving.append(frame['t'])
    result = {
        'status': 'measured',
        'backend': backend.name,
        **({'note': note} if note else {}),
        'sample_fps': args.fps,
        'frames': len(frames),
        'single_face': {
            'ratio': round(len(single) / len(frames), 4),
            'single_frames': len(single),
            'max_faces': max(frame['faces'] for frame in frames),
            'keyframes': [frame['t'] for frame in frames if frame['faces'] != 1][:20],
            # C15-4a: frames with two or more faces, judged on their own (a second person on screen).
            'multi_ratio': round(sum(1 for frame in frames if frame['faces'] >= 2) / len(frames), 4),
            'multi_keyframes': [frame['t'] for frame in frames if frame['faces'] >= 2][:20],
            'face_height': None if median_height is None else round(median_height, 4),
        },
        'learner_mouth': {
            'windows': len(windows),
            'frames': counted,
            'moving_frames': len(moving),
            'ratio': round(len(moving) / counted, 4) if counted else None,
            'keyframes': moving[:20],
        },
        'versions': {'mediapipe': getattr(mediapipe, '__version__', 'unknown'), 'opencv': cv2.__version__, 'model_sha256': MODEL_SHA256},
    }
    if args.anchor:
        # C15-4f: per-frame measurements of the one-face frames, for choosing the fixed reference frame (TypeScript decides).
        rounded = lambda value: None if value is None or not math.isfinite(value) else round(value, 4)
        result['anchor'] = {'candidates': [{key: (value if key == 't' else rounded(value)) for key, value in frame['anchor'].items()} for frame in frames if 'anchor' in frame][:400]}
    if args.scenes:
        result['scene_cuts'] = scene_cuts(args.video)
    emit(result)


def probe(args):
    try:
        import cv2
        import numpy as np
        import mediapipe
        import scenedetect
    except Exception as error:
        not_checked(f'face detection libraries are not installed: {type(error).__name__}')
    model, problem = cached_model(cache_dir(args.model_dir))
    if not model:
        not_checked(problem)
    backend, note = open_backend(model, cv2, np)
    backend.close()
    emit({'status': 'ready', 'backend': backend.name, **({'note': note} if note else {}),
          'mediapipe': mediapipe.__version__, 'opencv': cv2.__version__, 'scenedetect': scenedetect.__version__})


def main():
    parser = argparse.ArgumentParser(description='C14-4 offline face checks (measures only, never passes).')
    parser.add_argument('--video')
    parser.add_argument('--learner-windows', default='[]')
    parser.add_argument('--fps', type=float, default=5.0)
    parser.add_argument('--min-face-height', type=float, default=0.06)
    parser.add_argument('--mouth-delta', type=float, default=0.03)
    parser.add_argument('--model-dir')
    parser.add_argument('--scenes', action='store_true', help='also list PySceneDetect ContentDetector cuts (cross-check only)')
    parser.add_argument('--anchor', action='store_true', help='C15-4f: also list per-frame measurements for choosing the fixed reference frame')
    parser.add_argument('--fetch-model', action='store_true')
    parser.add_argument('--probe', action='store_true', help='report whether libraries and the cached model are usable')
    try:
        args = parser.parse_args()
    except SystemExit:
        not_checked('invalid arguments')
    try:
        if args.fetch_model:
            fetch_model(cache_dir(args.model_dir))
        elif args.probe:
            probe(args)
        elif not args.video or not os.path.isfile(args.video):
            not_checked('video file missing')
        else:
            measure(args)
    except SystemExit:
        raise
    except Exception as error:  # reported as not_checked, never as a pass
        not_checked(f'face check failed: {type(error).__name__}')


if __name__ == '__main__':
    main()
