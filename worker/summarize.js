const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3:8b';

/**
 * Format seconds to MM:SS or HH:MM:SS format.
 * @param {number} seconds 
 * @returns {string}
 */
function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n) => String(n).padStart(2, '0');
  if (h > 0) {
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  return `${pad(m)}:${pad(s)}`;
}

/**
 * Generate a summary and chapters for the transcript segments using local Ollama.
 * @param {Array<{start: number, end: number, text: string}>} segments 
 * @returns {Promise<{summary: string, chapters: Array<{start_time: number, title: string, summary: string}>}>}
 */
async function generateSummaryAndChapters(segments, signal) {
  if (!segments || segments.length === 0) {
    return { summary: 'No transcript available to summarize.', chapters: [] };
  }

  // 1. Build full transcript text
  const fullTranscript = segments.map(seg => seg.text).join(' ').trim();
  
  // Set a safe character limit for prompt context (e.g. 60,000 characters)
  const truncatedTranscript = fullTranscript.substring(0, 60000);

  console.log(`[Ollama] Generating summary using model ${OLLAMA_MODEL}...`);
  
  let summary = '';
  try {
    const summaryPrompt = `You are an expert content summarizer. Write a concise, comprehensive summary of the following transcript. Keep the summary under 3-4 paragraphs, focusing on key takeaways, main arguments, and important facts.

Transcript:
${truncatedTranscript}

Summary:`;

    const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: summaryPrompt,
        stream: false,
        options: {
          num_ctx: 4096
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama summary response error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    summary = data.response.trim();
    console.log('[Ollama] Summary generation complete.');
  } catch (err) {
    console.error('[Ollama] Failed to generate summary:', err);
    summary = 'Failed to generate summary automatically using local LLM.';
  }

  // 2. Generate Chapters
  console.log('[Ollama] Generating timestamped chapters...');
  let chapters = [];
  try {
    // Format segments into a readable timestamped transcript
    // To avoid bloating prompt size, we select segments at periodic intervals or limit the count if too long
    // If segments list is very long, format every segment, but restrict to first 30,000 chars of formatted list
    let segmentsPromptText = '';
    for (const seg of segments) {
      const line = `[${seg.start.toFixed(2)} / ${formatTime(seg.start)}] ${seg.text.trim()}\n`;
      if (segmentsPromptText.length + line.length > 30000) break;
      segmentsPromptText += line;
    }

    const chaptersPrompt = `Analyze the following transcript segments and group them into logical timestamped chapters.
Return the output as a JSON array of objects. Do not wrap the JSON in markdown formatting. Each object in the array must have the following keys:
- 'start_time': the float timestamp in seconds (exactly or very close to when the chapter starts)
- 'title': a concise, descriptive title for the chapter
- 'summary': a brief 1-2 sentence description of what is discussed in this chapter

Transcript segments:
${segmentsPromptText}

JSON response:`;

    const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: chaptersPrompt,
        format: 'json',
        stream: false,
        options: {
          num_ctx: 4096
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama chapters response error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const cleanResponse = data.response.trim();
    console.log('[Ollama Chapters RAW response]:', cleanResponse);
    
    // Parse the JSON (could be a direct array or wrapped in an object like { chapters: [...] })
    const parsed = JSON.parse(cleanResponse);
    
    // Recursive helper to find the first array in a JSON object structure
    const findFirstArray = (val) => {
      if (!val || typeof val !== 'object') return null;
      if (Array.isArray(val)) return val;
      for (const key of Object.keys(val)) {
        const item = val[key];
        if (Array.isArray(item)) return item;
        if (item && typeof item === 'object') {
          const found = findFirstArray(item);
          if (found) return found;
        }
      }
      return null;
    };

    const firstArray = findFirstArray(parsed);
    if (firstArray) {
      chapters = firstArray;
    } else if (parsed && typeof parsed === 'object') {
      // Check if it's a single chapter object directly
      if (parsed.title || parsed.start_time !== undefined) {
        chapters = [parsed];
      } else {
        throw new Error('Ollama chapters response is an object but contains no array property or chapter fields.');
      }
    } else {
      throw new Error('Ollama chapters response is not an array or object.');
    }
    
    // Validate schema of each chapter object
    chapters = chapters.map((ch, idx) => {
      let startTime = parseFloat(ch.start_time);
      if (isNaN(startTime)) {
        // Fallback to approximate start time if missing or malformed
        startTime = idx === 0 ? 0.0 : segments[Math.min(idx * 5, segments.length - 1)].start;
      }
      return {
        start_time: startTime,
        title: String(ch.title || `Chapter ${idx + 1}`),
        summary: String(ch.summary || '')
      };
    });

    // Ensure they are sorted by start_time
    chapters.sort((a, b) => a.start_time - b.start_time);

    console.log(`[Ollama] Chapter generation complete. Generated ${chapters.length} chapters.`);
  } catch (err) {
    console.error('[Ollama] Failed to generate chapters, using default fallback:', err);
    // Provide a default fallback chapter
    chapters = [
      {
        start_time: 0.0,
        title: 'Introduction',
        summary: 'Podcast audio start and introduction.'
      }
    ];
  }

  return { summary, chapters };
}

module.exports = {
  generateSummaryAndChapters,
  formatTime,
};
