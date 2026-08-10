#!/usr/bin/env python3
"""对比三张按钮背景图的颜色分布，辅助诊断视觉差异（纯 PIL 实现）。"""
from PIL import Image

files = {
    "normal": "src/assets/images/device/menu-btn-normal.png",
    "hover": "src/assets/images/device/menu-btn-hover.png",
    "active": "src/assets/images/device/menu-btn-active.png",
}

for name, path in files.items():
    img = Image.open(path).convert("RGBA")
    w, h = img.size
    pixels = list(img.getdata())
    total = len(pixels)
    opaque = [p for p in pixels if p[3] > 0]
    opaque_pct = len(opaque) / total * 100 if total else 0
    if opaque:
        r = sum(p[0] for p in opaque) / len(opaque)
        g = sum(p[1] for p in opaque) / len(opaque)
        b = sum(p[2] for p in opaque) / len(opaque)
        unique = len(set(pixels))
    else:
        r = g = b = 0
        unique = 0
    print(f"{name}: {w}x{h}, opaque={opaque_pct:.1f}%, mean_rgb=({r:.0f},{g:.0f},{b:.0f}), unique_colors={unique}")