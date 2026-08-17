# -*- coding: utf-8 -*-
"""底部弧形按钮条切缝间距分析（HomePage.css 逐缝 margin 的推导依据）。

底部按钮条由 13 段弧形切图水平拼接，相邻段边缘为斜线（切缝角 θ 各不相同：
端部约 45°，中部近垂直）。若用统一水平 gap，垂直于斜缝的视觉缝宽 = gap * cos(θ)
会随 θ 变化（端部窄、中部宽），导致按钮间距看起来不等。

本脚本逐段提取 alpha 边界、最小二乘拟合切缝斜率，推导使各缝垂直缝宽相等的
逐缝水平间距，并输出可直接用于 HomePage.css 的 clamp 规则。

用法：python scripts/analyze_bottom_bar_gaps.py [目标垂直缝宽px，默认2]
"""

import math
import os
import sys

from PIL import Image

ASSET_DIR = os.path.join(os.path.dirname(__file__), "..", "src", "assets", "images", "home")

# 13 段切图按 DOM 顺序（与 HomePage.tsx BOTTOM_BAR_ITEMS 一致）
SEGMENTS = [
    "bottom-bar-seg-01.png",
    "bottom-bar-seg-02.png",
    "bottom-bar-seg-03.png",
    "bottom-bar-seg-04.png",
    "bottom-bar-seg-05.png",
    "bottom-bar-seg-06.png",
    "bottom-bar-seg-07.png",
    "bottom-bar-seg-08.png",
    "bottom-bar-seg-09.png",
    "bottom-bar-seg-10.png",
    "bottom-bar-seg-11.png",
    "bottom-bar-seg-12.png",
    "bottom-bar-seg-13.png",
]

ALPHA_T = 8  # alpha > 8 视为可见（忽略抗锯齿过渡像素）


def edge_columns(img):
    """返回每行首个/末个可见列（None 表示该行完全透明）。"""
    w, h = img.size
    px = img.load()
    lefts, rights = [], []
    for y in range(h):
        l = r = None
        for x in range(w):
            if px[x, y][3] > ALPHA_T:
                if l is None:
                    l = x
                r = x
        lefts.append(l)
        rights.append(r)
    return lefts, rights


def fit_slope(cols):
    """最小二乘拟合 x = a*y + b，返回切缝斜率 dx/dy。"""
    pts = [(y, x) for y, x in enumerate(cols) if x is not None]
    n = len(pts)
    my = sum(p[0] for p in pts) / n
    mx = sum(p[1] for p in pts) / n
    num = sum((y - my) * (x - mx) for y, x in pts)
    den = sum((y - my) ** 2 for y, _ in pts)
    return num / den if den else 0.0


def clamp_css(px_design):
    """设计稿 px -> 与按钮高度同曲线的 clamp()（下限 960 视口，上限 1920 视口）。"""
    return "clamp(%.2fpx, %.3fvw, %.2fpx)" % (px_design / 2, px_design / 19.2, px_design)


def main():
    target = float(sys.argv[1]) if len(sys.argv) > 1 else 2.0

    edges = []
    for name in SEGMENTS:
        img = Image.open(os.path.join(ASSET_DIR, name)).convert("RGBA")
        edges.append(edge_columns(img))

    print("目标垂直缝宽：%gpx（设计稿 60px 高基准）" % target)
    print("缝   切缝角   cosθ   水平gap   CSS 规则")
    for i in range(len(SEGMENTS) - 1):
        sr = fit_slope(edges[i][1])        # 段 i 右边缘斜率
        sl = fit_slope(edges[i + 1][0])    # 段 i+1 左边缘斜率
        theta = math.atan((abs(sr) + abs(sl)) / 2)
        cos_t = math.cos(theta)
        gap = target / cos_t
        rule = ".bottom-bar__btn:nth-child(%d) { margin-right: %s; }" % (i + 1, clamp_css(gap))
        print("%2d-%-3d %5.1f°  %5.2f  %6.2f   %s" % (i + 1, i + 2, math.degrees(theta), cos_t, gap, rule))


if __name__ == "__main__":
    main()
