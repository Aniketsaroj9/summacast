from fastapi import FastAPI, File, UploadFile, HTTPException, Depends
from sqlalchemy.orm import Session
from backend.db import engine, get_db
from backend.models import Base, Media
from backend.storage import save_file

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="SummaCast API")

@app.get("/api/health")
def health_check():
    return {"status": "healthy"}

@app.post("/api/upload")
def upload_file(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not (file.content_type.startswith("audio/") or file.content_type.startswith("video/")):
        raise HTTPException(status_code=400, detail="Invalid file type. Must be audio or video.")
    
    # Save the file locally
    file_path = save_file(file.file, file.filename)
    
    # Save to database
    db_media = Media(original_filename=file.filename, file_path=file_path)
    db.add(db_media)
    db.commit()
    db.refresh(db_media)
    
    return {"id": db_media.id, "filename": db_media.original_filename, "status": db_media.status}
