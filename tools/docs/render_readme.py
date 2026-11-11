"""Render documentation artwork only; requires Pillow and Windows Segoe UI."""

import math
import random
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "docs" / "assets" / "readme"
SCREENSHOTS = ROOT / "docs" / "assets" / "screenshots"
SIZE = 432
HERO_WIDTH = 936
SCALE = 2
FRAMES = 144
TAU = math.tau
NAVY = (6, 17, 26)
WHITE = (232, 247, 247)
SEAFOAM = (181, 215, 207)
FROST = (221, 236, 230)
TEAL = (104, 158, 158)
INK = (25, 59, 66)
MUTED = (54, 91, 96)
FONTS = Path(r"C:\Windows\Fonts")


def font(size, bold=False):
    return ImageFont.truetype(
        str(FONTS / ("segoeuib.ttf" if bold else "segoeui.ttf")), size
    )


def blend(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def box(values):
    return tuple(round(v * SCALE) for v in values)


def background():
    image = Image.new("RGBA", (SIZE, SIZE))
    pixels = []
    for y in range(SIZE):
        for x in range(SIZE):
            distance = math.hypot(x - 216, y - 214)
            glow = max(0, 1 - distance / 208) ** 2
            opacity = min(1, max(0, (208 - distance) / 18))
            pixels.append((*blend(NAVY, (22, 65, 75), glow), round(255 * opacity)))
    image.putdata(pixels)
    return image.resize((SIZE * SCALE, SIZE * SCALE), Image.Resampling.LANCZOS)


def gradient(size, top, bottom):
    image = Image.new("RGBA", size)
    draw = ImageDraw.Draw(image)
    for y in range(size[1]):
        draw.line((0, y, size[0], y), fill=blend(top, bottom, y / (size[1] - 1)))
    return image


@lru_cache(maxsize=12)
def frosted_surface(size, top, bottom):
    rng = random.Random(23)
    grain = Image.frombytes("L", size, bytes(
        rng.randrange(120, 137) for _ in range(size[0] * size[1])
    ))
    face = gradient(size, top, bottom).convert("RGB")
    return Image.merge("RGB", tuple(
        ImageChops.add(channel, grain, offset=-128) for channel in face.split()
    )).convert("RGBA")


def microphone(level):
    image = Image.new("RGBA", (SIZE * SCALE, SIZE * SCALE))
    draw = ImageDraw.Draw(image)
    draw.arc(box((158, 194, 274, 310)), 0, 180, fill=(5, 12, 19), width=20 * SCALE)
    draw.arc(box((160, 192, 272, 304)), 0, 180, fill=SEAFOAM, width=13 * SCALE)
    draw.rounded_rectangle(box((160, 223, 173, 252)), radius=6 * SCALE, fill=SEAFOAM)
    draw.rounded_rectangle(box((259, 223, 272, 252)), radius=6 * SCALE, fill=SEAFOAM)
    draw.rectangle(box((210, 300, 222, 326)), fill=SEAFOAM)
    draw.rounded_rectangle(
        box((187, 321, 245, 335)), radius=7 * SCALE, fill=TEAL
    )
    capsule = (178, 126, 254, 277)
    draw.rounded_rectangle(
        box((180, 129, 258, 282)), radius=38 * SCALE, fill=(3, 10, 17)
    )
    mask = Image.new("L", image.size)
    ImageDraw.Draw(mask).rounded_rectangle(box(capsule), radius=38 * SCALE, fill=255)
    body = frosted_surface(image.size, (54, 88, 91), (23, 48, 57)).copy()
    fill = frosted_surface(image.size, FROST, TEAL)
    top = round((277 - level * 151) * SCALE)
    body.paste(fill.crop((0, top, image.width, image.height)), (0, top))
    image.paste(body, (0, 0), mask)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(
        box(capsule), radius=38 * SCALE, outline=SEAFOAM, width=2 * SCALE
    )
    return image


def sphere_node():
    diameter = 128
    image = Image.new("RGBA", (diameter, diameter))
    rng = random.Random(71)
    pixels = []
    for y in range(diameter):
        for x in range(diameter):
            nx, ny = (x - 64) / 62, (y - 64) / 62
            r = math.hypot(nx, ny)
            if r > 1:
                pixels.append((0, 0, 0, 0))
                continue
            z = math.sqrt(1 - r * r)
            diffuse = max(0, -.36 * nx - .48 * ny + .72 * z)
            rim = max(0, (r - .84) / .16) * max(0, -.5 * nx - .6 * ny)
            light = min(1, .14 + .75 * diffuse + .3 * rim)
            rgb = blend((88, 149, 153), FROST, light)
            grain = rng.randrange(-11, 12) + 3 * math.sin(x * .4) * math.cos(y * .37)
            pixels.append((*(
                min(255, max(0, round(channel + grain))) for channel in rgb
            ), 245))
    image.putdata(pixels)
    return image


def speech_level(phase):
    # Cyclic eased keyframes illustrate speech, never read a microphone.
    levels = (.12, .18, .64, .94, .42, .73, .22, .10,
              .15, .81, .48, .90, .32, .19, .58, .14)
    position = phase * len(levels)
    index = math.floor(position)
    t = (1 - math.cos(math.pi * (position - index))) / 2
    return levels[index % len(levels)] * (1 - t) + levels[(index + 1) % len(levels)] * t


def logo_waves(phase):
    image = Image.new("RGBA", (HERO_WIDTH * SCALE, SIZE * SCALE))
    draw = ImageDraw.Draw(image)
    half = HERO_WIDTH / 2
    energy = speech_level(phase)
    for band in range(18):
        points = []
        for step in range(161):
            distance = step / 160
            envelope = math.sin(math.pi * distance)
            wave = math.sin(distance * 13 - TAU * phase * 2 + band * .13)
            wave += .3 * math.sin(distance * 24 - TAU * phase * 3 + band * .08)
            y = envelope * (wave * (16 + 28 * energy) + (band - 8.5) * energy)
            points.append((distance * half, y))
        for direction in (-1, 1):
            for start, end in zip(points, points[1:]):
                fade = math.sin(math.pi * start[0] / half) ** .5
                brightness = fade * (.65 if band == 8 else .38 + .22 * energy)
                color = blend((15, 33, 45), (67, 133, 147), brightness)
                draw.line((
                    (half + direction * start[0]) * SCALE, (214 + start[1]) * SCALE,
                    (half + direction * end[0]) * SCALE, (214 + end[1]) * SCALE,
                ), fill=color, width=(2 if band == 8 else 1) * SCALE)
    return image.resize((HERO_WIDTH, SIZE), Image.Resampling.LANCZOS)


def render_frame(phase, base, node):
    angle = TAU * phase

    def rotate(point):
        x, y, z = point
        x, z = x * math.cos(angle) + z * math.sin(angle), -x * math.sin(angle) + z * math.cos(angle)
        return x, y * math.cos(.16) - z * math.sin(.16), y * math.sin(.16) + z * math.cos(.16)

    def project(point):
        x, y, z = point
        perspective = 1 / (1 - z * .15)
        return (216 + x * 151 * perspective) * SCALE, (214 + y * 151 * perspective) * SCALE

    points = []
    for i, latitude in enumerate((.05, .72, -.55, .38, -.85, .96, -.23, .62, -.64)):
        longitude = TAU * i / 9
        points.append(rotate((math.cos(latitude) * math.cos(longitude),
                              math.sin(latitude), math.cos(latitude) * math.sin(longitude))))
    primitives = [(0, "mic", None)]

    def segment(a, b):
        primitives.append(((a[2] + b[2]) / 2, "line", (project(a), project(b))))

    # Outer paths follow the spherical surface; interior connections are chords.
    for orbit in (0, 1):
        ring = []
        for i in range(97):
            t = TAU * i / 96
            ring.append(rotate((math.cos(t), 0, math.sin(t)) if orbit == 0
                               else (.35 * math.cos(t), math.sin(t), .94 * math.cos(t))))
        for a, b in zip(ring, ring[1:]):
            segment(a, b)
    edges = [(i, (i + 1) % 9) for i in range(9)] + [(0, 4), (0, 6), (1, 5), (2, 7), (3, 8)]
    for i, j in edges:
        for step in range(12):
            a = tuple(x + (y - x) * step / 12 for x, y in zip(points[i], points[j]))
            b = tuple(x + (y - x) * (step + 1) / 12 for x, y in zip(points[i], points[j]))
            segment(a, b)
    for i, point in enumerate(points):
        radius = (12, 8, 15, 7, 11, 9, 14, 7, 10)[i]
        primitives.append((point[2] + radius / 151, "node", (point, radius)))

    image = base.copy()
    mic = microphone(speech_level(phase))
    for depth, kind, value in sorted(primitives, key=lambda p: p[0]):
        draw = ImageDraw.Draw(image)
        if kind == "mic":
            image.alpha_composite(mic)
        elif kind == "line":
            a, b = value
            light = (depth + 1) / 2
            draw.line((*a, *b), fill=blend((34, 70, 77), TEAL, light), width=4 * SCALE)
            draw.line((*a, *b), fill=blend((57, 98, 104), SEAFOAM, light), width=2 * SCALE)
            draw.line(
                (a[0], a[1] - SCALE / 2, b[0], b[1] - SCALE / 2),
                fill=blend((65, 103, 109), FROST, light * .85), width=SCALE,
            )
        else:
            point, radius = value
            x, y = project(point)
            depth = point[2]
            radius *= SCALE * (.8 + .35 * (depth + 1))
            diameter = round(radius * 2)
            texture = node.resize((diameter, diameter), Image.Resampling.LANCZOS)
            shade = Image.new("RGBA", texture.size, (18, 44, 51, round(85 * (1 - depth) / 2)))
            texture = Image.composite(Image.alpha_composite(texture, shade), texture, texture.getchannel("A"))
            draw.ellipse((x - radius + 3, y - radius + 5, x + radius + 3, y + radius + 5),
                         fill=(3, 13, 21))
            image.alpha_composite(texture, (round(x - radius), round(y - radius)))
    hero = logo_waves(phase)
    hero.alpha_composite(
        image.resize((SIZE, SIZE), Image.Resampling.LANCZOS),
        ((HERO_WIDTH - SIZE) // 2, 0),
    )
    return hero


def render_static_brand():
    # Keep the high-resolution mark's geometry and the runtime icon unchanged.
    with Image.open(Path(__file__).parent / "sources" / "intercom-logo.png") as source:
        image = source.convert("RGBA")
    rng = random.Random(71)
    pixels = []
    for r, g, b, alpha in image.get_flattened_data():
        coverage = min(1, max(0, (min(g, b) - 48) / 72))
        light = min(1, (r + g + b) / 765 + .08)
        tint = blend((75, 135, 141), FROST, light)
        grain = rng.randrange(-9, 10)
        tint = tuple(min(255, max(0, c + grain)) for c in tint)
        pixels.append((*blend((r, g, b), tint, coverage), alpha))
    image.putdata(pixels)
    image.save(ROOT / "docs" / "assets" / "branding" / "intercom-logo.png", optimize=True)


def panel(name, title, subtitle, width=480):
    image = Image.new("RGBA", (width, 156))
    shadow = Image.new("RGBA", image.size)
    ImageDraw.Draw(shadow).rounded_rectangle(
        (16, 20, width - 16, 140), radius=22, fill=(0, 0, 0, 165)
    )
    image.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(8)))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(
        (12, 14, width - 12, 134), radius=20, fill=(59, 105, 111),
        outline=(42, 78, 84), width=2,
    )
    face = frosted_surface((width - 24, 120), FROST, SEAFOAM)
    mask = Image.new("L", face.size)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, face.width - 1, face.height - 1), radius=20, fill=255
    )
    image.paste(face, (12, 6), mask)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(
        (12, 6, width - 13, 125), radius=20, outline=(162, 193, 186), width=2
    )
    draw.line((35, 9, width - 36, 9), fill=(247, 253, 248))
    draw.text((width / 2, 45), title, font=font(29, True), fill=INK, anchor="mm")
    draw.text((width / 2, 88), subtitle, font=font(20), fill=MUTED, anchor="mm")
    image.save(ASSETS / name, optimize=True)


def gallery(name, source, title, caption):
    with Image.open(SCREENSHOTS / source) as screenshot:
        screenshot = screenshot.convert("RGBA")
        if screenshot.width > 1240:
            screenshot = screenshot.resize(
                (1240, round(screenshot.height * 1240 / screenshot.width)),
                Image.Resampling.LANCZOS,
            )
        image = frosted_surface((1240, 148 + screenshot.height), FROST, SEAFOAM).copy()
        draw = ImageDraw.Draw(image)
        draw.text((40, 35), title, font=font(32, True), fill=INK)
        draw.text((40, 90), caption, font=font(19), fill=MUTED)
        image.paste(screenshot, ((1240 - screenshot.width) // 2, 148), screenshot)
        image.save(ASSETS / name, optimize=True)


def render_logo():
    base, node = background(), sphere_node()
    # Reserve index zero for transparency; GIF cannot retain partial alpha.
    colors = [(255, 0, 255)]
    for count, a, b in (
        (15, NAVY, (22, 65, 75)),
        (48, (34, 70, 77), TEAL),
        (80, (71, 126, 132), FROST),
        (48, TEAL, SEAFOAM),
        (24, (54, 88, 91), (23, 48, 57)),
        (8, SEAFOAM, WHITE),
        (32, (15, 33, 45), (67, 133, 147)),
    ):
        colors.extend(blend(a, b, i / (count - 1)) for i in range(count))
    palette = Image.new("P", (1, 1))
    palette.putpalette([channel for color in colors for channel in color])
    frames = []
    for i in range(FRAMES):
        frame = render_frame(i / FRAMES, base, node)
        if i == 0:
            frame.save(ASSETS / "readme-logo-still.png", optimize=True)
        indexed = frame.convert("RGB").quantize(palette=palette, dither=Image.Dither.NONE)
        indexed.paste(0, mask=frame.getchannel("A").point(lambda a: 255 if a < 128 else 0))
        frames.append(indexed)
    frames[0].save(
        ASSETS / "intercom-logo-animated.gif", save_all=True, append_images=frames[1:],
        duration=50, loop=0, transparency=0, background=0, disposal=2, optimize=False,
    )
    print(f"Rendered {FRAMES} transparent {HERO_WIDTH} x {SIZE} logo frames; GIF: {(ASSETS / 'intercom-logo-animated.gif').stat().st_size:,} bytes")


def main():
    render_logo()
    render_static_brand()
    title = Image.new("RGBA", (1360, 248))
    shadow = Image.new("RGBA", title.size)
    ImageDraw.Draw(shadow).rounded_rectangle(
        (16, 20, 1344, 240), radius=38, fill=(0, 0, 0, 120)
    )
    title.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(8)))
    face = frosted_surface((1336, 224), FROST, SEAFOAM)
    mask = Image.new("L", face.size)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, 1335, 223), radius=36, fill=255
    )
    title.paste(face, (12, 4), mask)
    draw = ImageDraw.Draw(title)
    draw.rounded_rectangle(
        (12, 4, 1347, 227), radius=36, outline=(238, 247, 241), width=2
    )
    draw.text((680, 85), "intercom.", font=font(112, True), fill=INK, anchor="mm")
    draw.text((680, 200), "YOUR VOICE. YOUR CONTEXT. CONNECTED.",
              font=font(27), fill=MUTED, anchor="mm")
    title.save(ASSETS / "readme-title.png", optimize=True)
    panel("readme-download.png", "Download prototype .12", "Windows x64  /  unsigned")
    panel("readme-guide.png", "Project guide", "Setup  /  workflows  /  architecture")
    panel("readme-prototype.png", "Prototype .12", "Always-visible mic  /  release notes")
    gallery("readme-voices.png", "prototype-voice-profiles.png",
            "A voice that fits your workflow.", "Packaged .7  /  installed voice profiles  /  synthetic test contexts")
    gallery("readme-workspace.png", "prototype-window-controls.png",
            "Your contexts, in reach.", "Packaged .5  /  graph zoom + native window controls  /  synthetic test contexts")
    gallery("readme-floating.png", "floating-over-desktop.png",
            "Your mesh. Over your desktop.",
            "Owner-provided screenshot  /  transparent Floating Mesh  /  earlier control layout")
    gallery("readme-floating-browser.png", "floating-over-browser.png",
            "Stay in your flow.",
            "Owner-provided screenshot  /  floating above another app  /  earlier control layout")


if __name__ == "__main__":
    main()
