'use client';

import { useState, useEffect } from 'react';

export default function IdentityPage() {
  const [profile, setProfile] = useState(null);
  const [memories, setMemories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const pRes = await fetch('/api/profile');
        const pData = await pRes.json();
        setProfile(pData);

        const mRes = await fetch('/api/memories');
        const mData = await mRes.json();
        setMemories(mData);
      } catch (e) {
        console.error("Error loading identity data:", e);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  if (isLoading || !profile) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Decrypting identity evolution...</p>
      </div>
    );
  }

  // Archetype detail descriptors
  const archetypeDetails = {
    "Resilient Anchor": {
      title: "Resilient Anchor",
      description: "You have transitioned from reactive habits to active momentum protection. You excel at maintaining boundaries (like evening shutdown) when professional stress peaks. Your recovery speed after minor disruptions is high.",
      philosophy: "Progress is not linear. Stability during storms is the ultimate foundation for future growth.",
      icon: "🛡️",
      skills: ["Evening boundary setting", "Stress micro-recovery", "Consistent sleep management"],
      color: "#c084fc",
      gradient: "linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(99, 102, 241, 0.15) 100%)",
      shadow: "0 0 30px rgba(168, 85, 247, 0.15)"
    }
  };

  const details = archetypeDetails[profile.archetype] || {
    title: profile.archetype,
    description: "You are actively building your momentum profile. Keep completing daily actions to unlock more details.",
    philosophy: "One meaningful day at a time.",
    icon: "🌱",
    skills: ["Goal tracking"],
    color: "#6366f1",
    gradient: "linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(12, 13, 20, 0.6) 100%)",
    shadow: "0 0 20px rgba(99, 102, 241, 0.1)"
  };

  const archetypesList = [
    { title: "Surviving Mode", threshold: "0-40% Consistency", desc: "Easily thrown off by corporate scheduling disruptions. Habit execution is highly reactive.", status: "completed" },
    { title: "Mindful Rookie", threshold: "40-70% Consistency", desc: "Aware of stress patterns but struggles to intervene early. Recovery speed is slow.", status: "completed" },
    { title: "Resilient Anchor", threshold: "70-85% Consistency", desc: "Protects core energy boundaries under stress. Maintains stability during corporate bottlenecks.", status: "active" },
    { title: "Sustained Performer", threshold: "85%+ Consistency", desc: "Proactively expands challenges. Balances high performance with strict mental and physical restoration.", status: "locked" }
  ];

  return (
    <div className="app-container animate-fade-in">
      {/* Header Banner */}
      <section style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2.25rem', fontFamily: 'var(--font-display)' }}>Identity Archetype</h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          AUM doesn't just track habits. It tracks who you are becoming based on the consistency of your decisions.
        </p>
      </section>

      <div className="grid grid-cols-3">
        
        {/* LEFT COLUMN: Main Archetype Card & Philosophy */}
        <div className="flex flex-col gap-3" style={{ gridColumn: 'span 1' }}>
          
          {/* Detailed Archetype Card */}
          <div 
            className="glass-panel" 
            style={{ 
              background: details.gradient, 
              borderColor: details.color,
              boxShadow: details.shadow,
              padding: '2rem 1.5rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center'
            }}
          >
            <div style={{ ...styles.largeAvatar, borderColor: details.color }}>
              {details.icon}
            </div>
            
            <h2 style={{ fontSize: '1.75rem', fontFamily: 'var(--font-display)', color: details.color, marginTop: '1rem' }}>
              {details.title}
            </h2>
            
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Current Archetype
            </p>
            
            <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)', marginTop: '1.25rem', lineHeight: '1.5' }}>
              {details.description}
            </p>

            <div style={styles.philosophyBlock}>
              <span style={{ fontSize: '1.5rem', color: details.color, display: 'block', marginBottom: '0.25rem' }}>“</span>
              <p style={{ fontSize: '0.85rem', fontStyle: 'italic', color: 'var(--text-secondary)' }}>{details.philosophy}</p>
            </div>
          </div>

          {/* Special Capabilities */}
          <div className="glass-panel">
            <h3 style={styles.sectionTitle}>Demonstrated Strengths</h3>
            <ul style={styles.strengthsList}>
              {details.skills.map((skill, index) => (
                <li key={index} className="flex align-center gap-2" style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                  <span style={{ color: 'var(--color-success)' }}>✓</span> {skill}
                </li>
              ))}
            </ul>
          </div>

        </div>

        {/* RIGHT COLUMN: Progression Timeline & Memory Vault */}
        <div className="flex flex-col gap-3" style={{ gridColumn: 'span 2' }}>
          
          {/* Progression Timeline */}
          <div className="glass-panel">
            <h3 style={styles.sectionTitle} className="glow-text-primary">Archetype Progression</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Your progression pathway across consistency brackets.
            </p>
            
            <div className="flex flex-col gap-3" style={{ position: 'relative' }}>
              {/* Connecting vertical timeline line */}
              <div style={styles.timelineLine}></div>
              
              {archetypesList.map((arch, index) => {
                const isActive = arch.status === 'active';
                const isCompleted = arch.status === 'completed';
                
                let ringBg = 'rgba(255,255,255,0.03)';
                let borderC = 'var(--border-glass)';
                let titleColor = 'var(--text-muted)';
                let glowClass = '';

                if (isActive) {
                  ringBg = 'var(--color-primary-glow)';
                  borderC = 'var(--color-primary)';
                  titleColor = 'var(--color-primary)';
                  glowClass = 'glow-text-primary';
                } else if (isCompleted) {
                  ringBg = 'var(--color-success-glow)';
                  borderC = 'var(--color-success)';
                  titleColor = 'var(--color-success)';
                }

                return (
                  <div key={index} className="flex gap-4 animate-fade-in" style={{ position: 'relative', zIndex: 2 }}>
                    {/* Ring Icon */}
                    <div 
                      style={{
                        ...styles.timelineRing,
                        background: ringBg,
                        borderColor: borderC
                      }}
                    >
                      {isCompleted ? '✓' : isActive ? '⚡' : '🔒'}
                    </div>
                    
                    {/* Description Text */}
                    <div style={{ flexGrow: 1 }}>
                      <div className="flex justify-between align-center">
                        <h4 style={{ fontSize: '1.05rem', fontFamily: 'var(--font-display)', color: titleColor }} className={glowClass}>
                          {arch.title}
                        </h4>
                        <span className="badge" style={{ fontSize: '0.65rem', background: ringBg, color: titleColor, border: `1px solid ${borderC}` }}>
                          {arch.threshold}
                        </span>
                      </div>
                      <p style={{ fontSize: '0.85rem', color: isActive || isCompleted ? 'var(--text-secondary)' : 'var(--text-muted)', marginTop: '0.25rem' }}>
                        {arch.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* AI Memory Vault */}
          <div className="glass-panel">
            <div className="flex align-center justify-between" style={{ marginBottom: '1rem' }}>
              <h3 style={styles.sectionTitle}>AUM's Cognitive Vault</h3>
              <span className="badge badge-primary">Semantic Memory</span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Recurring behaviors, goals, and insights that AUM has synthesized from your reflective chat companion conversations.
            </p>
            
            <div style={styles.memoriesContainer}>
              {memories.length === 0 ? (
                <p style={{ fontStyle: 'italic', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>
                  No memories stored yet. Converse with the chat companion to build memory context.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {memories.map((mem) => (
                    <div key={mem.id} style={styles.memoryItem} className="flex align-center justify-between">
                      <div className="flex align-center gap-2">
                        <span style={styles.memoryCategoryBadge(mem.category)} className="badge">
                          {mem.category}
                        </span>
                        <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{mem.text}</span>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{mem.date}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 3-Month Consistency Ledger */}
          <div className="glass-panel">
            <div className="flex align-center justify-between" style={{ marginBottom: '1rem' }}>
              <h3 style={styles.sectionTitle}>3-Month Consistency Ledger</h3>
              <span className="badge badge-primary">90-Day History</span>
            </div>
            
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              A daily log of your sleep, stress, and checklist completion patterns over the last 90 days.
            </p>
            
            {/* Ledger Stats Row */}
            <div className="grid grid-cols-3 gap-3 text-center" style={{ marginBottom: '1.5rem', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '0.75rem', border: '1px solid var(--border-glass)' }}>
              <div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', fontFamily: 'var(--font-display)', color: 'var(--color-primary)' }}>
                  {profile.history && profile.history.reduce((acc, h) => acc + (h.tasks_total || 0), 0) > 0
                    ? Math.round((profile.history.reduce((acc, h) => acc + (h.tasks_completed || 0), 0) / profile.history.reduce((acc, h) => acc + (h.tasks_total || 0), 0)) * 100)
                    : 0}%
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>Task Consistency</div>
              </div>
              <div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', fontFamily: 'var(--font-display)', color: '#10b981' }}>
                  {profile.history && profile.history.length > 0
                    ? (profile.history.reduce((acc, h) => acc + (h.sleep_hours || 0), 0) / profile.history.length).toFixed(1)
                    : '0.0'}h
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>Avg. Sleep</div>
              </div>
              <div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', fontFamily: 'var(--font-display)', color: '#a855f7' }}>
                  {profile.history && profile.history.length > 0
                    ? (profile.history.reduce((acc, h) => acc + (h.stress || 0), 0) / profile.history.length).toFixed(1)
                    : '0.0'}/10
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>Avg. Stress</div>
              </div>
            </div>
            
            {/* Consistency Ledger List */}
            <div style={{ maxHeight: '240px', overflowY: 'auto', paddingRight: '0.25rem' }}>
              {!profile.history || profile.history.length === 0 ? (
                <p style={{ fontStyle: 'italic', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>
                  No historical entries. Complete your first day simulation to start logging consistency.
                </p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-glass)', textAlign: 'left', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '0.5rem 0.25rem' }}>Date</th>
                      <th style={{ padding: '0.5rem 0.25rem' }}>Sleep</th>
                      <th style={{ padding: '0.5rem 0.25rem' }}>Stress</th>
                      <th style={{ padding: '0.5rem 0.25rem', textAlign: 'right' }}>Tasks Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.history.slice().reverse().map((h, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                        <td style={{ padding: '0.65rem 0.25rem', fontWeight: '500' }}>{h.date}</td>
                        <td style={{ padding: '0.65rem 0.25rem' }}>{h.sleep_hours}h <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>({h.sleep_quality})</span></td>
                        <td style={{ padding: '0.65rem 0.25rem' }}>{h.stress}/10 <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>({h.mood_state})</span></td>
                        <td style={{ padding: '0.65rem 0.25rem', textAlign: 'right', fontWeight: 'bold', color: h.tasks_completed === h.tasks_total ? 'var(--color-success)' : h.tasks_completed > 0 ? '#fbbf24' : '#ef4444' }}>
                          {h.tasks_completed} / {h.tasks_total}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}

// CSS-in-JS styles for Identity Page
const styles = {
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
    minHeight: '400px',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '3px solid rgba(255, 255, 255, 0.05)',
    borderTopColor: 'var(--color-primary)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  largeAvatar: {
    width: '80px',
    height: '80px',
    borderRadius: '2rem',
    background: 'rgba(255,255,255,0.02)',
    border: '2px solid var(--border-glass)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '3rem',
  },
  philosophyBlock: {
    marginTop: '1.5rem',
    background: 'rgba(0,0,0,0.2)',
    padding: '0.75rem 1rem',
    borderRadius: '0.75rem',
    border: '1px solid rgba(255,255,255,0.03)',
    width: '100%',
  },
  sectionTitle: {
    fontSize: '1.2rem',
    fontFamily: 'var(--font-display)',
    marginBottom: '0.5rem',
  },
  strengthsList: {
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    marginTop: '0.5rem',
  },
  timelineLine: {
    position: 'absolute',
    left: '18px',
    top: '15px',
    bottom: '15px',
    width: '2px',
    background: 'rgba(255, 255, 255, 0.05)',
    zIndex: 1,
  },
  timelineRing: {
    width: '38px',
    height: '38px',
    borderRadius: '50%',
    border: '2px solid var(--border-glass)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.85rem',
    fontWeight: 'bold',
    flexShrink: 0,
  },
  memoriesContainer: {
    background: 'rgba(0,0,0,0.15)',
    borderRadius: '0.75rem',
    padding: '0.5rem',
    border: '1px solid var(--border-glass)',
  },
  memoryItem: {
    padding: '0.65rem 0.75rem',
    borderBottom: '1px solid rgba(255,255,255,0.03)',
    '&:last-child': {
      borderBottom: 'none'
    }
  },
  memoryCategoryBadge: (category) => {
    const colors = {
      pattern: { bg: 'rgba(168, 85, 247, 0.1)', text: '#c084fc', border: 'rgba(168, 85, 247, 0.2)' },
      insight: { bg: 'rgba(20, 184, 166, 0.1)', text: '#2dd4bf', border: 'rgba(20, 184, 166, 0.2)' },
      goal: { bg: 'rgba(14, 165, 233, 0.1)', text: '#38bdf8', border: 'rgba(14, 165, 233, 0.2)' },
      preference: { bg: 'rgba(245, 158, 11, 0.1)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.2)' }
    };
    const c = colors[category] || { bg: 'rgba(255,255,255,0.05)', text: '#94a3b8', border: 'rgba(255,255,255,0.1)' };
    return {
      background: c.bg,
      color: c.text,
      border: `1px solid ${c.border}`,
      fontSize: '0.6rem',
      padding: '0.15rem 0.4rem',
    };
  }
};
