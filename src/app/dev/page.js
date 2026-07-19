'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function DevDashboard() {
  const [signalState, setSignalState] = useState({
    counters: { stress: 0, anxiety: 0, joy: 0, happiness: 0, pride: 0, focus: 0 },
    last_triggered_at: null,
    date: ''
  });
  const [history, setHistory] = useState([]);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [simType, setSimType] = useState('stress');
  const [simIntensity, setSimIntensity] = useState(7);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [simulationResult, setSimulationResult] = useState(null);

  // 1. Establish SSE Connection for Live Data
  useEffect(() => {
    const eventSource = new EventSource('/api/dev/signal-stream');

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'initial') {
          if (payload.signalState) setSignalState(payload.signalState);
          if (payload.history) setHistory(payload.history);
        } else if (payload.type === 'update') {
          if (payload.signalState) setSignalState(payload.signalState);
          if (payload.event) {
            setHistory((prev) => {
              const next = [payload.event, ...prev];
              return next.slice(0, 10);
            });
          }
        }
      } catch (err) {
        console.error('Failed to parse SSE event', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE connection error:', err);
    };

    return () => {
      eventSource.close();
    };
  }, []);

  // 2. Real-time Cooldown Countdown Timer
  useEffect(() => {
    const calculateCooldown = () => {
      if (signalState.last_triggered_at) {
        const lastTime = new Date(signalState.last_triggered_at);
        // Use virtual_time if active, otherwise fallback to local system time
        const now = signalState.virtual_time ? new Date(signalState.virtual_time) : new Date();
        const diffMs = now.getTime() - lastTime.getTime();
        const diffSec = Math.floor(diffMs / 1000);
        const cooldownSec = 30 * 60; // 30 mins
        const remaining = diffSec >= 0 ? (cooldownSec - diffSec) : 0;
        setCooldownRemaining(remaining > 0 ? remaining : 0);
      } else {
        setCooldownRemaining(0);
      }
    };

    calculateCooldown();
    const interval = setInterval(calculateCooldown, 1000);
    return () => clearInterval(interval);
  }, [signalState]);

  // 3. Handle Actions
  const handleReset = async () => {
    if (isResetting) return;
    setIsResetting(true);
    setSimulationResult(null);
    try {
      const res = await fetch('/api/dev/signal-reset', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setSignalState(data.signalState);
      }
    } catch (err) {
      console.error('Reset counters failed:', err);
    } finally {
      setIsResetting(false);
    }
  };

  const handleSimulate = async () => {
    if (isSimulating) return;
    setIsSimulating(true);
    setSimulationResult(null);
    try {
      const res = await fetch('/api/dev/signal-simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signalType: simType, intensity: simIntensity })
      });
      const data = await res.json();
      if (data.success) {
        setSimulationResult(data);
        if (data.signalState) setSignalState(data.signalState);
      } else {
        alert('Simulation failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('Simulation request failed:', err);
    } finally {
      setIsSimulating(false);
    }
  };

  const formatCooldown = (seconds) => {
    if (seconds <= 0) return 'Ready';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const getCounterColorClass = (type) => {
    if (['stress', 'anxiety'].includes(type)) return 'counter-stress';
    if (['joy', 'happiness'].includes(type)) return 'counter-joy';
    return 'counter-focus';
  };

  return (
    <div className="app-container dev-dashboard">
      <header className="dev-header">
        <div className="title-area">
          <Link href="/" className="back-link">← App Dashboard</Link>
          <h1>Signal Tracker & Testing Dashboard</h1>
          <p className="subtitle">Real-time pressure valve telemetry and signal trigger simulation panel.</p>
        </div>
        <div className="cooldown-panel glass-panel">
          <span className="cooldown-label">System Cooldown</span>
          <div className={`cooldown-timer ${cooldownRemaining > 0 ? 'cooldown-active' : 'cooldown-ready'}`}>
            {cooldownRemaining > 0 ? '⏳ ' : '⚡ '}
            {formatCooldown(cooldownRemaining)}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-4">
        {/* Left Column: Counters Progress and Simulator */}
        <div className="flex flex-col gap-4">
          <section className="glass-panel">
            <h2 className="section-title">Live Counters (Threshold: 20)</h2>
            <div className="counters-list">
              {Object.entries(signalState.counters).map(([key, val]) => {
                const percentage = Math.min(100, (val / 20) * 100);
                return (
                  <div key={key} className="counter-item">
                    <div className="counter-header">
                      <span className="counter-name">{key}</span>
                      <span className="counter-val">{val} / 20</span>
                    </div>
                    <div className="progress-bg">
                      <div 
                        className={`progress-fill ${getCounterColorClass(key)}`} 
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="glass-panel">
            <h2 className="section-title">Simulate Signal Injection</h2>
            <div className="form-group">
              <label>Signal Type</label>
              <select 
                value={simType} 
                onChange={(e) => setSimType(e.target.value)}
                className="select-input"
              >
                <option value="stress">Stress</option>
                <option value="anxiety">Anxiety</option>
                <option value="joy">Joy</option>
                <option value="happiness">Happiness</option>
                <option value="pride">Pride</option>
                <option value="focus">Focus</option>
              </select>
            </div>

            <div className="form-group">
              <label>Signal Intensity: <strong style={{color: 'var(--color-primary)'}}>{simIntensity}</strong></label>
              <input 
                type="range" 
                min="1" 
                max="20" 
                value={simIntensity} 
                onChange={(e) => setSimIntensity(Number(e.target.value))}
                className="range-input"
              />
              <span className="range-hint">Intensity &ge; 6 passes the input gate.</span>
            </div>

            <div className="actions-row">
              <button 
                onClick={handleSimulate} 
                disabled={isSimulating}
                className="btn btn-primary"
              >
                {isSimulating ? 'Simulating...' : 'Simulate Signal'}
              </button>
              <button 
                onClick={handleReset} 
                disabled={isResetting}
                className="btn btn-secondary"
              >
                {isResetting ? 'Resetting...' : 'Reset Counters'}
              </button>
            </div>

            {simulationResult && (
              <div className="result-alert glass-panel">
                <h4>Simulation Result</h4>
                <div className="result-detail">
                  <p><strong>Gate Action:</strong> {simulationResult.evaluation.reason}</p>
                  <p><strong>Triggered:</strong> {simulationResult.evaluation.shouldFire ? '🟢 Yes (Task Fired)' : '🔴 No'}</p>
                  {simulationResult.taskGenerated && (
                    <div className="generated-task-card">
                      <p><strong>Generated Task:</strong> "{simulationResult.taskGenerated.text}"</p>
                      <p><strong>Explanation:</strong> <em>{simulationResult.taskGenerated.whyToday}</em></p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Live Event Stream Log */}
        <section className="glass-panel event-log-section">
          <h2 className="section-title">Live Signal Stream (Last 10 Events)</h2>
          <div className="event-list">
            {history.length === 0 ? (
              <div className="empty-logs">No signal events recorded yet. Interact with the chat interface or use the simulate panel to generate logs.</div>
            ) : (
              history.map((event) => (
                <div key={event.id} className={`event-card ${event.fired ? 'event-fired' : ''}`}>
                  <div className="event-meta">
                    <span className="event-time">{new Date(event.timestamp).toLocaleTimeString()}</span>
                    <span className="event-type">{event.signalType}</span>
                    <span className="event-intensity">Intensity: {event.intensity}</span>
                  </div>
                  <div className="event-reason">
                    <strong>Reason:</strong> {event.reason}
                  </div>
                  <div className="event-counters">
                    {Object.entries(event.counters || {}).map(([cKey, cVal]) => (
                      <span key={cKey} className="small-counter-tag">
                        {cKey[0].toUpperCase() + cKey.slice(1)}: {cVal}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <style jsx global>{`
        .dev-dashboard {
          color-scheme: dark;
          min-height: 100vh;
        }
        .dev-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
          border-bottom: 1px solid var(--border-glass);
          padding-bottom: 1.5rem;
        }
        .back-link {
          color: var(--text-secondary);
          font-size: 0.875rem;
          transition: color var(--transition-fast);
        }
        .back-link:hover {
          color: var(--color-primary);
        }
        .dev-header h1 {
          font-size: 2rem;
          margin-top: 0.5rem;
          background: linear-gradient(135deg, #fff 0%, var(--text-secondary) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .subtitle {
          color: var(--text-secondary);
          font-size: 0.95rem;
          margin-top: 0.25rem;
        }
        .cooldown-panel {
          text-align: right;
          padding: 0.75rem 1.5rem;
          min-width: 180px;
        }
        .cooldown-label {
          font-size: 0.75rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .cooldown-timer {
          font-size: 1.25rem;
          font-weight: 700;
          margin-top: 0.25rem;
        }
        .cooldown-active {
          color: var(--color-warning);
          text-shadow: 0 0 10px var(--color-warning-glow);
        }
        .cooldown-ready {
          color: var(--color-success);
          text-shadow: 0 0 10px var(--color-success-glow);
        }
        .section-title {
          font-size: 1.2rem;
          margin-bottom: 1.25rem;
          color: var(--text-primary);
          border-left: 3px solid var(--color-primary);
          padding-left: 0.75rem;
        }
        .counters-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .counter-item {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
        .counter-header {
          display: flex;
          justify-content: space-between;
          font-size: 0.9rem;
        }
        .counter-name {
          text-transform: capitalize;
          font-weight: 500;
        }
        .counter-val {
          color: var(--text-secondary);
        }
        .progress-bg {
          background: rgba(255, 255, 255, 0.05);
          height: 10px;
          border-radius: 5px;
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          border-radius: 5px;
          transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .counter-stress {
          background: linear-gradient(90deg, var(--color-warning) 0%, var(--color-danger) 100%);
        }
        .counter-joy {
          background: linear-gradient(90deg, var(--color-info) 0%, var(--color-success) 100%);
        }
        .counter-focus {
          background: linear-gradient(90deg, var(--color-primary) 0%, var(--color-secondary) 100%);
        }
        .form-group {
          margin-bottom: 1.25rem;
        }
        .form-group label {
          display: block;
          font-size: 0.875rem;
          color: var(--text-secondary);
          margin-bottom: 0.5rem;
        }
        .select-input {
          width: 100%;
          background: var(--bg-deep);
          border: 1px solid var(--border-glass);
          border-radius: 0.5rem;
          padding: 0.75rem;
          color: var(--text-primary);
          transition: border-color var(--transition-fast);
        }
        .select-input:focus {
          border-color: var(--color-primary);
        }
        .range-input {
          width: 100%;
          accent-color: var(--color-primary);
        }
        .range-hint {
          font-size: 0.75rem;
          color: var(--text-muted);
          margin-top: 0.25rem;
          display: block;
        }
        .actions-row {
          display: flex;
          gap: 1rem;
          margin-top: 1.5rem;
        }
        .btn {
          flex: 1;
          padding: 0.75rem;
          border-radius: 0.5rem;
          font-weight: 600;
          cursor: pointer;
          transition: all var(--transition-fast);
          text-align: center;
        }
        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .btn-primary {
          background: var(--color-primary);
          color: #fff;
        }
        .btn-primary:hover:not(:disabled) {
          background: #4f46e5;
          box-shadow: 0 0 15px rgba(99, 102, 241, 0.4);
        }
        .btn-secondary {
          background: transparent;
          border: 1px solid var(--border-glass);
          color: var(--text-primary);
        }
        .btn-secondary:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.05);
          border-color: var(--border-glass-hover);
        }
        .result-alert {
          margin-top: 1.5rem;
          background: rgba(255, 255, 255, 0.02);
          border-color: rgba(99, 102, 241, 0.2);
        }
        .result-alert h4 {
          font-size: 1rem;
          color: var(--text-primary);
          margin-bottom: 0.5rem;
        }
        .result-detail p {
          font-size: 0.875rem;
          margin-bottom: 0.25rem;
        }
        .generated-task-card {
          margin-top: 0.75rem;
          padding: 0.75rem;
          background: rgba(16, 185, 129, 0.05);
          border-left: 3px solid var(--color-success);
          border-radius: 4px;
        }
        .event-log-section {
          max-height: 80vh;
          display: flex;
          flex-direction: column;
        }
        .event-list {
          flex-grow: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          padding-right: 0.25rem;
        }
        .empty-logs {
          color: var(--text-muted);
          text-align: center;
          margin-top: 4rem;
          font-size: 0.95rem;
        }
        .event-card {
          padding: 0.75rem;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--border-glass);
          border-radius: 0.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          transition: all var(--transition-fast);
        }
        .event-card:hover {
          border-color: var(--border-glass-hover);
          background: rgba(255, 255, 255, 0.03);
        }
        .event-fired {
          border-left: 3px solid var(--color-success);
          background: rgba(16, 185, 129, 0.03);
        }
        .event-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.8rem;
          color: var(--text-secondary);
        }
        .event-time {
          color: var(--text-muted);
        }
        .event-type {
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.02em;
          color: var(--color-primary);
        }
        .event-card.event-fired .event-type {
          color: var(--color-success);
        }
        .event-reason {
          font-size: 0.875rem;
          color: var(--text-primary);
        }
        .event-counters {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
          margin-top: 0.25rem;
        }
        .small-counter-tag {
          font-size: 0.7rem;
          background: rgba(255, 255, 255, 0.04);
          padding: 0.15rem 0.4rem;
          border-radius: 4px;
          color: var(--text-secondary);
        }
      `}</style>
    </div>
  );
}
