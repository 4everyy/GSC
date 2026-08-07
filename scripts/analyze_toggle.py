from PIL import Image

files = [
    'src/assets/images/home/layer-toggle-on.png',
    'src/assets/images/home/layer-toggle-on-2.png',
    'src/assets/images/home/layer-toggle-on-3.png',
    'src/assets/images/home/layer-toggle-off.png',
]

for f in files:
    img = Image.open(f).convert('RGBA')
    w, h = img.size
    print(f'\n=== {f} ({w}x{h}) ===')
    px = img.load()

    # 1) 非透明像素统计
    opaque = []
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 200:
                opaque.append((x, y, r, g, b))

    if not opaque:
        print('  全透明！')
        continue

    xs = [p[0] for p in opaque]
    print(f'  非透明像素数: {len(opaque)}')
    print(f'  x 范围: {min(xs)} ~ {max(xs)}')

    # 2) 拨钮位置判断：非透明像素的 x 质心
    cx = sum(xs) / len(xs)
    print(f'  x 质心: {cx:.1f} ({"右侧/开启位" if cx > w/2 else "左侧/关闭位"})')

    # 3) 中线 y=h//2 的像素分布（看外壳轮廓）
    mid_y = h // 2
    row = []
    for x in range(w):
        r, g, b, a = px[x, mid_y]
        if a > 200:
            row.append(f'{x}:{r:02x}{g:02x}{b:02x}')
    print(f'  中线 y={mid_y} 非透明像素: {row[:30]}...')

    # 4) 左右两半像素数对比（判断拨钮偏向）
    left = sum(1 for p in opaque if p[0] < w / 2)
    right = sum(1 for p in opaque if p[0] >= w / 2)
    print(f'  左半:{left} 右半:{right} ({"偏右(开)" if right > left else "偏左(关)"})')