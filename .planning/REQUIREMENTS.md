# Requirements

## Epic: Core Media Processing
**Goal:** Ingest audio/video files and extract metadata.
- **Must Have:** File upload capability (audio/video).
- **Must Have:** Local file storage mechanism for uploaded media.
- **Must Have:** Media format validation and handling.

## Epic: Transcription Services
**Goal:** Convert audio to text using local Whisper.
- **Must Have:** Integration with local Whisper (e.g. whisper.cpp).
- **Must Have:** Accurate timestamp generation.
- **Must Have:** Searchable transcript generation.

## Epic: AI Summarization & Insights
**Goal:** Generate summaries and chapters using local Ollama.
- **Must Have:** Integration with local Ollama service.
- **Must Have:** Summarization engine for long-form content.
- **Must Have:** Auto-generation of timestamped chapters.
- **Should Have:** Interactive Q&A over the transcript.

## Epic: Web Platform & UI
**Goal:** Deliver a modern React frontend.
- **Must Have:** Dashboard to view all processed podcasts/videos.
- **Must Have:** Detail view with media player, transcript, and summary.
- **Must Have:** Fast and responsive design.
