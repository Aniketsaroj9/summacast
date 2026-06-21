import { useState, useRef } from 'react';

export default function Uploader({ onUploadSuccess }) {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('');
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type.startsWith('audio/') || droppedFile.type.startsWith('video/')) {
        setFile(droppedFile);
        setStatus('');
      } else {
        setStatus('Error: Only audio or video files are allowed.');
      }
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setStatus('');
    }
  };

  const onButtonClick = () => {
    fileInputRef.current.click();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setStatus('Error: Please select a file first.');
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
      setStatus(`Success: Upload completed!`);
      setFile(null); // clear file
      
      // Notify parent to refresh list
      if (onUploadSuccess) {
        onUploadSuccess(data);
      }
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div 
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        style={{
          border: '2px dashed',
          borderColor: isDragActive ? 'var(--primary-purple)' : 'var(--border-light)',
          background: isDragActive ? 'rgba(168, 85, 247, 0.04)' : 'rgba(0, 0, 0, 0.15)',
          borderRadius: '12px',
          padding: '24px 16px',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all 0.2s ease-in-out',
        }}
        onClick={onButtonClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,video/*"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        
        {/* Modern Icon Vector */}
        <svg 
          style={{ width: '40px', height: '40px', color: 'var(--text-secondary)', marginBottom: '8px' }} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>

        {file ? (
          <div>
            <p style={{ color: 'var(--text-primary)', fontWeight: '500', fontSize: '0.92rem', wordBreak: 'break-all' }}>
              {file.name}
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '4px' }}>
              {(file.size / (1024 * 1024)).toFixed(2)} MB
            </p>
          </div>
        ) : (
          <div>
            <p style={{ color: 'var(--text-primary)', fontWeight: '500', fontSize: '0.92rem' }}>
              Drag & Drop media here
            </p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: '4px' }}>
              or click to browse files
            </p>
          </div>
        )}
      </div>

      <button 
        type="button" 
        onClick={handleSubmit}
        disabled={!file || status === 'Uploading...'}
        className="btn btn-primary"
        style={{ width: '100%' }}
      >
        {status === 'Uploading...' ? 'Uploading...' : 'Process Media'}
      </button>

      {status && (
        <div 
          className="badge" 
          style={{ 
            display: 'block', 
            textAlign: 'center', 
            borderRadius: '8px', 
            padding: '8px', 
            fontSize: '0.85rem',
            background: status.startsWith('Error') 
              ? 'rgba(244, 63, 94, 0.1)' 
              : status.startsWith('Success') 
                ? 'rgba(16, 185, 129, 0.1)' 
                : 'rgba(99, 102, 241, 0.1)',
            color: status.startsWith('Error') 
              ? '#f87171' 
              : status.startsWith('Success') 
                ? '#34d399' 
                : '#818cf8',
            borderColor: status.startsWith('Error') 
              ? 'rgba(244, 63, 94, 0.2)' 
              : status.startsWith('Success') 
                ? 'rgba(16, 185, 129, 0.2)' 
                : 'rgba(99, 102, 241, 0.2)'
          }}
        >
          {status}
        </div>
      )}
    </div>
  );
}
