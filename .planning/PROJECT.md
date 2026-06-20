# SummaCast

## What This Is
SummaCast is an AI-powered podcast and video summarization platform designed to transform long-form audio and video content into concise summaries, searchable transcripts, timestamped chapters, and interactive insights.

## Core Value
Providing accessible, searchable, and concise insights from long-form media using entirely local, free AI models and local storage infrastructure to minimize operating costs while ensuring user privacy.

## Target Audience
Podcast listeners, researchers, content creators, and students who need to digest long audio/video content quickly without relying on paid cloud services.

## Architecture & Tech Stack
- **Frontend:** React
- **Backend:** Node.js, FastAPI
- **Database/Caching:** PostgreSQL, Redis
- **Storage:** Local file system (No AWS S3)
- **Transcription:** Local Whisper (e.g., whisper.cpp)
- **AI / LLM:** Ollama (Local LLM instead of paid APIs)

## Requirements

### Validated
(None yet — ship to validate)

### Active
- [ ] Process audio/video files uploaded by the user.
- [ ] Generate searchable transcripts using local Whisper.
- [ ] Generate concise summaries and timestamped chapters using Ollama.
- [ ] Store media files and transcripts on the local file system.
- [ ] Provide interactive insights and a user-friendly UI via React.

### Out of Scope
- Using AWS S3 or any paid cloud storage for media hosting.
- Using paid transcription services (e.g., OpenAI Whisper API).
- Using paid LLM APIs (e.g., GPT-4, Claude).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use local storage instead of AWS S3 | User constraint: avoid cloud hosting costs. | — Pending |
| Use local Whisper (whisper.cpp) | User constraint: avoid paid transcription APIs. | — Pending |
| Use Ollama | User constraint: avoid paid LLM APIs and keep data processing local. | — Pending |

## Evolution
This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state
