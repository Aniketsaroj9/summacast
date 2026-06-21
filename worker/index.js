require('dotenv').config();
const Redis = require('ioredis');
const path = require('path');
const fs = require('fs');
const { extractAudio, transcribeAudio } = require('./transcribe');

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
        
        // Placeholder for Plan 2 Database integration
        // 1. Update media status to PROCESSING
        // 2. Fetch media file path from DB
        // 3. Run extractAudio & transcribeAudio
        // 4. Save segments to DB and update media status to TRANSCRIBED
        
        console.log(`[Job Done] Finished processing media ID: ${mediaId}`);
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
