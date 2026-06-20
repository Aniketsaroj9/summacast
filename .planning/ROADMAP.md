# Roadmap

## Phase 1: Foundation & Infrastructure Setup
**Goal:** Initialize the project repositories and set up local services.
- Set up Node.js / FastAPI backend skeletons.
- Set up React frontend skeleton.
- Configure PostgreSQL and Redis for local development.
- Implement the local file storage module.

## Phase 2: Core Media Upload & Validation
**Goal:** Allow users to upload media files safely.
- Implement frontend file uploader.
- Implement backend upload API and format validation.
- Save files to local storage and insert database records.

## Phase 3: Transcription Service Integration
**Goal:** Hook up local Whisper for transcriptions.
- Set up whisper.cpp or similar local Whisper instance.
- Create background workers (Node/Redis) to process uploaded media.
- Extract audio, send to Whisper, and save raw transcripts and timestamps.

## Phase 4: AI Summarization & Chapters
**Goal:** Use Ollama for generating summaries and chapters.
- Integrate Ollama API client in the backend.
- Feed transcripts to Ollama to generate overall summaries.
- Prompt Ollama to generate timestamped chapters.
- Save results to the database.

## Phase 5: Web UI & Player
**Goal:** Deliver the final user experience.
- Build the React media player with chapter support.
- Display transcripts synchronously with playback.
- Build the main dashboard to list all processed media.
