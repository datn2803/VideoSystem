#!/usr/bin/env python3
"""Generate text overlay PNGs for each scene of the Vu case study video.
Output: assets/overlays/scene-{1-7}-{a,b,...}.png
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "assets", "overlays")
os.makedirs(OUT_DIR, exist_ok=True)

W, H = 1080, 1920

# Fonts — Arial supports Vietnamese diacritics on macOS
FONT_REG = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_ITAL = "/System/Library/Fonts/Supplemental/Arial Italic.ttf"

# Color palette — Shinhan / banker brand
BLACK = (0, 0, 0, 255)
WHITE = (255, 255, 255, 255)
CARBON = (15, 23, 42, 235)        # dark navy panel
CARBON_LIGHT = (30, 41, 59, 220)
SHINHAN_BLUE = (0, 79, 159, 255)  # Shinhan brand blue
GOLD = (251, 191, 36, 255)        # warning / highlight
RED = (220, 38, 38, 255)          # danger
RED_BG = (127, 29, 29, 230)       # danger panel bg
GREEN = (16, 185, 129, 255)       # positive
GREEN_BG = (6, 95, 70, 230)       # positive panel bg
YELLOW = (250, 204, 21, 255)
ORANGE_HL = (251, 146, 60, 255)
NAVY_DEEP = (8, 15, 30, 245)


def make_canvas():
    """Create transparent 1080x1920 canvas."""
    return Image.new("RGBA", (W, H), (0, 0, 0, 0))


def draw_panel(draw, xy, fill, radius=24, outline=None, outline_width=0):
    """Rounded rectangle panel."""
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=outline_width)


def text_size(draw, txt, font):
    bbox = draw.textbbox((0, 0), txt, font=font)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def draw_wrapped(draw, txt, font, x, y, max_width, fill, line_spacing=8, align="left"):
    """Draw wrapped text. Returns final y after last line."""
    words = txt.split()
    lines = []
    cur = ""
    for w in words:
        test = (cur + " " + w).strip()
        if text_size(draw, test, font)[0] <= max_width:
            cur = test
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    cy = y
    for line in lines:
        tw, th = text_size(draw, line, font)
        if align == "center":
            tx = x + (max_width - tw) // 2
        elif align == "right":
            tx = x + max_width - tw
        else:
            tx = x
        draw.text((tx, cy), line, font=font, fill=fill)
        cy += th + line_spacing
    return cy


def save(img, name):
    path = os.path.join(OUT_DIR, name)
    img.save(path, "PNG")
    print(f"✓ {path}  ({os.path.getsize(path)//1024}KB)")


# ─────────── SCENE 1: HOOK ───────────
def scene1_hook_top():
    """Top banner: 'THU NHẬP CAO · TÀI SẢN LỚN'"""
    img = make_canvas()
    d = ImageDraw.Draw(img)
    # Top dark gradient/panel
    draw_panel(d, (60, 180, W - 60, 380), fill=NAVY_DEEP, radius=20)
    f1 = ImageFont.truetype(FONT_BOLD, 72)
    f2 = ImageFont.truetype(FONT_BOLD, 56)
    draw_wrapped(d, "THU NHẬP CAO", f1, 60, 220, W - 120, WHITE, align="center")
    draw_wrapped(d, "TÀI SẢN LỚN", f1, 60, 305, W - 120, WHITE, align="center")
    save(img, "scene-01-a.png")


def scene1_hook_bottom():
    """Bottom: 'VẪN NGỘP DÒNG TIỀN?' red emphasis"""
    img = make_canvas()
    d = ImageDraw.Draw(img)
    # Red panel
    draw_panel(d, (60, 1400, W - 60, 1620), fill=(127, 29, 29, 240), radius=20)
    f = ImageFont.truetype(FONT_BOLD, 84)
    draw_wrapped(d, "VẪN NGỘP DÒNG TIỀN?", f, 60, 1450, W - 120, WHITE, align="center")
    save(img, "scene-01-b.png")


# ─────────── SCENE 2: CASE INTRO ───────────
def scene2_case_box():
    """Right-side panel: CASE KHÁCH HÀNG"""
    img = make_canvas()
    d = ImageDraw.Draw(img)
    # Right panel
    panel_x = 540
    draw_panel(d, (panel_x, 380, W - 60, 1100), fill=CARBON, radius=24)
    # Title bar
    draw_panel(d, (panel_x, 380, W - 60, 480), fill=SHINHAN_BLUE, radius=24)
    f_title = ImageFont.truetype(FONT_BOLD, 44)
    f_item = ImageFont.truetype(FONT_REG, 38)
    f_emph = ImageFont.truetype(FONT_BOLD, 44)
    d.text((panel_x + 30, 410), "CASE KHÁCH HÀNG", font=f_title, fill=WHITE)
    items = [
        ("• Tuổi:", "38"),
        ("• Nghề:", "Kinh doanh"),
        ("• Thu nhập:", "200tr/tháng"),
        ("• Tài sản:", "10 tỷ"),
    ]
    cy = 540
    for label, val in items:
        d.text((panel_x + 30, cy), label, font=f_item, fill=(200, 200, 200, 255))
        d.text((panel_x + 230, cy), val, font=f_emph, fill=GOLD)
        cy += 70
    save(img, "scene-02-a.png")


# ─────────── SCENE 3: VẤN ĐỀ (BẪY TÀI CHÍNH) ───────────
def scene3_problem_title():
    img = make_canvas()
    d = ImageDraw.Draw(img)
    draw_panel(d, (60, 120, W - 60, 280), fill=(127, 29, 29, 240), radius=20)
    f = ImageFont.truetype(FONT_BOLD, 72)
    draw_wrapped(d, "BẪY TÀI CHÍNH", f, 60, 160, W - 120, WHITE, align="center")
    save(img, "scene-03-a.png")


def scene3_problem_items():
    img = make_canvas()
    d = ImageDraw.Draw(img)
    f_label = ImageFont.truetype(FONT_BOLD, 42)
    f_val = ImageFont.truetype(FONT_BOLD, 56)
    f_unit = ImageFont.truetype(FONT_REG, 32)

    # Card 1: Thẻ TD
    draw_panel(d, (60, 340, W - 60, 540), fill=CARBON, radius=20)
    d.text((100, 365), "💳  THẺ TÍN DỤNG", font=f_label, fill=WHITE)
    d.text((100, 430), "2.3 tỷ", font=f_val, fill=RED)
    d.text((400, 455), "LS ~30%/năm", font=f_unit, fill=(220, 220, 220, 255))

    # Card 2: Tín chấp
    draw_panel(d, (60, 580, W - 60, 780), fill=CARBON, radius=20)
    d.text((100, 605), "📋  VAY TÍN CHẤP", font=f_label, fill=WHITE)
    d.text((100, 670), "3.7 tỷ", font=f_val, fill=RED)
    d.text((400, 695), "LS 16-20%/năm", font=f_unit, fill=(220, 220, 220, 255))

    # Total
    draw_panel(d, (60, 820, W - 60, 1020), fill=(127, 29, 29, 240), radius=20)
    d.text((100, 845), "🔻  TỔNG DƯ NỢ", font=f_label, fill=WHITE)
    f_big = ImageFont.truetype(FONT_BOLD, 88)
    d.text((100, 905), "6 TỶ", font=f_big, fill=WHITE)

    # Cash flow
    draw_panel(d, (60, 1060, W - 60, 1260), fill=(159, 18, 57, 245), radius=20)
    d.text((100, 1085), "DÒNG TIỀN/THÁNG", font=f_label, fill=WHITE)
    d.text((100, 1145), "ÂM ~35tr 🩸", font=f_val, fill=YELLOW)

    save(img, "scene-03-b.png")


# ─────────── SCENE 4: TÁI CẤU TRÚC ───────────
def scene4_solution_title():
    img = make_canvas()
    d = ImageDraw.Draw(img)
    draw_panel(d, (60, 120, W - 60, 280), fill=(6, 95, 70, 240), radius=20)
    f = ImageFont.truetype(FONT_BOLD, 64)
    draw_wrapped(d, "GIẢI PHÁP TÁI CẤU TRÚC", f, 60, 150, W - 120, WHITE, align="center")
    save(img, "scene-04-a.png")


def scene4_solution_steps():
    img = make_canvas()
    d = ImageDraw.Draw(img)
    f_num = ImageFont.truetype(FONT_BOLD, 88)
    f_label = ImageFont.truetype(FONT_BOLD, 42)
    f_sub = ImageFont.truetype(FONT_REG, 36)

    items = [
        ("1", "GOM NỢ", "Thẻ TD + Tín chấp → 1 khoản"),
        ("2", "VAY THẾ CHẤP", "6 tỷ · LS chỉ 7.2%/năm"),
        ("3", "KÉO DÀI 20 NĂM", "Cắt thẻ TD · Xây kế hoạch lại"),
    ]
    cy = 340
    for num, label, sub in items:
        draw_panel(d, (60, cy, W - 60, cy + 200), fill=CARBON, radius=20)
        # Number circle
        d.ellipse((90, cy + 50, 230, cy + 190), fill=GREEN)
        nw, nh = text_size(d, num, f_num)
        d.text((90 + (140 - nw) // 2, cy + 50 + (140 - nh) // 2 - 10), num, font=f_num, fill=WHITE)
        d.text((260, cy + 55), label, font=f_label, fill=WHITE)
        d.text((260, cy + 115), sub, font=f_sub, fill=(200, 200, 200, 255))
        cy += 240
    save(img, "scene-04-b.png")


# ─────────── SCENE 5: KẾT QUẢ ───────────
def scene5_result_title():
    img = make_canvas()
    d = ImageDraw.Draw(img)
    draw_panel(d, (60, 120, W - 60, 300), fill=(6, 95, 70, 240), radius=20)
    f = ImageFont.truetype(FONT_BOLD, 60)
    draw_wrapped(d, "KẾT QUẢ SAU 5 THÁNG", f, 60, 160, W - 120, WHITE, align="center")
    save(img, "scene-05-a.png")


def scene5_result_metrics():
    img = make_canvas()
    d = ImageDraw.Draw(img)
    f_label = ImageFont.truetype(FONT_BOLD, 38)
    f_val = ImageFont.truetype(FONT_BOLD, 78)
    f_unit = ImageFont.truetype(FONT_REG, 32)

    # Metric 1: dòng tiền +
    draw_panel(d, (60, 360, W - 60, 600), fill=CARBON, radius=20)
    d.text((100, 385), "💰  DÒNG TIỀN", font=f_label, fill=WHITE)
    d.text((100, 450), "+40tr", font=f_val, fill=GREEN)
    d.text((420, 480), "/ tháng", font=f_unit, fill=(220, 220, 220, 255))

    # Metric 2: tích lũy 600tr — BIG highlight
    draw_panel(d, (60, 640, W - 60, 920), fill=(6, 95, 70, 245), radius=20)
    d.text((100, 665), "📈  TÍCH LŨY", font=f_label, fill=WHITE)
    f_huge = ImageFont.truetype(FONT_BOLD, 120)
    d.text((100, 735), "600 TRIỆU", font=f_huge, fill=YELLOW)

    # Metric 3: tâm lý
    draw_panel(d, (60, 960, W - 60, 1180), fill=CARBON, radius=20)
    d.text((100, 985), "😌  TÂM LÝ", font=f_label, fill=WHITE)
    d.text((100, 1050), "Ổn định, chủ động", font=ImageFont.truetype(FONT_BOLD, 52), fill=GREEN)

    save(img, "scene-05-b.png")


# ─────────── SCENE 6: BÀI HỌC ───────────
def scene6_lesson():
    img = make_canvas()
    d = ImageDraw.Draw(img)
    # Top title
    f_title = ImageFont.truetype(FONT_BOLD, 56)
    draw_panel(d, (60, 200, W - 60, 340), fill=NAVY_DEEP, radius=20)
    d_w, d_h = text_size(d, "BÀI HỌC", f_title)
    d.text(((W - d_w) // 2, 240), "BÀI HỌC", font=f_title, fill=WHITE)

    # 3 pillars
    f_pillar = ImageFont.truetype(FONT_BOLD, 72)
    items = [
        ("✅", "HIỂU ĐÚNG"),
        ("✅", "CHỌN ĐÚNG"),
        ("✅", "DÒNG TIỀN KHỎE"),
    ]
    cy = 600
    for icon, label in items:
        draw_panel(d, (60, cy, W - 60, cy + 200), fill=CARBON, radius=20)
        d.text((110, cy + 55), icon, font=f_pillar, fill=GREEN)
        d.text((260, cy + 60), label, font=f_pillar, fill=WHITE)
        cy += 230
    save(img, "scene-06-a.png")


# ─────────── SCENE 7: CTA ───────────
def scene7_cta():
    img = make_canvas()
    d = ImageDraw.Draw(img)
    # Top CTA banner
    draw_panel(d, (60, 200, W - 60, 480), fill=SHINHAN_BLUE, radius=24)
    f_big = ImageFont.truetype(FONT_BOLD, 96)
    f_sub = ImageFont.truetype(FONT_BOLD, 48)
    f_label = ImageFont.truetype(FONT_REG, 38)
    d_w, _ = text_size(d, "INBOX VŨ", f_big)
    d.text(((W - d_w) // 2, 245), "INBOX VŨ", font=f_big, fill=WHITE)
    d_w, _ = text_size(d, "Tư vấn 1-1 · Miễn phí", f_sub)
    d.text(((W - d_w) // 2, 380), "Tư vấn 1-1 · Miễn phí", font=f_sub, fill=YELLOW)

    # 3 benefits
    benefits = [
        "✓  Phân tích miễn phí",
        "✓  Kế hoạch cá nhân hóa",
        "✓  Thoát bẫy tài chính",
    ]
    cy = 600
    for b in benefits:
        draw_panel(d, (60, cy, W - 60, cy + 130), fill=CARBON, radius=18)
        d.text((100, cy + 40), b, font=f_label, fill=WHITE)
        cy += 160

    # Bottom DM button
    draw_panel(d, (200, 1450, W - 200, 1620), fill=GOLD, radius=24)
    f_btn = ImageFont.truetype(FONT_BOLD, 80)
    d_w, _ = text_size(d, "DM NGAY", f_btn)
    d.text(((W - d_w) // 2, 1485), "DM NGAY", font=f_btn, fill=NAVY_DEEP)

    save(img, "scene-07-a.png")


# ─────────── BRANDING: top bar + bottom watermark for every scene ───────────
def branding_corner():
    """Top-left brand chip + bottom watermark applied as continuous overlay."""
    img = make_canvas()
    d = ImageDraw.Draw(img)
    # Top-left: Shinhan brand chip
    draw_panel(d, (40, 40, 480, 130), fill=SHINHAN_BLUE, radius=18)
    f_brand = ImageFont.truetype(FONT_BOLD, 36)
    d.text((70, 60), "VŨ Ở SHINHAN", font=f_brand, fill=WHITE)
    f_sub = ImageFont.truetype(FONT_REG, 22)
    d.text((70, 100), "Tư vấn tín dụng thế chấp", font=f_sub, fill=(220, 220, 220, 255))
    save(img, "branding.png")


if __name__ == "__main__":
    print("Generating text overlay PNGs...\n")
    scene1_hook_top()
    scene1_hook_bottom()
    scene2_case_box()
    scene3_problem_title()
    scene3_problem_items()
    scene4_solution_title()
    scene4_solution_steps()
    scene5_result_title()
    scene5_result_metrics()
    scene6_lesson()
    scene7_cta()
    branding_corner()
    print(f"\n✅ Done. Overlays in {OUT_DIR}")
