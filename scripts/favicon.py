#!/usr/bin/env python3
"""生成标签页图标（favicon）。

新 logo 是纯几何：圆角方框 + 橙圆压在黑圆上，所以不依赖任何位图素材，
这里按 public/favicon.svg 的同一套坐标（viewBox 64）放大绘制。

    python3 scripts/favicon.py

产物（都只服务浏览器标签页 / 添加到主屏）：
    public/favicon.ico     多尺寸 16/32/48（老浏览器兜底）
    public/favicon-16.png
    public/favicon-32.png
    public/favicon-48.png
    public/favicon.png     256
    public/apple-touch-icon.png  180（白底，iOS 不给透明）

站内字标不动：导航与页脚仍然是「Luna 黑 + Sol 橙」的文字标。
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "public"

INK = (22, 22, 22, 255)
BRAND = (244, 119, 53, 255)
WHITE = (255, 255, 255, 255)

# 与 public/favicon.svg 同一套坐标（viewBox 0 0 64 64）
VB = 64
RECT = (2.6, 2.6, 61.4, 61.4)   # 外框
RECT_R = 15
RECT_W = 4
BLACK_C = (35.0, 37.5, 14.0)
ORANGE_C = (27.0, 28.0, 13.4)

SS = 8  # 超采样倍数：小尺寸下圆才不糊


def draw(size: int, transparent: bool) -> Image.Image:
    px = size * SS
    img = Image.new("RGBA", (px, px), (0, 0, 0, 0) if transparent else WHITE)
    d = ImageDraw.Draw(img)
    k = px / VB

    def circle(cx, cy, r, color):
        d.ellipse([(cx - r) * k, (cy - r) * k, (cx + r) * k, (cy + r) * k], fill=color)

    # 方框：outline 画在 bbox 内侧，所以把 bbox 向外推半个描边宽，视觉上才是 2.6→61.4
    half = RECT_W / 2
    x0, y0, x1, y1 = RECT
    d.rounded_rectangle(
        [(x0 - half) * k, (y0 - half) * k, (x1 + half) * k, (y1 + half) * k],
        radius=(RECT_R + half) * k,
        outline=INK,
        width=round(RECT_W * k),
    )
    circle(*BLACK_C, INK)      # 黑圆在下
    circle(*ORANGE_C, BRAND)   # 橙圆压上去

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    for s in (16, 32, 48):
        draw(s, True).save(PUB / f"favicon-{s}.png")
    draw(256, True).save(PUB / "favicon.png")
    # iOS 主屏图标会自己加圆角，且不支持透明——白底整块
    draw(180, False).save(PUB / "apple-touch-icon.png")

    # .ico：一张图里塞多尺寸，系统/浏览器自己挑
    frames = [draw(s, True) for s in (16, 32, 48)]
    frames[0].save(
        PUB / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
        append_images=frames[1:],
    )
    print("favicon written ->", PUB)


if __name__ == "__main__":
    main()
