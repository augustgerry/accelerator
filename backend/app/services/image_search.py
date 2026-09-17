"""
Public web image search service for enterprise IT hardware, data center components,
and technology solutions. Uses Wikimedia Commons API and Bing Images via httpx
with image optimization via Pillow.
"""

import base64
import html
import io
import ipaddress
import json
import logging
import re
import socket
import urllib.parse
from typing import Optional
import httpx
from PIL import Image, ImageDraw, ImageFont

from app.services.image_utils import flatten_to_rgb

logger = logging.getLogger(__name__)

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
WIKI_UA = "SynapseProposalAccelerator/1.0 (https://github.com/augustgerry/accelerator; contact@synapse.smg) httpx/0.28.1"

MAX_IMAGE_FETCH_REDIRECTS = 5


def _is_public_http_url(url: str) -> bool:
    """Reject anything that isn't a plain http(s) URL resolving only to public IPs —
    blocks SSRF via loopback/link-local (incl. 169.254.169.254 cloud metadata)/RFC1918
    targets passed in as the image URL to fetch."""
    try:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            return False
        for family, _, _, _, sockaddr in socket.getaddrinfo(parsed.hostname, None):
            ip = ipaddress.ip_address(sockaddr[0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                return False
        return True
    except Exception:
        return False


def _fetch_public_image_bytes(client: httpx.Client, url: str) -> Optional[bytes]:
    """GET a URL that has already passed _is_public_http_url, re-validating the
    destination on every redirect hop so a public URL can't 302 into a private one."""
    for _ in range(MAX_IMAGE_FETCH_REDIRECTS):
        if not _is_public_http_url(url):
            return None
        resp = client.get(url, follow_redirects=False)
        if resp.is_redirect:
            location = resp.headers.get("location")
            if not location:
                return None
            url = urllib.parse.urljoin(url, location)
            continue
        if resp.status_code != 200:
            return None
        return resp.content
    return None


def _fetch_wikimedia_images(query: str, limit: int = 6) -> list[dict]:
    """Search Wikimedia Commons for high-quality public domain and CC-licensed hardware photos."""
    results = []
    try:
        encoded = urllib.parse.quote(query)
        url = (
            f"https://commons.wikimedia.org/w/api.php?action=query&generator=search"
            f"&gsrnamespace=6&gsrsearch={encoded}&gsrlimit={limit * 3}&prop=imageinfo&iiprop=url|size|mime&format=json"
        )
        with httpx.Client(timeout=8, headers={"User-Agent": WIKI_UA}) as client:
            resp = client.get(url)
            if resp.status_code != 200:
                return []
            data = resp.json()

        pages = data.get("query", {}).get("pages", {})
        for page in pages.values():
            image_info = page.get("imageinfo", [])
            if not image_info:
                continue
            info = image_info[0]
            img_url = info.get("url", "")
            mime = info.get("mime", "")
            width = info.get("width", 0)
            height = info.get("height", 0)

            # Only accept standard raster images with decent resolution
            if not (mime.startswith("image/jpeg") or mime.startswith("image/png") or mime.startswith("image/webp")):
                continue
            if width < 250 or height < 150:
                continue

            title = page.get("title", "").replace("File:", "").replace("_", " ")
            clean_title = re.sub(r"\.[a-zA-Z0-9]+$", "", title)

            results.append({
                "title": clean_title,
                "image_url": img_url,
                "thumbnail_url": img_url,
                "source": "Wikimedia Commons",
                "width": width,
                "height": height,
            })
            if len(results) >= limit:
                break
    except Exception as exc:
        logger.warning(f"Wikimedia search error for '{query}': {exc}")
    return results


def _fetch_web_images(query: str, limit: int = 6) -> list[dict]:
    """Search public web image index for authentic hardware product photos with strict negative filtering."""
    results = []
    # Negative filtering words to exclude portraits, streamers, anime, gaming thumbnails, wallpapers
    negative_words = {
        "mixi", "gaming", "streamer", "youtube", "tiktok", "facebook", "twitter", "avatar",
        "portrait", "face", "girl", "boy", "actor", "actress", "singer", "wallpaper",
        "anime", "manga", "cosplay", "swag", "bedding", "camping", "shirt", "shoe", "fashion",
        "tin tức", "nhân vật", "clip", "video", "phim", "gameplay", "độ mixi", "do mixi",
        "funny", "meme", "comic", "review game", "vlog"
    }

    # Enterprise IT terms to guarantee relevance
    it_hardware_terms = {
        "fortinet", "fortigate", "cisco", "switch", "firewall", "server", "router", "rack",
        "chassis", "appliance", "hpe", "dell", "poweredge", "proliant", "sangfor", "nutanix",
        "storage", "san", "nas", "catalyst", "pure storage", "purestorage", "100f", "200f", "60f",
        "sfp", "rj45", "ethernet", "datacenter", "data center", "hardware", "network"
    }
    query_tokens = set(re.findall(r"[a-zA-Z0-9]{3,}", query.lower()))
    allowed_terms = it_hardware_terms.union(query_tokens)

    try:
        url = f"https://www.bing.com/images/async?q={urllib.parse.quote(query)}&first=1&count={limit * 3}"
        with httpx.Client(timeout=8, headers={"User-Agent": USER_AGENT}) as client:
            resp = client.get(url)
            if resp.status_code != 200:
                return []

        matches = re.findall(r'm="(\{[^"]+\})"', resp.text)
        for m in matches:
            try:
                data = json.loads(html.unescape(m))
                img_url = data.get("murl")
                thumb_url = data.get("turl") or img_url
                title = data.get("t") or query

                # Title & URL relevance check
                title_lower = (title + " " + (img_url or "")).lower()
                if any(bad in title_lower for bad in negative_words):
                    continue

                # Must match at least one relevant IT hardware keyword or query token
                if not any(good in title_lower for good in allowed_terms):
                    continue

                if img_url and img_url.startswith("http"):
                    results.append({
                        "title": title,
                        "image_url": img_url,
                        "thumbnail_url": thumb_url,
                        "source": "Web",
                        "width": data.get("width", 800),
                        "height": data.get("height", 600),
                    })
                    if len(results) >= limit:
                        break
            except Exception:
                continue
    except Exception as exc:
        logger.warning(f"Web image search error for '{query}': {exc}")
    return results


import os

def _get_font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    """Load Segoe UI / Arial font on Windows with graceful fallback."""
    candidates = [
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/calibrib.ttf" if bold else "C:/Windows/Fonts/calibri.ttf",
    ]
    for p in candidates:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


def generate_synthetic_hardware_visual(device_name: str, form_factor: str = "2U") -> dict:
    """Generate an ultra-premium, high-resolution 2D technical graphic of enterprise hardware chassis."""
    clean_name = device_name.strip() or "Enterprise Rack Server"
    name_lower = clean_name.lower()

    # Determine device category
    is_storage = any(k in name_lower for k in ("storage", "pure", "flasharray", "powerstore", "netapp", "san", "all-flash", "array", "nvme", "jbod"))
    is_firewall = any(k in name_lower for k in ("firewall", "fortigate", "ngaf", "palo", "paloalto", "checkpoint", "sophos", "security"))
    is_switch = any(k in name_lower for k in ("switch", "catalyst", "brocade", "nexus", "arista", "tor", "leaf", "spine", "s5130", "s6800", "router", "gateway")) or is_firewall

    # Brand color & label detection
    brand_title = clean_name.split()[0].upper()
    brand_bg = (30, 41, 59)
    brand_fg = (255, 255, 255)
    badge_accent = (59, 130, 246)

    if "sangfor" in name_lower:
        brand_title = "SANGFOR HCI"
        brand_bg = (14, 116, 144)
        badge_accent = (6, 182, 212)
    elif "cisco" in name_lower:
        brand_title = "CISCO"
        brand_bg = (3, 105, 161)
        badge_accent = (56, 189, 248)
    elif "nutanix" in name_lower:
        brand_title = "NUTANIX"
        brand_bg = (15, 118, 110)
        badge_accent = (45, 212, 191)
    elif "dell" in name_lower or "poweredge" in name_lower or "powerstore" in name_lower:
        brand_title = "DELL TECHNOLOGIES"
        brand_bg = (29, 78, 216)
        badge_accent = (96, 165, 250)
    elif "hpe" in name_lower or "proliant" in name_lower:
        brand_title = "HPE PROLIANT"
        brand_bg = (5, 150, 105)
        badge_accent = (52, 211, 153)
    elif "fortinet" in name_lower or "fortigate" in name_lower:
        brand_title = "FORTINET"
        brand_bg = (185, 28, 28)
        badge_accent = (248, 113, 113)
    elif "pure" in name_lower or "flasharray" in name_lower:
        brand_title = "PURE STORAGE"
        brand_bg = (194, 65, 12)
        badge_accent = (251, 146, 60)
    elif "huawei" in name_lower:
        brand_title = "HUAWEI"
        brand_bg = (190, 18, 60)
        badge_accent = (251, 113, 133)

    # Dimensions based on form factor
    if "1u" in form_factor.lower() or (is_switch and "2u" not in form_factor.lower()):
        width, height = 1400, 260
        chassis_top, chassis_bottom = 35, 205
    elif "4u" in form_factor.lower() or "chassis" in name_lower:
        width, height = 1400, 520
        chassis_top, chassis_bottom = 40, 460
    else:  # Standard 2U
        width, height = 1400, 360
        chassis_top, chassis_bottom = 40, 310

    img = Image.new("RGBA", (width, height), (255, 255, 255, 255))
    draw = ImageDraw.Draw(img)

    # 1. Soft Realistic Multi-tier Studio Drop Shadow
    for i in range(12, 0, -2):
        alpha = int(12 * (1.0 - i / 14))
        draw.rounded_rectangle(
            [85 - i, chassis_top + 12 + i, 1315 + i, chassis_bottom + 22 + i * 2],
            radius=12 + i,
            fill=(15, 23, 42, alpha)
        )

    body_left, body_right = 110, 1290

    # 2. Main Chassis Body with specular metallic highlights
    # Dark slate brushed bezel
    draw.rounded_rectangle(
        [body_left, chassis_top, body_right, chassis_bottom],
        radius=8,
        fill=(15, 23, 42, 255),
        outline=(51, 65, 85, 255),
        width=2
    )
    # Upper metallic edge reflection
    draw.line([(body_left + 8, chassis_top + 2), (body_right - 8, chassis_top + 2)], fill=(100, 116, 139, 255), width=2)
    # Lower bezel ambient shadow
    draw.line([(body_left + 8, chassis_bottom - 2), (body_right - 8, chassis_bottom - 2)], fill=(2, 6, 23, 255), width=2)

    # 3. CNC Brushed Aluminum Rackmount Ears
    # Left Ear
    ear_left = 65
    draw.rounded_rectangle([ear_left, chassis_top - 6, body_left, chassis_bottom + 6], radius=5, fill=(71, 85, 105, 255), outline=(100, 116, 139, 255), width=2)
    # Specular ear highlight
    draw.line([(ear_left + 2, chassis_top - 4), (ear_left + 2, chassis_bottom + 4)], fill=(148, 163, 184, 255), width=2)
    # Hex socket mounting screws (Top & Bottom)
    for sy in [chassis_top + 18, chassis_bottom - 22]:
        draw.ellipse([ear_left + 12, sy - 10, ear_left + 32, sy + 10], fill=(30, 41, 59, 255), outline=(148, 163, 184, 255), width=2)
        # Inner hex socket
        draw.polygon([
            (ear_left + 22, sy - 6),
            (ear_left + 28, sy - 3),
            (ear_left + 28, sy + 3),
            (ear_left + 22, sy + 6),
            (ear_left + 16, sy + 3),
            (ear_left + 16, sy - 3)
        ], fill=(15, 23, 42, 255), outline=(203, 213, 225, 255))

    # Right Ear
    ear_right = 1335
    draw.rounded_rectangle([body_right, chassis_top - 6, ear_right, chassis_bottom + 6], radius=5, fill=(71, 85, 105, 255), outline=(100, 116, 139, 255), width=2)
    draw.line([(body_right + 2, chassis_top - 4), (body_right + 2, chassis_bottom + 4)], fill=(148, 163, 184, 255), width=2)
    for sy in [chassis_top + 18, chassis_bottom - 22]:
        draw.ellipse([ear_right - 32, sy - 10, ear_right - 12, sy + 10], fill=(30, 41, 59, 255), outline=(148, 163, 184, 255), width=2)
        draw.polygon([
            (ear_right - 22, sy - 6),
            (ear_right - 16, sy - 3),
            (ear_right - 16, sy + 3),
            (ear_right - 22, sy + 6),
            (ear_right - 28, sy + 3),
            (ear_right - 28, sy - 3)
        ], fill=(15, 23, 42, 255), outline=(203, 213, 225, 255))

    # 4. Left Control / OLED Diagnostic Panel
    panel_left, panel_right = body_left + 14, body_left + 220
    draw.rounded_rectangle([panel_left, chassis_top + 10, panel_right, chassis_bottom - 10], radius=5, fill=(30, 41, 59, 255), outline=(51, 65, 85, 255), width=1)

    # Vendor Glossy 3D Badge
    badge_y1 = chassis_top + 18
    badge_y2 = badge_y1 + 36
    draw.rounded_rectangle([panel_left + 10, badge_y1, panel_right - 10, badge_y2], radius=4, fill=brand_bg, outline=badge_accent, width=2)
    # Glass gloss line
    draw.line([(panel_left + 12, badge_y1 + 2), (panel_right - 12, badge_y1 + 2)], fill=(255, 255, 255, 160), width=1)
    badge_font = _get_font(13, bold=True)
    draw.text((panel_left + 16, badge_y1 + 8), brand_title[:18], fill=brand_fg, font=badge_font)

    # OLED Diagnostic Micro-Screen
    oled_y1 = badge_y2 + 12
    oled_y2 = oled_y1 + 48
    draw.rounded_rectangle([panel_left + 10, oled_y1, panel_right - 10, oled_y2], radius=3, fill=(2, 6, 23, 255), outline=(56, 189, 248, 200), width=1)
    oled_font = _get_font(9, bold=True)
    draw.text((panel_left + 16, oled_y1 + 6), "SYS: HEALTHY", fill=(52, 211, 153, 255), font=oled_font)
    draw.text((panel_left + 16, oled_y1 + 20), "IP: 192.168.10.5", fill=(125, 211, 252, 255), font=oled_font)
    draw.text((panel_left + 16, oled_y1 + 34), "LOAD: 18% | 22°C", fill=(148, 163, 184, 255), font=oled_font)

    # Status LED cluster with glowing halo
    led_start_y = oled_y2 + 16
    status_leds = [
        ("PWR", (34, 197, 94)),   # Green
        ("UID", (59, 130, 246)),   # Blue
        ("ACT", (245, 158, 11)),   # Amber
        ("WARN", (239, 68, 68)),   # Red off
    ]
    led_font = _get_font(9, bold=False)
    for idx, (label, color) in enumerate(status_leds):
        ly = led_start_y + idx * 18
        if ly + 14 > chassis_bottom - 45:
            break
        # LED glow halo
        draw.ellipse([panel_left + 14, ly, panel_left + 26, ly + 12], fill=(*color, 60))
        # LED core
        draw.ellipse([panel_left + 16, ly + 2, panel_left + 24, ly + 10], fill=(*color, 255))
        draw.text((panel_left + 32, ly), label, fill=(203, 213, 225, 255), font=led_font)

    # Device title & form factor footer
    title_font = _get_font(11, bold=True)
    sub_font = _get_font(9, bold=False)
    draw.text((panel_left + 10, chassis_bottom - 38), clean_name[:24], fill=(248, 250, 252, 255), font=title_font)
    draw.text((panel_left + 10, chassis_bottom - 22), f"{form_factor} HIGH AVAILABILITY", fill=(148, 163, 184, 255), font=sub_font)

    # 5. Right Bay & Interface Area
    bay_left = panel_right + 18
    bay_right = body_right - 18

    # Background ventilation honeycomb grid
    for hx in range(bay_left + 4, bay_right - 4, 14):
        for hy in range(chassis_top + 16, chassis_bottom - 16, 12):
            draw.ellipse([hx, hy, hx + 4, hy + 4], fill=(2, 6, 23, 200))

    if is_switch:
        # High-density switch/firewall front panel
        rows = 2
        cols = 24
        col_w = (bay_right - bay_left - 120) / cols
        port_num_font = _get_font(7, bold=False)

        # 48x RJ45 or SFP28 ports
        for r in range(rows):
            for c in range(cols):
                px = bay_left + c * col_w + 3
                py = chassis_top + 28 + r * 62
                # Port housing
                draw.rectangle([px, py, px + col_w - 5, py + 46], fill=(15, 23, 42, 255), outline=(71, 85, 105, 255), width=1)
                # SFP cage or RJ45 socket
                draw.rectangle([px + 3, py + 12, px + col_w - 8, py + 36], fill=(30, 41, 59, 255), outline=(100, 116, 139, 255), width=1)
                # Gold pin reflections
                draw.line([(px + 6, py + 22), (px + col_w - 11, py + 22)], fill=(234, 179, 8, 200), width=1)
                # Link LED
                led_c = (34, 197, 94, 255) if (c + r) % 3 != 0 else (245, 158, 11, 255)
                draw.rectangle([px + 4, py + 3, px + 10, py + 7], fill=led_c)
                # Port number
                draw.text((px + col_w - 14, py + 2), str(c * 2 + r + 1), fill=(148, 163, 184, 255), font=port_num_font)

        # 4x QSFP28 100G Uplink cages on the right
        qsfp_left = bay_right - 100
        draw.rounded_rectangle([qsfp_left, chassis_top + 20, bay_right - 6, chassis_bottom - 20], radius=4, fill=(30, 41, 59, 255), outline=(148, 163, 184, 255), width=2)
        draw.text((qsfp_left + 10, chassis_top + 26), "100G QSFP28", fill=(56, 189, 248, 255), font=_get_font(8, bold=True))
        for q in range(4):
            qy = chassis_top + 48 + q * 30
            if qy + 24 > chassis_bottom - 24:
                break
            draw.rectangle([qsfp_left + 8, qy, bay_right - 14, qy + 22], fill=(15, 23, 42, 255), outline=(203, 213, 225, 255), width=1)
            draw.rectangle([qsfp_left + 12, qy + 4, qsfp_left + 20, qy + 10], fill=(34, 197, 94, 255))
            draw.text((qsfp_left + 26, qy + 4), f"UPLINK-{q+1}", fill=(226, 232, 240, 255), font=_get_font(8, bold=False))

    elif is_storage:
        # NVMe / DirectFlash High-Density Array
        num_bays = 16
        bay_w = (bay_right - bay_left) / num_bays
        drive_font = _get_font(8, bold=True)
        for b in range(num_bays):
            bx = bay_left + b * bay_w + 3
            # Storage module
            draw.rounded_rectangle([bx, chassis_top + 16, bx + bay_w - 6, chassis_bottom - 16], radius=4, fill=(30, 41, 59, 255), outline=(71, 85, 105, 255), width=2)
            # Pure/Enterprise orange release lever
            draw.rounded_rectangle([bx + 4, chassis_top + 22, bx + bay_w - 10, chassis_top + 55], radius=3, fill=(234, 88, 12, 255), outline=(251, 146, 60, 255), width=1)
            # Module capacity tag
            draw.text((bx + 6, chassis_top + 65), "NVMe", fill=(241, 245, 249, 255), font=drive_font)
            draw.text((bx + 6, chassis_top + 78), "3.8TB", fill=(251, 146, 60, 255), font=_get_font(7, bold=True))
            # Ventilation slots
            for v in range(chassis_top + 98, chassis_bottom - 38, 10):
                draw.line([(bx + 6, v), (bx + bay_w - 12, v)], fill=(15, 23, 42, 255), width=2)
            # Dual activity & health LEDs
            draw.ellipse([bx + 6, chassis_bottom - 30, bx + 13, chassis_bottom - 23], fill=(34, 197, 94, 255))
            draw.ellipse([bx + 16, chassis_bottom - 30, bx + 23, chassis_bottom - 23], fill=(245, 158, 11, 255))

    else:
        # Enterprise Clustered Server Hot-Swap Caddies (8x or 12x 2.5" SFF / NVMe)
        num_bays = 10 if "2u" in form_factor.lower() else 8
        bay_w = (bay_right - bay_left) / num_bays
        caddy_font = _get_font(8, bold=True)
        sub_caddy_font = _get_font(7, bold=False)

        for b in range(num_bays):
            bx = bay_left + b * bay_w + 4
            # Caddy body
            draw.rounded_rectangle([bx, chassis_top + 16, bx + bay_w - 8, chassis_bottom - 16], radius=4, fill=(30, 41, 59, 255), outline=(71, 85, 105, 255), width=2)
            # Metallic brushed ejector lever
            draw.rounded_rectangle([bx + 4, chassis_top + 22, bx + bay_w - 12, chassis_top + 68], radius=3, fill=(51, 65, 85, 255), outline=(148, 163, 184, 255), width=1)
            # Specular lever line
            draw.line([(bx + 6, chassis_top + 24), (bx + bay_w - 14, chassis_top + 24)], fill=(203, 213, 225, 255), width=1)
            # Blue release button
            draw.rounded_rectangle([bx + bay_w - 30, chassis_top + 32, bx + bay_w - 16, chassis_top + 48], radius=2, fill=(2, 132, 199, 255), outline=(56, 189, 248, 255), width=1)
            # Drive label badge
            draw.rectangle([bx + 6, chassis_top + 76, bx + bay_w - 14, chassis_top + 115], fill=(15, 23, 42, 255))
            draw.text((bx + 10, chassis_top + 80), "ENTERPRISE", fill=(148, 163, 184, 255), font=sub_caddy_font)
            draw.text((bx + 10, chassis_top + 94), "NVMe SSD 3.84TB" if b % 2 == 0 else "SAS 12G 2.4TB", fill=(241, 245, 249, 255), font=caddy_font)
            # Ventilation slots
            for v in range(chassis_top + 124, chassis_bottom - 38, 11):
                draw.line([(bx + 8, v), (bx + bay_w - 16, v)], fill=(15, 23, 42, 255), width=2)
            # Dual Status LEDs: Power (Green) & Drive Activity (Blinking Amber)
            draw.ellipse([bx + 10, chassis_bottom - 30, bx + 18, chassis_bottom - 22], fill=(34, 197, 94, 255))
            draw.ellipse([bx + 22, chassis_bottom - 30, bx + 30, chassis_bottom - 22], fill=(245, 158, 11, 255))

    # Convert to RGB clean white canvas for docx/web embedding
    final_img = Image.new("RGB", (width, height), (255, 255, 255))
    final_img.paste(img, (0, 0), img)

    bio = io.BytesIO()
    final_img.save(bio, format="PNG", optimize=True)
    png_bytes = bio.getvalue()
    b64 = base64.b64encode(png_bytes).decode("ascii")
    data_url = f"data:image/png;base64,{b64}"

    return {
        "title": f"2D Technical Spec: {clean_name} ({form_factor} Enterprise Chassis)",
        "image_url": data_url,
        "thumbnail_url": data_url,
        "data_url": data_url,
        "source": "Synapse 2D Hardware Studio",
        "width": width,
        "height": height,
        "is_synthetic": True,
    }


# Verified authentic vendor hardware stencils for enterprise network, compute, and storage
VERIFIED_VENDOR_STENCILS = [
    {
        "keywords": ["fortigate 100f", "fortinet 100f", "fg-100f", "fg 100f"],
        "title": "Fortinet FortiGate 100F Next-Gen Firewall (1U Rackmount Appliance)",
        "image_url": "https://www.fortinet.com/content/dam/fortinet/images/products/product-images/fortigate-100f-front.png",
        "thumbnail_url": "https://www.fortinet.com/content/dam/fortinet/images/products/product-images/fortigate-100f-front.png",
        "source": "Fortinet Official Hardware Catalog",
        "width": 1200,
        "height": 300,
    },
    {
        "keywords": ["fortigate 200f", "fortinet 200f", "fg-200f"],
        "title": "Fortinet FortiGate 200F Enterprise Firewall Appliance",
        "image_url": "https://www.fortinet.com/content/dam/fortinet/images/products/product-images/fortigate-200f-front.png",
        "thumbnail_url": "https://www.fortinet.com/content/dam/fortinet/images/products/product-images/fortigate-200f-front.png",
        "source": "Fortinet Official Hardware Catalog",
        "width": 1200,
        "height": 300,
    },
    {
        "keywords": ["fortigate 60f", "fortinet 60f", "fg-60f"],
        "title": "Fortinet FortiGate 60F Desktop/Rack Next-Gen Firewall",
        "image_url": "https://www.fortinet.com/content/dam/fortinet/images/products/product-images/fortigate-60f-front.png",
        "thumbnail_url": "https://www.fortinet.com/content/dam/fortinet/images/products/product-images/fortigate-60f-front.png",
        "source": "Fortinet Official Hardware Catalog",
        "width": 1000,
        "height": 300,
    },
    {
        "keywords": ["cisco catalyst 9300", "c9300", "catalyst 9300"],
        "title": "Cisco Catalyst 9300 Series Enterprise Core/Access Switch (48-Port)",
        "image_url": "https://www.cisco.com/c/dam/en/us/products/switches/catalyst-9300-series-switches/c9300-front.png",
        "thumbnail_url": "https://www.cisco.com/c/dam/en/us/products/switches/catalyst-9300-series-switches/c9300-front.png",
        "source": "Cisco Official Product Stencil",
        "width": 1200,
        "height": 280,
    },
    {
        "keywords": ["cisco catalyst 9200", "c9200", "catalyst 9200"],
        "title": "Cisco Catalyst 9200 Series Gigabit Switch",
        "image_url": "https://www.cisco.com/c/dam/en/us/products/switches/catalyst-9200-series-switches/c9200-front.png",
        "thumbnail_url": "https://www.cisco.com/c/dam/en/us/products/switches/catalyst-9200-series-switches/c9200-front.png",
        "source": "Cisco Official Product Stencil",
        "width": 1200,
        "height": 280,
    },
    {
        "keywords": ["dl360", "proliant dl360", "hpe dl360"],
        "title": "HPE ProLiant DL360 Gen10 1U Rackmount Server",
        "image_url": "https://www.hpe.com/content/dam/hpe/shared/products/servers/proliant-dl360-gen10.png",
        "thumbnail_url": "https://www.hpe.com/content/dam/hpe/shared/products/servers/proliant-dl360-gen10.png",
        "source": "HPE Official Hardware Catalog",
        "width": 1200,
        "height": 300,
    },
    {
        "keywords": ["poweredge r750", "dell r750", "poweredge r740"],
        "title": "Dell EMC PowerEdge R750 2U Dual-Socket Rack Server",
        "image_url": "https://i.dell.com/is/image/DellContent/content/dam/ss2/product-images/dell-client-products/data-center/poweredge/poweredge-r750/pdp/poweredge-r750-front.png",
        "thumbnail_url": "https://i.dell.com/is/image/DellContent/content/dam/ss2/product-images/dell-client-products/data-center/poweredge/poweredge-r750/pdp/poweredge-r750-front.png",
        "source": "Dell Technologies Official Stencil",
        "width": 1200,
        "height": 350,
    },
]


def search_public_images(query: str, limit: int = 8) -> list[dict]:
    """Combine verified vendor stencils, Wikimedia Commons, clean web index, and synthetic 2D fallback generator."""
    clean_query = query.strip()
    if not clean_query:
        return []

    q_lower = clean_query.lower()

    # Check verified vendor stencils catalog
    matched_stencils = []
    for stencil in VERIFIED_VENDOR_STENCILS:
        if any(kw in q_lower for kw in stencil["keywords"]):
            matched_stencils.append(stencil)

    # Clean query for search engines
    hardware_search_term = f"{clean_query} appliance hardware rackmount front"

    # Try Wikimedia Commons (reliable, authentic hardware)
    wiki_results = _fetch_wikimedia_images(clean_query, limit=limit)

    # Supplement with web results
    web_results = _fetch_web_images(hardware_search_term, limit=limit)

    combined = matched_stencils + wiki_results + web_results

    # Deduplicate by URL
    seen = set()
    deduped = []
    for item in combined:
        u = item["image_url"]
        if u not in seen:
            seen.add(u)
            deduped.append(item)
        if len(deduped) >= limit:
            break

    # Always generate and prepend the high-fidelity 2D synthetic hardware visual
    synthetic_asset = generate_synthetic_hardware_visual(clean_query)
    deduped.insert(0, synthetic_asset)

    return deduped[:limit]


def download_and_optimize_image(image_url: str, max_dimension: int = 1200) -> Optional[dict]:
    """Download an image from the web, validate with Pillow, resize if oversized, and convert to base64 data URL."""
    try:
        if not _is_public_http_url(image_url):
            logger.warning(f"Refusing to fetch non-public image URL: {image_url}")
            return None

        with httpx.Client(
            timeout=12,
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            },
        ) as client:
            raw_bytes = _fetch_public_image_bytes(client, image_url)
            if raw_bytes is None:
                return None

        if len(raw_bytes) < 1000:
            return None

        with Image.open(io.BytesIO(raw_bytes)) as img:
            img.verify()

        # Reopen for transformation
        with Image.open(io.BytesIO(raw_bytes)) as img:
            w, h = img.size
            if max(w, h) > max_dimension:
                scale = max_dimension / max(w, h)
                new_w = max(1, int(w * scale))
                new_h = max(1, int(h * scale))
                img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
                w, h = new_w, new_h

            # Convert to RGB (white background) if RGBA for clean DOCX/PDF rendering
            img = flatten_to_rgb(img)

            output_bio = io.BytesIO()
            img.save(output_bio, format="JPEG", quality=85, optimize=True)
            optimized_bytes = output_bio.getvalue()

        b64 = base64.b64encode(optimized_bytes).decode("ascii")
        data_url = f"data:image/jpeg;base64,{b64}"

        return {
            "data_url": data_url,
            "width": w,
            "height": h,
            "bytes_size": len(optimized_bytes),
            "mime_type": "image/jpeg",
        }
    except Exception as exc:
        logger.warning(f"Failed to download/optimize image from {image_url}: {exc}")
        return None
