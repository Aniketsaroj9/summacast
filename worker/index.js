require('dotenv').config();
const Redis = require('ioredis');
const path = require('path');
const fs = require('fs');
const { extractAudio, transcribeAudio } = require('./transcribe');
const { getMediaFile, updateMediaStatus, saveTranscriptSegments, saveSummaryAndChapters } = require('./db');
const { generateSummaryAndChapters } = require('./summarize');

// Load env vars
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const MODEL_PATH = process.env.WHISPER_MODEL_PATH || path.join(__dirname, 'models', 'ggml-tiny.bin');

// Initialize Redis clients
const redis = new Redis(REDIS_URL);
const redisSub = new Redis(REDIS_URL);

let activeJobId = null;
let activeChildProcess = null;
let activeOllamaController = null;

console.log(`Worker starting...`);
console.log(`Connecting to Redis at ${REDIS_URL}`);
console.log(`Using Whisper model at ${MODEL_PATH}`);

redis.on('connect', () => {
  console.log('Successfully connected to Redis!');
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

// Subscribe to the job cancellation channel
redisSub.subscribe('cancellation_channel', (err, count) => {
  if (err) {
    console.error('Failed to subscribe to cancellation_channel:', err);
  } else {
    console.log('Subscribed to Redis cancellation_channel successfully.');
  }
});

redisSub.on('message', (channel, message) => {
  if (channel === 'cancellation_channel') {
    const cancelledMediaId = parseInt(message, 10);
    console.log(`[Cancellation Channel] Received signal for media ID: ${cancelledMediaId}`);
    
    if (activeJobId && activeJobId === cancelledMediaId) {
      console.log(`[Cancellation Executed] Stopping processes for media ID: ${activeJobId}`);
      
      // 1. Terminate ffmpeg or Whisper process
      if (activeChildProcess) {
        try {
          activeChildProcess.kill('SIGTERM');
          console.log(`SIGTERM signal sent to active child process successfully.`);
        } catch (killErr) {
          console.error('Failed to terminate child process:', killErr);
        }
      }
      
      // 2. Abort fetch call to local Ollama
      if (activeOllamaController) {
        try {
          activeOllamaController.abort();
          console.log(`Ollama HTTP AbortController activated.`);
        } catch (abortErr) {
          console.error('Failed to abort Ollama fetch:', abortErr);
        }
      }
    }
  }
});

async function start() {
  console.log('Worker is now listening for jobs on "transcription_queue"...');
  
  while (true) {
    try {
      // BRPOP blocks until an item is pushed onto the list
      const job = await redis.brpop('transcription_queue', 0);
      if (job) {
        const [queue, mediaIdStr] = job;
        const mediaId = parseInt(mediaIdStr, 10);
        console.log(`[Job Received] Processing media ID: ${mediaId}`);
        
        try {
          activeJobId = mediaId;

          // 1. Fetch file details from database
          const media = await getMediaFile(mediaId);
          if (!media) {
            console.error(`Media ID ${mediaId} not found in database. Skipping.`);
            continue;
          }
          
          console.log(`Media found: "${media.original_filename}" at path: ${media.file_path}`);
          
          // 2. Set status to PROCESSING
          await updateMediaStatus(mediaId, 'PROCESSING');
          
          // 3. Define temp paths
          const wavPath = path.join(__dirname, `temp_${mediaId}.wav`);
          const outputBase = path.join(__dirname, `output_${mediaId}`);
          
          // 4. Extract audio (convert to 16kHz mono WAV)
          await extractAudio(media.file_path, wavPath, (cmd) => {
            activeChildProcess = cmd;
          });
          
          // 5. Run whisper transcription
          const segments = await transcribeAudio(wavPath, MODEL_PATH, outputBase, (child) => {
            activeChildProcess = child;
          });
          
          activeChildProcess = null;
          
          // 6. Save segments
          await saveTranscriptSegments(mediaId, segments);
          
          // 7. Transition to SUMMARIZING and generate summary + chapters
          console.log(`[Summarizing] Initiating AI summarization for media ID: ${mediaId}`);
          await updateMediaStatus(mediaId, 'SUMMARIZING');
          
          activeOllamaController = new AbortController();
          const { summary, chapters } = await generateSummaryAndChapters(segments, activeOllamaController.signal);
          activeOllamaController = null;
          
          // 8. Save summary and chapters, then set to COMPLETED
          await saveSummaryAndChapters(mediaId, summary, chapters);
          await updateMediaStatus(mediaId, 'COMPLETED');
          
          console.log(`[Job Success] Completed media ID: ${mediaId}`);

        } catch (err) {
          console.error(`[Job Failed] Error processing media ID ${mediaId}:`, err);
          
          // Clean up any remaining temp files on failure/cancellation
          const wavPath = path.join(__dirname, `temp_${mediaId}.wav`);
          const outputBase = path.join(__dirname, `output_${mediaId}`);
          const jsonPath = `${outputBase}.json`;
          try {
            if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
            if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
          } catch (cleanupErr) {
            // Ignore if files do not exist
          }

          // Set status to FAILED
          try {
            await updateMediaStatus(mediaId, 'FAILED');
          } catch (dbErr) {
            console.error(`Failed to update media status to FAILED in db:`, dbErr);
          }
        } finally {
          activeJobId = null;
          activeChildProcess = null;
          activeOllamaController = null;
        }
      }
    } catch (err) {
      console.error('Error in worker polling loop:', err);
      // Wait 5 seconds before retrying to prevent hot loop
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

// Start polling loop
start().catch(err => {
  console.error('Fatal worker error:', err);
  process.exit(1);
});
