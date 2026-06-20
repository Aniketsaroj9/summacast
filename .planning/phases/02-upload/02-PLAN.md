---
wave: 1
depends_on: []
files_modified: []
autonomous: true
---

# Plan 2: Core Media Upload & Validation

## Requirements
- Allow users to upload media files safely.
- Implement frontend file uploader.
- Implement backend upload API and format validation.
- Save files to local storage and insert database records.

## Tasks

```xml
<task>
<read_first>
- backend/requirements.txt
- backend/main.py
</read_first>
<action>
Add `SQLAlchemy` and `python-multipart` to `backend/requirements.txt`.
Create `backend/db.py` setting up an async or sync SQLAlchemy engine connecting to PostgreSQL (`postgresql://summacast_user:summacast_password@localhost/summacast`).
Create `backend/models.py` defining a `Media` SQLAlchemy model with `id` (Integer), `original_filename` (String), `file_path` (String), `status` (String, e.g. "UPLOADED").
</action>
<acceptance_criteria>
- `backend/requirements.txt` contains `sqlalchemy` and `python-multipart`.
- `backend/db.py` exists with `engine` and `SessionLocal`.
- `backend/models.py` exists with `Media` model.
</acceptance_criteria>
</task>

<task>
<read_first>
- backend/main.py
- backend/storage.py
- backend/models.py
</read_first>
<action>
Update `backend/main.py` to create database tables on startup.
Implement a `POST /api/upload` endpoint that:
1. Receives an `UploadFile`.
2. Validates content type (must start with `audio/` or `video/`).
3. Uses `save_file` from `storage.py` to save the file.
4. Inserts a new `Media` record into the database with `status="UPLOADED"`.
5. Returns the created record ID and file path.
</action>
<acceptance_criteria>
- `backend/main.py` contains `POST /api/upload` route.
- The route includes validation for `audio/` and `video/` content types.
- The route persists data using SQLAlchemy.
</acceptance_criteria>
</task>

<task>
<read_first>
- frontend/src/App.tsx
</read_first>
<action>
Create `frontend/src/components/Uploader.tsx`. This component should:
1. Render an HTML file input accepting `audio/*` and `video/*`.
2. Send a `POST` request with `FormData` to `/api/upload` using `fetch`.
3. Display upload status (e.g., "Uploading...", "Success!", "Error").
Update `frontend/src/App.tsx` to mount `<Uploader />`.
Configure vite proxy in `frontend/vite.config.ts` to proxy `/api` to `http://localhost:8000`.
</action>
<acceptance_criteria>
- `frontend/src/components/Uploader.tsx` exists and handles file uploads.
- `frontend/src/App.tsx` renders the `Uploader` component.
- `frontend/vite.config.ts` proxies `/api` to `http://localhost:8000`.
</acceptance_criteria>
</task>
```
