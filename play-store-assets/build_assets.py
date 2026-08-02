"""Build Play Store graphic assets from raw device screenshots + app icon.
Run: python build_assets.py
Reads:  play-store-assets/raw/*.png, icon-512.png (repo root)
Writes: play-store-assets/phone/*.png
        play-store-assets/tablet-7in/*.png
        play-store-assets/tablet-10in/*.png
        play-store-assets/feature-graphic/feature-graphic.png
"""
from PIL import Image, ImageDraw, ImageFont
import os

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(ROOT)
RAW = os.path.join(ROOT, "raw")

CREAM = (245, 240, 234)      # #f5f0ea — app light background
INK = (26, 22, 18)           # near-black app text
GOLD = (184, 147, 90)        # #b8935a — app gold/accent
GOLD_LIGHT = (200, 169, 110) # #c8a96e

SCREENSHOTS = [
    ("01_thisweek.png", "This week"),
    ("02_today.png", "Today"),
    ("03_pantry_final.png", "Pantry"),
    ("04_dishes_final.png", "Dishes"),
    ("05_metrics_final.png", "Metrics"),
    ("06_swapmodal_final.png", "Swap"),
]

def load_raw(name):
    im = Image.open(os.path.join(RAW, name))
    if im.mode != "RGB":
        im = im.convert("RGB")
    return im

def save_phone():
    out_dir = os.path.join(ROOT, "phone")
    os.makedirs(out_dir, exist_ok=True)
    for i, (fname, label) in enumerate(SCREENSHOTS, start=1):
        im = load_raw(fname)
        out_path = os.path.join(out_dir, f"phone_{i}_{label.lower().replace(' ', '')}.png")
        im.save(out_path, "PNG")
        print("phone:", out_path, im.size)

def composite_on_canvas(phone_im, canvas_w, canvas_h, margin_ratio=0.06):
    canvas = Image.new("RGB", (canvas_w, canvas_h), CREAM)
    avail_w = canvas_w * (1 - 2 * margin_ratio)
    avail_h = canvas_h * (1 - 2 * margin_ratio)
    scale = min(avail_w / phone_im.width, avail_h / phone_im.height)
    new_w, new_h = int(phone_im.width * scale), int(phone_im.height * scale)
    resized = phone_im.resize((new_w, new_h), Image.LANCZOS)

    # subtle drop shadow
    shadow = Image.new("RGBA", (new_w + 40, new_h + 40), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle([20, 24, new_w + 20, new_h + 24], radius=28, fill=(60, 45, 25, 60))
    shadow = shadow.filter(__import__("PIL.ImageFilter", fromlist=["ImageFilter"]).GaussianBlur(18))
    shadow_x = (canvas_w - new_w) // 2 - 20
    shadow_y = (canvas_h - new_h) // 2 - 20
    canvas_rgba = canvas.convert("RGBA")
    canvas_rgba.alpha_composite(shadow, (shadow_x, shadow_y))
    canvas = canvas_rgba.convert("RGB")

    x = (canvas_w - new_w) // 2
    y = (canvas_h - new_h) // 2
    canvas.paste(resized, (x, y))
    return canvas

def save_tablets():
    specs = [
        ("tablet-7in", 1200, 1920),
        ("tablet-10in", 1600, 2560),
    ]
    for dirname, w, h in specs:
        out_dir = os.path.join(ROOT, dirname)
        os.makedirs(out_dir, exist_ok=True)
        for i, (fname, label) in enumerate(SCREENSHOTS, start=1):
            phone_im = load_raw(fname)
            canvas = composite_on_canvas(phone_im, w, h)
            out_path = os.path.join(out_dir, f"{dirname.replace('-', '_')}_{i}_{label.lower().replace(' ', '')}.png")
            canvas.save(out_path, "PNG")
            print(dirname + ":", out_path, canvas.size)

def font(path, size):
    return ImageFont.truetype(os.path.join("C:\\Windows\\Fonts", path), size)

def build_feature_graphic():
    W, H = 1024, 500
    canvas = Image.new("RGB", (W, H), CREAM)
    draw = ImageDraw.Draw(canvas)

    # soft gradient wash on the right side (subtle, warm)
    for x in range(W):
        t = max(0, (x - W * 0.35) / (W * 0.65))
        r = int(CREAM[0] + (GOLD_LIGHT[0] - CREAM[0]) * t * 0.18)
        g = int(CREAM[1] + (GOLD_LIGHT[1] - CREAM[1]) * t * 0.18)
        b = int(CREAM[2] + (GOLD_LIGHT[2] - CREAM[2]) * t * 0.18)
        draw.line([(x, 0), (x, H)], fill=(r, g, b))

    # app icon
    icon_path = os.path.join(REPO_ROOT, "icon-512.png")
    icon = Image.open(icon_path).convert("RGBA")
    icon_size = 220
    icon = icon.resize((icon_size, icon_size), Image.LANCZOS)
    icon_x, icon_y = 64, (H - icon_size) // 2
    canvas.paste(icon, (icon_x, icon_y), icon)

    # wordmark "Miso" (matches in-app header: black "Mi" + gold "so")
    text_x = icon_x + icon_size + 46
    f_word = font("georgiab.ttf", 96)
    mi_w = draw.textlength("Mi", font=f_word)
    draw.text((text_x, 118), "Mi", font=f_word, fill=INK)
    draw.text((text_x + mi_w, 118), "so", font=f_word, fill=GOLD)

    # tagline
    f_tag = font("georgiai.ttf", 34)
    draw.text((text_x + 6, 236), "Meal planning that starts", font=f_tag, fill=(70, 62, 52))
    draw.text((text_x + 6, 280), "with your pantry.", font=f_tag, fill=(70, 62, 52))

    out_dir = os.path.join(ROOT, "feature-graphic")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "feature-graphic.png")
    canvas.save(out_path, "PNG")
    print("feature graphic:", out_path, canvas.size)

if __name__ == "__main__":
    save_phone()
    save_tablets()
    build_feature_graphic()
    print("Done.")
