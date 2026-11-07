"""Generates deterministic test images for the acceptance tests."""
import random, os, sys
from PIL import Image, ImageDraw, ImageFilter
out = sys.argv[1]
os.makedirs(out, exist_ok=True)
random.seed(7)

# 1. pixel-art character on green, with the SAME green inside (gem) and 1px details
s = Image.new('RGB', (48, 48), (0, 255, 0))
d = s.load()
pal = {'k': (24, 16, 40), 's': (242, 190, 150), 'h': (130, 60, 30), 'w': (255, 255, 255), 'g': (0, 255, 0), 'b': (40, 80, 200)}
art = [
    "....kkkkkkkk....",
    "...khhhhhhhhk...",
    "..khhhhhhhhhhk..",
    "..kssssssssssk..",
    "..kswksssswksk..",
    "..kssssssssssk..",
    "..ksssskkssssk..",
    "...kssssssssk...",
    "....kkkkkkkk....",
    "...kbbbbbbbbk...",
    "..kbbbkggkbbbk..",
    "..kbbbkggkbbbk..",
    "..kbbbbbbbbbbk..",
    "...kkkk..kkkk...",
    "...k..k..k..k...",
    "...kkkk..kkkk...",
]
for y, row in enumerate(art):
    for x, c in enumerate(row):
        if c != '.':
            for dy in range(2):
                for dx in range(2):
                    d[8 + x * 2 + dx, 8 + y * 2 + dy] = pal[c]
d[30, 44] = (255, 255, 255)  # isolated 1px detail touching nothing (should be kept: not green)
s.save(f'{out}/sprite-green.png')

# 2. illustration on white with white details inside, anti-aliased outline
il = Image.new('RGB', (800, 600), (255, 255, 255))
g = ImageDraw.Draw(il)
g.ellipse((200, 100, 600, 500), fill=(250, 170, 60), outline=(30, 30, 30), width=8)
g.ellipse((300, 220, 370, 290), fill=(255, 255, 255), outline=(30, 30, 30), width=5)  # white eye
g.ellipse((430, 220, 500, 290), fill=(255, 255, 255), outline=(30, 30, 30), width=5)
g.ellipse((325, 245, 345, 265), fill=(20, 20, 20)); g.ellipse((455, 245, 475, 265), fill=(20, 20, 20))
g.arc((320, 300, 480, 420), 20, 160, fill=(30, 30, 30), width=8)
il = il.resize((1600, 1200), Image.LANCZOS).resize((800, 600), Image.LANCZOS)
il.save(f'{out}/illustration-white.png')

# 3. green screen "photo": soft subject with spill, uneven screen lighting, JPEG
w, h = 1200, 900
gs = Image.new('RGB', (w, h))
px = gs.load()
for y in range(h):
    for x in range(w):
        v = 1 - 0.25 * (((x - w / 2) / w) ** 2 + ((y - h / 2) / h) ** 2) * 4
        px[x, y] = (int(20 * v), int(185 * v), int(70 * v))
mask = Image.new('L', (w, h), 0)
md = ImageDraw.Draw(mask)
md.ellipse((450, 120, 750, 420), fill=255)
md.rounded_rectangle((380, 380, 820, 900), 80, fill=255)
mask = mask.filter(ImageFilter.GaussianBlur(2))
subj = Image.new('RGB', (w, h), (200, 60, 70))
sd = ImageDraw.Draw(subj)
sd.rectangle((380, 380, 820, 900), fill=(40, 60, 160))
sd.ellipse((450, 120, 750, 420), fill=(225, 175, 140))
sd.rectangle((560, 500, 640, 580), fill=(20, 185, 70))  # green logo on shirt (same as screen)
gs = Image.composite(subj, gs, mask)
gs.save(f'{out}/greenscreen.jpg', quality=92)

# 4. "photo" with complex background for the AI test: textured, multi-colored background + object
cw, ch = 1024, 768
bg = Image.new('RGB', (cw, ch))
bd = ImageDraw.Draw(bg)
for i in range(400):
    x, y = random.randint(-50, cw), random.randint(-50, ch)
    r = random.randint(10, 90)
    col = tuple(random.randint(60, 200) for _ in range(3))
    bd.ellipse((x, y, x + r, y + r), fill=col)
bg = bg.filter(ImageFilter.GaussianBlur(6))
bg.save(f'{out}/complex-bg-base.png')

# 5. large image for the high-resolution test
big = Image.new('RGB', (6000, 4000), (255, 255, 255))
bd = ImageDraw.Draw(big)
bd.ellipse((1500, 800, 4500, 3200), fill=(30, 90, 200))
big.save(f'{out}/large-white.png')
print('fixtures ready')
