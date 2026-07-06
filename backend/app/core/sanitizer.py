import html
import re
from typing import Optional

def sanitize_string(text: Optional[str]) -> Optional[str]:
    """
    Sanitizes string inputs to protect against XSS (HTML/Script Injection).
    Removes dangerous tags and escapes HTML special characters.
    """
    if not text:
        return text
    # Remove HTML tags entirely using regex
    clean_text = re.sub(r'<[^>]*>', '', text)
    # Escape HTML special characters
    return html.escape(clean_text)
