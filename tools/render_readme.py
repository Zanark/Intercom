"""Render documentation artwork only; requires Pillow and Windows Segoe UI."""

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs" / "assets"
SIZE = 432
SCALE = 2
FRAMES = 144
TAU = math.tau
NAVY = (6, 17, 26)
MINT = (153, 241, 216)
WHITE = (232, 247, 247)
MUTED = (150, 178, 188)
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
    image = Image.new("RGB", (SIZE, SIZE))
    pixels = []
    for y in range(SIZE):
        for x in range(SIZE):
            glow = max(0, 1 - math.hypot(x - 216, y - 205) / 260) ** 2
            pixels.append(blend(NAVY, (15, 47, 57), glow))
    image.putdata(pixels)
    return image.resize((SIZE * SCALE, SIZE * SCALE)).convert("RGBA")


def gradient(size, top, bottom):
    image = Image.new("RGBA", size)
    draw = ImageDraw.Draw(image)
    for y in range(size[1]):
        draw.line((0, y, size[0], y), fill=blend(top, bottom, y / (size[1] - 1)))
    return image


def microphone(level):
    image = Image.new("RGBA", (SIZE * SCALE, SIZE * SCALE))
    draw = ImageDraw.Draw(image)
    draw.arc(box((158, 194, 274, 310)), 0, 180, fill=(5, 12, 19), width=20 * SCALE)
    draw.arc(box((160, 192, 272, 304)), 0, 180, fill=MINT, width=13 * SCALE)
    draw.rounded_rectangle(box((160, 223, 173, 252)), radius=6 * SCALE, fill=MINT)
    draw.rounded_rectangle(box((259, 223, 272, 252)), radius=6 * SCALE, fill=MINT)
    draw.rectangle(box((210, 300, 222, 326)), fill=(99, 222, 214))
    draw.rounded_rectangle(
        box((187, 321, 245, 335)), radius=7 * SCALE, fill=(98, 223, 220)
    )
    capsule = (178, 126, 254, 277)
    draw.rounded_rectangle(
        box((180, 129, 258, 282)), radius=38 * SCALE, fill=(3, 10, 17)
    )
    mask = Image.new("L", image.size)
    ImageDraw.Draw(mask).rounded_rectangle(box(capsule), radius=38 * SCALE, fill=255)
    body = gradient(image.size, (34, 79, 84), (13, 35, 44))
    fill = gradient(image.size, (225, 255, 215), (26, 193, 221))
    top = round((277 - level * 151) * SCALE)
    body.paste(fill.crop((0, top, image.width, image.height)), (0, top))
    image.paste(body, (0, 0), mask)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(
        box(capsule), radius=38 * SCALE, outline=(160, 235, 219), width=2 * SCALE
    )
    return image


def sphere_node():
    diameter = 84
    image = Image.new("RGBA", (diameter, diameter))
    pixels = []
    for y in range(diameter):
        for x in range(diameter):
            r = math.hypot(x - 42, y - 42) / 40
            light = min(1, max(0, (x + y) / (diameter * 1.65)))
            rgb = blend((230, 255, 213), (21, 182, 219), light)
            pixels.append((*rgb, 255 if r <= 1 else 0))
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
            color = blend((27, 74, 88), (137, 236, 228), (depth + 1) / 2)
            draw.line((*a, *b), fill=color, width=2 * SCALE)
        else:
            point, radius = value
            x, y = project(point)
            depth = point[2]
            radius *= SCALE * (.8 + .35 * (depth + 1))
            diameter = round(radius * 2)
            texture = node.resize((diameter, diameter), Image.Resampling.LANCZOS)
            shade = Image.new("RGBA", texture.size, (5, 25, 34, round(110 * (1 - depth) / 2)))
            texture = Image.composite(Image.alpha_composite(texture, shade), texture, texture.getchannel("A"))
            draw.ellipse((x - radius + 3, y - radius + 5, x + radius + 3, y + radius + 5),
                         fill=(3, 13, 21))
            image.alpha_composite(texture, (round(x - radius), round(y - radius)))
    image = image.convert("RGB").resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    draw = ImageDraw.Draw(image)
    draw.text((216, 395), "ILLUSTRATIVE VOICE ACTIVITY", font=font(10), fill=MUTED, anchor="mm")
    return image


def panel(name, title, subtitle, width=480):
    image = Image.new("RGB", (width, 132), NAVY)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((1, 1, width - 2, 130), radius=18, outline=(38, 76, 82), width=2)
    draw.text((width / 2, 46), title, font=font(29, True), fill=WHITE, anchor="mm")
    draw.text((width / 2, 91), subtitle, font=font(20), fill=MINT, anchor="mm")
    image.save(ASSETS / name, optimize=True)


def gallery(name, source, title, caption):
    with Image.open(ASSETS / source) as screenshot:
        screenshot = screenshot.convert("RGBA")
        image = Image.new("RGB", (1240, 148 + screenshot.height), NAVY)
        draw = ImageDraw.Draw(image)
        draw.text((40, 35), title, font=font(32, True), fill=WHITE)
        draw.text((40, 90), caption, font=font(19), fill=MUTED)
        image.paste(screenshot, ((1240 - screenshot.width) // 2, 148), screenshot)
        image.save(ASSETS / name, optimize=True)


def main():
    base, node = background(), sphere_node()
    colors = []
    for count, a, b in (
        (16, NAVY, (15, 47, 57)),
        (64, (27, 74, 88), (137, 236, 228)),
        (80, (230, 255, 213), (21, 182, 219)),
        (48, (225, 255, 215), (26, 193, 221)),
        (32, (34, 79, 84), (13, 35, 44)),
        (16, MUTED, WHITE),
    ):
        colors.extend(blend(a, b, i / (count - 1)) for i in range(count))
    palette = Image.new("P", (1, 1))
    palette.putpalette([channel for color in colors for channel in color])
    frames = []
    for i in range(FRAMES):
        frame = render_frame(i / FRAMES, base, node)
        if i == 0:
            frame.save(ASSETS / "readme-logo-still.png", optimize=True)
        frames.append(frame.quantize(palette=palette, dither=Image.Dither.NONE))
    frames[0].save(
        ASSETS / "intercom-logo-animated.gif", save_all=True, append_images=frames[1:],
        duration=50, loop=0, disposal=1, optimize=False,
    )
    title = Image.new("RGB", (1360, 248), NAVY)
    draw = ImageDraw.Draw(title)
    draw.text((680, 85), "intercom.", font=font(112, True), fill=WHITE, anchor="mm")
    draw.text((680, 200), "YOUR VOICE. YOUR CONTEXT. CONNECTED.",
              font=font(27), fill=MINT, anchor="mm")
    title.save(ASSETS / "readme-title.png", optimize=True)
    panel("readme-download.png", "Download prototype .7", "Windows x64  /  unsigned")
    panel("readme-guide.png", "Project guide", "Setup  /  workflows  /  architecture")
    panel("readme-prototype.png", "Prototype details", "Features  /  checksums  /  limits")
    gallery("readme-voices.png", "prototype-voice-profiles.png",
            "A voice that fits your workflow.", "Packaged .7  /  installed voice profiles  /  synthetic test contexts")
    gallery("readme-workspace.png", "prototype-window-controls.png",
            "Your contexts, in reach.", "Packaged .5  /  graph zoom + native window controls  /  synthetic test contexts")
    gallery("readme-floating.png", "prototype-floating-controls.png",
            "Less window. More flow.", "Packaged .6  /  drag to move + window sizing  /  synthetic test contexts")
    print(f"Rendered {FRAMES} frames at {SIZE}px; GIF: {(ASSETS / 'intercom-logo-animated.gif').stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
