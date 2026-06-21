import os
import redis
from fastapi import FastAPI, File, UploadFile, HTTPException, Depends
from sqlalchemy.orm import Session
from backend.db import engine, get_db
from backend.models import Base, Media, TranscriptSegment, Chapter
from backend.storage import save_file
import httpx

# Create tables
Base.metadata.create_all(bind=engine)

# Initialize Redis client
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=0, decode_responses=True)

# Initialize Ollama settings
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3:8b")

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

@app.get("/api/media/{id}/summary")
def get_media_summary(id: int, db: Session = Depends(get_db)):
    media = db.query(Media).filter(Media.id == id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media file not found.")
        
    # Query chapters ordered by start_time
    chapters = db.query(Chapter).filter(Chapter.media_id == id).order_by(Chapter.start_time).all()
    
    return {
        "media_id": media.id,
        "filename": media.original_filename,
        "status": media.status,
        "summary": media.summary,
        "chapters": [
            {
                "id": ch.id,
                "start_time": ch.start_time,
                "title": ch.title,
                "summary": ch.summary
            }
            for ch in chapters
        ]
    }

from pydantic import BaseModel

class QARequest(BaseModel):
    question: str

@app.post("/api/media/{id}/qa")
async def ask_question_about_media(id: int, request: QARequest, db: Session = Depends(get_db)):
    media = db.query(Media).filter(Media.id == id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media file not found.")
        
    # Fetch transcript segments
    segments = db.query(TranscriptSegment).filter(TranscriptSegment.media_id == id).order_by(TranscriptSegment.start_time).all()
    if not segments:
        raise HTTPException(status_code=400, detail="No transcript available for this media file.")
        
    # Build prompt context
    context = "\n".join([f"[{seg.start_time:.2f}] {seg.text}" for seg in segments])
    
    prompt = (
        "You are a helpful assistant answering questions about a podcast/video. "
        "Use the provided transcript to answer the user's question accurately. "
        "If the answer cannot be found in the transcript, state that clearly.\n\n"
        f"Transcript:\n{context}\n\n"
        f"Question: {request.question}\n\n"
        "Answer:"
    )
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{OLLAMA_HOST}/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "options": {"num_ctx": 16384}
                },
                timeout=60.0
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=500, detail=f"Ollama returned error: {response.status_code}")
                
            data = response.json()
            answer = data.get("response", "").strip()
            return {"answer": answer}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to query local LLM: {str(e)}")

