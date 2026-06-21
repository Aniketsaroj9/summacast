require('dotenv').config();
const Redis = require('ioredis');
const path = require('path');
const fs = require('fs');
const { extractAudio, transcribeAudio } = require('./transcribe');
const { getMediaFile, updateMediaStatus, saveTranscriptSegments } = require('./db');

// Load env vars
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const MODEL_PATH = process.env.WHISPER_MODEL_PATH || path.join(__dirname, 'models', 'ggml-tiny.bin');

// Initialize Redis client
const redis = new Redis(REDIS_URL);

console.log(`Worker starting...`);
console.log(`Connecting to Redis at ${REDIS_URL}`);
console.log(`Using Whisper model at ${MODEL_PATH}`);

redis.on('connect', () => {
  console.log('Successfully connected to Redis!');
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
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
          await extractAudio(media.file_path, wavPath);
          
          // 5. Run whisper transcription
          const segments = await transcribeAudio(wavPath, MODEL_PATH, outputBase);
          
          // 6. Save segments and update status to TRANSCRIBED
          await saveTranscriptSegments(mediaId, segments);
          await updateMediaStatus(mediaId, 'TRANSCRIBED');
          
          console.log(`[Job Success] Completed media ID: ${mediaId}`);
        } catch (err) {
          console.error(`[Job Failed] Error processing media ID ${mediaId}:`, err);
          // Set status to FAILED
          try {
            await updateMediaStatus(mediaId, 'FAILED');
          } catch (dbErr) {
            console.error(`Failed to update media status to FAILED in db:`, dbErr);
          }
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
