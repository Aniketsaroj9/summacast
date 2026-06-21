import os
import redis
from datetime import datetime, timedelta
from fastapi import FastAPI, File, UploadFile, HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer
from fastapi.responses import FileResponse, PlainTextResponse
from sqlalchemy.orm import Session
from backend.db import engine, get_db
from backend.models import Base, Media, TranscriptSegment, Chapter, User
from backend.storage import save_file
import httpx
from passlib.context import CryptContext
from jose import JWTError, jwt
from pydantic import BaseModel

# Create tables
Base.metadata.create_all(bind=engine)

# Initialize Redis client
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=0, decode_responses=True)

# Initialize Ollama settings
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3:8b")

# Password hashing configuration
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

# JWT configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "summacast_super_secret_key_change_me_in_prod")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# Pydantic schemas
class UserAuth(BaseModel):
    email: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class QARequest(BaseModel):
    question: str

# Auth Dependency
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login", auto_error=False)

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(status_code=401, detail="Invalid authentication token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication token")
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user

app = FastAPI(title="SummaCast API")

@app.get("/api/health")
def health_check():
    return {"status": "healthy"}

# --- AUTH ENDPOINTS ---

@app.post("/api/auth/register")
def register(user_data: UserAuth, db: Session = Depends(get_db)):
    # Check if user already exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email is already registered.")
        
    hashed_pw = get_password_hash(user_data.password)
    new_user = User(email=user_data.email, hashed_password=hashed_pw)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"status": "success", "email": new_user.email}

@app.post("/api/auth/login", response_model=Token)
def login(user_data: UserAuth, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == user_data.email).first()
    if not user or not verify_password(user_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Invalid email or password.")
        
    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/auth/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {"id": current_user.id, "email": current_user.email}

# --- MEDIA ENDPOINTS ---

@app.post("/api/upload")
def upload_file(
    file: UploadFile = File(...), 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    if not (file.content_type.startswith("audio/") or file.content_type.startswith("video/")):
        raise HTTPException(status_code=400, detail="Invalid file type. Must be audio or video.")
    
    # Save the file locally
    file_path = save_file(file.file, file.filename)
    
    # Save to database mapped to current user
    db_media = Media(original_filename=file.filename, file_path=file_path, user_id=current_user.id)
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

@app.get("/api/media")
def list_media(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Support backward compatibility for uploads with null user_id
    media_files = db.query(Media).filter(
        (Media.user_id == current_user.id) | (Media.user_id.is_(None))
    ).order_by(Media.id.desc()).all()
    
    return [
        {
            "id": m.id,
            "filename": m.original_filename,
            "status": m.status,
            "summary": m.summary
        }
        for m in media_files
    ]

@app.get("/api/media/{id}/transcript")
def get_media_transcript(id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    media = db.query(Media).filter(
        Media.id == id, 
        (Media.user_id == current_user.id) | (Media.user_id.is_(None))
    ).first()
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
def get_media_summary(id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    media = db.query(Media).filter(
        Media.id == id, 
        (Media.user_id == current_user.id) | (Media.user_id.is_(None))
    ).first()
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

@app.post("/api/media/{id}/qa")
async def ask_question_about_media(
    id: int, 
    request: QARequest, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    media = db.query(Media).filter(
        Media.id == id, 
        (Media.user_id == current_user.id) | (Media.user_id.is_(None))
    ).first()
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
        f"Answer:"
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

@app.get("/api/media/{id}/file")
def get_media_file(id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    media = db.query(Media).filter(
        Media.id == id, 
        (Media.user_id == current_user.id) | (Media.user_id.is_(None))
    ).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media file not found.")
    if not os.path.exists(media.file_path):
        raise HTTPException(status_code=404, detail="Physical media file not found on disk.")
    
    # Determine MIME content-type based on file extension
    mime_type = "application/octet-stream"
    lower_name = media.original_filename.lower()
    if lower_name.endswith(".mp4"):
        mime_type = "video/mp4"
    elif lower_name.endswith(".mp3"):
        mime_type = "audio/mpeg"
    elif lower_name.endswith(".wav"):
        mime_type = "audio/wav"
    elif lower_name.endswith(".m4a"):
        mime_type = "audio/mp4"
    elif lower_name.endswith(".webm"):
        mime_type = "video/webm"
        
    return FileResponse(media.file_path, media_type=mime_type)

@app.get("/api/media/{id}/download")
def download_transcript(id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    media = db.query(Media).filter(
        Media.id == id, 
        (Media.user_id == current_user.id) | (Media.user_id.is_(None))
    ).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media file not found.")
    if media.status != "COMPLETED":
        raise HTTPException(status_code=400, detail="Transcript is not ready yet.")
        
    segments = db.query(TranscriptSegment).filter(TranscriptSegment.media_id == id).order_by(TranscriptSegment.start_time).all()
    
    # Format time helper: [01:23] or [01:02:03]
    def time_format(seconds):
        hrs = int(seconds // 3600)
        mins = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        if hrs > 0:
            return f"[{hrs:02d}:{mins:02d}:{secs:02d}]"
        return f"[{mins:02d}:{secs:02d}]"
        
    lines = []
    lines.append(f"SUMMACAST AI TRANSCRIPT LOG")
    lines.append(f"File: {media.original_filename}")
    lines.append(f"Generated at: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC")
    lines.append("=" * 45)
    lines.append("")
    
    for seg in segments:
        lines.append(f"{time_format(seg.start_time)} {seg.text}")
        
    content = "\n".join(lines)
    
    safe_filename = media.original_filename.replace(" ", "_")
    headers = {
        "Content-Disposition": f'attachment; filename="transcript_{safe_filename}.txt"'
    }
    return PlainTextResponse(content, headers=headers)

@app.post("/api/media/{id}/cancel")
def cancel_processing(id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    media = db.query(Media).filter(
        Media.id == id, 
        (Media.user_id == current_user.id) | (Media.user_id.is_(None))
    ).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media file not found.")
    if media.status not in ["UPLOADED", "PROCESSING", "SUMMARIZING"]:
        raise HTTPException(status_code=400, detail="Cannot cancel a finished or failed process.")
        
    # Mark as failed/cancelled
    media.status = "FAILED"
    db.commit()
    
    # Publish cancellation signal to Redis pub/sub
    try:
        redis_client.publish("cancellation_channel", str(id))
    except Exception as e:
        print(f"Error publishing cancellation to Redis: {e}")
        
    return {"status": "cancelled", "media_id": id}
