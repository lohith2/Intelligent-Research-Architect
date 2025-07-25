import io
from pypdf import PdfReader

async def process_file(file_content: bytes, filename: str) -> str:
    """
    Process file content based on extension and return text.
    """
    text = ""
    if filename.lower().endswith(".pdf"):
        try:
            reader = PdfReader(io.BytesIO(file_content))
            for page in reader.pages:
                text += page.extract_text() + "\n"
        except Exception as e:
            return f"Error reading PDF: {str(e)}"
    else:
        # Assume text/md
        try:
            text = file_content.decode("utf-8")
        except UnicodeDecodeError:
            return "Error: Could not decode text file."
            
    return text.strip()
