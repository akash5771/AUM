'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function Dashboard() {
  const router = useRouter();
  
  // Core Data States
  const [profile, setProfile] = useState(null);
  const [context, setContext] = useState(null);
  const [actions, setActions] = useState([]);
  const [backups, setBackups] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [virtualTime, setVirtualTime] = useState(null);
  const [currentTimeDisplay, setCurrentTimeDisplay] = useState('');
  
  // Interaction/UI States
  const [expandedActionId, setExpandedActionId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingContext, setIsUpdatingContext] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false); // Slide-over drawer state
  const [timeSelectorOpen, setTimeSelectorOpen] = useState(false);
  
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

  // Refs for scrolling and canvas
  const messagesEndRef = useRef(null);
  const chatScrollRef = useRef(null);
  const canvasRef = useRef(null);
  const confettiSystemRef = useRef(null);

  // Quick Reflection Chips
  const reflectionChips = [
    "How can I build momentum when tired?",
    "Review my weekly patterns.",
    "Acknowledge a small win today.",
    "Help me prepare for tomorrow."
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

  // Auto-scroll chat history (non-intrusive container scrolling)
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatHistory, isSendingChat]);

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

        // 4. Actions and Backups
        const aRes = await fetch('/api/actions');
        const aData = await aRes.json();
        setActions(aData);
        
        // 5. Chat History Logs
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
          mood: { rating: 5, state: 'clear' }, // Default mood
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

    // Add User bubble
    setChatHistory(prev => [...prev, { sender: 'User', text, timestamp: new Date().toISOString() }]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
      const data = await res.json();

      // Add AUM bubble
      setChatHistory(prev => [...prev, { sender: 'AUM', text: data.response, timestamp: new Date().toISOString() }]);
      
      // Update profile
      const pRes = await fetch('/api/profile');
      const pData = await pRes.json();
      setProfile(pData);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSendingChat(false);
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

  // Rate metrics
  const completedCount = actions.filter(a => a.status === 'done').length;
  const intentionalRate = profile.intentional_days_count && profile.total_actions_generated > 0
    ? Math.round((profile.intentional_days_count / (profile.total_actions_generated / 5)) * 100)
    : 75; // Baseline default

  return (
    <div style={styles.dashboardContainer}>
      <canvas ref={canvasRef} style={styles.confettiCanvas}></canvas>

      {/* Time Travel Bar */}
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

      {/* Main 3-Column Grid */}
      <div style={styles.layoutGrid}>
        
        {/* COLUMN 1: CONTEXT & WORLD ENGINE (Left) */}
        <div style={styles.column}>
          
          {/* Momentum Meter Status Card */}
          <div style={styles.panel}>
            <h3 style={styles.panelTitle}>Life Momentum Status</h3>
            <div style={styles.meterContainer}>
              <svg width="140" height="140" viewBox="0 0 140 140">
                <circle cx="70" cy="70" r="55" fill="transparent" stroke="rgba(255,255,255,0.03)" strokeWidth="8" />
                <circle 
                  cx="70" cy="70" r="55" 
                  fill="transparent" 
                  stroke="url(#momentumGradient)" 
                  strokeWidth="8" 
                  strokeDasharray="345"
                  strokeDashoffset={345 - (345 * (profile.momentum_score || 50)) / 100}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 0.8s ease-in-out' }}
                />
                <defs>
                  <linearGradient id="momentumGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#a855f7" />
                  </linearGradient>
                </defs>
              </svg>
              <div style={styles.meterText}>
                <span style={styles.meterVal}>{profile.momentum_score || 50}</span>
                <span style={styles.meterLabel}>Rolling Score</span>
              </div>
            </div>

            <div style={styles.metaStats}>
              <div style={styles.metaStatItem}>
                <span style={styles.metaStatVal}>🔥 {profile.streak || 0}d</span>
                <span style={styles.metaStatLabel}>Streak</span>
              </div>
              <div style={styles.metaDivider}></div>
              <div style={styles.metaStatItem}>
                <span style={styles.metaStatVal}>{intentionalRate}%</span>
                <span style={styles.metaStatLabel}>Intentional Days</span>
              </div>
            </div>

            <div style={styles.archetypeBox}>
              <span style={styles.badgeSuccess}>{profile.archetype || "The Rebuilder"}</span>
              <span style={styles.archetypeLabel}>Identity Archetype</span>
            </div>
          </div>

          {/* Daily Context Form Panel */}
          <div style={styles.panel}>
            <h3 style={styles.panelTitle}>
              Daily Context Status: <span style={{ color: context.is_frozen ? '#10b981' : '#f59e0b' }}>
                {context.is_frozen ? "Frozen" : "Awaiting Logs"}
              </span>
            </h3>
            
            {!context.is_frozen ? (
              <form onSubmit={handleSaveContext} style={styles.contextForm}>
                <div style={styles.inputRow}>
                  <label style={styles.formLabel}>Sleep Duration: {sleepHours}h</label>
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
                  <div style={styles.energyInput}>
                    <label style={styles.formLabel}>Social: {socialEnergy}</label>
                    <input type="range" min="1" max="10" value={socialEnergy} onChange={(e) => setSocialEnergy(e.target.value)} style={styles.slider} />
                  </div>
                  <div style={styles.energyInput}>
                    <label style={styles.formLabel}>Creative: {creativeEnergy}</label>
                    <input type="range" min="1" max="10" value={creativeEnergy} onChange={(e) => setCreativeEnergy(e.target.value)} style={styles.slider} />
                  </div>
                </div>

                <div style={styles.inputRow}>
                  <label style={styles.formLabel}>What did you create today?</label>
                  <textarea 
                    value={creationStory} 
                    onChange={(e) => setCreationStory(e.target.value)} 
                    placeholder="Describe any creative work, writing, project code..." 
                    style={styles.textareaMini} 
                  />
                </div>

                <div style={styles.inputRow}>
                  <label style={styles.formLabel}>What pulled your attention today?</label>
                  <textarea 
                    value={consumptionStory} 
                    onChange={(e) => setConsumptionStory(e.target.value)} 
                    placeholder="Describe feeds, movies, scrolling or attention leaks..." 
                    style={styles.textareaMini} 
                  />
                </div>

                <div style={styles.inputRow}>
                  <label style={styles.formLabel}>Weather</label>
                  <select value={weatherOutlook} onChange={(e) => setWeatherOutlook(e.target.value)} className="glass-select">
                    <option value="Clear">Clear & Sunny</option>
                    <option value="Overcast">Overcast / Humid</option>
                    <option value="Rainy">Raining</option>
                    <option value="Cold">Cold</option>
                  </select>
                </div>

                <button type="submit" disabled={isUpdatingContext} style={styles.submitBtn}>
                  {isUpdatingContext ? "Saving Context..." : "Lock Context Logs"}
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
                    M: {context.energies?.mental} | P: {context.energies?.physical} | S: {context.energies?.social} | C: {context.energies?.creative}
                  </span>
                </div>
                <div style={styles.frozenItem}>
                  <span style={styles.frozenLabel}>🎨 Creation Index</span>
                  <span style={styles.frozenVal}>
                    {context.creation_minutes} mins creation vs {context.consumption_minutes} mins reels
                  </span>
                </div>
                <button onClick={() => setContext(prev => ({ ...prev, is_frozen: false }))} style={styles.unfreezeBtn}>
                  ✏️ Edit Context Logs
                </button>
              </div>
            )}
          </div>

          {/* World Engine Panel */}
          <div style={styles.panel}>
            <h3 style={styles.panelTitle}>World Engine ( NCR Integration)</h3>
            <div style={styles.worldRow}>
              <span style={styles.worldLabel}>Location:</span>
              <span style={styles.worldVal}>{profile.city || "Bengaluru"}</span>
            </div>
            <div style={styles.worldRow}>
              <span style={styles.worldLabel}>Local AQI Level:</span>
              <span style={{ 
                ...styles.worldVal, 
                color: (profile.city === 'Gurgaon') ? '#ef4444' : '#10b981' 
              }}>
                {(profile.city === 'Gurgaon') ? "250 (Hazardous / Poor)" : "65 (Moderate)"}
              </span>
            </div>
            <div style={styles.worldRow}>
              <span style={styles.worldLabel}>Commute Traffic:</span>
              <span style={styles.worldVal}>
                {(profile.city === 'Gurgaon') ? "Critical Congestion" : "Moderate Traffic"}
              </span>
            </div>
            <div style={styles.worldRow}>
              <span style={styles.worldLabel}>Seasonal Triggers:</span>
              <span style={styles.worldVal}>Salary Week</span>
            </div>
          </div>
        </div>

        {/* COLUMN 2: DAILY CHECKLIST & Star Ratings (Center) */}
        <div style={{ ...styles.column, flexGrow: 1.5 }}>
          <div style={{ padding: '0 0.5rem' }}>
            <h2 style={styles.columnTitle}>Your Daily 5 Momentum Actions</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Weaved with your Purpose Anchors. Expand cards for downstream causality logic.
            </p>
          </div>

          <div style={styles.checklist}>
            {actions.map((action) => {
              const isExpanded = expandedActionId === action.id;
              const isDone = action.status === 'done';
              const isSkipped = action.status === 'skipped';

              return (
                <div 
                  key={action.id} 
                  style={{
                    ...styles.actionCard,
                    borderColor: isExpanded ? '#6366f1' : 'rgba(255,255,255,0.08)',
                    background: isExpanded ? 'rgba(10, 10, 15, 0.9)' : 'rgba(255,255,255,0.01)'
                  }}
                  onClick={() => setExpandedActionId(isExpanded ? null : action.id)}
                >
                  <div style={styles.actionHeader}>
                    <div style={styles.actionMain}>
                      <span style={{
                        ...styles.catBadge,
                        backgroundColor: isDone ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.03)',
                        color: isDone ? '#10b981' : '#d1d5db'
                      }}>
                        {action.category}
                      </span>
                      <h4 style={{
                        ...styles.actionTextTitle,
                        textDecoration: isDone ? 'line-through' : 'none',
                        color: isDone ? '#9ca3af' : '#fff'
                      }}>
                        {action.text}
                      </h4>
                    </div>

                    <div style={styles.actionControls} onClick={(e) => e.stopPropagation()}>
                      {isDone ? (
                        <div style={styles.starRow}>
                          <span style={styles.starLabelMini}>Effectiveness:</span>
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button 
                              key={star} 
                              onClick={() => handleRateAction(action.id, star)}
                              style={{
                                ...styles.starBtn,
                                color: (action.rating || 4) >= star ? '#fbbf24' : 'rgba(255,255,255,0.2)'
                              }}
                            >
                              ★
                            </button>
                          ))}
                          <button onClick={() => handleToggleAction(action.id, 'done')} style={styles.resetTaskBtn}>✕</button>
                        </div>
                      ) : isSkipped ? (
                        <div style={styles.skippedState}>
                          <span style={styles.skippedText}>Skipped</span>
                          <button onClick={() => handleToggleAction(action.id, 'skipped')} style={styles.resetTaskBtn}>↺ Reset</button>
                        </div>
                      ) : (
                        <div style={styles.todoControls}>
                          <button onClick={() => handleToggleAction(action.id, 'todo')} style={styles.doneBtn}>✓ Complete</button>
                          <button onClick={() => handleToggleAction(action.id, 'skipped')} style={styles.skipBtn}>✕ Skip</button>
                        </div>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={styles.expandedContent}>
                      <div style={styles.explainBlock}>
                        <span style={styles.explainLabel}>Why This Person? (Your Values & Chapter)</span>
                        <p style={styles.explainText}>{action.whyRelevant || "Tailored to supporting your family values and sleep goals."}</p>
                      </div>
                      <div style={styles.explainBlock}>
                        <span style={styles.explainLabel}>Why Today & Why Now? (Energies & Weather)</span>
                        <p style={styles.explainText}>{action.whyToday || "Selected because your social reserves are high and traffic is moderate."}</p>
                      </div>
                      <div style={styles.explainBlock}>
                        <span style={styles.explainLabel}>How to Execute</span>
                        <p style={styles.explainText}>{action.howTo || "Spend 10 minutes checking in with your family phone-free."}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* COLUMN 3: COMPANION CHAT & MY JOURNEY (Right) */}
        <div style={styles.column}>
          
          {/* companion chat panel */}
          <div style={{ ...styles.panel, display: 'flex', flexDirection: 'column', height: '620px' }}>
            <style>{`
              @keyframes typingBounce {
                0%, 80%, 100% { transform: translateY(0); }
                40% { transform: translateY(-5px); }
              }
              .typing-dot {
                display: inline-block;
                width: 6px;
                height: 6px;
                margin-right: 3px;
                background-color: #a855f7;
                border-radius: 50%;
                animation: typingBounce 1.4s infinite ease-in-out both;
              }
              .typing-dot:nth-child(2) {
                animation-delay: 0.2s;
              }
              .typing-dot:nth-child(3) {
                animation-delay: 0.4s;
              }
            `}</style>
            <h3 style={styles.panelTitle}>Companion Chat: {profile.companion_name || 'Aarav'}</h3>
            <div style={styles.chatViewport} ref={chatScrollRef}>
              <div style={styles.chatScroll}>
                {chatHistory.map((bubble, idx) => (
                  <div 
                    key={idx} 
                    style={{
                      ...styles.bubbleWrapper,
                      justifyContent: bubble.sender === 'User' ? 'flex-end' : 'flex-start'
                    }}
                  >
                    <div style={{
                      ...styles.bubble,
                      background: bubble.sender === 'User' ? 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' : 'rgba(255,255,255,0.03)',
                      border: bubble.sender === 'User' ? 'none' : '1px solid rgba(255,255,255,0.08)'
                    }}>
                      <div style={{ 
                        fontSize: '0.65rem', 
                        fontWeight: '700', 
                        marginBottom: '0.2rem', 
                        color: bubble.sender === 'User' ? '#c7d2fe' : '#d8b4fe',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}>
                        {bubble.sender === 'User' ? 'YOU' : (profile.companion_name || 'AARAV').toUpperCase()}
                      </div>
                      <span style={styles.bubbleText}>{bubble.text}</span>
                    </div>
                  </div>
                ))}
                {isSendingChat && (
                  <div style={{ ...styles.bubbleWrapper, justifyContent: 'flex-start' }}>
                    <div style={{
                      ...styles.bubble,
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      padding: '0.5rem 0.75rem'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', height: '14px' }}>
                        <span className="typing-dot"></span>
                        <span className="typing-dot"></span>
                        <span className="typing-dot"></span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef}></div>
              </div>
            </div>

            {/* Quick reflection templates */}
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

            <div style={styles.chatInputRow}>
              <textarea 
                placeholder={`Talk to ${profile.companion_name || 'Aarav'}...`} 
                value={chatInput} 
                onChange={(e) => setChatInput(e.target.value)} 
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendChatMessage();
                  }
                }}
                style={{
                  ...styles.chatInput,
                  resize: 'none',
                  height: '45px',
                  minHeight: '40px',
                  fontFamily: 'inherit',
                  paddingTop: '0.6rem',
                  lineHeight: '1.4'
                }}
                disabled={isSendingChat}
              />
              <button onClick={() => handleSendChatMessage()} style={styles.sendChatBtn} disabled={isSendingChat}>
                {isSendingChat ? "..." : "Send"}
              </button>
            </div>
          </div>

          {/* Toggle Sidebar Journey Drawer */}
          <button onClick={() => setIsDrawerOpen(true)} style={styles.openDrawerBtn}>
            📂 Slide Open: My Journey Timeline & Correlations
          </button>

          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => router.push('/onboarding')} style={{ ...styles.actionBtn, flex: 1 }}>⚙️ Onboard Settings</button>
            <button onClick={handleFullReset} style={{ ...styles.actionBtn, color: '#ef4444', borderColor: '#ef4444', flex: 1 }}>⚠️ Wipe OS Session</button>
          </div>
        </div>
      </div>

      {/* SLIDE-OVERsidebar DRAWER PANEL */}
      {isDrawerOpen && (
        <div style={styles.drawerOverlay} onClick={() => setIsDrawerOpen(false)}>
          <div style={styles.drawerContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.drawerHeader}>
              <h2 style={styles.drawerTitle}>My Momentum Journey</h2>
              <button onClick={() => setIsDrawerOpen(false)} style={styles.closeDrawerBtn}>✕ Close</button>
            </div>

            {/* Insights Section */}
            <div style={styles.drawerSection}>
              <h3 style={styles.drawerSecTitle}>Pearson Correlations & Insights</h3>
              <div style={styles.insightsList}>
                {profile.insights?.behavioral_insights && profile.insights.behavioral_insights.length > 0 ? (
                  profile.insights.behavioral_insights.map((ins, idx) => (
                    <div key={idx} style={styles.insightCard}>
                      <span style={styles.insightIcon}>📈</span>
                      <p style={styles.insightText}>{ins}</p>
                    </div>
                  ))
                ) : (
                  <p style={styles.emptyText}>Correlations calculate every 3 days. Log more context to unlock.</p>
                )}
              </div>
            </div>

            {/* Risks & Wins Section */}
            <div style={styles.drawerSection}>
              <h3 style={styles.drawerSecTitle}>Momentum Risks & Wins</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div style={styles.healthBlock}>
                  <h4 style={{ ...styles.healthTitle, color: '#ef4444' }}>Risks</h4>
                  <ul style={styles.healthList}>
                    {profile.insights?.current_risks && profile.insights.current_risks.length > 0 ? (
                      profile.insights.current_risks.map((risk, idx) => <li key={idx}>{risk}</li>)
                    ) : (
                      <li>No current risks</li>
                    )}
                  </ul>
                </div>
                <div style={styles.healthBlock}>
                  <h4 style={{ ...styles.healthTitle, color: '#10b981' }}>Wins</h4>
                  <ul style={styles.healthList}>
                    {profile.insights?.current_wins && profile.insights.current_wins.length > 0 ? (
                      profile.insights.current_wins.map((win, idx) => <li key={idx}>{win}</li>)
                    ) : (
                      <li>No recent wins</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>

            {/* Life Timeline Event ledger */}
            <div style={styles.drawerSection}>
              <h3 style={styles.drawerSecTitle}>Life Event Timeline</h3>
              <div style={styles.timelineList}>
                {profile.life_timeline && profile.life_timeline.length > 0 ? (
                  profile.life_timeline.map((evt, idx) => (
                    <div key={idx} style={styles.timelineItem}>
                      <span style={styles.timelineDot}></span>
                      <div style={styles.timelineDetails}>
                        <span style={styles.timelineEvtTitle}>{evt.text}</span>
                        <span style={styles.timelineEvtType}>{evt.type} ({evt.status})</span>
                        <span style={styles.timelineDate}>{evt.date}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p style={styles.emptyText}>No life events logged yet. Mention them to AUM to add them.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
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
    const colors = ['#6366f1', '#a855f7', '#10b981', '#0ea5e9', '#f59e0b', '#ef4444'];
    
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

// Inline Vanilla CSS styles for premium dark mode
const styles = {
  dashboardContainer: {
    color: '#fff',
    minHeight: '100vh',
    padding: '1.5rem',
    background: '#030305',
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
    color: '#a855f7',
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
    background: 'rgba(15, 15, 25, 0.95)',
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
    background: '#6366f1',
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
    gridTemplateColumns: '1.2fr 2fr 1.2fr',
    gap: '1.5rem',
  },
  column: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem'
  },
  panel: {
    background: 'rgba(15, 15, 25, 0.7)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '1.25rem',
    padding: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)'
  },
  panelTitle: {
    fontSize: '1.05rem',
    fontWeight: '600',
    marginBottom: '1rem',
    color: '#fff',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    paddingBottom: '0.5rem'
  },
  meterContainer: {
    position: 'relative',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    margin: '0.5rem 0'
  },
  meterText: {
    position: 'absolute',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  },
  meterVal: {
    fontSize: '2.25rem',
    fontWeight: '800',
    background: 'linear-gradient(135deg, #ffffff 0%, #a855f7 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  meterLabel: {
    fontSize: '0.65rem',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  metaStats: {
    display: 'flex',
    justifyContent: 'space-around',
    marginTop: '1.25rem',
    background: 'rgba(255, 255, 255, 0.02)',
    borderRadius: '0.75rem',
    padding: '0.75rem 0.5rem',
    border: '1px solid rgba(255,255,255,0.04)'
  },
  metaStatItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  },
  metaStatVal: {
    fontSize: '1.1rem',
    fontWeight: '700',
    color: '#fff'
  },
  metaStatLabel: {
    fontSize: '0.65rem',
    color: '#9ca3af',
    marginTop: '0.15rem'
  },
  metaDivider: {
    borderLeft: '1px solid rgba(255,255,255,0.08)',
    height: '24px',
    alignSelf: 'center'
  },
  archetypeBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginTop: '1rem',
    padding: '0.75rem',
    background: 'rgba(99, 102, 241, 0.05)',
    border: '1px solid rgba(99, 102, 241, 0.12)',
    borderRadius: '0.75rem'
  },
  badgeSuccess: {
    background: 'rgba(168, 85, 247, 0.15)',
    color: '#d8b4fe',
    fontSize: '0.8rem',
    fontWeight: '600',
    padding: '0.25rem 0.75rem',
    borderRadius: '1rem'
  },
  archetypeLabel: {
    fontSize: '0.65rem',
    color: '#9ca3af',
    marginTop: '0.25rem',
    textTransform: 'uppercase'
  },
  contextForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem'
  },
  inputRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem'
  },
  formLabel: {
    fontSize: '0.75rem',
    color: '#9ca3af',
    fontWeight: '500'
  },
  slider: {
    width: '100%',
    accentColor: '#6366f1',
    cursor: 'pointer'
  },
  energiesGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.75rem'
  },
  energyInput: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem'
  },
  textareaMini: {
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '0.5rem',
    padding: '0.5rem',
    color: '#fff',
    fontSize: '0.8rem',
    minHeight: '45px',
    outline: 'none',
    resize: 'none'
  },
  submitBtn: {
    background: '#6366f1',
    color: '#fff',
    border: 'none',
    padding: '0.65rem',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '0.85rem',
    marginTop: '0.5rem'
  },
  frozenStats: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem'
  },
  frozenItem: {
    display: 'flex',
    flexDirection: 'column',
    padding: '0.5rem',
    background: 'rgba(255,255,255,0.02)',
    borderRadius: '0.5rem',
    border: '1px solid rgba(255,255,255,0.04)'
  },
  frozenLabel: {
    fontSize: '0.65rem',
    color: '#9ca3af',
    fontWeight: 'bold',
    textTransform: 'uppercase'
  },
  frozenVal: {
    fontSize: '0.85rem',
    color: '#fff',
    marginTop: '0.15rem'
  },
  unfreezeBtn: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#9ca3af',
    padding: '0.5rem',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontSize: '0.8rem',
    marginTop: '0.5rem'
  },
  worldRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.8rem',
    padding: '0.4rem 0',
    borderBottom: '1px solid rgba(255,255,255,0.03)'
  },
  worldLabel: {
    color: '#9ca3af'
  },
  worldVal: {
    fontWeight: '500'
  },
  columnTitle: {
    fontSize: '1.5rem',
    fontWeight: '700',
    background: 'linear-gradient(135deg, #ffffff 0%, #6366f1 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  checklist: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem'
  },
  actionCard: {
    border: '1px solid',
    borderRadius: '1rem',
    padding: '1rem',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    display: 'flex',
    flexDirection: 'column'
  },
  actionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '1rem'
  },
  actionMain: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    flex: 1
  },
  catBadge: {
    alignSelf: 'flex-start',
    fontSize: '0.65rem',
    padding: '0.15rem 0.5rem',
    borderRadius: '0.5rem',
    fontWeight: '600'
  },
  actionTextTitle: {
    fontSize: '0.95rem',
    fontWeight: '500',
    lineHeight: '1.4'
  },
  actionControls: {
    display: 'flex',
    alignItems: 'center'
  },
  todoControls: {
    display: 'flex',
    gap: '0.5rem'
  },
  doneBtn: {
    background: 'rgba(16, 185, 129, 0.1)',
    border: '1px solid rgba(16, 185, 129, 0.2)',
    color: '#10b981',
    padding: '0.35rem 0.75rem',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: '500'
  },
  skipBtn: {
    background: 'rgba(239, 68, 68, 0.05)',
    border: '1px solid rgba(239, 68, 68, 0.15)',
    color: '#ef4444',
    padding: '0.35rem 0.5rem',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontSize: '0.8rem'
  },
  skippedState: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  },
  skippedText: {
    fontSize: '0.8rem',
    color: '#f59e0b',
    fontWeight: '500'
  },
  resetTaskBtn: {
    background: 'transparent',
    border: 'none',
    color: '#9ca3af',
    cursor: 'pointer',
    fontSize: '0.8rem',
    padding: '0.25rem'
  },
  starRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem'
  },
  starLabelMini: {
    fontSize: '0.75rem',
    color: '#9ca3af',
    marginRight: '0.25rem'
  },
  starBtn: {
    background: 'transparent',
    border: 'none',
    fontSize: '1.1rem',
    cursor: 'pointer',
    padding: 0
  },
  expandedContent: {
    marginTop: '0.75rem',
    borderTop: '1px solid rgba(255,255,255,0.05)',
    paddingTop: '0.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    cursor: 'default'
  },
  explainBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.15rem'
  },
  explainLabel: {
    fontSize: '0.7rem',
    color: '#818cf8',
    fontWeight: 'bold',
    textTransform: 'uppercase'
  },
  explainText: {
    fontSize: '0.85rem',
    color: '#e5e7eb',
    lineHeight: '1.45'
  },
  chatViewport: {
    flex: 1,
    overflowY: 'auto',
    marginBottom: '0.5rem',
    paddingRight: '0.25rem'
  },
  chatScroll: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem'
  },
  bubbleWrapper: {
    display: 'flex',
    width: '100%'
  },
  bubble: {
    maxWidth: '85%',
    padding: '0.65rem 0.85rem',
    borderRadius: '0.85rem',
    borderBottomLeftRadius: '0.15rem',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word'
  },
  bubbleText: {
    fontSize: '0.85rem',
    lineHeight: '1.4',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word'
  },
  chipRow: {
    display: 'flex',
    gap: '0.4rem',
    overflowX: 'auto',
    padding: '0.25rem 0',
    scrollbarWidth: 'none'
  },
  reflectionChip: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
    color: '#9ca3af',
    padding: '0.3rem 0.6rem',
    borderRadius: '0.5rem',
    fontSize: '0.75rem',
    whiteSpace: 'nowrap',
    cursor: 'pointer'
  },
  chatInputRow: {
    display: 'flex',
    gap: '0.5rem',
    marginTop: '0.5rem'
  },
  chatInput: {
    flex: 1,
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '0.5rem',
    padding: '0.5rem 0.75rem',
    color: '#fff',
    fontSize: '0.85rem',
    outline: 'none'
  },
  sendChatBtn: {
    background: '#6366f1',
    color: '#fff',
    border: 'none',
    padding: '0.5rem 1rem',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '0.85rem'
  },
  openDrawerBtn: {
    background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.1) 0%, rgba(99, 102, 241, 0.1) 100%)',
    border: '1px solid rgba(168, 85, 247, 0.25)',
    color: '#c084fc',
    padding: '0.75rem',
    borderRadius: '1rem',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: '600',
    textAlign: 'center',
    marginTop: '1.25rem'
  },
  actionBtn: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#9ca3af',
    padding: '0.4rem',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontSize: '0.75rem',
    textAlign: 'center'
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '80vh',
    background: '#030305',
    color: '#fff'
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '3px solid rgba(255, 255, 255, 0.05)',
    borderTopColor: '#6366f1',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  drawerOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    backdropFilter: 'blur(4px)',
    zIndex: 1000,
    display: 'flex',
    justifyContent: 'flex-end'
  },
  drawerContent: {
    width: '450px',
    height: '100%',
    background: '#0b0b12',
    borderLeft: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '-10px 0 35px rgba(0,0,0,0.5)',
    padding: '2rem 1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
    overflowY: 'auto'
  },
  drawerHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    paddingBottom: '0.75rem'
  },
  drawerTitle: {
    fontSize: '1.3rem',
    fontWeight: '700',
    color: '#fff'
  },
  closeDrawerBtn: {
    background: 'transparent',
    border: 'none',
    color: '#9ca3af',
    cursor: 'pointer',
    fontSize: '0.9rem'
  },
  drawerSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem'
  },
  drawerSecTitle: {
    fontSize: '0.95rem',
    fontWeight: '600',
    color: '#818cf8',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  insightsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem'
  },
  insightCard: {
    background: 'rgba(99, 102, 241, 0.04)',
    border: '1px solid rgba(99, 102, 241, 0.1)',
    borderRadius: '0.75rem',
    padding: '0.75rem',
    display: 'flex',
    gap: '0.75rem',
    alignItems: 'center'
  },
  insightIcon: {
    fontSize: '1.2rem'
  },
  insightText: {
    fontSize: '0.85rem',
    color: '#e5e7eb',
    lineHeight: '1.4'
  },
  emptyText: {
    fontSize: '0.8rem',
    color: '#6b7280',
    fontStyle: 'italic'
  },
  healthBlock: {
    background: 'rgba(255,255,255,0.01)',
    border: '1px solid rgba(255,255,255,0.04)',
    borderRadius: '0.75rem',
    padding: '0.75rem'
  },
  healthTitle: {
    fontSize: '0.8rem',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginBottom: '0.5rem'
  },
  healthList: {
    paddingLeft: '1rem',
    margin: 0,
    fontSize: '0.8rem',
    color: '#d1d5db',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem'
  },
  timelineList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    position: 'relative',
    paddingLeft: '1rem',
    borderLeft: '1px solid rgba(255,255,255,0.05)'
  },
  timelineItem: {
    position: 'relative',
    display: 'flex',
    gap: '0.75rem'
  },
  timelineDot: {
    position: 'absolute',
    left: '-1.35rem',
    top: '0.25rem',
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#a855f7',
    boxShadow: '0 0 6px #a855f7'
  },
  timelineDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.15rem'
  },
  timelineEvtTitle: {
    fontSize: '0.85rem',
    color: '#fff',
    fontWeight: '500'
  },
  timelineEvtType: {
    fontSize: '0.75rem',
    color: '#a855f7'
  },
  timelineDate: {
    fontSize: '0.7rem',
    color: '#6b7280'
  }
};
