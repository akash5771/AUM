'use client';

import { useState, useEffect } from 'react';

export default function MemoryVaultPage() {
  const [memories, setMemories] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('events'); // 'events', 'structured', 'relationships', 'experiences'

  useEffect(() => {
    async function loadMemories() {
      try {
        const res = await fetch('/api/memories?all=true');
        const data = await res.json();
        setMemories(data);
      } catch (e) {
        console.error("Error loading memories:", e);
      } finally {
        setIsLoading(false);
      }
    }
    loadMemories();
  }, []);

  if (isLoading || !memories) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Accessing AUM Memory Vault...</p>
      </div>
    );
  }

  // Combine Daily and Epoch summaries into one timeline of "Big Events"
  const dailyEvents = (memories.summaries || []).map(s => ({
    id: s.date,
    date: s.date,
    type: 'Daily',
    summary: s.summary,
    decisions: s.decisions || [],
    threads: s.active_threads || [],
    people: []
  }));

  const epochEvents = (memories.epoch_summaries || []).map(s => ({
    id: s.id || s.timestamp,
    date: (s.timestamp || s.date).split('T')[0],
    type: 'Epoch',
    summary: s.summary,
    decisions: s.decisions || [],
    threads: s.active_threads || [],
    people: s.people || []
  }));

  const bigEvents = [...dailyEvents, ...epochEvents].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div className="app-container animate-fade-in" style={{ paddingBottom: '4rem' }}>
      {/* Header Banner */}
      <section style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2.25rem', fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span>🧠</span> Memory Vault
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
          Explore the compressed layers of your cognitive profile: from major life milestones to structured preferences.
        </p>
      </section>

      {/* Vault Category Navigation Tabs */}
      <div style={styles.tabBar}>
        {[
          { id: 'events', label: 'Big Events', icon: '✨' },
          { id: 'relationships', label: 'Relationships', icon: '👥' },
          { id: 'experiences', label: 'Life Experiences', icon: '⛰️' },
          { id: 'structured', label: 'Cognitive Facts', icon: '🛡️' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              ...styles.tabButton,
              ...(activeTab === t.id ? styles.tabButtonActive : {})
            }}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* CONTENT AREA */}
      <div style={{ marginTop: '2rem' }}>
        
        {/* TAB 1: Big Events */}
        {activeTab === 'events' && (
          <div style={styles.listContainer}>
            {bigEvents.length === 0 ? (
              <div style={styles.emptyState}>No high-salience events logged yet. Keep conversing to record breakthrough moments.</div>
            ) : (
              bigEvents.map(event => (
                <div key={event.id} className="glass-panel" style={styles.eventCard}>
                  <div style={styles.cardHeader}>
                    <span style={styles.dateText}>{event.date}</span>
                    <span style={{
                      ...styles.badge,
                      backgroundColor: event.type === 'Daily' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(168, 85, 247, 0.15)',
                      color: event.type === 'Daily' ? '#818cf8' : '#c084fc',
                    }}>
                      {event.type} Milestone
                    </span>
                  </div>
                  
                  <p style={styles.summaryText}>{event.summary}</p>
                  
                  {event.decisions.length > 0 && (
                    <div style={styles.subMeta}>
                      <span style={styles.metaLabel}>Decisions:</span>
                      <div style={styles.tagGroup}>
                        {event.decisions.map((d, i) => (
                          <span key={i} style={styles.tag}>{d}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {event.people && event.people.length > 0 && (
                    <div style={styles.subMeta}>
                      <span style={styles.metaLabel}>People Involved:</span>
                      <div style={styles.tagGroup}>
                        {event.people.map((p, i) => (
                          <span key={i} style={{ ...styles.tag, borderColor: 'rgba(236, 72, 153, 0.3)', color: '#f472b6' }}>👤 {p}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 2: Relationships */}
        {activeTab === 'relationships' && (
          <div style={styles.gridContainer}>
            {(!memories.structured?.relationships || memories.structured.relationships.length === 0) ? (
              <div style={styles.emptyState}>No relationships mapped yet. Mention people in your conversations to build context.</div>
            ) : (
              memories.structured.relationships.map((rel, i) => (
                <div key={i} className="glass-panel" style={styles.relationshipCard}>
                  <div style={styles.cardHeader}>
                    <div>
                      <h3 style={styles.relationshipName}>{rel.name}</h3>
                      <span style={styles.relationshipRole}>{rel.role || 'Contact'}</span>
                    </div>
                    <span style={{
                      ...styles.badge,
                      backgroundColor: rel.relationship_health === 'Strained' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                      color: rel.relationship_health === 'Strained' ? '#f87171' : '#4ade80',
                    }}>
                      {rel.relationship_health}
                    </span>
                  </div>

                  {rel.context && <p style={styles.relationshipContext}>{rel.context}</p>}

                  {rel.relationship_history && rel.relationship_history.length > 0 && (
                    <div style={{ marginTop: '1rem' }}>
                      <h4 style={styles.subSectionTitle}>Recent Moments</h4>
                      <ul style={styles.momentList}>
                        {rel.relationship_history.slice(-3).map((h, idx) => (
                          <li key={idx} style={styles.momentItem}>
                            <span style={styles.momentDot}></span>
                            <div>
                              <p style={styles.momentSummary}>{h.summary}</p>
                              <span style={styles.momentDate}>{h.timestamp.split('T')[0]}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 3: Life Experiences */}
        {activeTab === 'experiences' && (
          <div style={styles.listContainer}>
            {(!memories.life_experiences || memories.life_experiences.length === 0) ? (
              <div style={styles.emptyState}>No life experiences logged yet. Mention milestones, workouts, or events.</div>
            ) : (
              memories.life_experiences.map((exp, i) => (
                <div key={i} className="glass-panel" style={styles.eventCard}>
                  <div style={styles.cardHeader}>
                    <span style={styles.dateText}>{exp.timestamp ? exp.timestamp.split('T')[0] : 'Past'}</span>
                    <span style={styles.expBadge}>{exp.type}</span>
                  </div>
                  <h3 style={styles.expActivity}>{exp.activity}</h3>
                  {exp.summary && <p style={styles.summaryText}>{exp.summary}</p>}
                  
                  <div style={styles.expFooter}>
                    {exp.location && <span style={styles.expMeta}>📍 {exp.location}</span>}
                    {exp.people && exp.people.length > 0 && (
                      <span style={styles.expMeta}>👥 {exp.people.join(', ')}</span>
                    )}
                    {exp.emotion_after && (
                      <span style={{
                        ...styles.expMeta,
                        color: exp.emotion_after === 'stressed' ? '#f87171' : '#4ade80'
                      }}>
                        Feelings: {exp.emotion_after}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 4: Cognitive Facts */}
        {activeTab === 'structured' && (
          <div style={styles.gridContainer}>
            {/* Identity Details */}
            <div className="glass-panel" style={styles.factCard}>
              <h3 style={styles.factCardTitle}>🛡️ Core Identity Profile</h3>
              <div style={styles.factList}>
                {Object.entries(memories.structured?.identity || {}).map(([key, val]) => (
                  <div key={key} style={styles.factItem}>
                    <span style={styles.factLabel}>{key}:</span>
                    <span style={styles.factVal}>{val}</span>
                  </div>
                ))}
                {Object.keys(memories.structured?.identity || {}).length === 0 && (
                  <div style={styles.emptyText}>No identity details parsed yet.</div>
                )}
              </div>
            </div>

            {/* Preferences */}
            <div className="glass-panel" style={styles.factCard}>
              <h3 style={styles.factCardTitle}>⭐ Preferences</h3>
              <div style={styles.tagGroup}>
                {(memories.structured?.preferences || []).map((pref, i) => (
                  <span key={i} style={styles.prefTag}>{pref}</span>
                ))}
                {(memories.structured?.preferences || []).length === 0 && (
                  <div style={styles.emptyText}>No preferences extracted yet.</div>
                )}
              </div>
            </div>

            {/* Active Goals */}
            <div className="glass-panel" style={styles.factCard}>
              <h3 style={styles.factCardTitle}>🎯 Goals Tracked</h3>
              <div style={styles.factList}>
                {(memories.structured?.goals || []).map((g, i) => (
                  <div key={i} style={styles.goalItem}>
                    <div style={styles.cardHeader}>
                      <span style={styles.goalName}>{g.goal}</span>
                      <span style={{
                        ...styles.badge,
                        backgroundColor: g.status === 'Active' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                        color: g.status === 'Active' ? '#4ade80' : 'var(--text-secondary)',
                      }}>
                        {g.status}
                      </span>
                    </div>
                    <div style={styles.goalMeta}>
                      {g.deadline && <span>Deadline: {g.deadline}</span>}
                      {g.priority && <span>Priority: {g.priority}</span>}
                    </div>
                  </div>
                ))}
                {(memories.structured?.goals || []).length === 0 && (
                  <div style={styles.emptyText}>No goals registered.</div>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

const styles = {
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '60vh',
    width: '100%',
  },
  spinner: {
    width: '50px',
    height: '50px',
    border: '3px solid rgba(255, 255, 255, 0.1)',
    borderTopColor: 'var(--color-primary)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  tabBar: {
    display: 'flex',
    gap: '0.75rem',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    paddingBottom: '0.5rem',
    overflowX: 'auto',
  },
  tabButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    background: 'none',
    border: '1px solid transparent',
    color: 'var(--text-secondary)',
    padding: '0.75rem 1.25rem',
    borderRadius: '0.75rem',
    cursor: 'pointer',
    fontSize: '0.95rem',
    fontWeight: '500',
    transition: 'all 0.2s ease',
    whiteSpace: 'nowrap'
  },
  tabButtonActive: {
    color: 'var(--text-primary)',
    background: 'rgba(255, 255, 255, 0.05)',
    borderColor: 'var(--border-glass)',
  },
  listContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  gridContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: '1.5rem',
  },
  eventCard: {
    padding: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'between',
    alignItems: 'center',
    width: '100%',
  },
  dateText: {
    fontSize: '0.85rem',
    color: 'var(--text-secondary)',
    fontWeight: '500',
  },
  badge: {
    fontSize: '0.75rem',
    fontWeight: '600',
    padding: '0.25rem 0.5rem',
    borderRadius: '0.375rem',
  },
  summaryText: {
    fontSize: '1rem',
    color: 'var(--text-primary)',
    lineHeight: '1.5',
  },
  subMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.85rem',
    marginTop: '0.5rem',
  },
  metaLabel: {
    color: 'var(--text-secondary)',
    fontWeight: '500',
  },
  tagGroup: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.375rem',
  },
  tag: {
    fontSize: '0.75rem',
    padding: '0.125rem 0.5rem',
    borderRadius: '0.25rem',
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    color: 'var(--text-secondary)',
  },
  relationshipCard: {
    padding: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  relationshipName: {
    fontSize: '1.2rem',
    fontWeight: '600',
    color: 'var(--text-primary)',
  },
  relationshipRole: {
    fontSize: '0.85rem',
    color: 'var(--text-secondary)',
  },
  relationshipContext: {
    fontSize: '0.9rem',
    color: 'var(--text-secondary)',
    lineHeight: '1.4',
  },
  subSectionTitle: {
    fontSize: '0.85rem',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--text-secondary)',
    marginBottom: '0.5rem',
  },
  momentList: {
    listStyle: 'none',
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  momentItem: {
    display: 'flex',
    gap: '0.75rem',
    alignItems: 'flex-start',
  },
  momentDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: 'var(--color-primary)',
    marginTop: '6px',
  },
  momentSummary: {
    fontSize: '0.85rem',
    color: 'var(--text-primary)',
  },
  momentDate: {
    fontSize: '0.75rem',
    color: 'var(--text-secondary)',
  },
  expBadge: {
    fontSize: '0.75rem',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    color: 'var(--text-secondary)',
    padding: '0.25rem 0.5rem',
    borderRadius: '0.25rem',
  },
  expActivity: {
    fontSize: '1.15rem',
    fontWeight: '600',
    color: 'var(--text-primary)',
  },
  expFooter: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '1rem',
    marginTop: '0.5rem',
  },
  expMeta: {
    fontSize: '0.8rem',
    color: 'var(--text-secondary)',
  },
  factCard: {
    padding: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  factCardTitle: {
    fontSize: '1.1rem',
    fontWeight: '600',
    color: 'var(--text-primary)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    paddingBottom: '0.5rem',
  },
  factList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  factItem: {
    display: 'flex',
    justifyContent: 'between',
    fontSize: '0.9rem',
  },
  factLabel: {
    color: 'var(--text-secondary)',
    textTransform: 'capitalize',
  },
  factVal: {
    color: 'var(--text-primary)',
    fontWeight: '500',
  },
  prefTag: {
    fontSize: '0.85rem',
    padding: '0.375rem 0.75rem',
    borderRadius: '0.5rem',
    background: 'rgba(99, 102, 241, 0.05)',
    border: '1px solid rgba(99, 102, 241, 0.15)',
    color: '#818cf8',
  },
  goalItem: {
    background: 'rgba(255, 255, 255, 0.01)',
    border: '1px solid rgba(255, 255, 255, 0.03)',
    borderRadius: '0.5rem',
    padding: '0.75rem',
  },
  goalName: {
    fontSize: '0.95rem',
    fontWeight: '600',
    color: 'var(--text-primary)',
  },
  goalMeta: {
    display: 'flex',
    gap: '1rem',
    fontSize: '0.8rem',
    color: 'var(--text-secondary)',
    marginTop: '0.25rem',
  },
  emptyState: {
    textAlign: 'center',
    padding: '3rem 1.5rem',
    color: 'var(--text-secondary)',
    borderRadius: '0.75rem',
    border: '1px dashed rgba(255, 255, 255, 0.1)',
  },
  emptyText: {
    fontSize: '0.9rem',
    color: 'var(--text-secondary)',
    fontStyle: 'italic',
  },
};
