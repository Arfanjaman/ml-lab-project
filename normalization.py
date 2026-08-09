import re
from typing import Any


CANONICAL_DEPARTMENTS = [
    "Architecture",
    "BECM",
    "Biomedical Engineering",
    "Chemical Engineering",
    "Civil Engineering",
    "CSE",
    "ECE",
    "EEE",
    "ESE",
    "IEM",
    "Leather Engineering",
    "Mechanical Engineering",
    "Mechatronics Engineering",
    "MSE",
    "Textile Engineering",
    "URP",
]


def _key(value: Any) -> str:
    text = str(value).strip().lower()
    text = text.replace("&", " and ")
    text = re.sub(r"\bdepartment\s+of\b", " ", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


ALIASES = {
    # Architecture
    "arch": "Architecture",
    "architecture": "Architecture",

    # Building Engineering and Construction Management
    "becm": "BECM",
    "building engineering and construction management": "BECM",

    # Biomedical Engineering
    "bme": "Biomedical Engineering",
    "biomedical engineering": "Biomedical Engineering",

    # Chemical Engineering
    "che": "Chemical Engineering",
    "chemical engineering": "Chemical Engineering",

    # Civil Engineering
    "ce": "Civil Engineering",
    "civil": "Civil Engineering",
    "civil engineering": "Civil Engineering",

    # Computer Science and Engineering
    "cse": "CSE",
    "csse": "CSE",  # Common typo in the supplied survey data
    "computer science and engineering": "CSE",

    # Electronics and Communication Engineering
    "ece": "ECE",
    "electronics and communication engineering": "ECE",

    # Electrical and Electronic(s) Engineering
    "eee": "EEE",
    "electrical and electronic engineering": "EEE",
    "electrical and electronics engineering": "EEE",
    "electrical electronic engineering": "EEE",
    "electrical and electronic engineering eee": "EEE",

    # Energy Science and Engineering
    "ese": "ESE",
    "energy science and engineering": "ESE",

    # Industrial Engineering and Management
    "iem": "IEM",
    "industrial engineering and management": "IEM",
    "industry engineering management": "IEM",

    # Leather Engineering
    "le": "Leather Engineering",
    "leather engineering": "Leather Engineering",

    # Mechanical Engineering
    "me": "Mechanical Engineering",
    "mechanical": "Mechanical Engineering",
    "mechanical engineering": "Mechanical Engineering",

    # Mechatronics Engineering
    "mte": "Mechatronics Engineering",
    "mechatronics engineering": "Mechatronics Engineering",

    # Materials Science and Engineering
    "mse": "MSE",
    "materials science and engineering": "MSE",

    # Textile Engineering
    "te": "Textile Engineering",
    "textile engineering": "Textile Engineering",

    # Urban and Regional Planning
    "urp": "URP",
    "urban and regional planning": "URP",
}


def normalize_department(value: Any) -> str:
    """Map spelling/case/name variants to one canonical department label."""
    if value is None:
        return "Unspecified"
    text = str(value).strip()
    if not text or text.lower() == "nan":
        return "Unspecified"

    key = _key(text)
    if key in ALIASES:
        return ALIASES[key]

    # Preserve an unexpected department instead of silently discarding it.
    return re.sub(r"\s+", " ", text).strip().title()


def normalize_semester(value: Any) -> str:
    if value is None:
        return "Unspecified"
    text = str(value).strip()
    if not text or text.lower() == "nan":
        return "Unspecified"

    try:
        number = float(text)
        if number.is_integer():
            return f"Semester {int(number)}"
    except ValueError:
        pass

    match = re.search(r"\b([1-8])\b", text)
    if match:
        return f"Semester {match.group(1)}"
    return text
