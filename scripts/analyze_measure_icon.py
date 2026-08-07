"""分析测距图标 PNG，定位灰色落点阴影的几何中心。

目标：
  当前代码把"图钉尖端"对齐到地图坐标（img 左上角 -12,-34，尖端在 24×34 图的 (12,34)）。
  用户反馈：折线落点应位于"灰色阴影中心"，而非尖端。

  本脚本输出：
  1) 整图尺寸
  2) 不透明像素包围盒（整体图形区域）
  3) 灰色阴影区域包围盒 + 中心点（用于计算新的锚点偏移）
     判定"灰色阴影"：亮度低 + 近灰（R≈G≈B） + 非纯透明
  4) 给出建议的 img 左上角偏移，使灰色阴影中心对齐原点 (0,0)
"""
from PIL import Image


def analyze(path: str) -> None:
    img = Image.open(path).convert('RGBA')
    w, h = img.size
    print(f'\n=== {path} ===')
    print(f'尺寸: {w} × {h}')

    px = img.load()

    # 1) 整体不透明包围盒
    min_x, min_y, max_x, max_y = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 10:  # 近似不透明
                if x < min_x:
                    min_x = x
                if y < min_y:
                    min_y = y
                if x > max_x:
                    max_x = x
                if y > max_y:
                    max_y = y
    print(f'整体图形包围盒: x[{min_x}..{max_x}] y[{min_y}..{max_y}]')

    # 2) 灰色阴影区域（R≈G≈B，亮度偏低，非完全透明）
    #    灰色阴影 #999999: R=G=B=153；容忍 ±40
    gray_min_x, gray_min_y, gray_max_x, gray_max_y = w, h, -1, -1
    gray_pixels = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 40:
                continue
            mx = max(abs(r - g), abs(g - b), abs(r - b))
            lum = (r + g + b) / 3
            # 灰色：三通道接近 + 亮度中等偏低（排除白色高光/纯黑描边）
            if mx < 40 and 60 < lum < 220:
                gray_pixels += 1
                if x < gray_min_x:
                    gray_min_x = x
                if y < gray_min_y:
                    gray_min_y = y
                if x > gray_max_x:
                    gray_max_x = x
                if y > gray_max_y:
                    gray_max_y = y

    if gray_pixels == 0:
        print('未检测到灰色阴影区域（可能阈值需调整）')
        return

    cx = (gray_min_x + gray_max_x) / 2
    cy = (gray_min_y + gray_max_y) / 2
    print(f'灰色阴影包围盒: x[{gray_min_x}..{gray_max_x}] y[{gray_min_y}..{gray_max_y}]  像素数={gray_pixels}')
    print(f'灰色阴影几何中心（相对图左上角，像素）: ({cx:.1f}, {cy:.1f})')

    # 3) 建议：让灰色阴影中心对齐原点
    #    当前 img 左上角放在 (left, top)，阴影中心 = (left + cx, top + cy)
    #    要求 = (0, 0) → left = -cx, top = -cy
    print(f'→ 建议 img 左上角偏移: left={-cx:.1f}px, top={-cy:.1f}px')
    print(f'  （当前为 left=-12, top=-34，即尖端对齐）')


if __name__ == '__main__':
    analyze('src/assets/images/measure/start.png')
    analyze('src/assets/images/measure/end.png')