'use client';

import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useRouter } from 'next/navigation';
import statements from '@/data/statements.json';

// Safely resolve imported statements with robust fallback array
const getActiveStatements = () => {
  const fallback = [
    "The world doesn't have a fitness or productivity problem; it has a consistency problem.",
    "Small disruptions compound into major life drift. Interrupt the cycle before it becomes permanent.",
    "AUM helps you recover your momentum before you drift too far from the life you want to build.",
    "The goal of AUM is not maximum productivity; it is sustained momentum.",
    "Progress is not measured by perfection. It is measured by the ability to return.",
    "Momentum is life's most valuable asset. It is easier to lose than motivation, but compounds faster than discipline.",
    "Momentum creates identity. Evolve your identity through small, daily, consistent choices.",
    "You do not fail because you lack discipline; you fail because life becomes too complex to execute good decisions.",
    "During burnout, we protect momentum. During consistency, we expand it. During high performance, we challenge it.",
    "We track not only actions, but identity evolution. Evolve from surviving life to intentionally shaping it.",
    "Return after a missed workout, after emotional eating, after burnout. Learn to return, always."
  ];

  if (!statements) return fallback;

  if (Array.isArray(statements)) {
    return statements.length > 0 ? statements : fallback;
  }

  // Handle case where statements is imported as module with default export
  if (statements.default && Array.isArray(statements.default)) {
    return statements.default.length > 0 ? statements.default : fallback;
  }

  return fallback;
};

// Static style injected once — keeps it out of the render cycle
const BANNER_STYLE_TAG = `
  @keyframes bannerPulse {
    0% { transform: scale(1); }
    50% { transform: scale(0.97) rotate(-0.5deg); }
    100% { transform: scale(1); }
  }
  .banner-click-animate {
    animation: bannerPulse 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  }
`;

if (typeof document !== 'undefined') {
  const existingTag = document.getElementById('aum-banner-style');
  if (!existingTag) {
    const tag = document.createElement('style');
    tag.id = 'aum-banner-style';
    tag.textContent = BANNER_STYLE_TAG;
    document.head.appendChild(tag);
  }
}

const InspirationBanner = memo(() => {
  const [statement, setStatement] = useState('');
  const [isFading, setIsFading] = useState(false);
  const [isClicking, setIsClicking] = useState(false);

  const rotateStatement = useCallback(() => {
    setIsFading(true);
    setTimeout(() => {
      setStatement(prev => {
        const activeList = getActiveStatements();
        const filtered = activeList.filter(s => s !== prev);
        if (filtered.length === 0) return prev;
        return filtered[Math.floor(Math.random() * filtered.length)];
      });
      setIsFading(false);
    }, 400); // Wait for fade out
  }, []);

  // Initialize statement on mount
  useEffect(() => {
    try {
      const activeList = getActiveStatements();
      if (activeList.length > 0) {
        const initial = activeList[Math.floor(Math.random() * activeList.length)];
        setStatement(initial);
      }
    } catch (err) {
      console.error('Error initializing InspirationBanner statement:', err);
    }
  }, []);

  // Rotate every 4 minutes (240000ms)
  useEffect(() => {
    const interval = setInterval(() => {
      rotateStatement();
    }, 240000);
    return () => clearInterval(interval);
  }, [rotateStatement]);

  const handleClick = () => {
    if (isClicking) return;
    setIsClicking(true);
    rotateStatement();
    setTimeout(() => {
      setIsClicking(false);
    }, 600); // Click animation duration
  };

  if (!statement) return null;

  return (
    <div 
      onClick={handleClick}
      className={isClicking ? 'banner-click-animate' : ''}
      style={{
        ...styles.bannerContainer,
        opacity: isFading ? 0.3 : 1,
        transition: 'opacity 0.4s ease-in-out'
      }}
    >
      <div style={styles.bannerGlow}></div>
      <div style={styles.bannerContent}>
        <span style={styles.bannerIcon}>✨</span>
        <p style={styles.bannerText}>"{statement}"</p>
      </div>
    </div>
  );
});
InspirationBanner.displayName = 'InspirationBanner';

const DashboardChatInput = memo(({ companionName, onSendMessage, isSendingChat }) => {
  const [inputValue, setInputValue] = useState('');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [inputValue]);


  const handleSend = () => {
    if (!inputValue.trim() || isSendingChat) return;
    onSendMessage(inputValue);
    setInputValue('');
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
        await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: "Shared a photo",
            type: "photo",
            mediaUrl: mediaUrl
          })
        });
        onSendMessage('', true);
      }
    } catch (err) {
      console.error("Failed to upload photo:", err);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    } else {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        alert("Speech recognition is not supported in this browser. Please use Google Chrome or Safari.");
        return;
      }
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-US';
      rec.onstart = () => {
        setIsRecording(true);
      };
      rec.onresult = (e) => {
        const transcript = e.results[0][0].transcript;
        setInputValue(prev => prev + (prev ? " " : "") + transcript);
      };
      rec.onerror = (e) => {
        console.error(e);
        setIsRecording(false);
      };
      rec.onend = () => {
        setIsRecording(false);
      };
      rec.start();
      recognitionRef.current = rec;
    }
  };

  return (
    <div style={styles.inputBar}>
      <button 
        onClick={() => fileInputRef.current?.click()} 
        style={styles.attachBtn}
        title="Attach photo"
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
        ref={textareaRef}
        rows={1}
        placeholder={`Message ${companionName}...`} 
        value={inputValue} 
        onChange={(e) => setInputValue(e.target.value)} 
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }}
        style={styles.feedTextarea}
        disabled={isSendingChat}
      />

      <button 
        onClick={toggleRecording} 
        style={{
          ...styles.micBtn,
          background: isRecording ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
          borderColor: isRecording ? '#ef4444' : 'rgba(255, 255, 255, 0.08)',
          color: isRecording ? '#ef4444' : '#9ca3af'
        }}
        title="Talk (Speech to Text)"
      >
        {isRecording ? <span style={styles.recordingPulse}></span> : '🎤'}
      </button>

      <button 
        onClick={handleSend} 
        style={styles.feedSendBtn} 
        disabled={isSendingChat || !inputValue.trim()}
      >
        Send
      </button>
    </div>
  );
});
DashboardChatInput.displayName = 'DashboardChatInput';

export default function Dashboard() {
  const router = useRouter();

  // Core Data States
  const [profile, setProfile] = useState(null);
  const [context, setContext] = useState(null);
  const [actions, setActions] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [virtualTime, setVirtualTime] = useState(null);
  const [currentTimeDisplay, setCurrentTimeDisplay] = useState('');

  // UI States
  const [expandedActionId, setExpandedActionId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [timeSelectorOpen, setTimeSelectorOpen] = useState(false);

  // New UI feature states
  const [isNotepadCollapsed, setIsNotepadCollapsed] = useState(false);
  const [showNotepadGlow, setShowNotepadGlow] = useState(false);

  const [ratingTarget, setRatingTarget] = useState(null); // { taskId: string } | null
  const [hoverRating, setHoverRating] = useState(0);
  const [selectedRating, setSelectedRating] = useState(0);
  const [selectedChips, setSelectedChips] = useState([]);

  // Refs
  const chatScrollRef = useRef(null);
  const canvasRef = useRef(null);
  const confettiSystemRef = useRef(null);
  const prevActionsLengthRef = useRef(0);
  const lastKnownDayRef = useRef(null);

  const formatTimeDisplay = useCallback((isoStr) => {
    const d = new Date(isoStr);
    const options = { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    setCurrentTimeDisplay(d.toLocaleDateString('en-US', options));
  }, []);

  const fetchAllData = useCallback(async () => {
    setIsLoading(true);
    try {
      const pRes = await fetch('/api/profile');
      const pData = await pRes.json();
      setProfile(pData);

      if (pData && pData.name && pData.onboarding_completed) {
        const tRes = await fetch('/api/time-travel');
        const tData = await tRes.json();
        setVirtualTime(tData.virtual_time);
        formatTimeDisplay(new Date().toISOString());

        const cRes = await fetch('/api/context');
        const cData = await cRes.json();
        setContext(cData);

        const aRes = await fetch('/api/actions');
        const aData = await aRes.json();
        setActions(aData);
        
        const chRes = await fetch('/api/chat');
        const chData = await chRes.json();
        setChatHistory(chData);
      }
    } catch (e) {
      console.error("Failed to load dashboard data:", e);
    } finally {
      setIsLoading(false);
    }
  }, [formatTimeDisplay]);

  // Reflection chips
  const reflectionChips = [
    "Today's been horrible.",
    "Walk for three minutes.",
    "Acknowledge a small win!",
    "I'm ready for more."
  ];

  const POSITIVE_CHIPS = ["Felt energizing", "Perfect timing", "Good difficulty", "Very relevant", "Built momentum"];
  const NEGATIVE_CHIPS = ["Too hard", "Bad timing", "Not relevant", "Too boring", "Too easy", "Felt forced"];

  const submitRating = async () => {
    if (!ratingTarget || selectedRating === 0) return;
    try {
      await fetch('/api/actions/rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionId: ratingTarget.taskId,
          rating: selectedRating,
          chips: selectedChips
        })
      });
    } catch (e) {
      console.error('Rating submit failed', e);
    } finally {
      setRatingTarget(null);
      setHoverRating(0);
      setSelectedRating(0);
      setSelectedChips([]);
    }
  };

  // Load all data
  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Seed the lastKnownDayRef after first data load
  useEffect(() => {
    if (profile?.last_generated_day) {
      if (!lastKnownDayRef.current) {
        lastKnownDayRef.current = profile.last_generated_day;
      }
    }
  }, [profile]);

  // Live clock ticker + smart 6 AM day-transition detector
  useEffect(() => {
    const clockInterval = setInterval(() => {
      // 1. Update the displayed clock with real current time
      const now = new Date();
      formatTimeDisplay(now.toISOString());

      // 2. Compute today's momentum day string (Kolkata time, same logic as server)
      const kolkataStr = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
      const kolkataNow = new Date(kolkataStr);
      const h = kolkataNow.getHours();

      // If before 6 AM, the 'day' is still yesterday
      let dayDate = new Date(kolkataNow);
      if (h < 6) {
        dayDate.setDate(dayDate.getDate() - 1);
      }
      const y = dayDate.getFullYear();
      const mo = String(dayDate.getMonth() + 1).padStart(2, '0');
      const d = String(dayDate.getDate()).padStart(2, '0');
      const todayStr = `${y}-${mo}-${d}`;

      // 3. If the day changed, fire a full refresh (handles 6:24 AM, 6:00 AM, any time)
      if (lastKnownDayRef.current && lastKnownDayRef.current !== todayStr) {
        console.log('[AUM] Day transition detected at', kolkataStr, '— refreshing dashboard...');
        lastKnownDayRef.current = todayStr;
        fetchAllData();
      }
    }, 60000); // Tick every 60 seconds

    return () => clearInterval(clockInterval);
  }, [fetchAllData]);

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
  }, [chatHistory, isSendingChat]);

  // Play synthetic audio chime using Web Audio API (Zero external file dependencies)
  const playChime = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      
      // Dual-tone chime for a warm, clean notification sound
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880.00, ctx.currentTime + 0.1); // A5
      
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.8);
    } catch (e) {
      console.warn("Web Audio chime failed:", e);
    }
  };

  // Watch for newly unlocked tasks to trigger animations and chime
  useEffect(() => {
    if (actions.length > 0 && prevActionsLengthRef.current > 0) {
      if (actions.length > prevActionsLengthRef.current) {
        setShowNotepadGlow(true);
        playChime();
        const timer = setTimeout(() => setShowNotepadGlow(false), 2500);
        return () => clearTimeout(timer);
      }
    }
    if (actions.length > 0) {
      prevActionsLengthRef.current = actions.length;
    }
  }, [actions]);

  // Redirect to onboarding if not completed
  useEffect(() => {
    if (profile && !profile.onboarding_completed) {
      router.push('/onboarding');
    }
  }, [profile, router]);



  const handleToggleAction = async (actionId, currentStatus) => {
    let nextStatus = 'todo';
    if (currentStatus === 'todo') {
      nextStatus = 'done';
      triggerConfettiBlast(50);
      playChime();
      setRatingTarget({ taskId: actionId });
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

  const handleSendChatMessage = async (text, refreshOnly = false) => {
    if (refreshOnly) {
      try {
        const chRes = await fetch('/api/chat');
        const chData = await chRes.json();
        setChatHistory(chData);
      } catch (err) {
        console.error("Failed to refresh chat after upload:", err);
      }
      return;
    }

    if (!text || !text.trim() || isSendingChat) return;

    setIsSendingChat(true);

    // Optimistically update chat history
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

      // Set up companion message bubble to stream into
      setChatHistory(prev => [...prev, { sender: 'AUM', text: '', timestamp: new Date().toISOString() }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let currentEventType = null;
      let currentData = '';
      let isMultiShot = false;
      let buffer = '';
      let accumulated = "";

      const processEvent = async (eventType, data) => {
        if (eventType === 'shot_start') {
          isMultiShot = true;
          accumulated = '';
          if (data !== '0') {
            setChatHistory(prev => [...prev, { sender: 'AUM', text: '', timestamp: new Date().toISOString() }]);
          }
        } else if (eventType === 'shot_end') {
          const delayMs = parseInt(data, 10);
          if (delayMs > 0) {
            await new Promise(r => setTimeout(r, delayMs));
          }
        }
      };

      // 32ms stream throttle
      let pendingUpdate = false;
      const flushAccumulatedStream = () => {
        if (pendingUpdate) return;
        pendingUpdate = true;
        setTimeout(() => {
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
          pendingUpdate = false;
        }, 32);
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.trim() === '') {
            if (currentEventType !== null) {
              await processEvent(currentEventType, currentData.trim());
              currentEventType = null;
              currentData = '';
            }
          } else if (line.startsWith('event: ')) {
            if (currentEventType !== null) {
              await processEvent(currentEventType, currentData.trim());
            }
            currentEventType = line.slice(7).trim();
            currentData = '';
          } else if (line.startsWith('data: ')) {
            const token = line.slice(6);
            if (currentEventType === 'shot_start' || currentEventType === 'shot_end') {
              currentData += token;
            } else if (currentEventType === null) {
              accumulated += token;
              flushAccumulatedStream();
            }
          }
        }
      }

      // Final synchronous flush
      if (accumulated) {
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

      // Re-sync actions and profile states
      const actRes = await fetch('/api/actions');
      const actData = await actRes.json();
      setActions(actData);

      const pRes = await fetch('/api/profile');
      const pData = await pRes.json();
      setProfile(pData);

      const cRes = await fetch('/api/context');
      const cData = await cRes.json();
      setContext(cData);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSendingChat(false);
    }
  };

  const handleWaterClick = async () => {
    if (!profile) return;
    const currentCups = profile.water_cups || 0;
    const nextCups = currentCups >= 8 ? 0 : currentCups + 1;
    
    // Optimistic UI update
    setProfile(prev => ({
      ...prev,
      water_cups: nextCups
    }));

    if (nextCups === 8) {
      triggerConfettiBlast(120);
      playChime();
    }

    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ water_cups: nextCups })
      });
      const data = await res.json();
      setProfile(data);
    } catch (e) {
      console.error("Failed to sync water:", e);
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
        alert("⏰ Next day started! Context logs reset, uncompleted tasks cleared.");
        fetchAllData();
      } else {
        const cRes = await fetch('/api/context');
        const cData = await cRes.json();
        setContext(cData);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const triggerConfettiBlast = (count) => {
    if (confettiSystemRef.current) {
      confettiSystemRef.current.start(count);
    }
  };

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
                {isUser ? 'YOU' : (profile.companion_name || 'Aarav').toUpperCase()}
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

    if (isSendingChat) {
      list.push(
        <div key="typing" style={{ ...styles.bubbleWrapper, justifyContent: 'flex-start' }}>
          <div style={{ ...styles.bubble, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: '700', color: '#a855f7', marginBottom: '0.2rem' }}>
              {(profile?.companion_name || 'Aarav').toUpperCase()}
            </div>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center', height: '16px', padding: '4px 2px' }}>
              <span style={styles.typingDot}></span>
              <span style={styles.typingDot}></span>
              <span style={styles.typingDot}></span>
            </div>
          </div>
        </div>
      );
    }

    return list;
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

  // Get nice display text for context check-in stage
  const getStageDisplayText = () => {
    const stage = context.checkin_stage || 'completed';
    if (stage === 'waiting_for_sleep') return '📋 Check-in: Sleep';
    if (stage === 'waiting_for_stress') return '📋 Check-in: Stress';
    if (stage === 'waiting_for_energy') return '📋 Check-in: Energy';
    return '⚡ Daily Logs Locked';
  };

  const checkin_stage = context?.checkin_stage || 'completed';
  const visibleActions = checkin_stage !== 'completed'
    ? actions.filter(a => a.id === 'morning-checkin')
    : actions;
  const nonStarterActions = actions.filter(a => a.id !== 'morning-checkin');

  return (
    <div style={styles.dashboardContainer}>
      <canvas ref={canvasRef} style={styles.confettiCanvas}></canvas>

      {/* STICKY HEADER */}
      <header style={styles.header}>
        {/* Left Section: Momentum circle progress & Checkin State */}
        <div style={styles.headerLeft}>
          <div style={styles.headerMomentumContainer}>
            <svg width="45" height="45" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="48" fill="transparent" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
              <circle 
                cx="60" cy="60" r="48" 
                fill="transparent" 
                stroke="url(#headerMomentumGradient)" 
                strokeWidth="10" 
                strokeDasharray="301"
                strokeDashoffset={301 - (301 * (profile.momentum_score || 50)) / 100}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 0.8s ease-in-out' }}
              />
              <defs>
                <linearGradient id="headerMomentumGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#128c7e" />
                  <stop offset="100%" stopColor="#25d366" />
                </linearGradient>
              </defs>
            </svg>
            <div style={styles.headerMomentumText}>{profile.momentum_score || 50}</div>
          </div>
          <div style={styles.headerContextLabel}>
            <span style={{ fontSize: '0.85rem', fontWeight: '600' }}>{getStageDisplayText()}</span>
            <span style={{ fontSize: '0.65rem', color: '#9ca3af', textTransform: 'uppercase' }}>🔥 {profile.streak || 0}d Streak</span>
          </div>
        </div>

        {/* Right Section: Navigation Links & Interactive Water widget */}
        <div style={styles.headerRight}>
          <button 
            onClick={handleWaterClick} 
            style={{
              ...styles.waterWidget,
              background: (profile.water_cups || 0) >= 8 ? 'rgba(37, 211, 102, 0.15)' : 'rgba(255, 255, 255, 0.03)',
              borderColor: (profile.water_cups || 0) >= 8 ? '#25d366' : 'rgba(255, 255, 255, 0.08)',
              color: (profile.water_cups || 0) >= 8 ? '#25d366' : '#9ca3af'
            }}
          >
            💧 {profile.water_cups || 0}/8 Cups {(profile.water_cups || 0) >= 8 && '🎉'}
          </button>
          
          <button onClick={() => setTimeSelectorOpen(!timeSelectorOpen)} style={styles.navBtn}>
            📅 {currentTimeDisplay}
          </button>
          
          <button onClick={() => router.push('/identity')} style={styles.navBtn}>Profile</button>
          
          <button 
            onClick={() => {
              if(confirm("🚨 Wipe entire session? This deletes all data.")) {
                fetch('/api/profile/reset', { method: 'POST' }).then(() => window.location.reload());
              }
            }} 
            style={styles.navBtnReset}
          >
            Reset
          </button>
        </div>

        {/* Time Travel Dropdown */}
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
      </header>

      {/* FLOATING GLASSMORPHISM NOTEPAD (TOP-RIGHT) */}
      <div 
        style={{
          ...styles.notepadContainer,
          width: isNotepadCollapsed ? '70px' : '360px',
          height: isNotepadCollapsed ? '70px' : 'auto',
          maxHeight: isNotepadCollapsed ? '70px' : 'calc(100vh - 120px)',
          borderRadius: isNotepadCollapsed ? '50%' : '1.25rem',
          padding: isNotepadCollapsed ? '0' : '1.25rem',
          boxShadow: showNotepadGlow 
            ? '0 0 25px rgba(37, 211, 102, 0.4), 0 8px 32px rgba(0, 0, 0, 0.4)' 
            : '0 8px 32px rgba(0, 0, 0, 0.3)'
        }}
      >
        {isNotepadCollapsed ? (
          <button 
            style={styles.notepadCollapsedBadge}
            onClick={() => setIsNotepadCollapsed(false)}
            title="Open Notepad"
          >
            📋
            <span style={styles.notepadCollapsedCount}>
              {visibleActions.filter(a => a.status === 'done').length}/{visibleActions.length}
            </span>
          </button>
        ) : (
          <>
            <div style={styles.notepadHeader}>
              <h3 style={styles.notepadTitle}>Today's Moves</h3>
              <div className="flex align-center gap-2">
                <span style={styles.movesCountBadge}>
                  {visibleActions.filter(a => a.status === 'done').length} / {visibleActions.length} Done
                </span>
                <button 
                  onClick={() => setIsNotepadCollapsed(true)} 
                  style={styles.notepadCloseBtn}
                >
                  ✕
                </button>
              </div>
            </div>

            <div style={styles.notepadList}>
              {visibleActions.length === 0 ? (
                <p style={styles.emptyTasksText}>No tasks unlocked yet. Start check-in to get going.</p>
              ) : (
                <>
                  {visibleActions.map((act) => {
                    const isExpanded = expandedActionId === act.id;
                  const isDone = act.status === 'done';
                  const isSkipped = act.status === 'skipped';
                  const isBonus = act.category === 'Bonus' || act.text?.toLowerCase().includes('bonus');
                  const isLocked = act.locked;

                  return (
                    <div 
                      key={act.id} 
                      style={{
                        ...styles.moveItemRow,
                        border: isDone ? '1px solid rgba(16, 185, 129, 0.2)' : isLocked ? '1px dashed rgba(255,255,255,0.08)' : '1px solid rgba(255,255,255,0.06)',
                        background: isDone ? 'rgba(16, 185, 129, 0.02)' : 'rgba(255,255,255,0.01)',
                        opacity: isLocked ? 0.6 : 1,
                        cursor: isLocked ? 'not-allowed' : 'pointer'
                      }}
                      onClick={() => {
                        if (!isLocked) setExpandedActionId(isExpanded ? null : act.id);
                      }}
                    >
                      <div style={styles.moveItemHeader}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span 
                              style={{
                                ...styles.moveCatBadge,
                                background: isBonus ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255,255,255,0.04)',
                                color: isBonus ? '#fbbf24' : '#9ca3af'
                              }}
                            >
                              {isBonus ? '🌟 BONUS' : act.category}
                            </span>
                            {isLocked && (
                              <span style={{ fontSize: '0.75rem', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)', padding: '2px 6px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                                🔒 Locked until {act.scheduled_time}
                              </span>
                            )}
                          </div>
                          <h4 style={{
                            ...styles.moveTextTitle,
                            textDecoration: isDone ? 'line-through' : 'none',
                            color: isDone ? '#9ca3af' : isLocked ? '#6b7280' : '#fff'
                          }}>{act.text}</h4>
                        </div>

                        {/* Quick controls */}
                        <div style={styles.moveControls} onClick={(e) => e.stopPropagation()}>
                          {isLocked ? (
                            <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>🔒 Locked</span>
                          ) : isDone ? (
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
                              <button onClick={() => handleToggleAction(act.id, 'skipped')} style={styles.resetTaskBtn}>↺</button>
                            </div>
                          ) : (
                            <div style={styles.todoControls}>
                              <button onClick={() => handleToggleAction(act.id, 'todo')} style={styles.doneBtn} title="Complete">✓</button>
                              <button onClick={() => handleToggleAction(act.id, 'skipped')} style={styles.skipBtn} title="Ignore">✕</button>
                            </div>
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div style={styles.moveExpandedContent}>
                          <div style={styles.moveExplainBlock}>
                            <span style={styles.moveExplainLabel}>Why This Matters</span>
                            <p style={styles.moveExplainText}>{act.whyToday || act.whyRelevant}</p>
                          </div>
                          {act.howTo && (
                            <div style={styles.moveExplainBlock}>
                              <span style={styles.moveExplainLabel}>How to Complete</span>
                              <p style={styles.moveExplainText}>{act.howTo}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {ratingTarget?.taskId === act.id && (
                        <div style={{
                          marginTop: '12px',
                          padding: '12px',
                          background: 'rgba(255,255,255,0.05)',
                          borderRadius: '12px',
                          border: '1px solid rgba(255,255,255,0.1)'
                        }}>
                          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginBottom: '8px' }}>
                            How did this task feel?
                          </p>
                          {/* Stars */}
                          <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                            {[1,2,3,4,5].map(star => (
                              <span
                                key={star}
                                onClick={() => setSelectedRating(star)}
                                onMouseEnter={() => setHoverRating(star)}
                                onMouseLeave={() => setHoverRating(0)}
                                style={{
                                  fontSize: '24px',
                                  cursor: 'pointer',
                                  color: star <= (hoverRating || selectedRating) ? '#F59E0B' : 'rgba(255,255,255,0.2)',
                                  transition: 'color 0.15s ease'
                                }}
                              >
                                ★
                              </span>
                            ))}
                          </div>
                          {/* Chips */}
                          {selectedRating > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                              {(selectedRating >= 4 ? POSITIVE_CHIPS : NEGATIVE_CHIPS).map(chip => (
                                <span
                                  key={chip}
                                  onClick={() => setSelectedChips(prev =>
                                    prev.includes(chip) ? prev.filter(c => c !== chip) : [...prev, chip]
                                  )}
                                  style={{
                                    padding: '4px 10px',
                                    borderRadius: '20px',
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                    border: selectedChips.includes(chip)
                                      ? '1px solid #F59E0B'
                                      : '1px solid rgba(255,255,255,0.2)',
                                    background: selectedChips.includes(chip)
                                      ? 'rgba(245,158,11,0.15)'
                                      : 'transparent',
                                    color: selectedChips.includes(chip)
                                      ? '#F59E0B'
                                      : 'rgba(255,255,255,0.6)',
                                    transition: 'all 0.15s ease'
                                  }}
                                >
                                  {chip}
                                </span>
                              ))}
                            </div>
                          )}
                          {/* Submit button */}
                          {selectedRating > 0 && (
                            <button
                              onClick={submitRating}
                              style={{
                                padding: '6px 16px',
                                borderRadius: '8px',
                                background: '#F59E0B',
                                color: '#000',
                                fontWeight: '600',
                                fontSize: '13px',
                                border: 'none',
                                cursor: 'pointer'
                              }}
                            >
                              Submit
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {checkin_stage === 'completed' && nonStarterActions.length === 0 && (
                  <p style={styles.emptyTasksText}>Your tasks will appear as we talk</p>
                )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* CHAT VIEWPORT */}
      <div style={styles.chatViewport}>
        <InspirationBanner />
        <div style={styles.chatMessagesArea} ref={chatScrollRef}>
          <div style={styles.chatWelcomeMessage}>
            <h2>{profile.companion_name || 'Aarav'}</h2>
            <p>Your reflective space & daily momentum coach. Talk freely, speak or write what is on your mind.</p>
          </div>
          {renderChatHistoryWithMonthDividers()}
        </div>

        {/* INPUT BOX */}
        <div style={styles.inputAreaWrapper}>
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

          <DashboardChatInput
            companionName={profile.companion_name || 'Aarav'}
            onSendMessage={handleSendChatMessage}
            isSendingChat={isSendingChat}
          />
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

// Inline CSS Styles for absolute glassmorphic minimalist visual layout
const styles = {
  dashboardContainer: {
    color: '#fff',
    height: '100vh',
    width: '100vw',
    display: 'flex',
    flexDirection: 'column',
    background: 'radial-gradient(ellipse at bottom, #0f1319 0%, #040508 100%)',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    overflow: 'hidden',
    position: 'relative'
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
  header: {
    height: '70px',
    background: 'rgba(10, 12, 18, 0.45)',
    backdropFilter: 'blur(30px)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0 2rem',
    zIndex: 100,
    position: 'relative'
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem'
  },
  headerMomentumContainer: {
    position: 'relative',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    width: '45px',
    height: '45px'
  },
  headerMomentumText: {
    position: 'absolute',
    fontSize: '0.85rem',
    fontWeight: '800',
    color: '#25d366'
  },
  headerContextLabel: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center'
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem'
  },
  waterWidget: {
    border: '1px solid',
    padding: '0.5rem 1rem',
    borderRadius: '1rem',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '0.85rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    transition: 'all 0.2s ease'
  },
  navBtn: {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    color: '#e5e7eb',
    padding: '0.5rem 1rem',
    borderRadius: '1rem',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: '500',
    transition: 'all 0.2s ease'
  },
  navBtnReset: {
    background: 'rgba(239, 68, 68, 0.05)',
    border: '1px solid rgba(239, 68, 68, 0.15)',
    color: '#f87171',
    padding: '0.5rem 1rem',
    borderRadius: '1rem',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: '500',
    transition: 'all 0.2s ease'
  },
  timeDropdown: {
    position: 'absolute',
    top: '75px',
    right: '2rem',
    background: 'rgba(15, 15, 25, 0.98)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '1.25rem',
    padding: '1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.65rem',
    zIndex: 200,
    width: '240px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
  },
  simBtn: {
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#fff',
    padding: '0.5rem',
    borderRadius: '0.75rem',
    cursor: 'pointer',
    fontSize: '0.8rem',
    transition: 'all 0.15s ease'
  },
  simBtnPrimary: {
    background: '#128c7e',
    border: 'none',
    color: '#fff',
    padding: '0.6rem',
    borderRadius: '0.75rem',
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: '600',
    transition: 'all 0.15s ease'
  },
  resetClockBtn: {
    background: 'transparent',
    border: 'none',
    color: '#ef4444',
    cursor: 'pointer',
    fontSize: '0.8rem',
    marginTop: '0.25rem'
  },
  notepadContainer: {
    position: 'fixed',
    top: '90px',
    right: '2rem',
    background: 'rgba(15, 18, 25, 0.7)',
    backdropFilter: 'blur(25px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    zIndex: 90,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)'
  },
  notepadCollapsedBadge: {
    width: '100%',
    height: '100%',
    background: 'transparent',
    border: 'none',
    color: '#fff',
    fontSize: '1.5rem',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative'
  },
  notepadCollapsedCount: {
    fontSize: '0.65rem',
    color: '#25d366',
    fontWeight: '700',
    marginTop: '2px',
    background: 'rgba(37, 211, 102, 0.12)',
    padding: '1px 5px',
    borderRadius: '4px'
  },
  notepadHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
    paddingBottom: '0.75rem',
    marginBottom: '0.75rem'
  },
  notepadTitle: {
    fontSize: '0.95rem',
    fontWeight: '700',
    color: '#e5e7eb',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  notepadCloseBtn: {
    background: 'transparent',
    border: 'none',
    color: '#9ca3af',
    cursor: 'pointer',
    fontSize: '0.9rem',
    padding: '0.25rem'
  },
  movesCountBadge: {
    fontSize: '0.75rem',
    background: 'rgba(37, 211, 102, 0.1)',
    color: '#25d366',
    padding: '0.2rem 0.5rem',
    borderRadius: '0.5rem',
    fontWeight: '600'
  },
  notepadList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    overflowY: 'auto',
    flexGrow: 1
  },
  emptyTasksText: {
    fontSize: '0.85rem',
    color: '#9ca3af',
    textAlign: 'center',
    padding: '2rem 1rem',
    lineHeight: '1.4'
  },
  moveItemRow: {
    borderRadius: '0.75rem',
    padding: '0.75rem',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    display: 'flex',
    flexDirection: 'column'
  },
  moveItemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '0.75rem'
  },
  moveCatBadge: {
    alignSelf: 'flex-start',
    fontSize: '0.6rem',
    padding: '0.15rem 0.4rem',
    borderRadius: '0.4rem',
    fontWeight: '700',
    letterSpacing: '0.05em'
  },
  moveTextTitle: {
    fontSize: '0.85rem',
    fontWeight: '600',
    marginTop: '0.35rem',
    lineHeight: '1.4'
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
    background: 'rgba(37, 211, 102, 0.12)',
    border: '1px solid rgba(37, 211, 102, 0.25)',
    color: '#25d366',
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '700',
    fontSize: '0.85rem'
  },
  skipBtn: {
    background: 'rgba(239, 68, 68, 0.08)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    color: '#f87171',
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
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
    fontWeight: '600'
  },
  resetTaskBtn: {
    background: 'transparent',
    border: 'none',
    color: '#9ca3af',
    cursor: 'pointer',
    fontSize: '0.8rem',
    marginLeft: '0.35rem'
  },
  starRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.1rem'
  },
  starBtn: {
    background: 'transparent',
    border: 'none',
    fontSize: '0.9rem',
    cursor: 'pointer',
    padding: '1px'
  },
  moveExpandedContent: {
    marginTop: '0.75rem',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    paddingTop: '0.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    cursor: 'default'
  },
  moveExplainBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.15rem'
  },
  moveExplainLabel: {
    fontSize: '0.65rem',
    color: '#128c7e',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  moveExplainText: {
    fontSize: '0.78rem',
    color: '#d1d5db',
    lineHeight: '1.45'
  },
  chatViewport: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    maxWidth: '800px',
    margin: '0 auto',
    padding: '1.5rem 1rem',
    boxSizing: 'border-box',
    height: 'calc(100vh - 70px)',
    position: 'relative'
  },
  chatMessagesArea: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
    paddingRight: '0.5rem',
    paddingBottom: '2rem',
    scrollbarWidth: 'thin'
  },
  chatWelcomeMessage: {
    textAlign: 'center',
    padding: '4rem 1rem 2rem 1rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem'
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
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative'
  },
  bubbleText: {
    fontSize: '0.92rem',
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
  inputAreaWrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    marginTop: 'auto',
    background: 'transparent',
    padding: '0.5rem 0'
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
    padding: '0.25rem 0.65rem',
    borderRadius: '0.75rem',
    fontSize: '0.75rem',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    transition: 'all 0.15s ease'
  },
  inputBar: {
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '1.5rem',
    padding: '0.5rem 0.75rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)',
    backdropFilter: 'blur(10px)'
  },
  attachBtn: {
    background: 'transparent',
    border: 'none',
    color: '#9ca3af',
    width: '36px',
    height: '36px',
    fontSize: '1.2rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    transition: 'all 0.15s ease'
  },
  micBtn: {
    border: '1px solid',
    width: '36px',
    height: '36px',
    fontSize: '1rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    transition: 'all 0.15s ease',
    position: 'relative'
  },
  recordingPulse: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#ef4444',
    display: 'block',
    animation: 'pulse 1.2s infinite ease-in-out'
  },
  feedTextarea: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    color: '#fff',
    fontSize: '0.9rem',
    outline: 'none',
    resize: 'none',
    overflowY: 'auto',
    height: 'auto',
    minHeight: '24px',
    maxHeight: '160px',
    lineHeight: '1.4',
    fontFamily: 'inherit',
    padding: 0
  },
  feedSendBtn: {
    background: '#128c7e',
    color: '#fff',
    border: 'none',
    padding: '0 1rem',
    borderRadius: '1rem',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '0.85rem',
    height: '32px',
    transition: 'all 0.15s ease'
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
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
  },
  typingDot: {
    width: '6px',
    height: '6px',
    background: '#a855f7',
    borderRadius: '50%',
    display: 'inline-block',
    animation: 'bounce 1.4s infinite ease-in-out both'
  },
  bannerContainer: {
    position: 'relative',
    background: 'rgba(15, 18, 28, 0.92)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '1rem',
    padding: '0.85rem 1.25rem',
    cursor: 'pointer',
    userSelect: 'none',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 30px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
    willChange: 'opacity',
    marginBottom: '1rem',
  },
  bannerGlow: {
    position: 'absolute',
    top: '-50%',
    left: '50%',
    transform: 'translateX(-55%)',
    width: '80%',
    height: '100%',
    background: 'radial-gradient(ellipse at center, rgba(168, 85, 247, 0.15) 0%, rgba(168, 85, 247, 0) 70%)',
    pointerEvents: 'none',
    zIndex: 0,
  },
  bannerContent: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.75rem',
    maxWidth: '100%',
  },
  bannerIcon: {
    fontSize: '1rem',
    color: '#a855f7',
    textShadow: '0 0 8px rgba(168, 85, 247, 0.6)',
    flexShrink: 0,
  },
  bannerText: {
    fontSize: '0.85rem',
    color: '#e2e8f0',
    fontWeight: '400',
    fontStyle: 'italic',
    lineHeight: '1.4',
    textAlign: 'center',
    margin: 0,
    letterSpacing: '0.015em',
    textShadow: '0 2px 4px rgba(0,0,0,0.4)',
  }
};
