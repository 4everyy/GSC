from PIL import Image
from collections import Counter

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
    c = Counter()
    for x in range(0, w, 2):
        for y in range(0, h, 2):
            r, g, b, a = px[x, y]
            if a > 128:  # 忽略透明像素
                c[(r, g, b)] += 1
    print('top colors (r,g,b): count')
    for color, count in c.most_common(12):
        print(f'  rgb{color}: {count}  #{color[0]:02x}{color[1]:02x}{color[2]:02x}')