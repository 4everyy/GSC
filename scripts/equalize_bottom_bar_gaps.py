# -*- coding: utf-8 -*-
"""底部弧形按钮条等间距计算。

背景：13 段切图按设计稿切片导出时，各段自带【不相等的透明内边距】。
即使盒模型零间距拼接，相邻段不透明区域之间的水平缝宽也高达 10~63px 且逐缝不同
（垂直视觉缝宽约 10.4 / 18.5 / 26 / 31.7 / 42.6px 递变）——这是"按钮间距不等"的根源。

本脚本：
1. 逐行提取各段 PNG 的不透明边界（alpha>=128）；
2. 对每条缝两侧边缘做最小二乘拟合（x = a + b·y），取平均斜率得缝角 θ = atan(b)；
3. 以"垂直于缝方向的视觉缝宽统一为 G=12px"为目标，反推每缝所需 margin-right
   （允许负值：只重叠透明内边距，绝不重叠实体像素）；
4. 合成验证图（洋红底）并实测修正后每条缝的垂直视觉缝宽。

输出可直接粘贴到 HomePage.css 的 clamp() 数值。
设计基准：60px 条高（1920px 视口）；960px 视口时条高 30px，间距减半，
故 clamp 下限 = 设计值 / 2，与条高 clamp(30px, 3.125vw, 60px) 缩放曲线一致。
"""
import math
import os

from PIL import Image

ASSET_DIR = os.path.join(os.path.dirname(__file__), "..", "src", "assets", "images", "home")
# 与 HomePage.tsx BOTTOM_BAR_ITEMS 一致的 DOM 顺序
NAMES = [
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
TARGET_PERP_GAP = 12.0  # 统一垂直视觉缝宽（px，60px 条高设计基准）
VIEWPORT = 1920.0        # 设计视口（条高 60px，切图按原始尺寸渲染）


def opaque_bounds(img):
    """逐行返回 (首个不透明x, 末个不透明x)，alpha>=128。"""
    px = img.load()
    w, h = img.size
    rows = []
    for y in range(h):
        first = last = None
        for x in range(w):
            if px[x, y][3] >= 128:
                if first is None:
                    first = x
                last = x
        rows.append((first, last))
    return rows


def fit_line(points):
    """最小二乘拟合 x = a + b·y。points: [(y, x)]。"""
    n = len(points)
    sy = sum(p[0] for p in points)
    sx = sum(p[1] for p in points)
    syy = sum(p[0] * p[0] for p in points)
    sxy = sum(p[0] * p[1] for p in points)
    b = (n * sxy - sy * sx) / (n * syy - sy * sy)
    a = (sx - b * sy) / n
    return a, b


def main():
    imgs = [Image.open(os.path.join(ASSET_DIR, n)).convert("RGBA") for n in NAMES]
    bounds = [opaque_bounds(im) for im in imgs]
    widths = [im.size[0] for im in imgs]
    y_lo, y_hi = 6, 53  # 拟合区间，避开上下拐角圆角/端头

    seams = []
    for i in range(12):
        # 左段右边缘、右段左边缘
        pr = [(y, bounds[i][y][1]) for y in range(y_lo, y_hi + 1) if bounds[i][y][1] is not None]
        pl = [(y, bounds[i + 1][y][0]) for y in range(y_lo, y_hi + 1) if bounds[i + 1][y][0] is not None]
        ar, br = fit_line(pr)
        al, bl = fit_line(pl)
        b = (br + bl) / 2.0  # 平均斜率 dx/dy
        theta = math.atan(abs(b))
        cos_t = math.cos(theta)
        y_mid = 30
        # 盒模型零间距拼接时的水平缝宽（在 y_mid 行）：右段盒起点 = widths[i]
        h0 = (widths[i] + al + bl * y_mid) - (ar + br * y_mid) - 1.0
        seams.append({"h0": h0, "slope": b, "theta_deg": math.degrees(theta), "cos": cos_t})

    print(f"目标统一垂直缝宽 G = {TARGET_PERP_GAP}px\n")
    print("缝  斜率dx/dy  缝角θ   cosθ   零间距水平缝h0  当前垂直缝  目标水平缝  新margin")
    css_lines = []
    for i, s in enumerate(seams):
        cur_perp = s["h0"] * s["cos"]
        h_target = TARGET_PERP_GAP / s["cos"]
        margin = h_target - s["h0"]
        s["margin"] = margin
        print(
            f"{i + 1:<3}{s['slope']:>8.3f}{s['theta_deg']:>7.1f}°{s['cos']:>7.3f}"
            f"{s['h0']:>10.2f}{cur_perp:>10.2f}{h_target:>10.2f}{margin:>10.2f}"
        )
        # clamp：正值 clamp(v/2, v·100/1920 vw, v)；负值 clamp(v, v·100/1920 vw, v/2)
        v = round(margin, 2)
        vw = round(v * 100.0 / VIEWPORT, 4)
        if v >= 0:
            css = f".bottom-bar__btn:nth-child({i + 1}) {{ margin-right: clamp({round(v / 2, 2)}px, {vw}vw, {v}px); }}"
        else:
            css = f".bottom-bar__btn:nth-child({i + 1}) {{ margin-right: clamp({v}px, {vw}vw, {round(v / 2, 2)}px); }}"
        css_lines.append(css)

    print("\n/* 生成的 CSS（60px 设计基准）*/")
    for line in css_lines:
        print(line)

    # ---- 合成验证：按新 margin 摆放，实测垂直缝宽 ----
    xs, cur = [], 0.0
    for i in range(13):
        xs.append(cur)
        cur += widths[i] + (seams[i]["margin"] if i < 12 else 0.0)
    total = cur
    canvas = Image.new("RGBA", (int(total) + 8, 60), (255, 0, 255, 255))
    for img, x0 in zip(imgs, xs):
        canvas.paste(img, (int(round(x0)), 0), img)
    canvas.save(os.path.join(os.path.dirname(__file__), "..", ".tmp_equalized_bar.png"))
    px = canvas.load()

    def magenta(c):
        r, g, b = c[0], c[1], c[2]
        return r > 200 and b > 200 and g < 90

    # 每条缝的拟合直线（含 margin 平移），用于计算期望缝心
    fits = []
    for i in range(12):
        pr = [(y, bounds[i][y][1]) for y in range(y_lo, y_hi + 1) if bounds[i][y][1] is not None]
        pl = [(y, bounds[i + 1][y][0]) for y in range(y_lo, y_hi + 1) if bounds[i + 1][y][0] is not None]
        fits.append((fit_line(pr), fit_line(pl)))

    def measure_gap(i, y):
        """以期望缝心为中心 ±25px 扫描最长洋红 run，返回水平缝宽。"""
        (ar, br), (al, bl) = fits[i]
        x_left = xs[i] + ar + br * y        # 左段右边缘
        x_right = xs[i + 1] + al + bl * y   # 右段左边缘
        center = (x_left + x_right) / 2.0
        best, run = 0, 0
        for x in range(int(center) - 25, int(center) + 25):
            if magenta(px[x, y]):
                run += 1
                best = max(best, run)
            else:
                run = 0
        return best

    print("\n验证：修正后每条缝逐行水平缝宽（应≈ G/cosθ 且逐缝换算后垂直缝宽≈G）")
    print("y   " + "".join(f"   缝{i + 1:<2}" for i in range(12)))
    for y in (10, 20, 30, 40, 50):
        cells = [measure_gap(i, y) for i in range(12)]
        print(f"{y:<4}" + "".join(f"{v:>6}" for v in cells))
    print("\n垂直缝宽换算（水平缝宽 × cosθ）：")
    for y in (10, 30, 50):
        perps = [measure_gap(i, y) * seams[i]["cos"] for i in range(12)]
        print(f"y={y:<3}" + "".join(f"{p:>6.1f}" for p in perps))


if __name__ == "__main__":
    main()
