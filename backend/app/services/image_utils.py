"""Small shared Pillow helpers used by both the web image search pipeline
(image_search.py) and the template asset extractor (template_extractor.py),
so the RGBA/P -> RGB flatten logic has one source of truth."""

from PIL import Image


def flatten_to_rgb(img: Image.Image) -> Image.Image:
    """Flatten a possibly-transparent image onto a white background and return RGB.
    Needed before saving as JPEG, which has no alpha channel."""
    if img.mode in ("RGBA", "LA", "P"):
        background = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "P":
            img = img.convert("RGBA")
        background.paste(img, mask=img.split()[-1] if "A" in img.getbands() else None)
        return background
    if img.mode != "RGB":
        return img.convert("RGB")
    return img
