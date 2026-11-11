"""Render docs artwork; requires Pillow and Windows Segoe UI."""

import math
import random
import argparse
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "docs" / "assets" / "readme"
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
WAVE_COLORS = (
    (115, 214, 231), (143, 222, 190), (177, 160, 237),
    (234, 162, 209), (239, 201, 151),
)
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


@lru_cache(maxsize=8)
def sea_glass_ink(size, region):
    left, top, right, bottom = region
    width, height = right - left, bottom - top
    text_bounds = font(112, True).getbbox("intercom.")
    scale_x = width / (text_bounds[2] - text_bounds[0])
    scale_y = height / 160
    ink = frosted_surface(size, (75, 125, 116), (91, 139, 125)).copy()
    wash = Image.new("RGBA", size)
    pigment = ImageDraw.Draw(wash)
    for offset, y, radius in ((.04, 25, 88), (.40, 4, 110), (.79, 45, 80)):
        x = left + width * offset
        pigment.ellipse(
            (x - radius * scale_x, top + (y - 40) * scale_y,
             x + radius * scale_x, top + (y + 55) * scale_y),
            fill=(75, 69, 101, 190),
        )
    ink.alpha_composite(wash.filter(ImageFilter.GaussianBlur(12 * min(scale_x, scale_y))))
    return ink


@lru_cache(maxsize=4)
def microphone_gradient(size, top, bottom):
    purple = (86, 80, 113)
    seafoam = (91, 139, 125)
    image = Image.new("RGBA", size, (*purple, 255))
    image.paste(gradient((size[0], bottom - top), purple, seafoam), (0, top))
    ImageDraw.Draw(image).rectangle((0, bottom, size[0], size[1]), fill=(*seafoam, 255))
    return image


def microphone(level):
    image = Image.new("RGBA", (SIZE * SCALE, SIZE * SCALE))
    draw = ImageDraw.Draw(image)
    draw.arc(box((158, 194, 274, 310)), 0, 180, fill=(5, 12, 19), width=20 * SCALE)
    support = Image.new("L", image.size)
    support_draw = ImageDraw.Draw(support)
    support_draw.arc(box((160, 192, 272, 304)), 0, 180, fill=255, width=13 * SCALE)
    support_draw.rounded_rectangle(box((160, 223, 173, 252)), radius=6 * SCALE, fill=255)
    support_draw.rounded_rectangle(box((259, 223, 272, 252)), radius=6 * SCALE, fill=255)
    support_draw.rectangle(box((210, 300, 222, 326)), fill=255)
    support_draw.rounded_rectangle(box((187, 321, 245, 335)), radius=7 * SCALE, fill=255)
    ink = microphone_gradient(image.size, 126 * SCALE, 335 * SCALE)
    image.paste(ink, (0, 0), support)
    draw = ImageDraw.Draw(image)
    capsule = (178, 126, 254, 277)
    draw.rounded_rectangle(
        box((180, 129, 258, 282)), radius=38 * SCALE, fill=(3, 10, 17)
    )
    mask = Image.new("L", image.size)
    ImageDraw.Draw(mask).rounded_rectangle(box(capsule), radius=38 * SCALE, fill=255)
    image.paste(ink, (0, 0), mask)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(
        box(capsule), radius=38 * SCALE,
        outline=blend(SEAFOAM, WHITE, level * .65), width=2 * SCALE,
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
    phase %= 1
    half = HERO_WIDTH // 2
    image = Image.new("RGBA", (half * SCALE, SIZE * SCALE))
    halo = Image.new("RGBA", image.size)
    draw = ImageDraw.Draw(image)
    glow = ImageDraw.Draw(halo)
    energy = speech_level(phase)
    for band in range(24):
        points = []
        for step in range(161):
            distance = step / 160
            envelope = math.sin(math.pi * distance) ** .8
            wave = math.sin(distance * TAU * 1.6 - TAU * phase * 2 + band * .16)
            wave += .45 * math.sin(distance * TAU * 3 - TAU * phase * 3 + band * .09)
            wave += .2 * math.sin(distance * TAU * .75 - TAU * phase + band * .25)
            spread = (.45 + .55 * math.sin(distance * TAU - TAU * phase) ** 2)
            y = envelope * (
                wave * (25 + 34 * energy) + (band - 11.5) * (1 + energy) * spread
            )
            points.append((distance, y))
        for start, end in zip(points, points[1:]):
            distance = (start[0] + end[0]) / 2
            fade = math.sin(math.pi * distance) ** .7
            position = (band / 24 + distance * .7 - phase) % 1 * len(WAVE_COLORS)
            index = math.floor(position)
            tint = blend(WAVE_COLORS[index], WAVE_COLORS[(index + 1) % len(WAVE_COLORS)],
                         position - index)
            line = (
                start[0] * (half - 12) * SCALE, (214 + start[1]) * SCALE,
                end[0] * (half - 12) * SCALE, (214 + end[1]) * SCALE,
            )
            alpha = round(255 * min(1, fade * 3))
            brightness = fade * (.3 + .35 * energy + (.13 if band == 12 else 0))
            glow.line(line, fill=(*blend(NAVY, tint, fade * .42), alpha), width=12 * SCALE)
            draw.line(line, fill=(*blend(NAVY, tint, brightness), alpha),
                      width=(2 if band == 12 else 1) * SCALE)
    halo = halo.filter(ImageFilter.GaussianBlur(6 * SCALE))
    halo.alpha_composite(image)
    wing = halo.resize((half, SIZE), Image.Resampling.LANCZOS)
    image = Image.new("RGBA", (HERO_WIDTH, SIZE))
    image.alpha_composite(ImageOps.mirror(wing))
    image.alpha_composite(wing, (half, 0))
    return image


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


def static_microphone_mask(size):
    if size != (1254, 1254):
        raise ValueError("Static microphone mask requires the original 1254px mark.")
    mask = Image.new("L", size)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((519, 333, 727, 690), radius=104, fill=255)
    draw.arc((450, 406, 798, 754), 0, 180, fill=255, width=45)
    draw.rounded_rectangle((450, 505, 495, 600), radius=22, fill=255)
    draw.rounded_rectangle((753, 505, 798, 600), radius=22, fill=255)
    draw.rectangle((594, 737, 649, 822), fill=255)
    draw.rounded_rectangle((519, 804, 725, 856), radius=26, fill=255)
    # Retain the foreground node and the two links crossing in front of the mic.
    draw.ellipse((625, 449, 800, 624), fill=0)
    draw.line((432, 263, 713, 537), fill=0, width=14)
    draw.line((399, 879, 713, 537), fill=0, width=14)
    return mask


def render_static_brand():
    # Keep the high-resolution mark's geometry and the runtime icon unchanged.
    with Image.open(Path(__file__).parent / "sources" / "intercom-logo.png") as source:
        image = source.convert("RGBA")
    mic_mask = static_microphone_mask(image.size)
    ink = microphone_gradient(image.size, 333, 856)
    rng = random.Random(71)
    pixels = []
    for (r, g, b, alpha), microphone_coverage, pigment in zip(
        image.get_flattened_data(), mic_mask.get_flattened_data(), ink.get_flattened_data()
    ):
        coverage = min(1, max(0, (min(g, b) - 48) / 72))
        light = min(1, (r + g + b) / 765 + .08)
        tint = blend((75, 135, 141), FROST, light)
        grain = rng.randrange(-9, 10)
        tint = tuple(min(255, max(0, c + grain)) for c in tint)
        color = blend((r, g, b), tint, coverage)
        if microphone_coverage:
            shading = .5 + .7 * sum(color) / 765
            material = tuple(min(255, round(channel * shading)) for channel in pigment[:3])
            color = blend(color, material, coverage * microphone_coverage / 255)
        pixels.append((*color, alpha))
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


def gallery(screenshot, title, caption):
    image = frosted_surface((1240, 148 + screenshot.height), FROST, SEAFOAM).copy()
    draw = ImageDraw.Draw(image)
    draw.text((40, 35), title, font=font(32, True), fill=INK)
    draw.text((40, 90), caption, font=font(19), fill=MUTED)
    image.paste(screenshot, ((1240 - screenshot.width) // 2, 148), screenshot)
    return image.resize((960, round(image.height * 960 / 1240)), Image.Resampling.LANCZOS)


def staged_desktop():
    with Image.open(ASSETS / "sea-glass-wallpaper.png") as source:
        return ImageOps.fit(source.convert("RGBA"), (1240, 820), Image.Resampling.LANCZOS)


def render_gui_galleries(directory):
    scenes = (
        ("voices", "A voice that fits your workflow.",
         "Source GUI  /  fictional contexts  /  voice and tuning tabs  /  no playback"),
        ("workspace", "Your contexts, in reach.",
         "Source GUI  /  fictional contexts  /  real orbit, drift and zoom"),
        ("floating", "Your mesh. Over your workspace.",
         "Transparent source GUI  /  owner-supplied sea-glass wallpaper  /  staged composite"),
        ("microphone", "A microphone that moves with you.",
         "Source GUI  /  synthetic audio  /  actual input-reactive waves  /  no dispatch"),
    )
    backdrop = staged_desktop()
    for scene, title, caption in scenes:
        paths = sorted((directory / scene).glob("*.png"))
        if len(paths) != 60:
            raise ValueError(f"{scene}: expected 60 GUI captures, found {len(paths)}")

        def compose(source):
            with Image.open(source) as raw:
                screenshot = raw.convert("RGBA")
            if scene == "floating":
                if screenshot.size != (540, 540) or screenshot.getpixel((0, 0))[3] != 0:
                    raise ValueError("Floating capture must retain real window transparency.")
                stage = backdrop.copy()
                screenshot = screenshot.resize((740, 740), Image.Resampling.LANCZOS)
                stage.alpha_composite(screenshot, (250, 40))
                screenshot = stage
            elif screenshot.size != (1240, 820):
                raise ValueError(f"Unexpected GUI viewport: {screenshot.size}")
            return gallery(screenshot, title, caption)

        samples = Image.new("RGB", (240 * 6, 188))
        for i in range(6):
            sample = compose(paths[i * 10]).convert("RGB")
            samples.paste(sample.resize((240, 188)), (i * 240, 0))
        palette = samples.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
        frames = [compose(source).convert("RGB").quantize(palette=palette, dither=Image.Dither.NONE)
                  for source in paths]
        if not ImageChops.difference(frames[0].convert("RGB"), frames[30].convert("RGB")).getbbox():
            raise ValueError(f"{scene}: GUI capture has no motion.")
        name = f"readme-{scene}"
        frames[0].save(
            ASSETS / f"{name}.gif", save_all=True, append_images=frames[1:],
            duration=100, loop=0, disposal=1, optimize=True,
        )
        with Image.open(ASSETS / f"{name}.gif") as result:
            if result.n_frames < 2 or result.info.get("loop") != 0:
                raise ValueError(f"{scene}: encoded GIF is not animated and looping.")
            duration = 0
            for frame in range(result.n_frames):
                result.seek(frame)
                expected = frames[duration // 100].convert("RGB")
                if ImageChops.difference(result.convert("RGB"), expected).getbbox():
                    raise ValueError(f"{scene}: delta encoding changed frame {frame}.")
                duration += result.info["duration"]
            if duration != 6000:
                raise ValueError(f"{scene}: incorrect GIF playback duration.")
            result.seek(0)
            result.convert("RGBA").save(ASSETS / f"{name}.png", optimize=True)
            print(f"{name}: {result.n_frames} frames, {result.size}, {duration}ms, "
                  f"{(ASSETS / f'{name}.gif').stat().st_size:,} bytes")


def render_logo():
    base, node = background(), sphere_node()
    # Reserve index zero for transparency; GIF cannot retain partial alpha.
    colors = [(255, 0, 255)]
    for count, a, b in (
        (12, NAVY, (22, 65, 75)),
        (16, (34, 70, 77), TEAL),
        (32, (71, 126, 132), FROST),
        (16, TEAL, SEAFOAM),
        (12, (54, 88, 91), (23, 48, 57)),
        (8, SEAFOAM, WHITE),
    ):
        colors.extend(blend(a, b, i / (count - 1)) for i in range(count))
    colors.extend(blend((86, 80, 113), (91, 139, 125), i / 63) for i in range(64))
    for tint in WAVE_COLORS:
        colors.extend(blend(NAVY, tint, .8 * i / 18) for i in range(19))
    palette = Image.new("P", (1, 1))
    palette.putpalette([channel for color in colors for channel in color])
    frames = []
    for i in range(FRAMES):
        frame = render_frame(i / FRAMES, base, node)
        if i == 0:
            frame.save(ASSETS / "readme-logo-still.png", optimize=True)
        indexed = frame.convert("RGB").quantize(palette=palette, dither=Image.Dither.FLOYDSTEINBERG)
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
    lettering = font(112, True)
    bounds = draw.textbbox((680, 85), "intercom.", font=lettering, anchor="mm")
    left, width = bounds[0], bounds[2] - bounds[0]
    mask = Image.new("L", title.size)
    ImageDraw.Draw(mask).text(
        (680, 85), "intercom.", font=lettering, fill=255, anchor="mm",
    )
    title.paste(sea_glass_ink(title.size, (left, 0, left + width, 160)), (0, 0), mask)
    draw = ImageDraw.Draw(title)
    draw.text((680, 200), "YOUR VOICE. YOUR CONTEXT. CONNECTED.",
              font=font(27), fill=MUTED, anchor="mm")
    title.save(ASSETS / "readme-title.png", optimize=True)
    panel("readme-download.png", "Download prototype .12", "Windows x64  /  unsigned")
    panel("readme-guide.png", "Project guide", "Setup  /  workflows  /  architecture")
    panel("readme-prototype.png", "Prototype .12", "Always-visible mic  /  release notes")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gui-frames", type=Path, help="Encode disposable Electron GUI captures instead of branding.")
    arguments = parser.parse_args()
    if arguments.gui_frames:
        render_gui_galleries(arguments.gui_frames)
    else:
        main()
