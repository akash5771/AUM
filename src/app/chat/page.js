'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

export default function ChatPage() {
  const router = useRouter();
  
  // Core Data States
  const [profile, setProfile] = useState(null);
  const [context, setContext] = useState(null);
  const [actions, setActions] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [expandedActionId, setExpandedActionId] = useState(null);
  const [showMoves, setShowMoves] = useState(true);
  const [chatInput, setChatInput] = useState('');
  const [activeReactionIdx, setActiveReactionIdx] = useState(null);

  // Refs
  const chatScrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const longPressTimer = useRef(null);

  // Fetch initial profile, actions & chat history
  useEffect(() => {
    fetchInitialData();
  }, []);

  // Auto scroll to bottom
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatHistory, isSendingChat, actions]);

  const fetchInitialData = async () => {
    try {
      const pRes = await fetch('/api/profile');
      const pData = await pRes.json();
      setProfile(pData);

      const cRes = await fetch('/api/context');
      const cData = await cRes.json();
      setContext(cData);

      const aRes = await fetch('/api/actions');
      const aData = await aRes.json();
      setActions(aData);

      const chRes = await fetch('/api/chat');
      const chData = await chRes.json();
      setChatHistory(chData);
    } catch (e) {
      console.error("Error fetching chat standalone data:", e);
    }
  };

  const handleSendChatMessage = async (textOverride) => {
    const text = textOverride || chatInput;
    if (!text.trim() || isSendingChat) return;

    setIsSendingChat(true);
    // Optimistic user bubble
    setChatHistory(prev => [...prev, { sender: 'User', text, timestamp: new Date().toISOString() }]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
      
      if (!res.ok) throw new Error("API call failed");
      if (!textOverride) setChatInput('');

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

      // Sync actions list which might update after background signals process
      const actRes = await fetch('/api/actions');
      const actData = await actRes.json();
      setActions(actData);
    } catch (e) {
      console.error("Error sending message:", e);
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

  const handleToggleAction = async (actionId, currentStatus) => {
    let nextStatus = 'todo';
    if (currentStatus === 'todo') {
      nextStatus = 'done';
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
      setChatHistory(data.chat_history || chatHistory);
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
    } catch (e) {
      console.error(e);
    }
  };

  const handleReaction = async (messageIndex, emoji) => {
    // Optimistically update local state
    setChatHistory(prev => {
      const updated = [...prev];
      if (updated[messageIndex]) {
        updated[messageIndex] = {
          ...updated[messageIndex],
          reaction: updated[messageIndex].reaction === emoji ? undefined : emoji
        };
      }
      return updated;
    });
    setActiveReactionIdx(null);
    // Persist to DB
    try {
      await fetch('/api/chat', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageIndex, reaction: emoji })
      });
    } catch (e) {
      console.error('Failed to save reaction:', e);
    }
  };


  const renderChatHistoryWithMonthDividers = () => {
    const list = [];
    let lastMonthYear = "";
    const REACTIONS = ['👍', '❤️', '👏', '🌱'];

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
        const timeStr = bubble.timestamp
          ? new Date(bubble.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase()
          : '';
        const isReactionActive = activeReactionIdx === idx;

        list.push(
          <div 
            key={`chat-${idx}`} 
            style={{
              ...styles.bubbleWrapper,
              justifyContent: isUser ? 'flex-end' : 'flex-start',
              position: 'relative'
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', maxWidth: '78%', position: 'relative' }}>
              
              {/* Reaction strip — shown on hover/long-press for AUM messages */}
              {!isUser && isReactionActive && (
                <div style={styles.reactionStrip}>
                  {REACTIONS.map(emoji => (
                    <button
                      key={emoji}
                      style={{
                        ...styles.reactionOption,
                        transform: bubble.reaction === emoji ? 'scale(1.3)' : 'scale(1)'
                      }}
                      onClick={() => handleReaction(idx, emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}

              {/* Main bubble */}
              <div
                style={{
                  ...styles.bubble,
                  background: isUser ? 'linear-gradient(135deg, #128c7e 0%, #075e54 100%)' : '#1e2235',
                  border: isUser ? 'none' : '1px solid rgba(255,255,255,0.07)',
                  borderBottomRightRadius: isUser ? '0.15rem' : '0.85rem',
                  borderBottomLeftRadius: isUser ? '0.85rem' : '0.15rem',
                  cursor: !isUser ? 'default' : undefined,
                }}
                onMouseEnter={!isUser ? () => setActiveReactionIdx(idx) : undefined}
                onMouseLeave={!isUser ? () => setActiveReactionIdx(null) : undefined}
                onTouchStart={!isUser ? () => { longPressTimer.current = setTimeout(() => setActiveReactionIdx(idx), 500); } : undefined}
                onTouchEnd={!isUser ? () => { clearTimeout(longPressTimer.current); } : undefined}
              >
                {bubble.type === 'photo' && bubble.mediaUrl ? (
                  <div style={styles.photoContainer}>
                    <img src={bubble.mediaUrl} alt="Shared memory" style={styles.photoImg} />
                    <p style={{ ...styles.bubbleText, marginTop: '0.5rem' }}>{bubble.text}</p>
                  </div>
                ) : (
                  <span style={styles.bubbleText}>{bubble.text}</span>
                )}
              </div>

              {/* Timestamp + reaction pill row */}
              <div style={styles.bubbleMeta}>
                {bubble.reaction && (
                  <span
                    style={styles.reactionPill}
                    onClick={() => !isUser && handleReaction(idx, bubble.reaction)}
                    title="Click to remove"
                  >
                    {bubble.reaction}
                  </span>
                )}
                <span style={styles.timestampText}>{timeStr}</span>
              </div>
            </div>
          </div>
        );
      }
    });

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
            background: '#1e2235',
            border: '1px solid rgba(255,255,255,0.07)',
            borderBottomRightRadius: '0.85rem',
            borderBottomLeftRadius: '0.15rem',
          }}>
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

  if (!profile) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
      </div>
    );
  }

  return (
    <div style={styles.pageContainer}>
      <div style={styles.chatFeedColumn}>
        
        {/* Header */}
        <div style={styles.feedHeaderPanel}>
          <div className="flex align-center justify-between" style={{ width: '100%' }}>
            <div className="flex align-center gap-3">
              <button onClick={() => router.push('/')} style={styles.backBtn}>← Back</button>
              <div style={styles.avatar}>🕉️</div>
              <div>
                <h2 style={{ fontSize: '1.15rem', color: '#fff' }}>{profile.companion_name || 'Aarav'}</h2>
                <div className="flex align-center gap-1" style={{ marginTop: '0.15rem' }}>
                  <span style={{ ...styles.onlineDot, backgroundColor: isSendingChat ? '#a855f7' : '#25d366' }}></span>
                  <span style={{ fontSize: '0.75rem', color: isSendingChat ? '#a855f7' : '#128c7e', fontStyle: isSendingChat ? 'italic' : 'normal' }}>
                    {isSendingChat ? 'typing...' : 'Online'}
                  </span>
                </div>
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
                <span style={styles.movesCountBadge}>{actions.filter(a => a.status === 'done').length} / {actions.length} Done</span>
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
                          <span style={styles.moveCatBadge}>{act.category}</span>
                          <h4 style={{
                            ...styles.moveTextTitle,
                            textDecoration: isDone ? 'line-through' : 'none',
                            color: isDone ? '#9ca3af' : '#fff'
                          }}>{act.text}</h4>
                          {act.whyToday && (
                            <p style={styles.moveExplanationWhy}>➔ {act.whyToday}</p>
                          )}
                        </div>
                        <div style={styles.moveControls} onClick={(e) => e.stopPropagation()}>
                          {isDone ? (
                            <div style={styles.starRow}>
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button key={star} onClick={() => handleRateAction(act.id, star)} style={{...styles.starBtn, color: (act.rating || 4) >= star ? '#fbbf24' : 'rgba(255,255,255,0.2)'}}>★</button>
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
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Viewport */}
        <div style={styles.feedViewport} ref={chatScrollRef}>
          {profile.pinned_mission && (
            <div style={styles.pinnedMissionBanner}>
              <span style={styles.pinIcon}>📌</span>
              <span style={styles.pinText}>
                <strong>Current Mission</strong>: {profile.pinned_mission.title}
              </span>
            </div>
          )}

          <div style={styles.feedScrollArea}>
            {renderChatHistoryWithMonthDividers()}
          </div>
        </div>

        {/* Input */}
        <div style={styles.feedInputPanel}>
          <div className="flex gap-2" style={{ width: '100%', alignItems: 'center' }}>
            <button onClick={() => fileInputRef.current?.click()} style={styles.attachBtn}>📷</button>
            <input type="file" ref={fileInputRef} onChange={handlePhotoUpload} accept="image/*" style={{ display: 'none' }} />
            
            <input 
              type="text" 
              placeholder={`Message ${profile?.companion_name || 'Aarav'}...`}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendChatMessage();
                }
              }}
              style={styles.chatInput}
            />
            <button
              onClick={() => handleSendChatMessage()}
              disabled={!chatInput.trim() || isSendingChat}
              style={{
                ...styles.sendBtn,
                opacity: (!chatInput.trim() || isSendingChat) ? 0.4 : 1
              }}
            >▶</button>
          </div>
        </div>

      </div>
    </div>
  );
}

const styles = {
  pageContainer: {
    color: '#fff',
    height: 'calc(100vh - 72px)',
    background: '#040508',
    display: 'flex',
    justifyContent: 'center',
    fontFamily: 'system-ui, -apple-system, sans-serif'
  },
  pinnedMovesContainer: {
    background: 'rgba(20, 24, 35, 0.6)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    padding: '0.85rem 1.25rem',
    maxHeight: '320px',
    overflowY: 'auto'
  },
  chatFeedColumn: {
    width: '100%',
    maxWidth: '650px',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(10, 12, 18, 0.6)',
    borderLeft: '1px solid rgba(255,255,255,0.06)',
    borderRight: '1px solid rgba(255,255,255,0.06)',
  },
  feedHeaderPanel: {
    background: 'rgba(20, 24, 35, 0.8)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    padding: '0.75rem 1.25rem',
  },
  backBtn: {
    background: 'transparent',
    border: 'none',
    color: '#25d366',
    cursor: 'pointer',
    fontSize: '0.85rem',
    marginRight: '0.5rem'
  },
  avatar: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: 'rgba(18, 140, 126, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.1rem'
  },
  onlineDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: '#25d366',
    display: 'inline-block'
  },
  feedViewport: {
    flex: 1,
    padding: '1rem',
    overflowY: 'auto'
  },
  pinnedMissionBanner: {
    background: 'rgba(18, 140, 126, 0.9)',
    borderRadius: '0.5rem',
    padding: '0.4rem 0.6rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    marginBottom: '1rem'
  },
  pinIcon: { fontSize: '0.85rem' },
  pinText: { fontSize: '0.7rem', color: '#fff' },
  feedScrollArea: { display: 'flex', flexDirection: 'column', gap: '0.85rem' },
  monthHeader: { display: 'flex', justify: 'center', margin: '1rem 0' },
  monthHeaderSpan: {
    fontSize: '0.7rem',
    color: '#a855f7',
    background: 'rgba(168, 85, 247, 0.1)',
    padding: '0.2rem 0.5rem',
    borderRadius: '0.75rem'
  },
  systemLogMessage: { display: 'flex', justifyContent: 'center' },
  systemLogSpan: {
    fontSize: '0.68rem',
    color: '#9ca3af',
    background: 'rgba(255,255,255,0.02)',
    padding: '0.15rem 0.5rem',
    borderRadius: '0.4rem'
  },
  bubbleWrapper: { display: 'flex', width: '100%' },
  bubble: {
    padding: '0.7rem 0.9rem',
    borderRadius: '0.75rem',
    lineHeight: '1.5',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
  },
  bubbleText: { fontSize: '0.9rem', color: '#fff', whiteSpace: 'pre-wrap' },
  bubbleMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    marginTop: '0.25rem',
    paddingLeft: '0.2rem',
    paddingRight: '0.2rem'
  },
  timestampText: {
    fontSize: '0.65rem',
    color: 'rgba(255,255,255,0.25)',
    userSelect: 'none'
  },
  reactionStrip: {
    display: 'flex',
    gap: '0.3rem',
    background: 'rgba(20,24,38,0.95)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '2rem',
    padding: '0.3rem 0.6rem',
    marginBottom: '0.3rem',
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    zIndex: 10,
    position: 'relative'
  },
  reactionOption: {
    background: 'transparent',
    border: 'none',
    fontSize: '1.25rem',
    cursor: 'pointer',
    padding: '0.1rem',
    transition: 'transform 0.15s ease',
    lineHeight: 1
  },
  reactionPill: {
    fontSize: '0.85rem',
    background: 'rgba(255,255,255,0.06)',
    borderRadius: '1rem',
    padding: '0.05rem 0.35rem',
    cursor: 'pointer',
    border: '1px solid rgba(255,255,255,0.08)',
    userSelect: 'none'
  },
  photoContainer: { borderRadius: '0.4rem', overflow: 'hidden', marginTop: '0.2rem' },
  photoImg: { width: '100%', maxHeight: '200px', objectFit: 'cover' },
  mediaCard: {
    background: 'rgba(0,0,0,0.2)',
    borderRadius: '0.5rem',
    padding: '0.5rem',
    marginTop: '0.5rem'
  },
  cardItemTitle: { fontSize: '0.75rem', fontWeight: 'bold' },
  cardItemSubtitle: { fontSize: '0.65rem', color: '#9ca3af' },
  cardPlayBtn: {
    background: '#128c7e',
    color: '#fff',
    border: 'none',
    borderRadius: '0.3rem',
    padding: '0.2rem 0.4rem',
    fontSize: '0.65rem',
    cursor: 'pointer'
  },
  feedMovesCard: {
    background: 'rgba(25, 28, 38, 0.7)',
    borderRadius: '0.75rem',
    padding: '0.85rem',
    margin: '1rem 0'
  },
  movesCardHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' },
  movesCardTitle: { fontSize: '0.8rem', color: '#25d366', fontWeight: 'bold' },
  movesCountBadge: { fontSize: '0.65rem', background: 'rgba(37, 211, 102, 0.1)', color: '#25d366', padding: '0.1rem 0.3rem' },
  movesList: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  moveItemRow: { border: '1px solid rgba(255,255,255,0.06)', borderRadius: '0.5rem', padding: '0.5rem', display: 'flex', flexDirection: 'column' },
  moveItemHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  moveCatBadge: { fontSize: '0.55rem', background: 'rgba(255,255,255,0.04)', color: '#9ca3af', padding: '0.1rem 0.3rem' },
  moveTextTitle: { fontSize: '0.8rem', fontWeight: '500', marginTop: '0.15rem' },
  moveExplanationWhy: { fontSize: '0.7rem', color: '#a855f7', marginTop: '0.15rem' },
  moveControls: { display: 'flex' },
  todoControls: { display: 'flex', gap: '0.25rem' },
  doneBtn: { background: 'rgba(37, 211, 102, 0.1)', color: '#25d366', padding: '0.2rem 0.4rem', border: 'none', borderRadius: '0.3rem', fontSize: '0.7rem', cursor: 'pointer' },
  skipBtn: { background: 'rgba(239, 68, 68, 0.04)', color: '#ef4444', padding: '0.2rem 0.4rem', border: 'none', borderRadius: '0.3rem', fontSize: '0.7rem', cursor: 'pointer' },
  skippedState: { display: 'flex', gap: '0.25rem' },
  skippedText: { fontSize: '0.7rem', color: '#f59e0b' },
  resetTaskBtn: { background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '0.7rem' },
  starRow: { display: 'flex', gap: '0.1rem' },
  starBtn: { background: 'transparent', border: 'none', fontSize: '0.85rem', cursor: 'pointer' },
  feedInputPanel: { background: 'rgba(20, 24, 35, 0.8)', padding: '0.75rem 1.25rem' },
  attachBtn: { background: 'rgba(255,255,255,0.03)', border: 'none', color: '#9ca3af', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', fontSize: '1rem' },
  chatInput: { flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1.5rem', padding: '0.6rem 1rem', color: '#fff', fontSize: '0.9rem', outline: 'none' },
  sendBtn: { background: 'rgba(18, 140, 126, 0.9)', border: 'none', color: '#fff', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'opacity 0.2s' },
  loadingContainer: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#040508' },
  spinner: { width: '30px', height: '30px', border: '3px solid rgba(255, 255, 255, 0.04)', borderTopColor: '#25d366', borderRadius: '50%', animation: 'spin 1s linear infinite' }
};
