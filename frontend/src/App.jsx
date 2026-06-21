import { useState, useEffect, useRef } from 'react';
import Uploader from './components/Uploader';

export default function App() {
  const [mediaList, setMediaList] = useState([]);
  const [currentMediaId, setCurrentMediaId] = useState(null);
  const [selectedMedia, setSelectedMedia] = useState(null);
  
  // Detail states
  const [detailSummary, setDetailSummary] = useState(null);
  const [detailChapters, setDetailChapters] = useState([]);
  const [detailTranscript, setDetailTranscript] = useState([]);
  
  // Navigation & Interactive states
  const [activeTab, setActiveTab] = useState('transcript');
  const [activeSegmentId, setActiveSegmentId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Chat States
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  
  // Loading & Error States
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState('');

  const mediaRef = useRef(null);
  const chatEndRef = useRef(null);

  // Fetch initial media list
  useEffect(() => {
    fetchMediaList();
  }, []);

  const fetchMediaList = async () => {
    try {
      const res = await fetch('/api/media');
      if (!res.ok) throw new Error('Failed to fetch media list');
      const data = await res.json();
      setMediaList(data);
    } catch (err) {
      console.error('Error fetching media list:', err);
    }
  };

  // Polling for processing items inside Dashboard
  useEffect(() => {
    const hasProcessing = mediaList.some(item => 
      ['UPLOADED', 'PROCESSING', 'SUMMARIZING'].includes(item.status)
    );

    if (hasProcessing) {
      const interval = setInterval(() => {
        fetchMediaList();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [mediaList]);

  // Polling active item status inside Detail View
  useEffect(() => {
    if (!currentMediaId || !selectedMedia) return;

    const isProcessing = ['UPLOADED', 'PROCESSING', 'SUMMARIZING'].includes(selectedMedia.status);

    if (isProcessing) {
      const interval = setInterval(async () => {
        try {
          const res = await fetch('/api/media');
          if (res.ok) {
            const data = await res.json();
            setMediaList(data);
            const updatedItem = data.find(m => m.id === currentMediaId);
            if (updatedItem) {
              setSelectedMedia(updatedItem);
              if (updatedItem.status === 'COMPLETED') {
                fetchDetails(currentMediaId);
              }
            }
          }
        } catch (err) {
          console.error('Polling error:', err);
        }
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [currentMediaId, selectedMedia]);

  // Scroll to bottom of chat
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isChatLoading]);

  // Scroll transcript to active segment
  useEffect(() => {
    if (activeSegmentId) {
      const activeEl = document.getElementById(`seg-${activeSegmentId}`);
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [activeSegmentId]);

  const fetchDetails = async (id) => {
    setIsLoadingDetail(true);
    setDetailError('');
    try {
      const [summaryRes, transcriptRes] = await Promise.all([
        fetch(`/api/media/${id}/summary`),
        fetch(`/api/media/${id}/transcript`)
      ]);

      if (!summaryRes.ok || !transcriptRes.ok) {
        throw new Error('Failed to load media details.');
      }

      const summaryData = await summaryRes.json();
      const transcriptData = await transcriptRes.json();

      setDetailSummary(summaryData.summary);
      setDetailChapters(summaryData.chapters || []);
      setDetailTranscript(transcriptData.segments || []);
    } catch (err) {
      setDetailError(err.message);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleCardClick = (item) => {
    setCurrentMediaId(item.id);
    setSelectedMedia(item);
    setChatMessages([]);
    setChatInput('');
    setChatError('');
    setActiveSegmentId(null);
    setIsPlaying(false);
    
    if (item.status === 'COMPLETED') {
      fetchDetails(item.id);
    }
  };

  const handleBack = () => {
    setCurrentMediaId(null);
    setSelectedMedia(null);
    setDetailSummary(null);
    setDetailChapters([]);
    setDetailTranscript([]);
    fetchMediaList();
  };

  const handleSeek = (time) => {
    if (mediaRef.current) {
      mediaRef.current.currentTime = time;
      mediaRef.current.play().catch(err => console.log('Autoplay blocked:', err));
      setIsPlaying(true);
    }
  };

  const handleTimeUpdate = () => {
    if (!mediaRef.current || detailTranscript.length === 0) return;
    const currentTime = mediaRef.current.currentTime;
    
    // Find matching segment
    const activeSeg = detailTranscript.find(
      seg => currentTime >= seg.start && currentTime <= seg.end
    );
    
    if (activeSeg && activeSeg.id !== activeSegmentId) {
      setActiveSegmentId(activeSeg.id);
    }
  };

  const handleSendChat = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;

    const userMsg = chatInput.trim();
    setChatMessages(prev => [...prev, { sender: 'user', text: userMsg }]);
    setChatInput('');
    setIsChatLoading(true);
    setChatError('');

    try {
      const response = await fetch(`/api/media/${currentMediaId}/qa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: userMsg })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Q&A request failed');
      }

      const data = await response.json();
      setChatMessages(prev => [...prev, { sender: 'ai', text: data.answer }]);
    } catch (err) {
      setChatError(err.message);
    } finally {
      setIsChatLoading(false);
    }
  };

  const formatTime = (seconds) => {
    if (seconds == null || isNaN(seconds)) return '00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    const paddedMins = mins.toString().padStart(2, '0');
    const paddedSecs = secs.toString().padStart(2, '0');
    
    if (hrs > 0) {
      return `${hrs}:${paddedMins}:${paddedSecs}`;
    }
    return `${paddedMins}:${paddedSecs}`;
  };

  return (
    <div>
      <style>{`
        @keyframes dance {
          0%, 100% { height: 8px; }
          50% { height: 32px; }
        }
        .wave-bar {
          display: inline-block;
          width: 4px;
          height: 8px;
          background: var(--primary-purple);
          border-radius: 2px;
          margin: 0 2px;
          transition: height 0.2s ease;
        }
        .wave-bar.playing {
          animation: dance 1s ease-in-out infinite;
        }
        .wave-bar:nth-child(1) { animation-delay: 0.1s; }
        .wave-bar:nth-child(2) { animation-delay: 0.3s; }
        .wave-bar:nth-child(3) { animation-delay: 0.5s; }
        .wave-bar:nth-child(4) { animation-delay: 0.2s; }
        .wave-bar:nth-child(5) { animation-delay: 0.4s; }
        .wave-bar:nth-child(6) { animation-delay: 0.15s; }
        .wave-bar:nth-child(7) { animation-delay: 0.35s; }
      `}</style>

      {/* Futuristic Glow Header */}
      <header style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        paddingBottom: '20px', 
        borderBottom: '1px solid var(--border-light)',
        marginBottom: '20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            background: 'var(--primary-gradient)',
            borderRadius: '10px',
            padding: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(168, 85, 247, 0.3)'
          }}>
            <svg style={{ width: '24px', height: '24px', color: 'white' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <div>
            <h1>SummaCast</h1>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              AI Podcast & Video Intelligence Platform
            </p>
          </div>
        </div>
      </header>

      {/* DASHBOARD VIEW */}
      {!currentMediaId && (
        <div className="dashboard-grid">
          {/* Left panel: Upload & Stats */}
          <div className="glass-panel" style={{ padding: '24px', height: 'fit-content' }}>
            <h2 style={{ marginBottom: '16px', fontSize: '1.25rem' }}>Upload Project</h2>
            <p style={{ fontSize: '0.88rem', marginBottom: '20px' }}>
              Upload any podcast audio or video file. Our Whisper engine will transcribe it, and Qwen3 will automatically partition it into key chapters and produce a smart summary.
            </p>
            <Uploader onUploadSuccess={fetchMediaList} />
          </div>

          {/* Right panel: Projects Grid */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h2 style={{ marginBottom: '20px', fontSize: '1.25rem' }}>Projects Repository</h2>
            
            {mediaList.length === 0 ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '60px 20px',
                textAlign: 'center',
                borderRadius: '12px',
                border: '1px dashed var(--border-light)',
                background: 'rgba(255, 255, 255, 0.01)'
              }}>
                <svg style={{ width: '48px', height: '48px', color: 'var(--text-muted)', marginBottom: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <h3 style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>No Projects Uploaded Yet</h3>
                <p style={{ fontSize: '0.82rem', maxWidth: '320px', marginTop: '6px' }}>
                  Use the uploader on the left to start analyzing your first podcast or presentation.
                </p>
              </div>
            ) : (
              <div className="cards-container">
                {mediaList.map((item) => {
                  const isVideo = item.filename.toLowerCase().endsWith('.mp4') || 
                                  item.filename.toLowerCase().endsWith('.webm');
                  return (
                    <div 
                      key={item.id} 
                      className="glass-panel glass-panel-hover" 
                      style={{ 
                        padding: '20px', 
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        minHeight: '180px'
                      }}
                      onClick={() => handleCardClick(item)}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                          <div style={{ 
                            background: isVideo ? 'rgba(99, 102, 241, 0.1)' : 'rgba(168, 85, 247, 0.1)',
                            borderRadius: '8px',
                            padding: '6px',
                            display: 'inline-flex'
                          }}>
                            {isVideo ? (
                              <svg style={{ width: '18px', height: '18px', color: 'var(--primary-indigo)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            ) : (
                              <svg style={{ width: '18px', height: '18px', color: 'var(--primary-purple)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                              </svg>
                            )}
                          </div>
                          
                          <span className={`badge badge-${item.status.toLowerCase()}`}>
                            {item.status}
                          </span>
                        </div>
                        
                        <h3 
                          style={{ 
                            fontSize: '0.98rem', 
                            lineHeight: '1.4', 
                            marginBottom: '8px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }} 
                          title={item.filename}
                        >
                          {item.filename}
                        </h3>
                        
                        <p style={{ fontSize: '0.8rem', margin: 0, display: '-webkit-box', WebkitLineClamp: '2', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {item.summary || (item.status === 'FAILED' ? 'Processing failed. Please check logs.' : 'Transcription & chapters processing in progress...')}
                        </p>
                      </div>
                      
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between', 
                        marginTop: '16px',
                        borderTop: '1px solid var(--border-light)',
                        paddingTop: '12px'
                      }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Project #{item.id}</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--primary-purple)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {item.status === 'COMPLETED' ? 'View Insights' : 'Monitor Progress'}
                          <svg style={{ width: '12px', height: '12px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                          </svg>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* DETAIL PROJECT VIEW */}
      {currentMediaId && selectedMedia && (
        <div>
          {/* Back Action Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <button onClick={handleBack} className="btn btn-secondary">
              <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Dashboard
            </button>
            <span style={{ color: 'var(--text-muted)' }}>/</span>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Project Insights</span>
          </div>

          {/* Project Details Banner */}
          <div className="glass-panel" style={{ padding: '20px 24px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <span style={{ fontSize: '0.72rem', color: 'var(--primary-purple)', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.08em' }}>
                {selectedMedia.filename.toLowerCase().endsWith('.mp4') || selectedMedia.filename.toLowerCase().endsWith('.webm') ? 'Video Asset' : 'Audio Podcast'}
              </span>
              <h2 style={{ marginTop: '2px', fontSize: '1.4rem' }}>{selectedMedia.filename}</h2>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span className={`badge badge-${selectedMedia.status.toLowerCase()}`}>
                {selectedMedia.status}
              </span>
            </div>
          </div>

          {/* If the project failed */}
          {selectedMedia.status === 'FAILED' && (
            <div className="glass-panel" style={{ padding: '40px 24px', textAlign: 'center', borderColor: 'rgba(244, 63, 94, 0.3)', background: 'rgba(244, 63, 94, 0.02)' }}>
              <svg style={{ width: '48px', height: '48px', color: 'var(--primary-rose)', marginBottom: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h3 style={{ color: 'var(--text-primary)', marginBottom: '8px' }}>Project AI Processing Failed</h3>
              <p style={{ color: 'var(--text-secondary)', maxWidth: '500px', margin: '0 auto 20px', fontSize: '0.9rem' }}>
                We encountered an error during audio extraction, transcription, or summarization. Please make sure the media file is valid, contains clear speech, and is uploaded correctly.
              </p>
              <button onClick={handleBack} className="btn btn-secondary">
                Return to Dashboard
              </button>
            </div>
          )}

          {/* If the project is actively processing */}
          {['UPLOADED', 'PROCESSING', 'SUMMARIZING'].includes(selectedMedia.status) && (
            <div className="glass-panel" style={{ padding: '60px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ position: 'relative', width: '80px', height: '80px', marginBottom: '24px' }}>
                {/* Pulsing Outer Ring */}
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  border: '3px solid var(--primary-purple)',
                  borderRadius: '50%',
                  opacity: 0.1,
                  animation: 'pulse-purple 2.5s infinite ease-in-out'
                }} />
                {/* Rotating Inner Segment */}
                <div style={{
                  position: 'absolute',
                  inset: '8px',
                  border: '3px solid transparent',
                  borderTopColor: 'var(--primary-indigo)',
                  borderRightColor: 'var(--primary-purple)',
                  borderRadius: '50%',
                  animation: 'spin 1.2s infinite linear'
                }} />
                <style>{`
                  @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                  }
                `}</style>
              </div>

              <h3 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>Processing Project Media</h3>
              <p style={{ color: 'var(--text-secondary)', maxWidth: '480px', margin: '0 auto 24px', fontSize: '0.9rem', lineHeight: '1.5' }}>
                {selectedMedia.status === 'UPLOADED' && 'Media received. Queueing transcription workflow...'}
                {selectedMedia.status === 'PROCESSING' && 'Whisper AI is transcribing the podcast speech to text. This may take a minute or two...'}
                {selectedMedia.status === 'SUMMARIZING' && 'Speech transcript successfully extracted! Summarizing and generating logical chapters with local Qwen3 LLM...'}
              </p>

              <div style={{ display: 'flex', gap: '16px', fontSize: '0.8rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-light)', paddingTop: '20px', width: '100%', maxWidth: '400px', justifyContent: 'space-around' }}>
                <span style={{ color: selectedMedia.status === 'UPLOADED' ? 'var(--primary-indigo)' : 'var(--text-secondary)', fontWeight: selectedMedia.status === 'UPLOADED' ? '600' : '400' }}>1. Uploaded</span>
                <span>→</span>
                <span style={{ color: selectedMedia.status === 'PROCESSING' ? 'var(--primary-indigo)' : 'var(--text-secondary)', fontWeight: selectedMedia.status === 'PROCESSING' ? '600' : '400' }}>2. Transcribing</span>
                <span>→</span>
                <span style={{ color: selectedMedia.status === 'SUMMARIZING' ? 'var(--primary-indigo)' : 'var(--text-secondary)', fontWeight: selectedMedia.status === 'SUMMARIZING' ? '600' : '400' }}>3. Summarizing</span>
              </div>
            </div>
          )}

          {/* Completed Project View */}
          {selectedMedia.status === 'COMPLETED' && (
            <div className="detail-grid">
              {/* Left Column: Player & Q&A */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                
                {/* Media Player wrapper */}
                <div className="player-wrapper">
                  {isLoadingDetail ? (
                    <div style={{ height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Loading media streaming source...</p>
                    </div>
                  ) : (
                    <div>
                      {selectedMedia.filename.toLowerCase().endsWith('.mp4') || selectedMedia.filename.toLowerCase().endsWith('.webm') ? (
                        <video 
                          ref={mediaRef} 
                          src={`/api/media/${selectedMedia.id}/file`} 
                          className="media-player-element" 
                          controls
                          onTimeUpdate={handleTimeUpdate}
                          onPlay={() => setIsPlaying(true)}
                          onPause={() => setIsPlaying(false)}
                          onEnded={() => setIsPlaying(false)}
                        />
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                          <div style={{ 
                            height: '120px', 
                            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(168, 85, 247, 0.08))',
                            borderRadius: '10px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1px solid rgba(255, 255, 255, 0.03)',
                            position: 'relative',
                            overflow: 'hidden'
                          }}>
                            <div style={{
                              position: 'absolute',
                              width: '100px',
                              height: '100px',
                              background: 'var(--primary-purple)',
                              filter: 'blur(30px)',
                              opacity: isPlaying ? 0.25 : 0.08,
                              transition: 'all 0.5s ease',
                              zIndex: 0
                            }} />
                            
                            <svg style={{ width: '40px', height: '40px', color: 'var(--primary-purple)', zIndex: 1, marginBottom: '12px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                            </svg>
                            
                            <div style={{ zIndex: 1, display: 'flex', gap: '3px', height: '24px', alignItems: 'center' }}>
                              <span className={`wave-bar ${isPlaying ? 'playing' : ''}`}></span>
                              <span className={`wave-bar ${isPlaying ? 'playing' : ''}`}></span>
                              <span className={`wave-bar ${isPlaying ? 'playing' : ''}`}></span>
                              <span className={`wave-bar ${isPlaying ? 'playing' : ''}`}></span>
                              <span className={`wave-bar ${isPlaying ? 'playing' : ''}`}></span>
                              <span className={`wave-bar ${isPlaying ? 'playing' : ''}`}></span>
                              <span className={`wave-bar ${isPlaying ? 'playing' : ''}`}></span>
                            </div>
                          </div>

                          <audio 
                            ref={mediaRef} 
                            src={`/api/media/${selectedMedia.id}/file`} 
                            className="media-player-element" 
                            controls
                            onTimeUpdate={handleTimeUpdate}
                            onPlay={() => setIsPlaying(true)}
                            onPause={() => setIsPlaying(false)}
                            onEnded={() => setIsPlaying(false)}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Executive Summary */}
                <div className="glass-panel" style={{ padding: '20px' }}>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: '1.1rem' }}>
                    <svg style={{ width: '20px', height: '20px', color: 'var(--primary-purple)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    AI Executive Summary
                  </h3>
                  {isLoadingDetail ? (
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Loading AI summary...</p>
                  ) : (
                    <p style={{ fontSize: '0.95rem', margin: 0, whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
                      {detailSummary || 'No summary available.'}
                    </p>
                  )}
                </div>

                {/* Interactive Q&A Panel */}
                <div className="glass-panel" style={{ padding: '20px' }}>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: '1.1rem' }}>
                    <svg style={{ width: '20px', height: '20px', color: 'var(--primary-indigo)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    Interactive Q&A Assistant
                  </h3>
                  
                  <div className="chat-container">
                    <div className="chat-messages">
                      <div className="chat-bubble chat-bubble-ai">
                        Hello! I have fully indexed this media file's transcript. Ask me any questions about the content, specific topics discussed, or summaries of segments!
                      </div>
                      
                      {chatMessages.map((msg, index) => (
                        <div 
                          key={index} 
                          className={`chat-bubble ${msg.sender === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'}`}
                        >
                          {msg.text}
                        </div>
                      ))}
                      
                      {isChatLoading && (
                        <div className="chat-bubble chat-bubble-ai" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                          <span className="badge badge-processing" style={{ width: '10px', height: '10px', padding: 0, borderRadius: '50%' }}></span>
                          AI is reading transcript...
                        </div>
                      )}

                      {chatError && (
                        <div className="chat-bubble chat-bubble-ai" style={{ borderLeftColor: 'var(--primary-rose)', color: '#f87171' }}>
                          Error: {chatError}
                        </div>
                      )}

                      <div ref={chatEndRef} />
                    </div>
                    
                    <form onSubmit={handleSendChat} className="chat-input-wrapper">
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="Ask a question about the audio/video context..."
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        disabled={isChatLoading || isLoadingDetail}
                      />
                      <button 
                        type="submit" 
                        className="btn btn-primary"
                        disabled={!chatInput.trim() || isChatLoading || isLoadingDetail}
                      >
                        Send
                      </button>
                    </form>
                  </div>
                </div>

              </div>

              {/* Right Column: Tabs (Transcript & Chapters) */}
              <div className="glass-panel" style={{ padding: '20px', height: '640px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div className="tabs-nav">
                  <button 
                    className={`tab-btn ${activeTab === 'transcript' ? 'active' : ''}`}
                    onClick={() => setActiveTab('transcript')}
                  >
                    Transcript
                  </button>
                  <button 
                    className={`tab-btn ${activeTab === 'chapters' ? 'active' : ''}`}
                    onClick={() => setActiveTab('chapters')}
                  >
                    Chapters
                  </button>
                </div>

                {isLoadingDetail ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Loading transcription indexing...</p>
                  </div>
                ) : (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    
                    {/* Transcript Tab list */}
                    {activeTab === 'transcript' && (
                      <div className="transcript-list" style={{ flex: 1, overflowY: 'auto' }}>
                        {detailTranscript.length === 0 ? (
                          <div style={{ padding: '40px 10px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            No transcription segments available.
                          </div>
                        ) : (
                          detailTranscript.map((seg) => (
                            <div 
                              key={seg.id} 
                              id={`seg-${seg.id}`}
                              className={`transcript-item ${activeSegmentId === seg.id ? 'active' : ''}`}
                              onClick={() => handleSeek(seg.start)}
                            >
                              <div className="transcript-timestamp">{formatTime(seg.start)}</div>
                              <div className="transcript-text">{seg.text}</div>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {/* Chapters Tab list */}
                    {activeTab === 'chapters' && (
                      <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
                        {detailChapters.length === 0 ? (
                          <div style={{ padding: '40px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            No chapters generated for this media.
                          </div>
                        ) : (
                          detailChapters.map((ch) => (
                            <div 
                              key={ch.id} 
                              className="chapter-item"
                              onClick={() => handleSeek(ch.start_time)}
                            >
                              <div className="chapter-header">
                                <span className="chapter-title">{ch.title}</span>
                                <span className="chapter-time">{formatTime(ch.start_time)}</span>
                              </div>
                              {ch.summary && <div className="chapter-desc">{ch.summary}</div>}
                            </div>
                          ))
                        )}
                      </div>
                    )}

                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      )}
    </div>
  );
}
