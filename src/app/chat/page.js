'use client';

import { useState, useEffect, useRef } from 'react';

export default function ChatPage() {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [profile, setProfile] = useState(null);
  const [memories, setMemories] = useState([]);
const [showContext, setShowContext] = useState(false);
const [contextData, setContextData] = useState(null);
  const messagesEndRef = useRef(null);

  // Suggested reflection templates
  const reflectionChips = [
    "I had a setback today at work.",
    "How can I build momentum when tired?",
    "I want to celebrate a small win!",
    "Help me shut down work today."
  ];

  // Fetch initial profile & chat history
  useEffect(() => {
    fetchProfileAndMemories();
    fetchChatHistory();
  }, []);

  // Auto scroll to bottom
  useEffect(() => {
    scrollToBottom();
  }, [messages, isSending]);

  const fetchProfileAndMemories = async () => {
    try {
      const pRes = await fetch('/api/profile');
      const pData = await pRes.json();
      setProfile(pData);

      const ctxRes = await fetch('/api/context');
      const ctxData = await ctxRes.json();
      setContextData(ctxData);

      const memRes = await fetch('/api/memories');
      const memData = await memRes.json();
      if (Array.isArray(memData) && memData.length > 0) {
        setMemories(memData.map(m => `[${m.category || 'insight'}] ${m.text}`));
      } else {
        setMemories([
          "Struggles with afternoon fatigue on Wednesdays",
          "Responds well to 10-min breathing micro-breaks",
          "Goal: Sustain energy for family post-work"
        ]);
      }
    } catch (e) {
      console.error("Error fetching profile and memories:", e);
    }
  };

  const fetchChatHistory = async () => {
    try {
      const res = await fetch('/api/chat');
      const data = await res.json();
      setMessages(data);
    } catch (e) {
      console.error(e);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (textToSend) => {
    const text = textToSend || inputText;
    if (!text.trim() || isSending) return;

    setIsSending(true);
    if (!textToSend) setInputText('');

    // Optimistically add user message
    const tempUserMsg = { sender: 'User', text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
      const data = await res.json();
      
      // Add AI response message
      const tempAiMsg = { sender: 'AUM', text: data.response, timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, tempAiMsg]);
    } catch (e) {
      console.error("Error sending message:", e);
      // Fallback response if call fails
      const fallbackMsg = { sender: 'AUM', text: "I'm having trouble syncing right now, Alex. Let's focus on taking a short breath and checking back shortly.", timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, fallbackMsg]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="app-container flex flex-col animate-fade-in" style={{ height: 'calc(100vh - 75px)', paddingBottom: '1rem' }}>
      
      {/* CHAT HEADER WITH MEMORY LOADED METRICS */}
      <section style={styles.chatHeader} className="glass-panel flex align-center justify-between">
        <div className="flex align-center gap-3">
          <div style={styles.avatar}>🕉️</div>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-display)' }}>AUM Companion</h2>
            <div className="flex align-center gap-1" style={{ marginTop: '0.2rem' }}>
              <span style={styles.onlineDot}></span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Empathy Engine Online</span>
            </div>
          </div>
        </div>

        {/* Semantic Memory Status */}
        <div style={styles.memoryStatus} className="flex flex-col">
          <span style={styles.memoryStatusTitle}>🧠 Active Memory Layers:</span>
          <div className="flex gap-1" style={{ marginTop: '0.25rem', flexWrap: 'wrap' }}>
            <span className="badge badge-primary" style={{ fontSize: '0.65rem' }}>Personal Core</span>
            <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>Stress Patterns</span>
            <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>Stamina Goals</span>
          </div>
        </div>

        {/* Context toggle button */}
        <button
          onClick={() => setShowContext(prev => !prev)}
          className="btn btn-outline"
          style={styles.contextBtn}
        >
          {showContext ? 'Hide Context' : 'Show Context'}
        </button>
      </section>

      {/* Context panel (conditionally shown) */}
      {showContext && (
        <section style={styles.contextPanel} className="glass-panel mt-2">
          <h3 style={styles.contextTitle}>Current Context</h3>
          <pre style={styles.contextPre}>{JSON.stringify(contextData, null, 2)}</pre>
        </section>
      )}

      {/* MESSAGES VIEWPORT */}
      <section style={styles.viewport} className="glass-panel flex-col">
        <div style={styles.scrollableArea}>
          {messages.length === 0 ? (
            <div className="flex flex-col align-center justify-center" style={{ height: '100%', color: 'var(--text-muted)' }}>
              <p>No messages yet. Start reflecting to begin.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3" style={{ padding: '0.5rem' }}>
              {messages.map((msg, index) => {
                const isAi = msg.sender === 'AUM';
                return (
                  <div 
                    key={index} 
                    style={{
                      ...styles.bubbleWrapper,
                      justifyContent: isAi ? 'flex-start' : 'flex-end'
                    }}
                    className="animate-fade-in"
                  >
                    {isAi && <div style={styles.miniAvatar}>🕉️</div>}
                    
                    <div 
                      style={{
                        ...styles.bubble,
                        ...(isAi ? styles.bubbleAi : styles.bubbleUser)
                      }}
                    >
                      <p style={styles.bubbleText}>{msg.text}</p>
                      <span style={styles.bubbleTime}>
                        {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                  </div>
                );
              })}
              
              {isSending && (
                <div style={styles.bubbleWrapper} className="animate-fade-in">
                  <div style={styles.miniAvatar}>🕉️</div>
                  <div style={{ ...styles.bubble, ...styles.bubbleAi, opacity: 0.7 }}>
                    <div style={styles.typingIndicator} className="flex gap-1">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </section>

      {/* BOTTOM CONTROLS & SUGGESTION CHIPS */}
      <section style={styles.inputSection}>
        {/* Reflection Suggestion Chips */}
        <div className="flex gap-2" style={styles.chipsRow}>
          {reflectionChips.map((chip, index) => (
            <button 
              key={index} 
              onClick={() => handleSendMessage(chip)}
              className="btn btn-secondary"
              style={styles.chip}
              disabled={isSending}
            >
              {chip}
            </button>
          ))}
        </div>

        {/* TextInput Box */}
        <div className="flex gap-2" style={{ width: '100%' }}>
          <input 
            type="text" 
            placeholder="Reflect on your day, report a setback, or note a win..." 
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            className="glass-input"
            style={styles.chatInput}
            disabled={isSending}
          />
          <button 
            onClick={() => handleSendMessage()}
            className="btn btn-primary"
            style={styles.sendBtn}
            disabled={isSending}
          >
            {isSending ? "..." : "Send"}
          </button>
        </div>
      </section>

    </div>
  );
}

// CSS Styles for Chat Page
const styles = {
  chatHeader: {
    padding: '0.75rem 1.25rem',
    marginBottom: '1rem',
    borderRadius: '1rem',
  },
  avatar: {
    width: '45px',
    height: '45px',
    borderRadius: '0.75rem',
    background: 'rgba(99, 102, 241, 0.1)',
    border: '1px solid rgba(99, 102, 241, 0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.5rem',
  },
  miniAvatar: {
    width: '28px',
    height: '28px',
    borderRadius: '0.5rem',
    background: 'rgba(99, 102, 241, 0.1)',
    border: '1px solid rgba(99, 102, 241, 0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.9rem',
    alignSelf: 'flex-end',
    marginBottom: '4px',
  },
  onlineDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: 'var(--color-success)',
    boxShadow: '0 0 8px var(--color-success)',
    display: 'inline-block',
  },
  memoryStatus: {
    textAlign: 'right',
  },
  memoryStatusTitle: {
    fontSize: '0.7rem',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontWeight: '600',
  },
  viewport: {
    flexGrow: 1,
    padding: '1rem',
    overflow: 'hidden',
    position: 'relative',
    borderRadius: '1.25rem',
    marginBottom: '1rem',
  },
  scrollableArea: {
    width: '100%',
    height: '100%',
    overflowY: 'auto',
    paddingRight: '0.5rem',
  },
  bubbleWrapper: {
    display: 'flex',
    gap: '0.5rem',
    width: '100%',
  },
  bubble: {
    maxWidth: '75%',
    padding: '0.85rem 1.1rem',
    borderRadius: '1.1rem',
    lineHeight: '1.5',
    position: 'relative',
    boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
  },
  bubbleAi: {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid var(--border-glass)',
    color: 'var(--text-primary)',
    borderBottomLeftRadius: '0.2rem',
  },
  bubbleUser: {
    background: 'linear-gradient(135deg, var(--color-primary) 0%, rgba(99,102,241,0.6) 100%)',
    color: 'white',
    borderBottomRightRadius: '0.2rem',
  },
  bubbleText: {
    fontSize: '0.95rem',
  },
  bubbleTime: {
    fontSize: '0.65rem',
    color: 'rgba(255, 255, 255, 0.4)',
    display: 'block',
    textAlign: 'right',
    marginTop: '0.4rem',
  },
  inputSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    width: '100%',
  },
  chipsRow: {
    overflowX: 'auto',
    paddingBottom: '0.25rem',
    scrollbarWidth: 'none', // Firefox
  },
  chip: {
    padding: '0.4rem 0.85rem',
    fontSize: '0.8rem',
    borderRadius: '0.75rem',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  },
  chatInput: {
    flexGrow: 1,
    padding: '0.85rem 1.25rem',
    fontSize: '0.95rem',
    borderRadius: '0.85rem',
  },
  sendBtn: {
    padding: '0 1.5rem',
    fontSize: '0.95rem',
    borderRadius: '0.85rem',
  },
  typingIndicator: {
    alignItems: 'center',
    height: '15px',
    padding: '0 0.5rem',
    'span': {
      width: '6px',
      height: '6px',
      borderRadius: '50%',
      backgroundColor: 'var(--text-secondary)',
      animation: 'bounce 1.4s infinite ease-in-out both',
    }
  }
};
