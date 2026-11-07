"""Generates deterministic test images for the acceptance tests."""
import random, os, sys
import numpy as np
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

# 6. cartoon illustration on white: LIGHT colors (pale yellow, light pink, light grey), dark outline, AA edges
ss = 4
W, H = 700, 520
c = Image.new('RGB', (W * ss, H * ss), (255, 255, 255))
g = ImageDraw.Draw(c)
S = lambda *v: [x * ss for x in v]
g.ellipse(S(180, 60, 520, 400), fill=(255, 240, 160), outline=(40, 30, 30), width=6 * ss)          # pale yellow head
g.ellipse(S(235, 260, 285, 300), fill=(255, 205, 210))                                               # light pink cheek
g.ellipse(S(415, 260, 465, 300), fill=(255, 205, 210))
g.ellipse(S(260, 170, 320, 240), fill=(255, 255, 255), outline=(40, 30, 30), width=4 * ss)          # white eyes
g.ellipse(S(380, 170, 440, 240), fill=(255, 255, 255), outline=(40, 30, 30), width=4 * ss)
g.ellipse(S(282, 195, 302, 220), fill=(30, 30, 30)); g.ellipse(S(402, 195, 422, 220), fill=(30, 30, 30))
g.rounded_rectangle(S(230, 380, 470, 500), 30 * ss, fill=(235, 235, 240), outline=(40, 30, 30), width=6 * ss)  # light grey shirt touching nothing
g.polygon(S(330, 20, 370, 20, 350, 70), fill=(250, 250, 250), outline=(40, 30, 30))                 # near-white hat tip
c.resize((W, H), Image.LANCZOS).save(f'{out}/cartoon-white.png')

# 7. logo on white: pale grey text and a light blue shape, anti-aliased
lg = Image.new('RGB', (900, 300), (255, 255, 255))
lgd = ImageDraw.Draw(lg)
lgd.rounded_rectangle((40, 60, 240, 240), 40, fill=(170, 210, 250))
lgd.ellipse((90, 110, 190, 190), fill=(255, 255, 255))
for i, x in enumerate(range(290, 860, 90)):
    lgd.rectangle((x, 110, x + 60, 190), fill=(200, 200, 205))
lg = lg.resize((1800, 600)).filter(ImageFilter.GaussianBlur(1.2)).resize((900, 300), Image.LANCZOS)
lg.save(f'{out}/logo-white.png')

# 8. studio product photo: light grey backdrop gradient + noise + soft shadow, subject with shading, JPEG
pw, ph = 1000, 750
yy = np.linspace(0, 1, ph)[:, None]; xx = np.linspace(0, 1, pw)[None, :]
bgp = 228 + 18 * (1 - yy) - 10 * ((xx - 0.5) ** 2)
img = np.stack([bgp, bgp, bgp + 3], -1)
rng = np.random.default_rng(3)
img += rng.normal(0, 2.5, img.shape)
# soft shadow
sh = Image.new('L', (pw, ph), 0); ImageDraw.Draw(sh).ellipse((330, 560, 690, 640), fill=120)
sh = np.array(sh.filter(ImageFilter.GaussianBlur(25))) / 255.0
img *= (1 - 0.45 * sh[..., None])
# subject: a bottle with vertical shading and a white label
m = Image.new('L', (pw, ph), 0); md = ImageDraw.Draw(m)
md.rounded_rectangle((420, 230, 600, 610), 40, fill=255); md.rectangle((475, 130, 545, 240), fill=255)
m = np.array(m.filter(ImageFilter.GaussianBlur(1.0))) / 255.0
shade = 0.65 + 0.5 * np.clip(1 - np.abs((xx - 0.51) / 0.09), 0, 1)
body = np.stack([30 + 0 * yy + 0 * xx, 110 * shade + 0 * yy, 70 * shade + 0 * yy], -1)
label = np.zeros((ph, pw)); label[330:470, 430:590] = 1
body = body * (1 - label[..., None]) + np.array([245, 245, 240]) * label[..., None]
img = img * (1 - m[..., None]) + body * m[..., None]
Image.fromarray(np.clip(img, 0, 255).astype('uint8')).save(f'{out}/product-photo.jpg', quality=88)
gt = Image.fromarray((m * 255).astype('uint8')); gt.save(f'{out}/product-photo-gt.png')
print('extra fixtures ready')
