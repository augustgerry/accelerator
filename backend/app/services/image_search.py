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
    """Search public web image index for product photos."""
    results = []
    try:
        url = f"https://www.bing.com/images/async?q={urllib.parse.quote(query)}&first=1&count={limit * 2}"
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


def generate_synthetic_hardware_visual(device_name: str, form_factor: str = "2U") -> dict:
    """Generate a clean, high-resolution 2D technical graphic of enterprise hardware chassis when no photo is found."""
    clean_name = device_name.strip()
    name_lower = clean_name.lower()

    # Determine device category
    is_storage = any(k in name_lower for k in ("storage", "pure", "flasharray", "powerstore", "netapp", "san", "all-flash", "array"))
    is_switch = any(k in name_lower for k in ("switch", "catalyst", "brocade", "nexus", "arista", "fortigate", "firewall", "router", "gateway"))

    # Determine canvas dimensions based on form factor
    if "1u" in form_factor.lower() or ("switch" in name_lower and not is_storage):
        width, height = 1200, 220
        chassis_top, chassis_bottom = 30, 180
    elif "4u" in form_factor.lower() or "chassis" in name_lower:
        width, height = 1200, 480
        chassis_top, chassis_bottom = 30, 430
    else:  # Standard 2U
        width, height = 1200, 320
        chassis_top, chassis_bottom = 30, 280

    img = Image.new("RGBA", (width, height), (255, 255, 255, 255))
    draw = ImageDraw.Draw(img)

    # 1. Drop shadow under chassis
    draw.rounded_rectangle([75, chassis_top + 10, 1125, chassis_bottom + 18], radius=8, fill=(226, 232, 240, 180))

    # 2. Main chassis body (Deep Slate Enterprise Bezel)
    body_left, body_right = 95, 1105
    draw.rounded_rectangle([body_left, chassis_top, body_right, chassis_bottom], radius=6, fill=(15, 23, 42, 255), outline=(51, 65, 85, 255), width=3)

    # 3. Left Rackmount Ear
    draw.rounded_rectangle([60, chassis_top - 5, body_left, chassis_bottom + 5], radius=4, fill=(51, 65, 85, 255), outline=(71, 85, 105, 255), width=2)
    # Screw holes
    draw.ellipse([70, chassis_top + 15, 84, chassis_top + 29], fill=(15, 23, 42, 255), outline=(100, 116, 139, 255), width=2)
    draw.ellipse([70, chassis_bottom - 29, 84, chassis_bottom - 15], fill=(15, 23, 42, 255), outline=(100, 116, 139, 255), width=2)

    # 4. Right Rackmount Ear
    draw.rounded_rectangle([body_right, chassis_top - 5, 1140, chassis_bottom + 5], radius=4, fill=(51, 65, 85, 255), outline=(71, 85, 105, 255), width=2)
    draw.ellipse([1116, chassis_top + 15, 1130, chassis_top + 29], fill=(15, 23, 42, 255), outline=(100, 116, 139, 255), width=2)
    draw.ellipse([1116, chassis_bottom - 29, 1130, chassis_bottom - 15], fill=(15, 23, 42, 255), outline=(100, 116, 139, 255), width=2)

    # 5. Left Control & Status Panel (x: 105 to 260)
    panel_left, panel_right = 105, 260
    draw.rounded_rectangle([panel_left, chassis_top + 12, panel_right, chassis_bottom - 12], radius=4, fill=(30, 41, 59, 255), outline=(51, 65, 85, 255), width=1)

    # Vendor & Model Badge
    draw.rectangle([panel_left + 10, chassis_top + 22, panel_right - 10, chassis_top + 55], fill=(2, 132, 199, 255) if not is_storage else (234, 88, 12, 255))
    badge_label = clean_name.split()[0].upper() if clean_name else "ENTERPRISE"
    draw.text((panel_left + 16, chassis_top + 30), badge_label[:14], fill=(255, 255, 255, 255))

    # Power, UID, Health LEDs
    led_y = chassis_top + 70
    # Power (Green)
    draw.ellipse([panel_left + 15, led_y, panel_left + 25, led_y + 10], fill=(34, 197, 94, 255))
    draw.text((panel_left + 32, led_y - 2), "PWR / OK", fill=(148, 163, 184, 255))
    # UID (Blue)
    draw.ellipse([panel_left + 15, led_y + 20, panel_left + 25, led_y + 30], fill=(59, 130, 246, 255))
    draw.text((panel_left + 32, led_y + 18), "UID", fill=(148, 163, 184, 255))
    # Network Link (Amber/Green)
    draw.ellipse([panel_left + 15, led_y + 40, panel_left + 25, led_y + 50], fill=(245, 158, 11, 255))
    draw.text((panel_left + 32, led_y + 38), "FAULT / ACT", fill=(148, 163, 184, 255))

    # Device Model Text
    draw.text((panel_left + 12, chassis_bottom - 42), clean_name[:24], fill=(241, 245, 249, 255))
    draw.text((panel_left + 12, chassis_bottom - 26), f"{form_factor} RACK APPLIANCE", fill=(100, 116, 139, 255))

    # 6. Bay / Port Area (x: 275 to 1090)
    bay_area_left = 275
    bay_area_right = 1090

    if is_switch:
        # Render 24/48 SFP/RJ45 switch ports
        rows = 2
        cols = 24
        col_w = (bay_area_right - bay_area_left) / cols
        for r in range(rows):
            for c in range(cols):
                px = bay_area_left + c * col_w + 3
                py = chassis_top + 40 + r * 55
                draw.rectangle([px, py, px + col_w - 6, py + 40], fill=(15, 23, 42, 255), outline=(71, 85, 105, 255), width=1)
                # RJ45 / SFP latch shape
                draw.rectangle([px + 3, py + 10, px + col_w - 9, py + 30], fill=(30, 41, 59, 255))
                # Port LED indicator
                led_col = (34, 197, 94, 255) if (c + r) % 3 != 0 else (245, 158, 11, 255)
                draw.rectangle([px + 4, py + 3, px + 10, py + 7], fill=led_col)
    elif is_storage:
        # Render DirectFlash / NVMe storage modules (pure storage style orange/silver accents)
        num_bays = 14
        bay_w = (bay_area_right - bay_area_left) / num_bays
        for b in range(num_bays):
            bx = bay_area_left + b * bay_w + 4
            draw.rounded_rectangle([bx, chassis_top + 16, bx + bay_w - 8, chassis_bottom - 16], radius=3, fill=(30, 41, 59, 255), outline=(51, 65, 85, 255), width=2)
            # Orange module release latch
            draw.rectangle([bx + 4, chassis_top + 24, bx + bay_w - 12, chassis_top + 50], fill=(234, 88, 12, 255))
            # Drive ventilation slots
            for v in range(chassis_top + 65, chassis_bottom - 45, 12):
                draw.line([(bx + 6, v), (bx + bay_w - 14, v)], fill=(15, 23, 42, 255), width=2)
            # Status LED
            draw.ellipse([bx + bay_w // 2 - 4, chassis_bottom - 32, bx + bay_w // 2 + 4, chassis_bottom - 24], fill=(34, 197, 94, 255))
    else:
        # Render enterprise hot-swap drive bays (2.5" SFF or 3.5" LFF)
        num_bays = 8
        bay_w = (bay_area_right - bay_area_left) / num_bays
        for b in range(num_bays):
            bx = bay_area_left + b * bay_w + 6
            draw.rounded_rectangle([bx, chassis_top + 18, bx + bay_w - 10, chassis_bottom - 18], radius=3, fill=(30, 41, 59, 255), outline=(51, 65, 85, 255), width=2)
            # Caddy release handle
            draw.rounded_rectangle([bx + 5, chassis_top + 25, bx + bay_w - 15, chassis_top + 65], radius=2, fill=(51, 65, 85, 255), outline=(71, 85, 105, 255), width=1)
            draw.ellipse([bx + bay_w - 28, chassis_top + 38, bx + bay_w - 20, chassis_top + 46], fill=(2, 132, 199, 255))
            # Drive vent grid
            for v in range(chassis_top + 78, chassis_bottom - 45, 12):
                draw.line([(bx + 8, v), (bx + bay_w - 18, v)], fill=(15, 23, 42, 255), width=2)
            # Drive Activity LED & Status LED
            draw.ellipse([bx + 12, chassis_bottom - 34, bx + 19, chassis_bottom - 27], fill=(34, 197, 94, 255))
            draw.ellipse([bx + 24, chassis_bottom - 34, bx + 31, chassis_bottom - 27], fill=(15, 23, 42, 255), outline=(71, 85, 105, 255), width=1)

    # Convert to RGB clean white canvas for docx/web embedding
    final_img = Image.new("RGB", (width, height), (255, 255, 255))
    final_img.paste(img, (0, 0), img)

    bio = io.BytesIO()
    final_img.save(bio, format="PNG", optimize=True)
    png_bytes = bio.getvalue()
    b64 = base64.b64encode(png_bytes).decode("ascii")
    data_url = f"data:image/png;base64,{b64}"

    return {
        "title": f"Official 2D Technical Chassis: {clean_name} ({form_factor})",
        "image_url": data_url,
        "thumbnail_url": data_url,
        "source": "Synapse 2D Hardware Studio (Official Spec)",
        "width": width,
        "height": height,
        "is_synthetic": True,
    }


def search_public_images(query: str, limit: int = 8) -> list[dict]:
    """Combine Wikimedia Commons, public web index (clean transparent/isolated), and synthetic 2D fallback generator."""
    clean_query = query.strip()
    if not clean_query:
        return []

    # Refined search query for enterprise IT hardware: prioritize clean isolated PNG product photos
    refined_query = f"{clean_query} transparent isolated PNG official chassis front-view"

    # Try Wikimedia Commons first (reliable, high resolution, authentic hardware)
    wiki_results = _fetch_wikimedia_images(clean_query, limit=limit)
    if len(wiki_results) >= limit:
        return wiki_results[:limit]

    # Supplement with web results using refined hardware query
    web_results = _fetch_web_images(refined_query, limit=limit)
    if not web_results:
        # Fallback to plain query
        web_results = _fetch_web_images(clean_query, limit=limit)

    combined = wiki_results + web_results

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

    # Always generate and append the clean 2D synthetic hardware visual as a high-fidelity option
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
