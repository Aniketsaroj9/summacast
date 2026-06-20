---
wave: 1
depends_on: []
files_modified: []
autonomous: true
---

# Plan 1: Foundation & Infrastructure Setup

## Requirements
- Set up Node.js / FastAPI backend skeletons.
- Set up React frontend skeleton.
- Configure PostgreSQL and Redis for local development.
- Implement the local file storage module.

## Tasks

```xml
<task>
<read_first>
- .planning/PROJECT.md
- .planning/REQUIREMENTS.md
</read_first>
<action>
Create a React frontend application using Vite. Run `npx -y create-vite@latest frontend --template react-ts`.
</action>
<acceptance_criteria>
- `frontend/package.json` contains "react" and "react-dom".
- `frontend/vite.config.ts` exists.
</acceptance_criteria>
</task>

<task>
<read_first>
- .planning/PROJECT.md
- .planning/REQUIREMENTS.md
</read_first>
<action>
Create a Python FastAPI backend application.
1. Create `backend` directory.
2. Initialize `backend/requirements.txt` with `fastapi`, `uvicorn`, `psycopg2-binary`, `redis`, `python-dotenv`.
3. Create `backend/main.py` containing a minimal FastAPI app instance with a health check route `/api/health`.
</action>
<acceptance_criteria>
- `backend/requirements.txt` contains required dependencies.
- `backend/main.py` exists and contains `from fastapi import FastAPI`.
</acceptance_criteria>
</task>

<task>
<read_first>
- .planning/PROJECT.md
- backend/main.py
</read_first>
<action>
Implement local file storage module.
1. Create `backend/storage.py`.
2. Add a `save_file(file_obj, filename)` function that saves uploaded files to `backend/data/` directory.
</action>
<acceptance_criteria>
- `backend/storage.py` exists and contains `def save_file`.
</acceptance_criteria>
</task>

<task>
<read_first>
- backend/requirements.txt
</read_first>
<action>
Create a `docker-compose.yml` in the project root to spin up PostgreSQL and Redis for local development.
Set PostgreSQL port to 5432 and Redis port to 6379. Use standard official images (`postgres:15`, `redis:7`).
</action>
<acceptance_criteria>
- `docker-compose.yml` exists in root.
- Contains services for `postgres` and `redis` with correct ports.
</acceptance_criteria>
</task>
```
