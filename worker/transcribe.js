require('dotenv').config();
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const os = require('os');

// Set ffmpeg path if it's installed via winget or custom location
if (process.env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
}

/**
 * Extract audio from video or audio file and resample to 16kHz mono WAV PCM.
 * @param {string} inputPath - Path to input media file
 * @param {string} outputPath - Path to save the extracted 16kHz mono WAV file
 * @returns {Promise<string>} - Resolves to the outputPath
 */
function extractAudio(inputPath, outputPath, onSpawn) {
  return new Promise((resolve, reject) => {
    console.log(`Extracting and downsampling audio: ${inputPath} -> ${outputPath}`);
    const command = ffmpeg(inputPath)
      .noVideo()
      .audioCodec('pcm_s16le')
      .audioChannels(1)
      .audioFrequency(16000)
      .toFormat('wav')
      .on('start', (commandLine) => {
        console.log('Spawned Ffmpeg with command: ' + commandLine);
      })
      .on('end', () => {
        console.log('Audio extraction finished successfully.');
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error('Error during audio extraction:', err);
        reject(err);
      });

    if (onSpawn) {
      onSpawn(command);
    }
    command.save(outputPath);
  });
}

/**
 * Runs whisper.cpp binary to transcribe a 16kHz WAV file, generating a JSON output.
 * @param {string} audioPath - Path to 16kHz mono WAV file
 * @param {string} modelPath - Path to ggml model (.bin)
 * @param {string} outputBase - Base path for output files (no extension)
 * @returns {Promise<Array>} - Resolves to array of segments: { start: float, end: float, text: string }
 */
function transcribeAudio(audioPath, modelPath, outputBase, onSpawn) {
  return new Promise((resolve, reject) => {
    // Determine whisper executable path
    const baseDir = path.dirname(__dirname);
    const exePath = path.join(baseDir, 'worker', 'bin', 'main.exe');
    
    // Command flags:
    // -m: model path
    // -f: input WAV file
    // -oj: output JSON format
    // -of: output file path (without extension)
    // -nt: no timestamps in stdout
    // -np: no prints of other info
    // Determine CPU threads (leaving 1 thread free for system responsiveness)
    const threads = Math.max(1, os.cpus().length - 1);

    const args = [
      '-m', modelPath,
      '-f', audioPath,
      '-t', String(threads),
      '-oj',
      '-of', outputBase,
      '-nt',
      '-np'
    ];

    console.log(`Spawning transcription: ${exePath} ${args.join(' ')}`);
    
    const child = spawn(exePath, args);
    if (onSpawn) {
      onSpawn(child);
    }
    let stderr = '';

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      console.error('Failed to start whisper process:', err);
      reject(err);
    });

    child.on('close', async (code) => {
      if (code !== 0) {
        console.error(`Whisper process exited with code ${code}. Stderr: ${stderr}`);
        return reject(new Error(`whisper-cli exited with code ${code}: ${stderr}`));
      }

      const jsonPath = `${outputBase}.json`;
      console.log(`whisper.cpp finished. Reading JSON results from ${jsonPath}`);
      
      try {
        if (!fs.existsSync(jsonPath)) {
          throw new Error(`JSON output file not found at ${jsonPath}`);
        }

        const rawData = fs.readFileSync(jsonPath, 'utf8');
        const parsed = JSON.parse(rawData);
        
        let segments = [];
        // whisper.cpp versions can output structure under result.transcription or transcription array
        const rawSegments = parsed.transcription || (parsed.result && parsed.result.transcription);
        
        if (Array.isArray(rawSegments)) {
          segments = rawSegments.map(seg => {
            const startMs = (seg.offsets && seg.offsets.from) || 0;
            const endMs = (seg.offsets && seg.offsets.to) || 0;
            return {
              start: parseFloat((startMs / 1000).toFixed(3)),
              end: parseFloat((endMs / 1000).toFixed(3)),
              text: (seg.text || '').trim()
            };
          });
        } else {
          console.warn('Unexpected JSON structure from whisper:', parsed);
        }

        // Clean up temporary wav and json files
        fs.unlinkSync(audioPath);
        fs.unlinkSync(jsonPath);
        
        console.log(`Successfully transcribed ${segments.length} segments.`);
        resolve(segments);
      } catch (err) {
        // Clean up on failure
        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
        if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
        reject(err);
      }
    });
  });
}

module.exports = {
  extractAudio,
  transcribeAudio
};
