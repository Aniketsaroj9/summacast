from datetime import datetime
from sqlalchemy import Column, Integer, String, ForeignKey, Float, DateTime
from sqlalchemy.orm import relationship
from backend.db import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    media_files = relationship("Media", back_populates="user", cascade="all, delete-orphan")

class Media(Base):
    __tablename__ = "media_files"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    original_filename = Column(String, index=True)
    file_path = Column(String)
    status = Column(String, default="UPLOADED")
    summary = Column(String, nullable=True)
    
    segments = relationship("TranscriptSegment", back_populates="media", cascade="all, delete-orphan")
    chapters = relationship("Chapter", back_populates="media", cascade="all, delete-orphan")
    user = relationship("User", back_populates="media_files")

class TranscriptSegment(Base):
    __tablename__ = "transcript_segments"

    id = Column(Integer, primary_key=True, index=True)
    media_id = Column(Integer, ForeignKey("media_files.id", ondelete="CASCADE"), nullable=False, index=True)
    start_time = Column(Float, nullable=False)
    end_time = Column(Float, nullable=False)
    text = Column(String, nullable=False)

    media = relationship("Media", back_populates="segments")

class Chapter(Base):
    __tablename__ = "chapters"

    id = Column(Integer, primary_key=True, index=True)
    media_id = Column(Integer, ForeignKey("media_files.id", ondelete="CASCADE"), nullable=False, index=True)
    start_time = Column(Float, nullable=False)
    title = Column(String, nullable=False)
    summary = Column(String, nullable=True)

    media = relationship("Media", back_populates="chapters")


