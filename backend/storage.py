import os
import shutil
from pathlib import Path

# Base directory for local file storage
STORAGE_DIR = Path(__file__).parent / "data"

def init_storage():
    """Ensure the storage directory exists."""
    os.makedirs(STORAGE_DIR, exist_ok=True)

def save_file(file_obj, filename: str) -> str:
    """
    Save an uploaded file object to the local storage.
    Returns the absolute path to the saved file.
    """
    init_storage()
    file_path = STORAGE_DIR / filename
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file_obj, buffer)
        
    return str(file_path)

def get_file_path(filename: str) -> str:
    """
    Get the absolute path for a filename in storage.
    """
    return str(STORAGE_DIR / filename)
