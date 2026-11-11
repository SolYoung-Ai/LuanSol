#!/usr/bin/env python3
"""从 public/logo.png 生成整套站点图标。

logo.png 是品牌图案的透明底高分辨率版本（889×873），换成新 logo 时只替换它，
然后跑一次本脚本即可，不要再手工另存一堆尺寸——手工做的尺寸迟早会和源图不一致。

    python3 scripts/icons.py

产物（都写进 public/，随 vite 原样拷到 dist）：
    favicon.ico            16/32/48/64/128/256，Windows 与老浏览器
    favicon-16.png         浏览器标签页（小尺寸单独重采样，比直接缩放 256 清楚）
    favicon-32.png
    favicon-48.png
    favicon.png            256，Chrome 高分屏 / 部分爬虫
    icon-512.png           PWA 与社交分享备用
    apple-touch-icon.png   180，白底不透明（iOS 对透明图标会填黑）

依赖：pillow
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
SRC = PUBLIC / "logo.png"

# 图案在方形画布里的占比。太满会顶到边（标签页有 1px 裁切感），
# 太空在 16px 下只剩一点色块。92% 是实测下来 16/32/48 都还认得出的折中值。
FILL = 0.92
CANVAS = 1024
# 认为「是图案」的 alpha 阈值，用来裁掉源图四周的空白
ALPHA_FLOOR = 8


def build_canvas() -> Image.Image:
    logo = Image.open(SRC).convert("RGBA")
    box = logo.split()[3].point(lambda v: 255 if v > ALPHA_FLOOR else 0).getbbox()
    if not box:
        raise SystemExit(f"{SRC} 全透明，没有可用的图案")
    mark = logo.crop(box)

    inner = int(CANVAS * FILL)
    scale = inner / max(mark.size)
    target = (max(1, round(mark.width * scale)), max(1, round(mark.height * scale)))
    mark = mark.resize(target, Image.LANCZOS)

    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.paste(mark, ((CANVAS - mark.width) // 2, (CANVAS - mark.height) // 2), mark)
    return canvas


def save_png(canvas: Image.Image, size: int, name: str, background=None) -> None:
    im = canvas.resize((size, size), Image.LANCZOS)
    if background:
        # iOS 会把带透明通道的 apple-touch-icon 补成黑色底，所以这里压成纯 RGB
        flat = Image.new("RGBA", im.size, background)
        flat.alpha_composite(im)
        im = flat.convert("RGB")
    im.save(PUBLIC / name, "PNG", optimize=True)
    print(f"  {name:<22} {size}×{size}")


def main() -> None:
    canvas = build_canvas()

    for size, name in [
        (16, "favicon-16.png"),
        (32, "favicon-32.png"),
        (48, "favicon-48.png"),
        (256, "favicon.png"),
        (512, "icon-512.png"),
    ]:
        save_png(canvas, size, name)

    save_png(canvas, 180, "apple-touch-icon.png", background=(255, 255, 255, 255))

    canvas.resize((256, 256), Image.LANCZOS).save(
        PUBLIC / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    print(f"  {'favicon.ico':<22} 16/32/48/64/128/256")


if __name__ == "__main__":
    main()
