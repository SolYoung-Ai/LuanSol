#!/usr/bin/env python3
"""生成标签页图标（favicon）。

新 logo 是纯几何：一个橙圆压在一个黑圆上（Luna = 橙日，Sol = 黑），没有外框。
坐标取自设计稿「橙黑交叠圆形标志.png」的实际比例：
    两圆等大 r 259.5，黑圆相对橙圆偏右下 (123, 79.5)
换算到 viewBox 64 即 r 23、偏移 (10.9, 7.05)；去掉外框后图形约占画面 89%。
同一套数字也写在 public/favicon.svg 里，改一处要一起改。

    python3 scripts/favicon.py

产物（都只服务浏览器标签页 / 添加到主屏）：
    public/favicon.ico     多尺寸 16/32/48（老浏览器兜底）
    public/favicon-16.png
    public/favicon-32.png
    public/favicon-48.png
    public/favicon.png     256
    public/apple-touch-icon.png  180（白底，iOS 不给透明）
    public/icon-512.png    512

站内字标用的是同一个标志（见 src/site/SiteNav.tsx，坐标与本文件一致）。
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "public"

INK = (22, 22, 22, 255)
BRAND = (253, 113, 2, 255)   # 取色自设计稿（#FD7102）
WHITE = (255, 255, 255, 255)

# 与 public/favicon.svg 同一套坐标（viewBox 0 0 64 64）
VB = 64
R = 23.0
BLACK_C = (36.4, 35.6)
ORANGE_C = (25.5, 28.6)

SS = 8  # 超采样倍数：小尺寸下圆才不糊


def draw(size: int, transparent: bool) -> Image.Image:
    px = size * SS
    img = Image.new("RGBA", (px, px), (0, 0, 0, 0) if transparent else WHITE)
    d = ImageDraw.Draw(img)
    k = px / VB

    def circle(cx, cy, r, color):
        d.ellipse([(cx - r) * k, (cy - r) * k, (cx + r) * k, (cy + r) * k], fill=color)

    circle(*BLACK_C, R, INK)     # 黑圆在下
    circle(*ORANGE_C, R, BRAND)  # 橙圆压上去

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    for s in (16, 32, 48):
        draw(s, True).save(PUB / f"favicon-{s}.png")
    draw(256, True).save(PUB / "favicon.png")
    # iOS 主屏图标会自己加圆角，且不支持透明——白底整块
    draw(180, False).save(PUB / "apple-touch-icon.png")
    draw(512, True).save(PUB / "icon-512.png")

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
