import os
import redis
from fastapi import FastAPI, File, UploadFile, HTTPException, Depends
from sqlalchemy.orm import Session
from backend.db import engine, get_db
from backend.models import Base, Media, TranscriptSegment
from backend.storage import save_file

# Create tables
Base.metadata.create_all(bind=engine)

# Initialize Redis client
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=0, decode_responses=True)

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
    
    # Queue task in Redis
    try:
        redis_client.rpush("transcription_queue", str(db_media.id))
    except Exception as e:
        print(f"Error pushing job to Redis: {e}")
        # Log error but don't fail upload
    
    return {"id": db_media.id, "filename": db_media.original_filename, "status": db_media.status}

@app.get("/api/media/{id}/transcript")
def get_media_transcript(id: int, db: Session = Depends(get_db)):
    media = db.query(Media).filter(Media.id == id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media file not found.")
        
    # Query segments ordered by start_time
    segments = db.query(TranscriptSegment).filter(TranscriptSegment.media_id == id).order_by(TranscriptSegment.start_time).all()
    
    return {
        "media_id": media.id,
        "filename": media.original_filename,
        "status": media.status,
        "segments": [
            {
                "id": seg.id,
                "start": seg.start_time,
                "end": seg.end_time,
                "text": seg.text
            }
            for seg in segments
        ]
    }
