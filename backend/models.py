from sqlalchemy import Column, Integer, String
from backend.db import Base

class Media(Base):
    __tablename__ = "media_files"

    id = Column(Integer, primary_key=True, index=True)
    original_filename = Column(String, index=True)
    file_path = Column(String)
    status = Column(String, default="UPLOADED")
