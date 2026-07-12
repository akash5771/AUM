'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function Dashboard() {
  const router = useRouter();
  
  // Core Data States
  const [profile, setProfile] = useState(null);
  const [context, setContext] = useState(null);
  const [actions, setActions] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [virtualTime, setVirtualTime] = useState(null);
  const [currentTimeDisplay, setCurrentTimeDisplay] = useState('');
  
  // Interaction/UI States
  const [expandedActionId, setExpandedActionId] = useState(null);
  const [showMoves, setShowMoves] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingContext, setIsUpdatingContext] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [timeSelectorOpen, setTimeSelectorOpen] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  
  // Daily Context Logging States
  const [sleepHours, setSleepHours] = useState(7.0);
  const [sleepQuality, setSleepQuality] = useState('good');
  const [mentalEnergy, setMentalEnergy] = useState(7);
  const [physicalEnergy, setPhysicalEnergy] = useState(7);
  const [socialEnergy, setSocialEnergy] = useState(7);
  const [creativeEnergy, setCreativeEnergy] = useState(7);
  const [creationStory, setCreationStory] = useState('');
  const [consumptionStory, setConsumptionStory] = useState('');
  const [weatherOutlook, setWeatherOutlook] = useState('Clear');

  // Refs
  const chatScrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const confettiSystemRef = useRef(null);

  // Quick Chat Nudges (Momentum Moments)
  const reflectionChips = [
    "Today's been horrible.",
    "Walk for three minutes.",
    "Acknowledge a small win!",
    "Ignored: Read a 3-minute article"
  ];

  // Fetch all initial data
  useEffect(() => {
    fetchAllData();
  }, []);

  // Sync Confetti Particle System
  useEffect(() => {
    if (canvasRef.current) {
      confettiSystemRef.current = new ConfettiEffect(canvasRef.current);
      const handleResize = () => {
        if (canvasRef.current) {
          canvasRef.current.width = window.innerWidth;
          canvasRef.current.height = window.innerHeight;
        }
      };
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, [profile]);

  // Auto-scroll chat history
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatHistory, isSendingChat, actions]);

  // Route to onboarding if not completed
  useEffect(() => {
    if (profile && !profile.onboarding_completed) {
      router.push('/onboarding');
    }
  }, [profile, router]);

  const fetchAllData = async () => {
    setIsLoading(true);
    try {
      // 1. Profile
      const pRes = await fetch('/api/profile');
      const pData = await pRes.json();
      setProfile(pData);

      if (pData && pData.name && pData.onboarding_completed) {
        // 2. Time Travel Info
        const tRes = await fetch('/api/time-travel');
        const tData = await tRes.json();
        setVirtualTime(tData.virtual_time);
        formatTimeDisplay(tData.current_time);

        // 3. Context Logs
        const cRes = await fetch('/api/context');
        const cData = await cRes.json();
        setContext(cData);
        syncContextForm(cData);

        // 4. Actions
        const aRes = await fetch('/api/actions');
        const aData = await aRes.json();
        setActions(aData);
        
        // 5. Chat History Logs (Life Feed)
        const fullDbRes = await fetch('/api/chat');
        const chatData = await fullDbRes.json();
        setChatHistory(chatData);
      }
    } catch (e) {
      console.error("Failed to load dashboard data:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const formatTimeDisplay = (isoStr) => {
    const d = new Date(isoStr);
    const options = { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    setCurrentTimeDisplay(d.toLocaleDateString('en-US', options));
  };

  const syncContextForm = (cData) => {
    setSleepHours(cData.sleep?.hours || 7.0);
    setSleepQuality(cData.sleep?.quality || 'good');
    setMentalEnergy(cData.energies?.mental || 7);
    setPhysicalEnergy(cData.energies?.physical || 7);
    setSocialEnergy(cData.energies?.social || 7);
    setCreativeEnergy(cData.energies?.creative || 7);
    setCreationStory(cData.creation_story || '');
    setConsumptionStory(cData.consumption_story || '');
    setWeatherOutlook(cData.environmental?.weather || 'Clear');
  };

  const handleSaveContext = async (e) => {
    e.preventDefault();
    setIsUpdatingContext(true);
    try {
      const res = await fetch('/api/context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sleep: { hours: parseFloat(sleepHours), quality: sleepQuality },
          mood: { rating: 5, state: 'clear' },
          energies: {
            mental: parseInt(mentalEnergy),
            physical: parseInt(physicalEnergy),
            social: parseInt(socialEnergy),
            creative: parseInt(creativeEnergy)
          },
          creation_story: creationStory,
          consumption_story: consumptionStory,
          environmental: { weather: weatherOutlook }
        })
      });

      const updatedContext = await res.json();
      setContext(updatedContext);

      // Refresh actions and chats
      const actRes = await fetch('/api/actions');
      const actData = await actRes.json();
      setActions(actData);

      const chRes = await fetch('/api/chat');
      const chData = await chRes.json();
      setChatHistory(chData);
      
      // Update profile
      const pRes = await fetch('/api/profile');
      const pData = await pRes.json();
      setProfile(pData);
    } catch (e) {
      console.error(e);
    } finally {
      setIsUpdatingContext(false);
    }
  };

  const handleToggleAction = async (actionId, currentStatus) => {
    let nextStatus = 'todo';
    if (currentStatus === 'todo') {
      nextStatus = 'done';
      triggerConfettiBlast(50);
    } else if (currentStatus === 'done') {
      nextStatus = 'skipped';
    }

    try {
      const res = await fetch('/api/actions/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId, status: nextStatus })
      });
      const data = await res.json();
      setActions(data.actions || []);
      setProfile(data.profile || profile);
      setChatHistory(data.chat_history || chatHistory);

      // Check for clean sweep
      if (data.actions && data.actions.every(a => a.status === 'done')) {
        triggerConfettiBlast(200);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRateAction = async (actionId, rating) => {
    try {
      const res = await fetch('/api/actions/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId, status: 'done', rating })
      });
      const data = await res.json();
      setActions(data.actions || []);
      setProfile(data.profile || profile);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSendChatMessage = async (textOverride) => {
    const text = textOverride || chatInput;
    if (!text.trim() || isSendingChat) return;

    setIsSendingChat(true);
    if (!textOverride) setChatInput('');

    // Optimistically update frontend history to show user's message immediately
    setChatHistory(prev => [
      ...prev,
      {
        sender: 'User',
        text: text,
        timestamp: new Date().toISOString()
      }
    ]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
      
      if (!res.ok) throw new Error("API call failed");

      // Append an empty companion bubble that we will stream text into
      setChatHistory(prev => [...prev, { sender: 'AUM', text: '', timestamp: new Date().toISOString() }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const token = trimmed.slice(6);
            accumulated += token;
            setChatHistory(prev => {
              const updated = [...prev];
              if (updated.length > 0) {
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  text: accumulated
                };
              }
              return updated;
            });
          }
        }
      }

      // Sync profile/actions
      const pRes = await fetch('/api/profile');
      const pData = await pRes.json();
      setProfile(pData);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSendingChat(false);
    }
  };

  const handlePhotoUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploadingPhoto(true);
    const formData = new FormData();
    formData.append('files', files[0]);

    try {
      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      const uploadData = await uploadRes.json();
      const mediaUrl = uploadData.urls?.[0];

      if (mediaUrl) {
        // Send photo post message
        await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: "Shared a photo",
            type: "photo",
            mediaUrl: mediaUrl
          })
        });

        // Refresh chat history
        const chRes = await fetch('/api/chat');
        const chData = await chRes.json();
        setChatHistory(chData);
      }
    } catch (err) {
      console.error("Failed to upload photo:", err);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleTimeTravel = async (action, value) => {
    try {
      const res = await fetch('/api/time-travel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, value })
      });
      const data = await res.json();
      setVirtualTime(data.virtual_time);
      formatTimeDisplay(data.current_time);

      if (data.dayTransitionCrossed) {
        alert("⏰ 6 AM day boundary crossed! Transition summary generated. Uncompleted tasks expired.");
        fetchAllData();
      } else {
        const cRes = await fetch('/api/context');
        const cData = await cRes.json();
        setContext(cData);
        syncContextForm(cData);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleFullReset = async () => {
    if (confirm("🚨 WARNING: Wipe entire session? This deletes all data.")) {
      const res = await fetch('/api/profile/reset', { method: 'POST' });
      if (res.ok) window.location.reload();
    }
  };

  const triggerConfettiBlast = (count) => {
    if (confettiSystemRef.current) {
      confettiSystemRef.current.start(count);
    }
  };


  // Loading Screen
  if (isLoading || !profile || !context) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p style={{ marginTop: '1.5rem', color: 'var(--text-secondary)' }}>Synchronizing Life Momentum Matrix...</p>
      </div>
    );
  }

  // Calculate month dividers helper
  const renderChatHistoryWithMonthDividers = () => {
    const list = [];
    let lastMonthYear = "";

    chatHistory.forEach((bubble, idx) => {
      if (bubble.timestamp) {
        const d = new Date(bubble.timestamp);
        const monthYear = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
        
        if (monthYear !== lastMonthYear) {
          lastMonthYear = monthYear;
          list.push(
            <div key={`month-${monthYear}`} style={styles.monthHeader}>
              <span style={styles.monthHeaderSpan}>{monthYear}</span>
            </div>
          );
        }
      }

      // Render system vs chat vs photo logs
      if (bubble.type === 'activity_completion') {
        list.push(
          <div key={`sys-${idx}`} style={styles.systemLogMessage}>
            <span style={styles.systemLogSpan}>{bubble.text}</span>
          </div>
        );
      } else if (bubble.type === 'activity_rejection') {
        list.push(
          <div key={`sys-${idx}`} style={styles.systemLogMessage}>
            <span style={{ ...styles.systemLogSpan, color: '#f59e0b', background: 'rgba(245,158,11,0.05)', borderColor: 'rgba(245,158,11,0.1)' }}>{bubble.text}</span>
          </div>
        );
      } else {
        const isUser = bubble.sender === 'User';
        list.push(
          <div 
            key={`chat-${idx}`} 
            style={{
              ...styles.bubbleWrapper,
              justifyContent: isUser ? 'flex-end' : 'flex-start'
            }}
          >
            <div style={{
              ...styles.bubble,
              background: isUser ? 'linear-gradient(135deg, #128c7e 0%, #075e54 100%)' : 'rgba(255,255,255,0.04)',
              border: isUser ? 'none' : '1px solid rgba(255,255,255,0.08)',
              borderBottomRightRadius: isUser ? '0.15rem' : '0.85rem',
              borderBottomLeftRadius: isUser ? '0.85rem' : '0.15rem',
            }}>
              <div style={{ 
                fontSize: '0.65rem', 
                fontWeight: '700', 
                marginBottom: '0.2rem', 
                color: isUser ? '#25d366' : '#a855f7',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                {isUser ? 'YOU' : (profile.companion_name || 'AUM').toUpperCase()}
              </div>

              {bubble.type === 'photo' && bubble.mediaUrl ? (
                <div style={styles.photoContainer}>
                  <img src={bubble.mediaUrl} alt="Shared memory" style={styles.photoImg} />
                  <p style={{ ...styles.bubbleText, marginTop: '0.5rem' }}>{bubble.text}</p>
                </div>
              ) : (
                <span style={styles.bubbleText}>{bubble.text}</span>
              )}
            </div>
          </div>
        );
      }
    });

    // Append typing indicator bubble at the end of history if currently sending/generating chat
    if (isSendingChat) {
      list.push(
        <div 
          key="typing-indicator-bubble" 
          style={{
            ...styles.bubbleWrapper,
            justifyContent: 'flex-start'
          }}
        >
          <div style={{
            ...styles.bubble,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderBottomRightRadius: '0.85rem',
            borderBottomLeftRadius: '0.15rem',
          }}>
            <div style={{ 
              fontSize: '0.65rem', 
              fontWeight: '700', 
              marginBottom: '0.2rem', 
              color: '#a855f7',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              {(profile.companion_name || 'AUM').toUpperCase()}
            </div>
            <div className="typing-indicator" style={{ display: 'flex', gap: '4px', alignItems: 'center', height: '16px', padding: '4px 2px' }}>
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        </div>
      );
    }

    return list;
  };

  const activeStage = profile.momentum_stage || "Stage 1: Activation";

  return (
    <div style={styles.dashboardContainer}>
      <canvas ref={canvasRef} style={styles.confettiCanvas}></canvas>

      {/* Time Travel Simulated Clock */}
      <div style={styles.timeTravelBar}>
        <button onClick={() => setTimeSelectorOpen(!timeSelectorOpen)} style={styles.timeButton}>
          📅 Virtual Clock: {currentTimeDisplay} {virtualTime ? " (Simulated)" : " (Live)"}
        </button>
        {timeSelectorOpen && (
          <div style={styles.timeDropdown}>
            <button onClick={() => handleTimeTravel('advance', 1)} style={styles.simBtn}>+1 Hour</button>
            <button onClick={() => handleTimeTravel('advance', 12)} style={styles.simBtn}>+12 Hours</button>
            <button 
              onClick={() => {
                const now = virtualTime ? new Date(virtualTime) : new Date();
                const target = new Date(now);
                target.setDate(target.getDate() + 1);
                target.setHours(6, 1, 0, 0);
                handleTimeTravel('set', target.toISOString());
              }} 
              style={styles.simBtnPrimary}
            >
              Advance to 6:01 AM (Next Day)
            </button>
            {virtualTime && (
              <button onClick={() => handleTimeTravel('reset')} style={styles.resetClockBtn}>
                Reset to Real-Time
              </button>
            )}
          </div>
        )}
      </div>

      {/* Main 2-Column Grid */}
      <div style={styles.layoutGrid}>
        
        {/* COLUMN 1: LIFE MOMENTUM & CONTEXT LOGS (Left) */}
        <div style={styles.columnLeft}>
          
          {/* Life Momentum Score Panel */}
          <div style={styles.panel}>
            <h3 style={styles.panelTitle}>Life Momentum Status</h3>
            <div style={styles.meterContainer}>
              <svg width="120" height="120" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="48" fill="transparent" stroke="rgba(255,255,255,0.03)" strokeWidth="6" />
                <circle 
                  cx="60" cy="60" r="48" 
                  fill="transparent" 
                  stroke="url(#momentumGradient)" 
                  strokeWidth="6" 
                  strokeDasharray="301"
                  strokeDashoffset={301 - (301 * (profile.momentum_score || 50)) / 100}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 0.8s ease-in-out' }}
                />
                <defs>
                  <linearGradient id="momentumGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#128c7e" />
                    <stop offset="100%" stopColor="#25d366" />
                  </linearGradient>
                </defs>
              </svg>
              <div style={styles.meterText}>
                <span style={styles.meterVal}>{profile.momentum_score || 50}</span>
                <span style={styles.meterLabel}>Momentum</span>
              </div>
            </div>

            <div style={styles.readinessSection}>
              <div className="flex justify-between align-center" style={{ width: '100%', marginBottom: '0.25rem' }}>
                <span style={styles.readinessLabel}>Today's Readiness Score:</span>
                <span style={styles.readinessValue}>{profile.readiness_score || 5}/10</span>
              </div>
              <div style={styles.progressBarBg}>
                <div style={{ ...styles.progressBarFill, width: `${(profile.readiness_score || 5) * 10}%` }}></div>
              </div>
            </div>

            <div style={styles.archetypeBox}>
              <span style={styles.badgeSuccess}>{activeStage}</span>
              <span style={styles.archetypeLabel}>Momentum Stage</span>
            </div>

            <div style={styles.metaStats}>
              <div style={styles.metaStatItem}>
                <span style={styles.metaStatVal}>🔥 {profile.streak || 0}d</span>
                <span style={styles.metaStatLabel}>Streak</span>
              </div>
              <div style={styles.metaDivider}></div>
              <div style={styles.metaStatItem}>
                <span style={styles.metaStatVal}>{profile.archetype || "Mindful Rookie"}</span>
                <span style={styles.metaStatLabel}>Identity Archetype</span>
              </div>
            </div>
          </div>

          {/* Daily Context Form Panel */}
          <div style={styles.panel}>
            <h3 style={styles.panelTitle}>
              Daily Context Logs: <span style={{ color: context.is_frozen ? '#10b981' : '#f59e0b' }}>
                {context.is_frozen ? "Locked" : "Awaiting logs"}
              </span>
            </h3>
            
            {!context.is_frozen ? (
              <form onSubmit={handleSaveContext} style={styles.contextForm}>
                <div style={styles.inputRow}>
                  <label style={styles.formLabel}>Sleep Hours: {sleepHours}h</label>
                  <input 
                    type="range" min="4" max="10" step="0.1" 
                    value={sleepHours} 
                    onChange={(e) => setSleepHours(e.target.value)} 
                    style={styles.slider}
                  />
                </div>

                <div style={styles.inputRow}>
                  <label style={styles.formLabel}>Sleep Quality</label>
                  <select value={sleepQuality} onChange={(e) => setSleepQuality(e.target.value)} className="glass-select">
                    <option value="excellent">Excellent</option>
                    <option value="good">Good / Rested</option>
                    <option value="poor">Poor / Interrupted</option>
                    <option value="terrible">Insomnia</option>
                  </select>
                </div>

                <div style={styles.energiesGrid}>
                  <div style={styles.energyInput}>
                    <label style={styles.formLabel}>Mental: {mentalEnergy}</label>
                    <input type="range" min="1" max="10" value={mentalEnergy} onChange={(e) => setMentalEnergy(e.target.value)} style={styles.slider} />
                  </div>
                  <div style={styles.energyInput}>
                    <label style={styles.formLabel}>Physical: {physicalEnergy}</label>
                    <input type="range" min="1" max="10" value={physicalEnergy} onChange={(e) => setPhysicalEnergy(e.target.value)} style={styles.slider} />
                  </div>
                </div>

                <button type="submit" disabled={isUpdatingContext} style={styles.submitBtn}>
                  {isUpdatingContext ? "Locking logs..." : "Lock Context Logs"}
                </button>
              </form>
            ) : (
              <div style={styles.frozenStats}>
                <div style={styles.frozenItem}>
                  <span style={styles.frozenLabel}>💤 Sleep Analysis</span>
                  <span style={styles.frozenVal}>{context.sleep?.hours} hrs ({context.sleep?.quality})</span>
                </div>
                <div style={styles.frozenItem}>
                  <span style={styles.frozenLabel}>⚡ Energies</span>
                  <span style={styles.frozenVal}>
                    Mental: {context.energies?.mental} | Physical: {context.energies?.physical}
                  </span>
                </div>
                <button onClick={() => setContext(prev => ({ ...prev, is_frozen: false }))} style={styles.unfreezeBtn}>
                  ✏️ Edit Context Logs
                </button>
              </div>
            )}
          </div>

          {/* World Engine layer */}
          <div style={styles.panel}>
            <h3 style={styles.panelTitle}>World Engine (Live Environment)</h3>
            <div style={styles.worldRow}>
              <span style={styles.worldLabel}>Location:</span>
              <span style={styles.worldVal}>{profile.city || "Gurgaon"}</span>
            </div>
            <div style={styles.worldRow}>
              <span style={styles.worldLabel}>Local AQI Level:</span>
              <span style={{ 
                ...styles.worldVal, 
                color: (profile.city === 'Gurgaon') ? '#ef4444' : '#10b981' 
              }}>
                {(profile.city === 'Gurgaon') ? "250 (Critical / Hazardous)" : "65 (Moderate)"}
              </span>
            </div>
            <div style={styles.worldRow}>
              <span style={styles.worldLabel}>Seasonal Trigger:</span>
              <span style={styles.worldVal}>Salary Week</span>
            </div>
            <div style={styles.worldRow}>
              <span style={styles.worldLabel}>Weather Outlook:</span>
              <span style={styles.worldVal}>{context.environmental?.weather || "Clear"}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => router.push('/onboarding')} style={{ ...styles.actionBtn, flex: 1 }}>⚙️ Onboarding Settings</button>
            <button onClick={handleFullReset} style={{ ...styles.actionBtn, color: '#ef4444', borderColor: '#ef4444', flex: 1 }}>⚠️ Wipe OS Session</button>
          </div>
        </div>

        {/* COLUMN 2: THE WHATSAPP LIFE FEED (Right) */}
        <div style={styles.columnRight}>
          
          <div style={styles.feedHeaderPanel}>
            {/* Header WhatsApp Meta info */}
            <div className="flex align-center justify-between" style={{ width: '100%' }}>
              <div className="flex align-center gap-3">
                <div style={styles.avatar}>🕉️</div>
                <div>
                  <h2 style={{ fontSize: '1.15rem', fontFamily: 'var(--font-display)', color: '#fff' }}>
                    {profile.companion_name || 'Aarav'}
                  </h2>
                  <div className="flex align-center gap-1" style={{ marginTop: '0.15rem' }}>
                    <span style={styles.onlineDot}></span>
                    <span style={{ fontSize: '0.75rem', color: '#128c7e' }}>Listening & Journaling</span>
                  </div>
                </div>
              </div>

              {/* Active Memory Layers indicators */}
              <div style={{ textAlign: 'right' }}>
                <span style={styles.memoryStatusTitle}>🧠 Active Journal Nodes</span>
                <div className="flex gap-1" style={{ marginTop: '0.25rem' }}>
                  <span className="badge badge-primary" style={{ fontSize: '0.6rem', padding: '0.15rem 0.4rem' }}>Friction Log</span>
                  <span className="badge badge-success" style={{ fontSize: '0.6rem', padding: '0.15rem 0.4rem' }}>EV Scoring</span>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Checklist (Today's Moves) pinned at the top */}
          {actions.length > 0 && (
            <div style={styles.pinnedMovesContainer}>
              <div 
                style={{ ...styles.movesCardHeader, cursor: 'pointer', userSelect: 'none' }} 
                onClick={() => setShowMoves(!showMoves)}
              >
                <div className="flex align-center gap-2">
                  <h3 style={styles.movesCardTitle}>Today's Moves</h3>
                  <span style={styles.movesCountBadge}>{actions.filter(a => a.status === 'done').length} / {actions.length} Completed</span>
                </div>
                <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>{showMoves ? '▲ Collapse' : '▼ Expand'}</span>
              </div>

              {showMoves && (
                <div style={styles.movesList}>
                  {actions.map((act) => {
                    const isExpanded = expandedActionId === act.id;
                    const isDone = act.status === 'done';
                    const isSkipped = act.status === 'skipped';

                    return (
                      <div 
                        key={act.id} 
                        style={{
                          ...styles.moveItemRow,
                          borderColor: isDone ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.06)',
                          background: isDone ? 'rgba(16, 185, 129, 0.02)' : 'rgba(255,255,255,0.01)'
                        }}
                        onClick={() => setExpandedActionId(isExpanded ? null : act.id)}
                      >
                        <div style={styles.moveItemHeader}>
                          <div style={{ flex: 1 }}>
                            <div className="flex align-center gap-2">
                              <span style={styles.moveCatBadge}>{act.category}</span>
                              {act.success_probability && (
                                <span style={styles.probIndicator}>{act.success_probability}% Likelihood</span>
                              )}
                            </div>
                            <h4 style={{
                              ...styles.moveTextTitle,
                              textDecoration: isDone ? 'line-through' : 'none',
                              color: isDone ? '#9ca3af' : '#fff'
                            }}>{act.text}</h4>
                            
                            {/* The Explanation Engine output displayed directly */}
                            {act.whyToday && (
                              <p style={styles.moveExplanationWhy}>
                                ➔ {act.whyToday}
                              </p>
                            )}
                          </div>

                          <div style={styles.moveControls} onClick={(e) => e.stopPropagation()}>
                            {isDone ? (
                              <div style={styles.starRow}>
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <button 
                                    key={star} 
                                    onClick={() => handleRateAction(act.id, star)}
                                    style={{
                                      ...styles.starBtn,
                                      color: (act.rating || 4) >= star ? '#fbbf24' : 'rgba(255,255,255,0.2)'
                                    }}
                                  >
                                    ★
                                  </button>
                                ))}
                                <button onClick={() => handleToggleAction(act.id, 'done')} style={styles.resetTaskBtn}>✕</button>
                              </div>
                            ) : isSkipped ? (
                              <div style={styles.skippedState}>
                                <span style={styles.skippedText}>Ignored</span>
                                <button onClick={() => handleToggleAction(act.id, 'skipped')} style={styles.resetTaskBtn}>↺ Reset</button>
                              </div>
                            ) : (
                              <div style={styles.todoControls}>
                                <button onClick={() => handleToggleAction(act.id, 'todo')} style={styles.doneBtn}>✓ Complete</button>
                                <button onClick={() => handleToggleAction(act.id, 'skipped')} style={styles.skipBtn}>✕ Ignore</button>
                              </div>
                            )}
                          </div>
                        </div>

                        {isExpanded && (
                          <div style={styles.moveExpandedContent}>
                            <div style={styles.moveExplainBlock}>
                              <span style={styles.moveExplainLabel}>Why This Move Matters</span>
                              <p style={styles.moveExplainText}>{act.whyRelevant || "Customized to align with your personal context log variables."}</p>
                            </div>
                            {act.howTo && (
                              <div style={styles.moveExplainBlock}>
                                <span style={styles.moveExplainLabel}>How to Complete</span>
                                <p style={styles.moveExplainText}>{act.howTo}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Scrolling Feed Container */}
          <div style={styles.feedViewport} ref={chatScrollRef}>
            
            {/* Pinned Current Mission Card */}
            {profile.pinned_mission && (
              <div style={styles.pinnedMissionBanner}>
                <span style={styles.pinIcon}>📌</span>
                <span style={styles.pinText}>
                  <strong>Current Mission</strong>: {profile.pinned_mission.title} • Day 38
                </span>
              </div>
            )}

            <div style={styles.feedScrollArea}>
              
              {/* Chronological events loop */}
              {renderChatHistoryWithMonthDividers()}

            </div>
          </div>

          {/* Feed Text Input & Media Attachment Controls */}
          <div style={styles.feedInputPanel}>
            {/* Quick response chips (Momentum Moments) */}
            <div style={styles.chipRow}>
              {reflectionChips.map((chip, idx) => (
                <button 
                  key={idx} 
                  onClick={() => handleSendChatMessage(chip)} 
                  disabled={isSendingChat}
                  style={styles.reflectionChip}
                >
                  {chip}
                </button>
              ))}
            </div>

            <div className="flex gap-2" style={{ width: '100%', alignItems: 'center' }}>
              {/* Photo Upload Attachment Icon */}
              <button 
                onClick={() => fileInputRef.current?.click()} 
                style={styles.attachBtn}
                title="Attach photo memory to life feed"
                disabled={isUploadingPhoto}
              >
                {isUploadingPhoto ? "..." : "📷"}
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handlePhotoUpload} 
                accept="image/*" 
                style={{ display: 'none' }} 
              />

              <textarea 
                placeholder={`Message ${profile.companion_name || 'Aarav'}...`} 
                value={chatInput} 
                onChange={(e) => setChatInput(e.target.value)} 
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendChatMessage();
                  }
                }}
                style={styles.feedTextarea}
                disabled={isSendingChat}
              />
              <button 
                onClick={() => handleSendChatMessage()} 
                style={styles.feedSendBtn} 
                disabled={isSendingChat || !chatInput.trim()}
              >
                {isSendingChat ? "..." : "Send"}
              </button>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}

// Confetti Particle Physics system
class ConfettiEffect {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.active = false;
  }
  
  start(count = 100) {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.particles = [];
    const colors = ['#128c7e', '#25d366', '#34b7f1', '#ece5dd', '#f59e0b', '#ef4444'];
    
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * -this.canvas.height - 20,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        speedX: Math.random() * 4 - 2,
        speedY: Math.random() * 5 + 3,
        rotation: Math.random() * 360,
        rotationSpeed: Math.random() * 4 - 2
      });
    }
    
    if (!this.active) {
      this.active = true;
      this.animate();
    }
  }
  
  animate() {
    if (!this.active) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    let finished = true;
    
    this.particles.forEach(p => {
      p.x += p.speedX;
      p.y += p.speedY;
      p.rotation += p.rotationSpeed;
      
      this.ctx.save();
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate(p.rotation * Math.PI / 180);
      this.ctx.fillStyle = p.color;
      this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      this.ctx.restore();
      
      if (p.y < this.canvas.height + 20) {
        finished = false;
      }
    });
    
    if (finished) {
      this.active = false;
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    } else {
      requestAnimationFrame(() => this.animate());
    }
  }
}

// Inline CSS styled custom elements
const styles = {
  dashboardContainer: {
    color: '#fff',
    minHeight: '100vh',
    padding: '1.5rem',
    background: '#040508',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  },
  confettiCanvas: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    pointerEvents: 'none',
    zIndex: 9999,
  },
  timeTravelBar: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginBottom: '1rem',
    position: 'relative'
  },
  timeButton: {
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    color: '#25d366',
    padding: '0.5rem 1rem',
    borderRadius: '0.75rem',
    cursor: 'pointer',
    fontWeight: '500',
    fontSize: '0.85rem'
  },
  timeDropdown: {
    position: 'absolute',
    top: '110%',
    right: 0,
    background: 'rgba(15, 15, 25, 0.98)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '1rem',
    padding: '0.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    zIndex: 100,
    width: '240px'
  },
  simBtn: {
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#fff',
    padding: '0.4rem',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontSize: '0.8rem',
  },
  simBtnPrimary: {
    background: '#128c7e',
    border: 'none',
    color: '#fff',
    padding: '0.5rem',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: '500'
  },
  resetClockBtn: {
    background: 'transparent',
    border: 'none',
    color: '#ef4444',
    cursor: 'pointer',
    fontSize: '0.8rem',
    marginTop: '0.25rem'
  },
  layoutGrid: {
    display: 'grid',
    gridTemplateColumns: '1.2fr 3fr',
    gap: '1.5rem',
  },
  columnLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem'
  },
  columnRight: {
    display: 'flex',
    flexDirection: 'column',
    height: '1150px',
    minHeight: '620px',
    background: 'rgba(10, 12, 18, 0.6)',
    backdropFilter: 'blur(25px)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '1.5rem',
    overflow: 'hidden',
    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.35)'
  },
  pinnedMovesContainer: {
    background: 'rgba(20, 24, 35, 0.6)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    padding: '0.85rem 1.25rem',
    maxHeight: '320px',
    overflowY: 'auto'
  },
  panel: {
    background: 'rgba(15, 15, 25, 0.7)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '1.25rem',
    padding: '1.25rem',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)'
  },
  panelTitle: {
    fontSize: '0.95rem',
    fontWeight: '600',
    marginBottom: '1rem',
    color: '#fff',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    paddingBottom: '0.5rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  meterContainer: {
    position: 'relative',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    margin: '0.25rem 0'
  },
  meterText: {
    position: 'absolute',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  },
  meterVal: {
    fontSize: '2rem',
    fontWeight: '800',
    background: 'linear-gradient(135deg, #ffffff 0%, #25d366 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  meterLabel: {
    fontSize: '0.6rem',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  readinessSection: {
    marginTop: '0.75rem',
    padding: '0.5rem 0.75rem',
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.04)',
    borderRadius: '0.75rem'
  },
  readinessLabel: {
    fontSize: '0.75rem',
    color: '#9ca3af'
  },
  readinessValue: {
    fontSize: '0.85rem',
    fontWeight: '700',
    color: '#25d366'
  },
  progressBarBg: {
    width: '100%',
    height: '6px',
    background: 'rgba(255,255,255,0.05)',
    borderRadius: '3px',
    overflow: 'hidden'
  },
  progressBarFill: {
    height: '100%',
    background: '#128c7e',
    borderRadius: '3px',
    transition: 'width 0.5s ease-in-out'
  },
  archetypeBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginTop: '0.75rem',
    padding: '0.5rem',
    background: 'rgba(18, 140, 126, 0.05)',
    border: '1px solid rgba(18, 140, 126, 0.15)',
    borderRadius: '0.75rem'
  },
  badgeSuccess: {
    color: '#25d366',
    fontSize: '0.8rem',
    fontWeight: '600'
  },
  archetypeLabel: {
    fontSize: '0.6rem',
    color: '#9ca3af',
    marginTop: '0.15rem',
    textTransform: 'uppercase'
  },
  metaStats: {
    display: 'flex',
    justifyContent: 'space-around',
    marginTop: '0.75rem',
    background: 'rgba(255, 255, 255, 0.01)',
    borderRadius: '0.5rem',
    padding: '0.5rem 0.25rem',
    border: '1px solid rgba(255,255,255,0.03)'
  },
  metaStatItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  },
  metaStatVal: {
    fontSize: '0.9rem',
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center'
  },
  metaStatLabel: {
    fontSize: '0.6rem',
    color: '#9ca3af',
    marginTop: '0.15rem'
  },
  metaDivider: {
    borderLeft: '1px solid rgba(255,255,255,0.08)',
    height: '20px',
    alignSelf: 'center'
  },
  contextForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.85rem'
  },
  inputRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem'
  },
  formLabel: {
    fontSize: '0.75rem',
    color: '#9ca3af'
  },
  slider: {
    width: '100%',
    accentColor: '#128c7e',
    cursor: 'pointer'
  },
  energiesGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.5rem'
  },
  energyInput: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem'
  },
  submitBtn: {
    background: '#128c7e',
    color: '#fff',
    border: 'none',
    padding: '0.55rem',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '0.8rem',
    marginTop: '0.25rem'
  },
  frozenStats: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem'
  },
  frozenItem: {
    display: 'flex',
    flexDirection: 'column',
    padding: '0.4rem',
    background: 'rgba(255,255,255,0.01)',
    borderRadius: '0.5rem',
    border: '1px solid rgba(255,255,255,0.03)'
  },
  frozenLabel: {
    fontSize: '0.6rem',
    color: '#9ca3af',
    fontWeight: 'bold',
    textTransform: 'uppercase'
  },
  frozenVal: {
    fontSize: '0.8rem',
    color: '#fff',
    marginTop: '0.1rem'
  },
  unfreezeBtn: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#9ca3af',
    padding: '0.45rem',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontSize: '0.75rem',
    marginTop: '0.25rem'
  },
  worldRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.75rem',
    padding: '0.35rem 0',
    borderBottom: '1px solid rgba(255,255,255,0.03)'
  },
  worldLabel: {
    color: '#9ca3af'
  },
  worldVal: {
    fontWeight: '500'
  },
  actionBtn: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#9ca3af',
    padding: '0.4rem',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontSize: '0.75rem',
    textAlign: 'center'
  },
  feedHeaderPanel: {
    background: 'rgba(20, 24, 35, 0.8)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    padding: '0.85rem 1.25rem',
  },
  avatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background: 'rgba(18, 140, 126, 0.15)',
    border: '1px solid rgba(18, 140, 126, 0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.25rem'
  },
  onlineDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    backgroundColor: '#25d366',
    boxShadow: '0 0 6px #25d366',
    display: 'inline-block'
  },
  memoryStatusTitle: {
    fontSize: '0.65rem',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontWeight: '600'
  },
  feedViewport: {
    flex: 1,
    padding: '1rem',
    overflowY: 'auto',
    position: 'relative'
  },
  pinnedMissionBanner: {
    position: 'sticky',
    top: '0',
    background: 'rgba(18, 140, 126, 0.9)',
    border: '1px solid rgba(37, 211, 102, 0.3)',
    borderRadius: '0.75rem',
    padding: '0.5rem 0.75rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    zIndex: 10,
    marginBottom: '1rem',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
  },
  pinIcon: {
    fontSize: '0.95rem'
  },
  pinText: {
    fontSize: '0.75rem',
    color: '#fff'
  },
  feedScrollArea: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem'
  },
  monthHeader: {
    display: 'flex',
    justifyContent: 'center',
    margin: '1.5rem 0 0.5rem 0'
  },
  monthHeaderSpan: {
    fontSize: '0.75rem',
    fontWeight: '600',
    color: '#a855f7',
    background: 'rgba(168, 85, 247, 0.1)',
    border: '1px solid rgba(168, 85, 247, 0.2)',
    padding: '0.25rem 0.75rem',
    borderRadius: '1rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  systemLogMessage: {
    display: 'flex',
    justifyContent: 'center',
    margin: '0.25rem 0'
  },
  systemLogSpan: {
    fontSize: '0.7rem',
    color: '#9ca3af',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
    padding: '0.2rem 0.6rem',
    borderRadius: '0.5rem'
  },
  bubbleWrapper: {
    display: 'flex',
    width: '100%'
  },
  bubble: {
    maxWidth: '75%',
    padding: '0.75rem 1rem',
    borderRadius: '0.85rem',
    lineHeight: '1.45',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative'
  },
  bubbleText: {
    fontSize: '0.9rem',
    color: '#fff',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word'
  },
  photoContainer: {
    borderRadius: '0.5rem',
    overflow: 'hidden',
    marginTop: '0.25rem',
    border: '1px solid rgba(255,255,255,0.05)'
  },
  photoImg: {
    width: '100%',
    maxHeight: '220px',
    objectFit: 'cover',
    borderRadius: '0.4rem'
  },
  mediaCard: {
    background: 'rgba(0,0,0,0.2)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '0.75rem',
    padding: '0.75rem',
    marginTop: '0.6rem',
    width: '100%',
    minWidth: '240px'
  },
  cardItemTitle: {
    fontSize: '0.8rem',
    fontWeight: 'bold',
    color: '#fff'
  },
  cardItemSubtitle: {
    fontSize: '0.7rem',
    color: '#9ca3af',
    marginTop: '0.1rem'
  },
  cardPlayBtn: {
    background: '#128c7e',
    color: '#fff',
    border: 'none',
    borderRadius: '0.4rem',
    padding: '0.3rem 0.6rem',
    fontSize: '0.7rem',
    cursor: 'pointer',
    fontWeight: '600'
  },
  feedMovesCard: {
    background: 'rgba(25, 28, 38, 0.7)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '1rem',
    padding: '1rem',
    margin: '1.25rem 0',
    boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
  },
  movesCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.75rem',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    paddingBottom: '0.5rem'
  },
  movesCardTitle: {
    fontSize: '0.9rem',
    fontWeight: 'bold',
    color: '#25d366',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  movesCountBadge: {
    fontSize: '0.7rem',
    background: 'rgba(37, 211, 102, 0.1)',
    color: '#25d366',
    padding: '0.15rem 0.4rem',
    borderRadius: '0.5rem',
    fontWeight: '600'
  },
  movesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem'
  },
  moveItemRow: {
    border: '1px solid',
    borderRadius: '0.75rem',
    padding: '0.75rem',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    display: 'flex',
    flexDirection: 'column'
  },
  moveItemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '1rem'
  },
  moveCatBadge: {
    alignSelf: 'flex-start',
    fontSize: '0.6rem',
    padding: '0.1rem 0.4rem',
    borderRadius: '0.4rem',
    background: 'rgba(255,255,255,0.04)',
    color: '#9ca3af',
    fontWeight: '600'
  },
  probIndicator: {
    fontSize: '0.6rem',
    color: '#818cf8',
    fontWeight: 'bold'
  },
  moveTextTitle: {
    fontSize: '0.85rem',
    fontWeight: '500',
    marginTop: '0.2rem',
    lineHeight: '1.3'
  },
  moveExplanationWhy: {
    fontSize: '0.72rem',
    color: '#a855f7',
    marginTop: '0.2rem',
    fontWeight: '500'
  },
  moveControls: {
    display: 'flex',
    alignItems: 'center'
  },
  todoControls: {
    display: 'flex',
    gap: '0.35rem'
  },
  doneBtn: {
    background: 'rgba(37, 211, 102, 0.1)',
    border: '1px solid rgba(37, 211, 102, 0.25)',
    color: '#25d366',
    padding: '0.25rem 0.5rem',
    borderRadius: '0.4rem',
    cursor: 'pointer',
    fontSize: '0.75rem',
    fontWeight: '600'
  },
  skipBtn: {
    background: 'rgba(239, 68, 68, 0.04)',
    border: '1px solid rgba(239, 68, 68, 0.15)',
    color: '#ef4444',
    padding: '0.25rem 0.4rem',
    borderRadius: '0.4rem',
    cursor: 'pointer',
    fontSize: '0.75rem'
  },
  skippedState: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.35rem'
  },
  skippedText: {
    fontSize: '0.75rem',
    color: '#f59e0b',
    fontWeight: '500'
  },
  resetTaskBtn: {
    background: 'transparent',
    border: 'none',
    color: '#9ca3af',
    cursor: 'pointer',
    fontSize: '0.75rem',
    padding: '0.15rem'
  },
  starRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.15rem'
  },
  starBtn: {
    background: 'transparent',
    border: 'none',
    fontSize: '1rem',
    cursor: 'pointer',
    padding: 0
  },
  moveExpandedContent: {
    marginTop: '0.5rem',
    borderTop: '1px solid rgba(255,255,255,0.05)',
    paddingTop: '0.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    cursor: 'default'
  },
  moveExplainBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.1rem'
  },
  moveExplainLabel: {
    fontSize: '0.65rem',
    color: '#128c7e',
    fontWeight: 'bold',
    textTransform: 'uppercase'
  },
  moveExplainText: {
    fontSize: '0.78rem',
    color: '#d1d5db',
    lineHeight: '1.4'
  },
  feedInputPanel: {
    background: 'rgba(20, 24, 35, 0.8)',
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
    padding: '0.75rem 1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem'
  },
  chipRow: {
    display: 'flex',
    gap: '0.4rem',
    overflowX: 'auto',
    paddingBottom: '0.2rem',
    scrollbarWidth: 'none'
  },
  reflectionChip: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
    color: '#9ca3af',
    padding: '0.25rem 0.5rem',
    borderRadius: '0.5rem',
    fontSize: '0.75rem',
    whiteSpace: 'nowrap',
    cursor: 'pointer'
  },
  attachBtn: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '0.5rem',
    color: '#9ca3af',
    width: '40px',
    height: '40px',
    fontSize: '1.1rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  feedTextarea: {
    flex: 1,
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '0.5rem',
    padding: '0.65rem 0.75rem',
    color: '#fff',
    fontSize: '0.85rem',
    outline: 'none',
    resize: 'none',
    height: '40px',
    lineHeight: '1.4',
    fontFamily: 'inherit'
  },
  feedSendBtn: {
    background: '#128c7e',
    color: '#fff',
    border: 'none',
    padding: '0 1rem',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '0.85rem',
    height: '40px'
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '80vh',
    background: '#040508',
    color: '#fff'
  },
  spinner: {
    width: '35px',
    height: '35px',
    border: '3px solid rgba(255, 255, 255, 0.04)',
    borderTopColor: '#25d366',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  }
};
