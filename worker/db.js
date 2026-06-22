const { Pool } = require('pg');

// Retrieve database URL from env, and clean up any '+pg8000' driver suffix if present
const connectionString = (
  process.env.DATABASE_URL || 
  'postgresql://summacast_user:summacast_password@localhost:5432/summacast'
).replace('+pg8000', '');

console.log(`Connecting to Postgres DB...`);
const pool = new Pool({
  connectionString: connectionString,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle database client', err);
});

/**
 * Fetch media file details from db.
 * @param {number} mediaId 
 * @returns {Promise<{file_path: string, original_filename: string}|null>}
 */
async function getMediaFile(mediaId) {
  const query = 'SELECT file_path, original_filename FROM media_files WHERE id = $1';
  const { rows } = await pool.query(query, [mediaId]);
  return rows[0] || null;
}

/**
 * Update media record status in db.
 * @param {number} mediaId 
 * @param {string} status 
 */
async function updateMediaStatus(mediaId, status) {
  const query = 'UPDATE media_files SET status = $1 WHERE id = $2';
  await pool.query(query, [status, mediaId]);
}

/**
 * Save transcription segments in bulk within a single transaction.
 * @param {number} mediaId 
 * @param {Array<{start: number, end: number, text: string}>} segments 
 */
async function saveTranscriptSegments(mediaId, segments) {
  if (!segments || segments.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Clear any existing segments first to avoid duplicates on retry
    await client.query('DELETE FROM transcript_segments WHERE media_id = $1', [mediaId]);

    // Build batch insert query:
    // INSERT INTO transcript_segments (media_id, start_time, end_time, text) VALUES ($1, $2, $3, $4), ($5, $6, $7, $8)...
    const values = [];
    const placeholders = [];
    let counter = 1;

    segments.forEach((seg) => {
      placeholders.push(`($${counter}, $${counter + 1}, $${counter + 2}, $${counter + 3})`);
      values.push(mediaId, seg.start, seg.end, seg.text);
      counter += 4;
    });

    const queryText = `
      INSERT INTO transcript_segments (media_id, start_time, end_time, text) 
      VALUES ${placeholders.join(', ')}
    `;

    await client.query(queryText, values);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Save summary and chapters within a single database transaction.
 * @param {number} mediaId 
 * @param {string} summary 
 * @param {Array<{start_time: number, title: string, summary: string}>} chapters 
 */
async function saveSummaryAndChapters(mediaId, summary, chapters) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Clear any existing chapters first to avoid duplicates on retry
    await client.query('DELETE FROM chapters WHERE media_id = $1', [mediaId]);

    // 1. Update Media summary field
    await client.query(
      'UPDATE media_files SET summary = $1 WHERE id = $2',
      [summary, mediaId]
    );

    // 2. Insert chapters if any
    if (chapters && chapters.length > 0) {
      const values = [];
      const placeholders = [];
      let counter = 1;

      chapters.forEach((ch) => {
        placeholders.push(`($${counter}, $${counter + 1}, $${counter + 2}, $${counter + 3})`);
        values.push(mediaId, ch.start_time, ch.title, ch.summary || null);
        counter += 4;
      });

      const queryText = `
        INSERT INTO chapters (media_id, start_time, title, summary) 
        VALUES ${placeholders.join(', ')}
      `;

      await client.query(queryText, values);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  getMediaFile,
  updateMediaStatus,
  saveTranscriptSegments,
  saveSummaryAndChapters,
};

