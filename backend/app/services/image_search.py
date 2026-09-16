"""
Public web image search service for enterprise IT hardware, data center components,
and technology solutions. Uses Wikimedia Commons API and Bing Images via httpx
with image optimization via Pillow.
"""

import base64
import html
import io
import json
import logging
import re
import urllib.parse
from typing import Optional
import httpx
from PIL import Image

from app.services.image_utils import flatten_to_rgb

logger = logging.getLogger(__name__)

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
WIKI_UA = "SynapseProposalAccelerator/1.0 (https://github.com/augustgerry/accelerator; contact@synapse.smg) httpx/0.28.1"


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


def search_public_images(query: str, limit: int = 8) -> list[dict]:
    """Combine Wikimedia Commons (enterprise equipment) and public web index for enterprise hardware."""
    clean_query = query.strip()
    if not clean_query:
        return []

    # Try Wikimedia Commons first (reliable, high resolution, authentic hardware)
    wiki_results = _fetch_wikimedia_images(clean_query, limit=limit)
    if len(wiki_results) >= limit:
        return wiki_results[:limit]

    # Supplement with web results
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
    return deduped


def download_and_optimize_image(image_url: str, max_dimension: int = 1200) -> Optional[dict]:
    """Download an image from the web, validate with Pillow, resize if oversized, and convert to base64 data URL."""
    try:
        with httpx.Client(
            timeout=12,
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            },
            follow_redirects=True,
        ) as client:
            resp = client.get(image_url)
            if resp.status_code != 200:
                return None
            raw_bytes = resp.content

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
