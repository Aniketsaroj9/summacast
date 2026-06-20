import { useState } from 'react';

export default function Uploader() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('');

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setStatus('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setStatus('Please select a file first.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      setStatus('Uploading...');
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Upload failed');
      }

      const data = await response.json();
      setStatus(`Success! File ID: ${data.id}, Status: ${data.status}`);
      setFile(null); // clear file
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
  };

  return (
    <div style={{ border: '1px solid #ccc', padding: '20px', borderRadius: '8px', maxWidth: '400px', margin: '20px auto' }}>
      <h2>Upload Media</h2>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '15px' }}>
          <input
            type="file"
            accept="audio/*,video/*"
            onChange={handleFileChange}
          />
        </div>
        <button type="submit" disabled={!file || status === 'Uploading...'}>
          {status === 'Uploading...' ? 'Uploading...' : 'Upload'}
        </button>
      </form>
      {status && <p style={{ marginTop: '15px', color: status.startsWith('Error') ? 'red' : 'green' }}>{status}</p>}
    </div>
  );
}
