import io
import subprocess
import tempfile
from pathlib import Path


def convert_office_to_pdf(data: bytes, extension: str) -> bytes:
    """Render DOCX/PPTX with the installed Microsoft Office application."""
    if extension.lower() not in {".docx", ".pptx"}:
        raise ValueError("Only DOCX and PPTX files can be rendered")

    with tempfile.TemporaryDirectory(prefix="synapse-office-") as directory:
        source_path = Path(directory) / f"source{extension.lower()}"
        output_path = Path(directory) / "output.pdf"
        source_path.write_bytes(data)

        source = str(source_path).replace("'", "''")
        output = str(output_path).replace("'", "''")
        if extension.lower() == ".docx":
            script = f"""
$app = New-Object -ComObject Word.Application
$app.Visible = $false
$doc = $app.Documents.Open('{source}', $false, $true, $false)
$doc.ExportAsFixedFormat('{output}', 17)
$doc.Close($false)
$app.Quit()
"""
        else:
            script = f"""
$app = New-Object -ComObject PowerPoint.Application
$deck = $app.Presentations.Open('{source}', $true, $false, $false)
$deck.SaveAs('{output}', 32)
$deck.Close()
$app.Quit()
"""

        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0 or not output_path.exists():
            detail = (result.stderr or result.stdout or "unknown Office render error").strip()
            raise RuntimeError(detail)
        return output_path.read_bytes()