"""
Extract embedded media assets (architecture diagrams, photos, charts) from
template documents (.docx / .pptx) stored in Drive or uploaded by the user.
"""

import base64
import io
import logging
import zipfile
from typing import Optional
from PIL import Image

from app.services.image_utils import flatten_to_rgb

logger = logging.getLogger(__name__)


def extract_images_from_office_bytes(file_bytes: bytes, max_images: int = 12) -> list[dict]:
    """Inspect a .docx or .pptx ZIP archive and extract meaningful embedded images."""
    extracted = []
    try:
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as zf:
            namelist = zf.namelist()
            media_files = [
                name for name in namelist
                if (name.startswith("word/media/") or name.startswith("ppt/media/"))
                and name.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".bmp"))
            ]

            for idx, media_name in enumerate(media_files, start=1):
                try:
                    img_bytes = zf.read(media_name)
                    # Ignore tiny decorations (under 6KB)
                    if len(img_bytes) < 6000:
                        continue

                    with Image.open(io.BytesIO(img_bytes)) as img:
                        w, h = img.size
                        # Ignore 1x1 pixels or tiny bullet icons
                        if w < 100 or h < 100:
                            continue

                        # Generate thumbnail/preview data URL
                        thumb = img.copy()
                        thumb.thumbnail((800, 600), Image.Resampling.LANCZOS)
                        thumb = flatten_to_rgb(thumb)

                        bio = io.BytesIO()
                        thumb.save(bio, format="JPEG", quality=85)
                        b64 = base64.b64encode(bio.getvalue()).decode("ascii")

                    base_name = media_name.split("/")[-1]
                    extracted.append({
                        "id": f"tmpl-img-{idx}",
                        "name": f"Aset Template: {base_name}",
                        "data_url": f"data:image/jpeg;base64,{b64}",
                        "width": w,
                        "height": h,
                        "size_bytes": len(img_bytes),
                    })

                    if len(extracted) >= max_images:
                        break
                except Exception as e:
                    logger.debug(f"Skipping corrupt image {media_name}: {e}")
    except Exception as exc:
        logger.warning(f"Failed to extract images from office document bytes: {exc}")

    return extracted
