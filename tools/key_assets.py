#!/usr/bin/env python3
"""METAL SMUG asset pipeline.

Chroma-keys the flat-magenta GPT Image GIFs to real transparency
(per-frame distance-to-magenta alpha + edge feather + magenta despill),
crops each asset to the union content bbox across its frames (so in-frame
motion like the jump arc and the death fall survives), normalizes hero
assets so their median content height matches the idle asset's, and
exports animated WebP. Emits assets-keyed/assets.json with per-asset
geometry the engine uses for display sizing.
"""
import json
import os

import numpy as np
from PIL import Image

ROOT = os.path.expanduser("~/workspace/metal-smug")
SRC = os.path.join(ROOT, "assets")
OUT = os.path.join(ROOT, "assets-keyed")
os.makedirs(OUT, exist_ok=True)

# asset path (relative to assets/) -> output name
GIF_ASSETS = {
    "hero/idle.gif": "hero-idle",
    "hero/run.gif": "hero-run",
    "hero/shoot.gif": "hero-shoot",
    "hero/run_shoot.gif": "hero-run-shoot",
    "hero/jump.gif": "hero-jump",
    "hero/crouch.gif": "hero-crouch",
    "hero/hit.gif": "hero-hit",
    "hero/death.gif": "hero-death",
    "hero/victory.gif": "hero-victory",
    "hero/grenade.gif": "hero-grenade",
    "enemy/grunt_walk.gif": "grunt-walk",
    "enemy/lobber.gif": "lobber",
    "enemy/tank_idle.gif": "tank-idle",
    "fx/explosion.gif": "explosion",
    "fx/tank_boom.gif": "tank-boom",
}
HERO = {k for k in GIF_ASSETS if k.startswith("hero/")}


def load_frames(path):
    im = Image.open(path)
    frames, durs = [], []
    for i in range(im.n_frames):
        im.seek(i)
        frames.append(np.asarray(im.convert("RGB")).astype(np.float32))
        durs.append(int(im.info.get("duration", 100)) or 100)
    return frames, durs


def key_frame(rgb):
    """Return (rgba uint8 HxWx4, alpha float HxW)."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    s = np.minimum(r, b) - g  # magenta score: ~230 for pure #FF00FF
    # alpha ramp: fully opaque below s=45, fully transparent above s=120
    alpha = np.clip((120.0 - s) / 75.0, 0.0, 1.0)
    # gentle 1px erosion to eat the bright fringe
    er = alpha.copy()
    er[1:, :] = np.minimum(er[1:, :], alpha[:-1, :])
    er[:-1, :] = np.minimum(er[:-1, :], alpha[1:, :])
    er[:, 1:] = np.minimum(er[:, 1:], alpha[:, :-1])
    er[:, :-1] = np.minimum(er[:, :-1], alpha[:, 1:])
    alpha = np.minimum(alpha, er + 0.2)
    # despill: pull r/b toward g in proportion to magenta-ness
    spill = np.clip((s - 30.0) / 90.0, 0.0, 1.0) * 0.95
    excess = np.maximum(np.minimum(r, b) - g, 0.0)
    r2 = r - excess * spill
    b2 = b - excess * spill
    rgba = np.dstack([r2, g, b2, alpha * 255.0]).astype(np.uint8)
    return rgba, alpha


def process_gif(rel, name):
    frames, durs = load_frames(os.path.join(SRC, rel))
    keyed, alphas = [], []
    for f in frames:
        rgba, a = key_frame(f)
        keyed.append(rgba)
        alphas.append(a)
    # union content bbox across frames
    mask = np.zeros(alphas[0].shape, dtype=bool)
    heights = []
    for a in alphas:
        m = a > 0.2
        mask |= m
        ys = np.where(m.any(axis=1))[0]
        heights.append(float(ys.max() - ys.min() + 1) if len(ys) else 0.0)
    ys, xs = np.where(mask.any(axis=1))[0], np.where(mask.any(axis=0))[0]
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    cropped = [k[y0:y1, x0:x1] for k in keyed]
    median_h = float(np.median(heights))
    return name, cropped, durs, median_h


def save_webp(frames_rgba, durs, out_path, scale=1.0):
    imgs = [Image.fromarray(f, "RGBA") for f in frames_rgba]
    if scale != 1.0:
        w, h = imgs[0].size
        nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
        imgs = [im.resize((nw, nh), Image.LANCZOS) for im in imgs]
    imgs[0].save(
        out_path,
        save_all=True,
        append_images=imgs[1:],
        duration=durs,
        loop=0,
        quality=88,
        alpha_quality=100,
        method=4,
    )
    return imgs[0].size


def main():
    results = {}
    medians = {}
    pending = {}
    for rel, name in GIF_ASSETS.items():
        name, cropped, durs, median_h = process_gif(rel, name)
        pending[name] = (cropped, durs)
        medians[name] = median_h
        print(f"{name}: frames={len(cropped)} crop={cropped[0].shape[1]}x{cropped[0].shape[0]} medianH={median_h:.0f}")
    idle_med = medians["hero-idle"]
    for name, (cropped, durs) in pending.items():
        is_hero = ("assets/hero/" + name.replace("hero-", "") + ".gif")
        scale = 1.0
        # hero assets: normalize median content height to idle's
        src_rel = [k for k, v in GIF_ASSETS.items() if v == name][0]
        if src_rel in HERO:
            scale = idle_med / medians[name]
        out_path = os.path.join(OUT, name + ".webp")
        (w, h) = save_webp(cropped, durs, out_path, scale)
        results[name] = {
            "file": name + ".webp",
            "w": w,
            "h": h,
            "frames": len(cropped),
            "totalMs": int(sum(durs)),
            "frameMs": durs[0],
            "medianContentH": round(medians[name] * scale, 1),
            "scaleApplied": round(scale, 3),
            "bytes": os.path.getsize(out_path),
        }
        print(f"  -> {name}.webp {w}x{h} scale={scale:.3f} {results[name]['bytes']//1024} KB")

    # hero master still -> keyed static webp (title art)
    master = np.asarray(Image.open(os.path.join(SRC, "hero/hero-master.png")).convert("RGB")).astype(np.float32)
    rgba, a = key_frame(master)
    m = a > 0.2
    ys, xs = np.where(m.any(axis=1))[0], np.where(m.any(axis=0))[0]
    crop = rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    Image.fromarray(crop, "RGBA").save(os.path.join(OUT, "hero-master.webp"), quality=90, alpha_quality=100, method=4)
    results["hero-master"] = {"file": "hero-master.webp", "w": crop.shape[1], "h": crop.shape[0],
                               "frames": 1, "totalMs": 0, "frameMs": 0,
                               "medianContentH": float(crop.shape[0]), "scaleApplied": 1.0,
                               "bytes": os.path.getsize(os.path.join(OUT, "hero-master.webp"))}
    print(f"hero-master.webp {crop.shape[1]}x{crop.shape[0]}")

    # backdrop: 2048px is overkill for a 960px stage; ship 1600px webp
    bg = Image.open(os.path.join(SRC, "bg.png")).convert("RGB")
    bg = bg.resize((1600, 900), Image.LANCZOS)
    bg.save(os.path.join(OUT, "bg.webp"), quality=82, method=4)
    print(f"bg.webp 1600x900 {os.path.getsize(os.path.join(OUT, 'bg.webp'))//1024} KB")

    with open(os.path.join(OUT, "assets.json"), "w") as fh:
        json.dump(results, fh, indent=1)
    total = sum(v["bytes"] for v in results.values()) + os.path.getsize(os.path.join(OUT, "bg.webp"))
    print(f"TOTAL keyed weight: {total/1024:.0f} KB")


if __name__ == "__main__":
    main()
