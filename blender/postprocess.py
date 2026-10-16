import json
import os
import sys

import bpy
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "blender", "out")
DEST = os.path.join(ROOT, "public", "icons")
os.makedirs(DEST, exist_ok=True)

BG_CENTER = np.array([0xFB, 0xF4, 0xEA]) / 255.0
BG_EDGE = np.array([0xEE, 0xDF, 0xCB]) / 255.0


def load(name, size=None):
    img = bpy.data.images.load(os.path.join(SRC, f"{name}.png"), check_existing=False)
    if size:
        img.scale(size, size)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(h, w, 4)


def save(arr, path):
    h, w, _ = arr.shape
    img = bpy.data.images.new(os.path.basename(path), w, h, alpha=True)
    img.pixels.foreach_set(arr.astype(np.float32).ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


def gradient(size):
    y, x = np.mgrid[0:size, 0:size].astype(np.float32) / (size - 1)
    d = np.clip(np.sqrt((x - 0.5) ** 2 + (y - 0.42) ** 2) / 0.75, 0, 1)[..., None]
    rgb = BG_CENTER * (1 - d) + BG_EDGE * d
    return np.concatenate([rgb, np.ones((size, size, 1))], axis=2)


def over(bg, fg, scale):
    size = bg.shape[0]
    inner = int(size * scale)
    src = load("app", inner)
    off = (size - inner) // 2
    out = bg.copy()
    region = out[off:off + inner, off:off + inner]
    y, x = np.mgrid[0:inner, 0:inner].astype(np.float32) / (inner - 1)
    edge = np.minimum(np.minimum(x, 1 - x), np.minimum(y, 1 - y))
    fade = np.clip(edge / 0.14, 0, 1)[..., None]
    a = src[..., 3:4] * fade * fade * (3 - 2 * fade)
    region[..., :3] = src[..., :3] * a + region[..., :3] * (1 - a)
    return out


def app_icons():
    for size, scale, name in [
        (512, 0.98, "app-512.png"),
        (192, 0.98, "app-192.png"),
        (180, 0.98, "apple-touch-icon.png"),
        (512, 0.78, "maskable-512.png"),
    ]:
        save(over(gradient(size), None, scale), os.path.join(DEST, name))

    badge = load("app", 96)
    alpha = np.clip(badge[..., 3:4] * 1.6, 0, 1)
    mono = np.concatenate([np.ones((96, 96, 3)), alpha], axis=2)
    save(mono, os.path.join(DEST, "badge-96.png"))


def contact_sheet(path):
    names = sorted(f[:-4] for f in os.listdir(SRC) if f.endswith(".png"))
    tile, cols = 256, 4
    rows = (len(names) + cols - 1) // cols
    sheet = np.ones((rows * tile, cols * tile, 4), dtype=np.float32)
    sheet[..., :3] = BG_CENTER
    for i, name in enumerate(names):
        img = load(name, tile)
        r = rows - 1 - i // cols
        c = i % cols
        region = sheet[r * tile:(r + 1) * tile, c * tile:(c + 1) * tile]
        a = img[..., 3:4]
        region[..., :3] = img[..., :3] * a + region[..., :3] * (1 - a)
    save(sheet, path)


def ui_icons():
    dest = os.path.join(SRC, "ui")
    os.makedirs(dest, exist_ok=True)
    for f in sorted(os.listdir(SRC)):
        if not f.endswith(".png") or not os.path.exists(os.path.join(SRC, f[:-4] + ".json")):
            continue
        raw = load(f[:-4])
        pad = raw.shape[0] // 2
        px = np.zeros((raw.shape[0] + 2 * pad, raw.shape[1] + 2 * pad, 4), dtype=np.float32)
        px[pad:-pad, pad:-pad] = raw
        h, w, _ = px.shape
        with open(os.path.join(SRC, f[:-4] + ".json")) as fh:
            b = json.load(fh)
        rh, rw = raw.shape[:2]
        cx = pad + (b["x0"] + b["x1"]) / 2 * rw
        cy = pad + (1 - (b["y0"] + b["y1"]) / 2) * rh
        half = max((b["x1"] - b["x0"]) * rw, (b["y1"] - b["y0"]) * rh) * 0.66
        x0, x1 = int(max(cx - half, 0)), int(min(cx + half, w))
        y0, y1 = int(max(cy - half, 0)), int(min(cy + half, h))
        side = min(x1 - x0, y1 - y0)
        crop = px[y0:y0 + side, x0:x0 + side].copy()
        yy, xx = np.mgrid[0:side, 0:side].astype(np.float32) / (side - 1)
        edge = np.minimum(np.minimum(xx, 1 - xx), np.minimum(yy, 1 - yy))
        fade = np.clip(edge / 0.12, 0, 1)
        crop[..., 3] *= fade * fade * (3 - 2 * fade)
        save(crop, os.path.join(dest, f))


argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if argv and argv[0] == "sheet":
    contact_sheet(argv[1])
else:
    app_icons()
    ui_icons()
