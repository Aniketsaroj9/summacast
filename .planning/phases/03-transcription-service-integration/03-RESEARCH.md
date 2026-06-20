# Phase 3: Transcription Service Integration - Research

**Researched:** 2026-06-20
**Domain:** Local Whisper Audio Transcription & Background Worker
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

No user constraints - all decisions at the agent's discretion.

### Locked Decisions
- Must use local Whisper (whisper.cpp or similar local instance).
- Must use local storage for files and database (PostgreSQL/Redis).
- Must not use paid transcription APIs (e.g. OpenAI Whisper API).

### the agent's Discretion
- Choice of worker implementation language (Node.js selected as per roadmap recommendation "background workers (Node/Redis)").
- Method of running/executing Whisper (running precompiled `whisper-cli` executable via subprocess).
- Choice of queue orchestration library (simple Redis list with `BRPOP` for simplicity and lightweight execution).

### Deferred Ideas (OUT OF SCOPE)
- Paid cloud transcription services.
- AWS S3 storage.
</user_constraints>

<research_summary>
## Summary

This research establishes a lightweight, highly efficient transcription pipeline for SummaCast. The architecture utilizes a Node.js background worker listening to a Redis queue. The FastAPI backend pushes a message (containing the media ID) to a Redis list (`transcription_queue`) upon a successful upload.

The Node.js worker picks up the job, extracts audio from the uploaded video/audio file using `ffmpeg`, downsamples it to the required 16kHz mono WAV format, and feeds it to `whisper.cpp` CLI via a spawned child process. Once transcription is complete, the worker parses the output (e.g., JSON or TXT format) and updates the PostgreSQL database.

**Primary recommendation:** Use a Node.js worker with `ioredis` and `pg`. Spawn `ffmpeg` to convert files to 16kHz mono WAV, and spawn precompiled `whisper-cli` with a downloaded `ggml-tiny.bin` or `ggml-base.bin` model. Store the resulting segments in a new database table and update the `Media` status.
</research_summary>

<standard_stack>
## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| whisper.cpp CLI | v1.11.0 | Local fast C++ transcription inference | CPU-optimized, no PyTorch overhead, runs locally |
| ioredis | ^5.4.1 | Node.js Redis client for queue polling | Fast, robust, support for async/await and promises |
| pg | ^8.11.3 | Node.js PostgreSQL client | Standard client to write results to db |
| fluent-ffmpeg | ^2.1.2 | Wrapper around ffmpeg for audio conversion | Simplifies ffmpeg arguments for audio extraction |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| dotenv | ^16.4.5 | Load env vars from .env | Standard config loading |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Node.js worker | Python Celery/RQ | Python is great, but Node.js was specifically requested by the roadmap ("Node/Redis workers"). A Python worker would add Celery/Redis complexity. Node.js is lightweight and fast. |
| BullMQ | Redis list `BRPOP` | BullMQ has rich features (retries, delay), but raw `BRPOP` has zero config, zero overhead, and is trivial to implement and test. |
| Python faster-whisper | whisper.cpp CLI | Python version is hard to install on Windows + Python 3.14 due to CTranslate2 compilation. whisper.cpp has precompiled executables. |

**Installation:**
In `worker` folder:
```bash
npm init -y
npm install ioredis pg fluent-ffmpeg dotenv
npm install --save-dev @types/node
```
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### Recommended Project Structure
```
worker/
├── package.json
├── index.js          # Entrypoint / BRPOP loop
├── db.js             # Postgres client & query helpers
├── queue.js          # Redis client
└── transcribe.js     # ffmpeg extraction & whisper-cli spawning
```

### Pattern 1: Redis BRPOP Queue Loop
**What:** Use Redis blocking list pop (`BRPOP`) to listen for incoming tasks infinitely without polling overhead.
**When to use:** Simple queue consumption.
**Example:**
```javascript
const Redis = require('ioredis');
const redis = new Redis("redis://localhost:6379");

async function startWorker() {
  console.log("Worker started, waiting for jobs...");
  while (true) {
    try {
      // blocks until an item is pushed onto the queue list
      const res = await redis.brpop("transcription_queue", 0);
      if (res) {
        const [queueName, mediaIdStr] = res;
        const mediaId = parseInt(mediaIdStr, 10);
        console.log(`Processing media ID: ${mediaId}`);
        await processJob(mediaId);
      }
    } catch (err) {
      console.error("Queue loop error:", err);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}
```

### Pattern 2: ffmpeg 16kHz Mono WAV Extraction
**What:** Extract audio from video/audio files and resample to 16kHz mono WAV format (required by whisper.cpp).
**When to use:** Prior to calling whisper.cpp CLI.
**Example:**
```javascript
const ffmpeg = require('fluent-ffmpeg');

function extractAudio(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioCodec('pcm_s16le')
      .audioChannels(1)
      .audioFrequency(16000)
      .toFormat('wav')
      .save(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err));
  });
}
```

### Anti-Patterns to Avoid
- **Passing MP3/MP4 directly to whisper.cpp:** whisper.cpp strictly expects WAV files format (16-bit, 16kHz, mono, PCM). Any other format will cause whisper.cpp to exit with an error.
- **Concurrent worker spikes:** Since transcription is heavily CPU/GPU bound, executing multiple Whisper instances in parallel can freeze the system. Ensure the worker processes tasks sequentially (concurrency = 1).
- **Hardcoded paths:** Do not hardcode the path to the whisper.cpp binary or models. Keep them configurable in env vars.
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Audio conversion | Custom WAV header parser or python wave converter | `ffmpeg` | ffmpeg handles all input container formats (mp3, mp4, mkv, avi, m4a) and resamples correctly without memory leaks. |
| C++ model bindings | Custom native addon compiling node-gyp for ggml | `whisper-cli` executable | Native bindings frequently break across node versions. Spawning the CLI as a subprocess is stable, reliable, and decoupled. |
| Job state management | In-memory queues inside FastAPI | Redis list / PostgreSQL statuses | If the FastAPI app restarts, in-memory jobs are lost. Redis ensures persistence of the queue. |
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: ffmpeg not in PATH
**What goes wrong:** `fluent-ffmpeg` throws a "cannot find ffmpeg" error.
**Why it happens:** ffmpeg is not installed or its executable path is not in the system's environment variables.
**How to avoid:** Provide an option to set the ffmpeg path in environmental variables (e.g. `FFMPEG_PATH`), or default to a system-wide ffmpeg installation.

### Pitfall 2: whisper.cpp memory usage and execution time
**What goes wrong:** Spawning whisper-cli on large media files consumes a lot of CPU and takes a long time.
**Why it happens:** Large models like `ggml-large` require lots of RAM and CPU threads.
**How to avoid:** Default to using `ggml-tiny.bin` or `ggml-base.bin` for quick development and testing. Expose configuration for threads count (`-t`) to match CPU core availability.

### Pitfall 3: Whisper JSON Output Format changes
**What goes wrong:** Parsing the text output of whisper.cpp is brittle.
**Why it happens:** Text formatting can change or have localized variations.
**How to avoid:** Invoke the CLI with the `-oj` (JSON output) flag or `--output-json` flag, which generates a stable JSON file with exact timestamps and text segments.
</common_pitfalls>

<code_examples>
## Code Examples

### Spawning whisper-cli in Node.js
```javascript
const { spawn } = require('child_process');
const fs = require('fs');

function transcribe(audioPath, modelPath, outputPathWithoutExtension) {
  return new Promise((resolve, reject) => {
    // whisper.cpp flags:
    // -m <model>: model path
    // -f <file>: input audio file
    // -oj: output JSON format
    // -of <file>: output filename (without extension)
    const args = [
      '-m', modelPath,
      '-f', audioPath,
      '-oj',
      '-of', outputPathWithoutExtension
    ];
    
    console.log(`Running: whisper-cli ${args.join(' ')}`);
    const child = spawn('whisper-cli', args);
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve(`${outputPathWithoutExtension}.json`);
      } else {
        reject(new Error(`whisper-cli exited with code ${code}`));
      }
    });
    
    child.on('error', (err) => reject(err));
  });
}
```

### FastAPI endpoint queue insertion
```python
import redis

redis_client = redis.Redis(host='localhost', port=6379, db=0)

# In POST /api/upload after creating db entry:
db_media = Media(original_filename=file.filename, file_path=file_path, status="UPLOADED")
db.add(db_media)
db.commit()
db.refresh(db_media)

# Queue task for worker
redis_client.rpush("transcription_queue", db_media.id)
```
</code_examples>

<sota_updates>
## State of the Art (2025-2026)

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| PyTorch Whisper | whisper.cpp / ggml | 2023-2024 | CPU performance is 10x faster, zero heavy dependencies |
| Python multiprocessing | Separate worker service | 2024 | Better resource isolation and reliability, FastAPI remains responsive |

**New tools/patterns to consider:**
- Vulkan/CUDA support in whisper.cpp for GPU acceleration if available.
- Using `-otxt` or `-oj` outputs directly instead of manual stdout parsing.
</sota_updates>

<open_questions>
## Open Questions

1. **How should whisper-cli be distributed/installed?**
   - What we know: On Windows, whisper.cpp binaries can be downloaded from GitHub releases, or we can compile them.
   - What's unclear: Can we provide a simple script that downloads the precompiled binaries and a model, or do we expect the developer to have `whisper-cli` in their path?
   - Recommendation: Provide a setup script in the backend or worker directory (e.g. `setup_whisper.ps1`) that downloads a precompiled whisper-cli executable and a model file (e.g. `ggml-tiny.bin` from Hugging Face) into a local bin/ folder.

2. **Schema database table for transcripts?**
   - What we know: Transcripts need to be searchable and have timestamps.
   - What's unclear: Should we store the transcript as a single large text block in `media_files`, or a separate `transcript_segments` table?
   - Recommendation: Create a `transcript_segments` table linked to `media_files` with `id`, `media_id`, `start_time` (float), `end_time` (float), and `text` (text). This allows searching and direct jumping to timestamps.
</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)
- https://github.com/ggml-org/whisper.cpp - official repository and CLI usage.
- https://huggingface.co/ggerganov/whisper.cpp - official ggml model storage.

### Secondary (MEDIUM confidence)
- fluent-ffmpeg documentation and examples.
- ioredis queue patterns.
</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: whisper.cpp & Node.js Redis Queue worker
- Ecosystem: ioredis, pg, fluent-ffmpeg
- Patterns: Redis list BRPOP queue, ffmpeg conversion, child_process spawning

**Confidence breakdown:**
- Standard stack: HIGH
- Architecture: HIGH
- Pitfalls: HIGH
- Code examples: HIGH

**Research date:** 2026-06-20
**Valid until:** 2026-07-20
</metadata>

---

*Phase: 03-transcription-service-integration*
*Research completed: 2026-06-20*
*Ready for planning: yes*
