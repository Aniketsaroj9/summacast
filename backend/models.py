from sqlalchemy import Column, Integer, String, ForeignKey, Float
from sqlalchemy.orm import relationship
from backend.db import Base

class Media(Base):
    __tablename__ = "media_files"

    id = Column(Integer, primary_key=True, index=True)
    original_filename = Column(String, index=True)
    file_path = Column(String)
    status = Column(String, default="UPLOADED")
    summary = Column(String, nullable=True)
    
    segments = relationship("TranscriptSegment", back_populates="media", cascade="all, delete-orphan")
    chapters = relationship("Chapter", back_populates="media", cascade="all, delete-orphan")

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


