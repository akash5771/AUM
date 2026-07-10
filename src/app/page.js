'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function Dashboard() {
  const router = useRouter();
  
  // State for core data structures
  const [profile, setProfile] = useState(null);
  const [context, setContext] = useState(null);
  const [actions, setActions] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [virtualTime, setVirtualTime] = useState(null);
  const [currentTimeDisplay, setCurrentTimeDisplay] = useState('');
  
  // UI and Interaction states
  const [expandedActionId, setExpandedActionId] = useState(null);
  const [isLoadingActions, setIsLoadingActions] = useState(false);
  const [isUpdatingContext, setIsUpdatingContext] = useState(false);
  const [isLoggingContext, setIsLoggingContext] = useState(false); // To toggle form edit mode
  const [chatInput, setChatInput] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [levelUpModalOpen, setLevelUpModalOpen] = useState(false);
  const [celebratedLevel, setCelebratedLevel] = useState(0);

  // Time travel simulation states
  const [timeSelectorOpen, setTimeSelectorOpen] = useState(false);

  // Onboarding Wizard State
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [onboardingProfile, setOnboardingProfile] = useState({
    name: '',
    age: '',
    gender: '',
    job: '',
    workHours: '',
    workDays: 5,
    maritalStatus: '',
    kids: 0,
    idealLife: '',
    goal: '',
    problem: '',
    lifeSatisfaction: 5,
    lifeAreas: []
  });
  const [onboardingSubmitting, setOnboardingSubmitting] = useState(false);

  // Context editor values (synchronized from context state)
  const [editSleep, setEditSleep] = useState(7.0);
  const [editSleepQuality, setEditSleepQuality] = useState('good');
  const [editEnergy, setEditEnergy] = useState(7);
  const [editMoodRating, setEditMoodRating] = useState(6);
  const [editMoodState, setEditMoodState] = useState('stressed');
  const [editWeather, setEditWeather] = useState('Clear');

  // Refs for auto-scroll and canvas confetti
  const messagesEndRef = useRef(null);
  const canvasRef = useRef(null);
  const confettiSystemRef = useRef(null);

  // Reflection template chips
  const reflectionChips = [
    "I had a setback today at work.",
    "How can I build momentum when tired?",
    "I want to celebrate a small win!",
    "Help me shut down work today."
  ];

  // Fetch initial dataset
  useEffect(() => {
    fetchAllData();
  }, []);

  // Set up Canvas Confetti Particle System
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
  }, [profile]); // Rebind if profile triggers mount

  // Auto-scroll chat window when history updates
  useEffect(() => {
    scrollToBottom();
  }, [chatHistory, isSendingChat]);

  const fetchAllData = async () => {
    try {
      // 1. Fetch Profile
      const pRes = await fetch('/api/profile');
      const pData = await pRes.json();
      setProfile(pData);

      if (pData && pData.name) {
        // 2. Fetch Time Travel clock
        const tRes = await fetch('/api/time-travel');
        const tData = await tRes.json();
        setVirtualTime(tData.virtual_time);
        formatTimeDisplay(tData.current_time);

        // 3. Fetch Context
        const cRes = await fetch('/api/context');
        const cData = await cRes.json();
        setContext(cData);
        syncContextInputs(cData);
        setIsLoggingContext(!cData.is_frozen);

        // 4. Fetch Actions
        const aRes = await fetch('/api/actions');
        const aData = await aRes.json();
        setActions(aData);

        // 5. Fetch Chat History
        const chRes = await fetch('/api/chat');
        const chData = await chRes.json();
        setChatHistory(chData);

        // Check if a level up celebration is pending
        if (pData.level_up_celebration_pending) {
          setCelebratedLevel(pData.level);
          setLevelUpModalOpen(true);
          triggerConfettiBlast(180);
        }
      }
    } catch (err) {
      console.error("Error loading core workspace data:", err);
    }
  };

  const formatTimeDisplay = (isoStr) => {
    const d = new Date(isoStr);
    const options = { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    setCurrentTimeDisplay(d.toLocaleDateString('en-US', options));
  };

  const syncContextInputs = (cData) => {
    setEditSleep(cData.sleep?.hours || 7.0);
    setEditSleepQuality(cData.sleep?.quality || 'good');
    setEditEnergy(cData.sleep?.energy || 7);
    setEditMoodRating(cData.mood?.rating || 6);
    setEditMoodState(cData.mood?.state || 'stressed');
    setEditWeather(cData.environmental?.weather || 'Clear');
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Toggle Action checklist status
  const handleToggleAction = async (actionId, currentStatus) => {
    let nextStatus = 'todo';
    if (currentStatus === 'todo') {
      nextStatus = 'done';
      triggerConfettiBlast(50); // Burst of confetti on single completion
    } else if (currentStatus === 'done') {
      nextStatus = 'skipped';
    }

    try {
      const res = await fetch('/api/actions/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId, status: nextStatus })
      });
      
      if (!res.ok) {
        throw new Error("Failed to update task status on the server.");
      }
      
      const data = await res.json();
      if (data.error) {
        throw new Error(data.error);
      }
      
      setActions(data.actions || []);
      setProfile(data.profile || profile);
      setChatHistory(data.chat_history || chatHistory);

      // Check if all actions are now completed to trigger screen blast
      if (data.actions && Array.isArray(data.actions)) {
        const allDone = data.actions.every(a => a.status === 'done');
        if (allDone && nextStatus === 'done') {
          triggerConfettiBlast(200); // Massive screen-wide blast
        }
      }

      // Check if level-up modal needs to pop up
      if (data.profile && data.profile.level_up_celebration_pending) {
        setCelebratedLevel(data.profile.level);
        setLevelUpModalOpen(true);
        triggerConfettiBlast(180);
      }
    } catch (e) {
      console.error("Error toggling action state:", e);
      alert(`Could not toggle task completion. Error: ${e.message}`);
    }
  };

  // Save Daily Context and freeze
  const handleSaveContext = async (e) => {
    e.preventDefault();
    setIsUpdatingContext(true);
    try {
      const res = await fetch('/api/context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sleep: { hours: parseFloat(editSleep), quality: editSleepQuality, energy: parseInt(editEnergy) },
          mood: { rating: parseInt(editMoodRating), state: editMoodState },
          environmental: { weather: editWeather }
        })
      });
      const updatedContext = await res.json();
      setContext(updatedContext);
      setIsLoggingContext(false);
      
      // Reload actions and chat to capture companion reaction to logs
      const actRes = await fetch('/api/actions');
      const actData = await actRes.json();
      setActions(actData);
      
      const chRes = await fetch('/api/chat');
      const chData = await chRes.json();
      setChatHistory(chData);
    } catch (err) {
      console.error("Failed to save context logs:", err);
    } finally {
      setIsUpdatingContext(false);
    }
  };

  // Chat message submission
  const handleSendChatMessage = async (textOverride) => {
    const text = textOverride || chatInput;
    if (!text.trim() || isSendingChat) return;

    setIsSendingChat(true);
    if (!textOverride) setChatInput('');

    // Optimistically add user bubble to screen
    const userBubble = { sender: 'User', text, timestamp: new Date().toISOString() };
    setChatHistory(prev => [...prev, userBubble]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
      const data = await res.json();

      // Append companion response bubble
      const aumBubble = { sender: 'AUM', text: data.response, timestamp: new Date().toISOString() };
      setChatHistory(prev => [...prev, aumBubble]);

      // If user typed something about completing a task or leveling up, check state
      fetchProfileAndActions();
    } catch (e) {
      console.error("Failed to send message:", e);
      const errBubble = { sender: 'AUM', text: "I'm having trouble reflecting right now. Let's take a breath and try again shortly.", timestamp: new Date().toISOString() };
      setChatHistory(prev => [...prev, errBubble]);
    } finally {
      setIsSendingChat(false);
    }
  };

  const fetchProfileAndActions = async () => {
    try {
      const pRes = await fetch('/api/profile');
      const pData = await pRes.json();
      setProfile(pData);
      
      const aRes = await fetch('/api/actions');
      const aData = await aRes.json();
      setActions(aData);
    } catch (err) {
      console.log(err);
    }
  };

  // Virtual Time Travel
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
        alert(`⏰ 6 AM Day Boundary Crossed! Transitioning to next day.\n• Yesterday's uncompleted tasks expired.\n• XP and Streak updated.\n• Next Daily 5 generated.`);
        // Reload all data to catch transition changes
        fetchAllData();
      } else {
        // Just reload context and actions to sync with time
        const cRes = await fetch('/api/context');
        const cData = await cRes.json();
        setContext(cData);
        syncContextInputs(cData);
        setIsLoggingContext(!cData.is_frozen);
      }
    } catch (err) {
      console.error("Failed to travel in time:", err);
    }
  };

  // Onboarding Wizard Submission
  const handleOnboardingChange = (e) => {
    const { name, value } = e.target;
    setOnboardingProfile(prev => ({ ...prev, [name]: value }));
  };

  const handleFocusAreaToggle = (area) => {
    setOnboardingProfile(prev => {
      const current = prev.lifeAreas || [];
      const updated = current.includes(area)
        ? current.filter(a => a !== area)
        : [...current, area];
      return { ...prev, lifeAreas: updated };
    });
  };

  const handleNextStep = (currentStep) => {
    if (currentStep === 1) {
      if (!onboardingProfile.name || !onboardingProfile.age || !onboardingProfile.gender) {
        alert("Please fill in your Name, Age, and Gender identity to proceed.");
        return;
      }
      setOnboardingStep(2);
    } else if (currentStep === 2) {
      if (!onboardingProfile.job || !onboardingProfile.workHours) {
        alert("Please fill in your Job Title/Role and Daily Work Hours to proceed.");
        return;
      }
      setOnboardingStep(3);
    } else if (currentStep === 3) {
      if (
        !onboardingProfile.maritalStatus ||
        onboardingProfile.kids === '' ||
        !onboardingProfile.idealLife ||
        !onboardingProfile.goal ||
        !onboardingProfile.problem
      ) {
        alert("Please fill in all the questions (Relationship status, Kids, Ideal life, Goals, and Problems) to proceed.");
        return;
      }
      setOnboardingStep(4);
    }
  };

  const handleFullReset = async () => {
    if (
      confirm(
        "🚨 WARNING: This will permanently delete your entire profile, actions history, and chat logs on the server. You will be started as a completely fresh tester.\n\nAre you sure you want to proceed?"
      )
    ) {
      try {
        const res = await fetch('/api/profile/reset', { method: 'POST' });
        if (!res.ok) throw new Error("Wipe request failed");
        
        alert("Server database deleted. Resetting session...");
        window.location.reload();
      } catch (err) {
        console.error(err);
        alert("Failed to reset database session. Please try again.");
      }
    }
  };

  const handleOnboardingSubmit = async (e) => {
    e.preventDefault();
    setOnboardingSubmitting(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(onboardingProfile)
      });
      if (!res.ok) throw new Error("Failed to submit onboarding");
      
      // Reload entire app state after successful onboarding
      await fetchAllData();
      triggerConfettiBlast(120);
    } catch (err) {
      console.error(err);
      alert("Something went wrong saving onboarding profile. Check logs.");
    } finally {
      setOnboardingSubmitting(false);
    }
  };

  const triggerConfettiBlast = (count) => {
    if (confettiSystemRef.current) {
      confettiSystemRef.current.start(count);
    }
  };

  const dismissLevelUp = () => {
    setLevelUpModalOpen(false);
    // Dismiss key on backend
    fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level_up_celebration_pending: false })
    }).then(res => res.json()).then(data => setProfile(data));
  };

  // Helper to determine Archetype color theme
  const getArchetypeColor = (level) => {
    if (level >= 35) return '#f43f5e'; // Life Architect - Rose Red
    if (level >= 20) return '#38bdf8'; // Focus Master - Sky Blue
    if (level >= 10) return '#fbbf24'; // Stamina Builder - Amber
    if (level >= 4) return '#c084fc'; // Consistency Seeker - Lavender Purple
    return '#a5b4fc'; // Mindful Rookie - Indigo
  };

  const getArchetypeName = (level) => {
    if (level >= 35) return 'Life Architect';
    if (level >= 20) return 'Focus Master';
    if (level >= 10) return 'Stamina Builder';
    if (level >= 4) return 'Consistency Seeker';
    return 'Mindful Rookie';
  };

  // RENDER ONBOARDING WIZARD IF PROFILE NOT INITIALIZED OR ONBOARDING NOT COMPLETED
  if (profile && !profile.onboarding_completed) {
    return (
      <div style={styles.pageWrapper}>
        <canvas ref={canvasRef} style={styles.confettiCanvas}></canvas>
        <div className="glass-panel" style={styles.wizardContainer}>
          <div style={styles.progressContainer}>
            <div style={{ ...styles.progressBar, width: `${(onboardingStep / 4) * 100}%` }}></div>
          </div>
          <div style={styles.stepIndicator}>Step {onboardingStep} of 4</div>

          <h2 style={styles.wizardTitle}>Setup Your AUM Life OS</h2>
          
          <form onSubmit={handleOnboardingSubmit} style={{ display: 'contents' }}>
            {onboardingStep === 1 && (
              <div style={styles.wizardStep} className="animate-fade-in">
                <h3 style={styles.wizardStepTitle}>1. Personal Core</h3>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Full Name</label>
                  <input
                    name="name"
                    value={onboardingProfile.name}
                    onChange={handleOnboardingChange}
                    className="glass-input"
                    placeholder="e.g. Akash Tripathi"
                    required
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Age</label>
                  <input
                    name="age"
                    type="number"
                    value={onboardingProfile.age}
                    onChange={handleOnboardingChange}
                    className="glass-input"
                    placeholder="e.g. 35"
                    required
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Gender Identity</label>
                  <select
                    name="gender"
                    value={onboardingProfile.gender}
                    onChange={handleOnboardingChange}
                    className="glass-select"
                    required
                  >
                    <option value="">Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div style={styles.buttonRow}>
                  <div></div>
                  <button
                    type="button"
                    onClick={() => handleNextStep(1)}
                    className="btn btn-primary"
                  >
                    Next Step →
                  </button>
                </div>
              </div>
            )}

            {onboardingStep === 2 && (
              <div style={styles.wizardStep} className="animate-fade-in">
                <h3 style={styles.wizardStepTitle}>2. Work & Lifestyle</h3>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Job Title / Role</label>
                  <input
                    name="job"
                    value={onboardingProfile.job}
                    onChange={handleOnboardingChange}
                    className="glass-input"
                    placeholder="e.g. General Manager Business Development"
                    required
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Daily Work Hours</label>
                  <input
                    name="workHours"
                    type="number"
                    value={onboardingProfile.workHours}
                    onChange={handleOnboardingChange}
                    className="glass-input"
                    placeholder="e.g. 10"
                    required
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Weekly Work Days</label>
                  <select
                    name="workDays"
                    value={onboardingProfile.workDays}
                    onChange={handleOnboardingChange}
                    className="glass-select"
                    required
                  >
                    <option value={5}>5 Days</option>
                    <option value={6}>6 Days</option>
                  </select>
                </div>
                <div style={styles.buttonRow}>
                  <button type="button" onClick={() => setOnboardingStep(1)} className="btn btn-secondary">
                    ← Back
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNextStep(2)}
                    className="btn btn-primary"
                  >
                    Next Step →
                  </button>
                </div>
              </div>
            )}

            {onboardingStep === 3 && (
              <div style={styles.wizardStep} className="animate-fade-in">
                <h3 style={styles.wizardStepTitle}>3. Vision & Vulnerability</h3>
                <div className="grid grid-cols-2" style={{ gap: '1rem' }}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Relationship Status</label>
                    <select
                      name="maritalStatus"
                      value={onboardingProfile.maritalStatus}
                      onChange={handleOnboardingChange}
                      className="glass-select"
                      required
                    >
                      <option value="">Select Status</option>
                      <option value="Single">Single</option>
                      <option value="In a Relationship">In a Relationship</option>
                      <option value="Married">Married</option>
                      <option value="Prefer not to say">Prefer not to say</option>
                    </select>
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Number of Kids</label>
                    <input
                      name="kids"
                      type="number"
                      value={onboardingProfile.kids}
                      onChange={handleOnboardingChange}
                      className="glass-input"
                      placeholder="0"
                      required
                    />
                  </div>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>What does your IDEAL life look like?</label>
                  <textarea
                    name="idealLife"
                    value={onboardingProfile.idealLife}
                    onChange={handleOnboardingChange}
                    className="glass-textarea"
                    placeholder="Describe your ideal state of relationships, peace, focus..."
                    style={{ height: '70px', resize: 'none' }}
                    required
                  ></textarea>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>What are your primary GOALS?</label>
                  <input
                    name="goal"
                    value={onboardingProfile.goal}
                    onChange={handleOnboardingChange}
                    className="glass-input"
                    placeholder="e.g. Achieve inner freedom, stable routines..."
                    required
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>What are the biggest PROBLEMS / bottlenecks?</label>
                  <input
                    name="problem"
                    value={onboardingProfile.problem}
                    onChange={handleOnboardingChange}
                    className="glass-input"
                    placeholder="e.g. Unstable job, tricky marital arguments..."
                    required
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Focus Areas (Select all that apply)</label>
                  <div className="flex flex-wrap gap-1">
                    {["Mindset", "Physical", "Relationships", "Work-Life", "Reflection"].map((area) => {
                      const isSelected = onboardingProfile.lifeAreas.includes(area);
                      return (
                        <button
                          key={area}
                          type="button"
                          onClick={() => handleFocusAreaToggle(area)}
                          className="badge"
                          style={{
                            ...styles.focusChip,
                            backgroundColor: isSelected ? 'var(--color-primary)' : 'rgba(255,255,255,0.02)',
                            borderColor: isSelected ? 'var(--color-primary)' : 'var(--border-glass)',
                            color: isSelected ? '#fff' : 'var(--text-secondary)',
                            cursor: 'pointer'
                          }}
                        >
                          {area}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div style={styles.buttonRow}>
                  <button type="button" onClick={() => setOnboardingStep(2)} className="btn btn-secondary">
                    ← Back
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNextStep(3)}
                    className="btn btn-primary"
                  >
                    Next Step →
                  </button>
                </div>
              </div>
            )}

            {onboardingStep === 4 && (
              <div style={styles.wizardStep} className="animate-fade-in">
                <h3 style={styles.wizardStepTitle}>4. Life Satisfaction</h3>
                <div style={{ textAlign: 'center', margin: '2rem 0' }}>
                  <div style={{ fontSize: '3rem', fontFamily: 'var(--font-display)', fontWeight: 'bold', color: 'var(--color-primary)', textShadow: '0 0 15px rgba(99,102,241,0.3)' }}>
                    {onboardingProfile.lifeSatisfaction} <span style={{ fontSize: '1.5rem', color: 'var(--text-secondary)' }}>/ 10</span>
                  </div>
                  <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', fontSize: '0.9rem' }}>
                    How satisfied are you with your life on a scale of 1 to 10 today?
                  </p>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    name="lifeSatisfaction"
                    value={onboardingProfile.lifeSatisfaction}
                    onChange={handleOnboardingChange}
                    style={{ ...styles.slider, width: '80%', margin: '1.5rem auto 0 auto', display: 'block' }}
                  />
                </div>
                <div style={styles.buttonRow}>
                  <button type="button" onClick={() => setOnboardingStep(3)} className="btn btn-secondary">
                    ← Back
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={onboardingSubmitting}
                  >
                    {onboardingSubmitting ? "Generating Momentum..." : "Initialize OS ✓"}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>
    );
  }

  // RENDER LOADING PLACEHOLDER IF LOGS NOT FULLY CONFIGURED
  if (!profile || !context) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p style={{ marginTop: '1.5rem', color: 'var(--text-secondary)' }}>Aligning momentum matrix...</p>
      </div>
    );
  }

  const completedCount = actions.filter(a => a.status === 'done').length;
  const progressPercent = actions.length > 0 ? Math.round((completedCount / actions.length) * 100) : 0;

  return (
    <div className="app-container animate-fade-in" style={{ position: 'relative' }}>
      <canvas ref={canvasRef} style={styles.confettiCanvas}></canvas>

      {/* LEVEL UP MODAL CELEBRATION OVERLAY */}
      {levelUpModalOpen && (
        <div style={styles.modalOverlay}>
          <div className="glass-panel" style={styles.levelUpModal}>
            <div style={styles.levelUpHeader}>🏆 LEVEL UP!</div>
            <div style={styles.levelUpBadge} className="animate-glow">
              {celebratedLevel}
            </div>
            <h3 style={{ fontSize: '1.5rem', fontFamily: 'var(--font-display)', marginTop: '1rem', color: getArchetypeColor(celebratedLevel) }}>
              {getArchetypeName(celebratedLevel)}
            </h3>
            <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', fontSize: '0.9rem', maxWidth: '300px', margin: '0.5rem auto 0 auto' }}>
              Congratulations Akash! You have leveled up by building consistent momentum. Your companion is waiting to celebrate in the chat.
            </p>
            <button onClick={dismissLevelUp} className="btn btn-primary" style={{ marginTop: '1.5rem', width: '150px' }}>
              Thank You!
            </button>
          </div>
        </div>
      )}

      {/* FLOAT FLOATING TIME TRAVEL CONTROL */}
      <div style={styles.floatingTimeTravel}>
        <button onClick={() => setTimeSelectorOpen(!timeSelectorOpen)} className="btn btn-secondary" style={styles.timeTravelToggleBtn}>
          📅 {currentTimeDisplay} {virtualTime ? " (Simulated)" : " (Live)"}
        </button>
        
        {timeSelectorOpen && (
          <div className="glass-panel" style={styles.timeSelectorDropdown}>
            <div style={styles.timeTitle}>Virtual Clock Simulation</div>
            <div className="flex flex-col gap-1" style={{ width: '100%' }}>
              <button onClick={() => handleTimeTravel('advance', 1)} className="btn btn-secondary" style={styles.simOptBtn}>+1 Hour</button>
              <button onClick={() => handleTimeTravel('advance', 12)} className="btn btn-secondary" style={styles.simOptBtn}>+12 Hours</button>
              
              {/* Force to next 6:01 AM day boundary */}
              <button 
                onClick={() => {
                  const now = virtualTime ? new Date(virtualTime) : new Date();
                  const target = new Date(now);
                  if (target.getHours() < 6) {
                    target.setHours(6, 1, 0, 0);
                  } else {
                    target.setDate(target.getDate() + 1);
                    target.setHours(6, 1, 0, 0);
                  }
                  handleTimeTravel('set', target.toISOString());
                }} 
                className="btn btn-primary" 
                style={styles.simOptPrimaryBtn}
              >
                Fast-Forward to 6:01 AM (Next Day)
              </button>
              
              {virtualTime && (
                <button onClick={() => handleTimeTravel('reset')} className="btn btn-secondary" style={{ ...styles.simOptBtn, color: '#ef4444' }}>
                  Reset to Live Clock
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* SECTION 1: WELCOME & DASHBOARD STATS */}
      <section style={styles.welcomeBanner} className="glass-panel flex justify-between align-center">
        <div>
          <span className="badge badge-primary" style={{ marginBottom: '0.5rem' }}>
            Current Phase: {profile.current_phase || 'Stability'}
          </span>
          <h1 style={styles.welcomeTitle}>Welcome, {profile.name}</h1>
          <p style={styles.welcomeSubtitle}>
            Focusing on <strong className="glow-text-primary">{profile.current_phase || 'Stability'}</strong>.
            {profile.current_phase === 'Recovery' && " Protecting reserves. Prioritize lowering cognitive demands."}
            {profile.current_phase === 'Stability' && " Maintaining rhythm. Focus on small, high-certainty actions today."}
            {profile.current_phase === 'Growth' && " Expanding capabilities. Take on new, deliberate focus challenges."}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button 
            onClick={() => {
              if (confirm("Reset current profile and re-run onboarding? This will re-capture your goals, work structure, and baseline metrics.")) {
                setProfile(prev => ({ ...prev, onboarding_completed: false }));
              }
            }}
            className="btn btn-secondary"
            style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
          >
            ⚙️ Reset & Onboard
          </button>
          <button 
            onClick={handleFullReset}
            className="btn btn-secondary"
            style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', whiteSpace: 'nowrap', border: '1px solid #ef4444', color: '#ef4444' }}
          >
            ⚠️ Wipe & Restart
          </button>
        </div>
      </section>

      {/* SECTION 2: CONTEXT LOG TRACKER & EDITOR */}
      <section style={{ marginTop: '1.5rem' }} className="glass-panel">
        <div className="flex justify-between align-center" style={{ borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              🔒 Daily Context Status: <span style={{ color: context.is_frozen ? 'var(--color-success)' : '#fbbf24' }}>
                {context.is_frozen ? "Frozen & Saved" : "Awaiting Logs"}
              </span>
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
              Locking daily context details helps AUM structure the Daily 5 recommendation loop.
            </p>
          </div>
          {context.is_frozen && (
            <button 
              onClick={() => setIsLoggingContext(!isLoggingContext)} 
              className="btn btn-secondary"
              style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }}
            >
              {isLoggingContext ? "Cancel Edit" : "✏️ Update Context"}
            </button>
          )}
        </div>

        {/* Read-Only Stats Display when Frozen */}
        {!isLoggingContext ? (
          <div className="grid grid-cols-3" style={{ gap: '1.5rem' }}>
            <div style={styles.freezeLogBlock}>
              <span style={styles.freezeLogLabel}>💤 Sleep Analysis</span>
              <div style={styles.freezeLogVal}>{context.sleep?.hours || 7} hrs <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>({context.sleep?.quality})</span></div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Energy Level: {context.sleep?.energy}/10</span>
            </div>
            <div style={styles.freezeLogBlock}>
              <span style={styles.freezeLogLabel}>🎭 Emotional State</span>
              <div style={styles.freezeLogVal} className="glow-text-primary">
                {context.mood?.state ? context.mood.state.charAt(0).toUpperCase() + context.mood.state.slice(1) : 'Neutral'}
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Stress Rating: {context.mood?.rating || 5}/10</span>
            </div>
            <div style={styles.freezeLogBlock}>
              <span style={styles.freezeLogLabel}>🌍 Environment</span>
              <div style={styles.freezeLogVal}>{context.environmental?.weather || 'Clear'}</div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Day: {context.environmental?.day_of_week || 'Today'}</span>
            </div>
          </div>
        ) : (
          /* Form Editor when Open */
          <form onSubmit={handleSaveContext} className="grid grid-cols-3 animate-fade-in" style={{ gap: '2rem' }}>
            <div>
              <h4 style={styles.simSecTitle}>Physical Parameters</h4>
              <div style={styles.inputGrp}>
                <label style={styles.inputLbl}>Sleep Duration: {editSleep} hrs</label>
                <input
                  type="range" min="4" max="10" step="0.1"
                  value={editSleep}
                  onChange={(e) => setEditSleep(e.target.value)}
                  style={styles.slider}
                />
              </div>
              <div style={styles.inputGrp}>
                <label style={styles.inputLbl}>Sleep Quality</label>
                <select value={editSleepQuality} onChange={(e) => setEditSleepQuality(e.target.value)} className="glass-select">
                  <option value="excellent">Excellent</option>
                  <option value="good">Good / Rested</option>
                  <option value="poor">Poor / Interrupted</option>
                  <option value="terrible">Insomnia / Exhausted</option>
                </select>
              </div>
              <div style={styles.inputGrp}>
                <label style={styles.inputLbl}>Morning Energy Level: {editEnergy}/10</label>
                <input
                  type="range" min="1" max="10"
                  value={editEnergy}
                  onChange={(e) => setEditEnergy(e.target.value)}
                  style={styles.slider}
                />
              </div>
            </div>

            <div>
              <h4 style={styles.simSecTitle}>Emotional Parameters</h4>
              <div style={styles.inputGrp}>
                <label style={styles.inputLbl}>Stress Level: {editMoodRating}/10</label>
                <input
                  type="range" min="1" max="10"
                  value={editMoodRating}
                  onChange={(e) => setEditMoodRating(e.target.value)}
                  style={styles.slider}
                />
              </div>
              <div style={styles.inputGrp}>
                <label style={styles.inputLbl}>Dominant Feeling State</label>
                <select value={editMoodState} onChange={(e) => setEditMoodState(e.target.value)} className="glass-select">
                  <option value="confident">Confident / Proactive</option>
                  <option value="excited">Excited / High Stamina</option>
                  <option value="stressed">Stressed / Busy</option>
                  <option value="anxious">Anxious / Overloaded</option>
                  <option value="exhausted">Exhausted / Low battery</option>
                  <option value="disconnected">Disconnected / Lost</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col justify-between">
              <div>
                <h4 style={styles.simSecTitle}>Environmental Parameters</h4>
                <div style={styles.inputGrp}>
                  <label style={styles.inputLbl}>Weather Outlook</label>
                  <select value={editWeather} onChange={(e) => setEditWeather(e.target.value)} className="glass-select">
                    <option value="Clear">Clear & Sunny</option>
                    <option value="Overcast">Overcast & Humid</option>
                    <option value="Rainy">Raining / Indoors</option>
                    <option value="Cold">Chilly / Overcast</option>
                  </select>
                </div>
              </div>
              <div style={{ marginTop: '1rem' }}>
                <button type="submit" disabled={isUpdatingContext} className="btn btn-primary" style={{ width: '100%', padding: '0.8rem' }}>
                  {isUpdatingContext ? "Locking & Recalculating..." : "Save Log & Freeze Context"}
                </button>
              </div>
            </div>
          </form>
        )}
      </section>

      {/* SECTION 3: SPLIT GRID - GAMIFICATION PROGRESS & DAILY 5 TASKS */}
      <div className="grid grid-cols-3" style={{ marginTop: '1.5rem' }}>
        
        {/* LEFT COLUMN: GAMIFICATION CARD & ACTIVE ARCHETYPE */}
        <div className="flex flex-col gap-3">
          <div className="glass-panel flex flex-col align-center justify-center" style={{ padding: '2rem 1.5rem', textAlign: 'center' }}>
            <h3 style={styles.panelTitle}>Momentum Experience</h3>
            
            <div style={styles.ringWrapper}>
              <svg width="150" height="150" viewBox="0 0 150 150">
                <circle cx="75" cy="75" r="60" fill="transparent" stroke="rgba(255,255,255,0.03)" strokeWidth="10" />
                <circle 
                  cx="75" cy="75" r="60" 
                  fill="transparent" 
                  stroke="url(#xpGradient)" 
                  strokeWidth="10" 
                  strokeDasharray="377"
                  strokeDashoffset={377 - (377 * (profile.xp || 0)) / 100}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 0.8s ease-in-out' }}
                />
                <defs>
                  <linearGradient id="xpGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="var(--color-primary)" />
                    <stop offset="100%" stopColor="var(--color-secondary)" />
                  </linearGradient>
                </defs>
              </svg>
              <div style={styles.ringTextContainer}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Level</span>
                <span style={styles.ringPercentage}>{profile.level || 0}</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{profile.xp || 0} / 100 XP</span>
              </div>
            </div>

            <div className="flex gap-4" style={{ marginTop: '1.5rem', width: '100%', justifyContent: 'space-around' }}>
              <div>
                <span style={styles.statVal} className="glow-text-primary">🔥 {profile.streak || 0}d</span>
                <span style={styles.statLabel}>Streak</span>
              </div>
              <div style={{ borderLeft: '1px solid var(--border-glass)', height: '24px' }}></div>
              <div>
                <span style={styles.statVal}>{completedCount} / 5</span>
                <span style={styles.statLabel}>Completed</span>
              </div>
              <div style={{ borderLeft: '1px solid var(--border-glass)', height: '24px' }}></div>
              <div>
                <span style={styles.statVal}>{profile.completion_rate || 0}%</span>
                <span style={styles.statLabel}>Total Rate</span>
              </div>
            </div>
          </div>

          <div className="glass-panel" style={{ background: `linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(168, 85, 247, 0.05) 100%)`, border: `1px solid rgba(99,102,241,0.15)` }}>
            <div className="flex align-center justify-between" style={{ marginBottom: '1rem' }}>
              <h3 style={styles.panelTitle}>Active Identity</h3>
              <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>Archetype Status</span>
            </div>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <div style={{ ...styles.archetypeBadge, borderColor: getArchetypeColor(profile.level) }}>🛡️</div>
              <div>
                <h4 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-display)', color: getArchetypeColor(profile.level) }}>
                  {getArchetypeName(profile.level)}
                </h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  Evolving through consistency
                </p>
              </div>
            </div>
          </div>

          {/* HISTORICAL MILESTONES */}
          {profile.milestones && profile.milestones.length > 0 && (
            <div className="glass-panel flex flex-col" style={{ flexGrow: 1, maxHeight: '200px', overflowY: 'auto' }}>
              <h4 style={{ ...styles.panelTitle, fontSize: '0.9rem', marginBottom: '0.5rem' }}>Milestone History</h4>
              <div className="flex flex-col gap-1">
                {profile.milestones.slice(-5).reverse().map((mil, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'between', fontSize: '0.8rem', padding: '0.25rem 0', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>⚡ {mil.text}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{mil.date}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: THE DAILY 5 CHECKLIST */}
        <div style={{ gridColumn: 'span 2' }} className="flex flex-col gap-3">
          <div className="flex align-center justify-between" style={{ padding: '0 0.5rem' }}>
            <div>
              <h2 style={{ fontSize: '1.4rem', fontFamily: 'var(--font-display)' }}>The Daily 5 Tasks</h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Intelligent, customized actions selected based on your broad goals and daily context.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2" style={{ position: 'relative' }}>
            {actions.map((action) => {
              const isExpanded = expandedActionId === action.id;
              const isDone = action.status === 'done';
              const isSkipped = action.status === 'skipped';

              let statusSymbol = '○';
              let statusColor = 'var(--text-secondary)';
              let titleStyle = {};

              if (isDone) {
                statusSymbol = '✓';
                statusColor = 'var(--color-success)';
                titleStyle = { textDecoration: 'line-through', color: 'var(--text-muted)' };
              } else if (isSkipped) {
                statusSymbol = '✕';
                statusColor = 'var(--color-warning)';
                titleStyle = { color: 'var(--text-muted)' };
              }

              return (
                <div 
                  key={action.id}
                  className={`glass-panel ${!isExpanded ? 'glass-panel-interactive' : ''}`}
                  style={{
                    ...styles.actionCard,
                    ...(isExpanded ? styles.actionCardExpanded : {}),
                    borderColor: isExpanded ? 'rgba(99, 102, 241, 0.4)' : 'var(--border-glass)'
                  }}
                  onClick={() => !isExpanded && setExpandedActionId(action.id)}
                >
                  <div className="flex justify-between align-center" style={{ width: '100%' }}>
                    <div className="flex align-center gap-3" style={{ flexGrow: 1 }}>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleAction(action.id, action.status);
                        }}
                        style={{
                          ...styles.statusButton,
                          color: statusColor,
                          borderColor: isDone || isSkipped ? statusColor : 'var(--border-glass)'
                        }}
                      >
                        {statusSymbol}
                      </button>

                      <div>
                        <span className="badge" style={styles.actionCategoryBadge(action.category)}>
                          {action.category} • Diff {action.difficulty || 1}
                        </span>
                        <h4 style={{ ...styles.actionText, ...titleStyle }}>{action.text}</h4>
                      </div>
                    </div>
                    
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedActionId(isExpanded ? null : action.id);
                      }}
                      style={styles.expandButton}
                    >
                      {isExpanded ? '▲' : '▼'}
                    </button>
                  </div>

                  {isExpanded && (
                    <div style={styles.actionDrawer} className="animate-fade-in">
                      <div style={styles.drawerSection}>
                        <h5 style={styles.drawerSectionTitle}>💡 Why Today?</h5>
                        <p style={styles.drawerSectionText}>{action.whyToday}</p>
                      </div>
                      <div style={styles.drawerSection}>
                        <h5 style={styles.drawerSectionTitle}>🎯 Long-term Value</h5>
                        <p style={styles.drawerSectionText}>{action.whyRelevant}</p>
                      </div>
                      <div style={styles.drawerSection}>
                        <h5 style={styles.drawerSectionTitle}>📝 How to Execute</h5>
                        <p style={styles.drawerSectionText}>{action.howTo}</p>
                      </div>
                      <div className="flex justify-between" style={{ marginTop: '1rem', borderTop: '1px solid var(--border-glass)', paddingTop: '0.75rem' }}>
                        <button 
                          className="btn btn-secondary"
                          onClick={() => setExpandedActionId(null)}
                          style={{ padding: '0.35rem 0.85rem', fontSize: '0.75rem' }}
                        >
                          Collapse
                        </button>
                        <div className="flex gap-2">
                          <button 
                            className="btn btn-secondary"
                            onClick={() => handleToggleAction(action.id, 'done')} // transitions from done to skipped
                            style={{ padding: '0.35rem 0.85rem', fontSize: '0.75rem', borderColor: 'var(--color-warning-glow)', color: '#fcd34d' }}
                          >
                            Skip Action
                          </button>
                          <button 
                            className="btn btn-primary"
                            onClick={() => handleToggleAction(action.id, 'todo')} // transitions to done
                            style={{ padding: '0.35rem 1rem', fontSize: '0.75rem', boxShadow: 'none' }}
                          >
                            Complete Action
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* SECTION 4: UNIFIED CHAT COMPANION AT BOTTOM */}
      <section style={{ marginTop: '1.5rem' }}>
        <div style={styles.chatHeader} className="glass-panel flex align-center justify-between">
          <div className="flex align-center gap-3">
            <div style={styles.avatar}>🕉️</div>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontFamily: 'var(--font-display)' }}>My AI Companion (AUM)</h2>
              <div className="flex align-center gap-1" style={{ marginTop: '0.2rem' }}>
                <span style={styles.onlineDot}></span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Empathy Engine Online</span>
              </div>
            </div>
          </div>

          <div style={styles.memoryStatus} className="flex flex-col">
            <span style={styles.memoryStatusTitle}>🧠 Evolving Memories:</span>
            <div className="flex gap-1" style={{ marginTop: '0.25rem' }}>
              <span className="badge badge-primary" style={{ fontSize: '0.6rem' }}>Core Needs</span>
              <span className="badge badge-success" style={{ fontSize: '0.6rem' }}>Habit Loops</span>
            </div>
          </div>
        </div>

        {/* Viewport for messages */}
        <div style={styles.chatViewport} className="glass-panel">
          <div style={styles.chatScrollArea}>
            {chatHistory.length === 0 ? (
              <div className="flex flex-col align-center justify-center" style={{ height: '100%', color: 'var(--text-muted)', minHeight: '150px' }}>
                <p>Hello Akash, I'm AUM. I help you track and maintain life momentum. Chat with me anytime.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3" style={{ padding: '0.5rem' }}>
                {chatHistory.map((msg, index) => {
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
                
                {isSendingChat && (
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
        </div>

        {/* Controls and Input */}
        <div style={styles.inputSection} style={{ marginTop: '0.5rem' }}>
          <div className="flex gap-2" style={styles.chipsRow}>
            {reflectionChips.map((chip, index) => (
              <button 
                key={index} 
                onClick={() => handleSendChatMessage(chip)}
                className="btn btn-secondary"
                style={styles.chip}
                disabled={isSendingChat}
              >
                {chip}
              </button>
            ))}
          </div>

          <div className="flex gap-2" style={{ width: '100%', marginTop: '0.5rem' }}>
            <input 
              type="text" 
              placeholder="Talk to your companion about today's wins, struggles, or goals..." 
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendChatMessage()}
              className="glass-input"
              style={styles.chatInput}
              disabled={isSendingChat}
            />
            <button 
              onClick={() => handleSendChatMessage()}
              className="btn btn-primary"
              style={styles.sendBtn}
              disabled={isSendingChat}
            >
              {isSendingChat ? "..." : "Send"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

// Simple Canvas Confetti Particle System
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

// Inline CSS Styles for Dashboard Page
const styles = {
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '80vh',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '3px solid rgba(255, 255, 255, 0.05)',
    borderTopColor: 'var(--color-primary)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
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
  floatingTimeTravel: {
    position: 'fixed',
    top: '1.1rem',
    right: '250px',
    zIndex: 999,
  },
  timeTravelToggleBtn: {
    padding: '0.45rem 1rem',
    fontSize: '0.8rem',
    backdropFilter: 'blur(10px)',
  },
  timeSelectorDropdown: {
    position: 'absolute',
    top: '110%',
    right: 0,
    width: '240px',
    padding: '1rem',
    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  timeTitle: {
    fontSize: '0.85rem',
    fontFamily: 'var(--font-display)',
    fontWeight: 'bold',
    borderBottom: '1px solid var(--border-glass)',
    paddingBottom: '0.4rem',
  },
  simOptBtn: {
    padding: '0.4rem',
    fontSize: '0.75rem',
    width: '100%',
    textAlign: 'center',
  },
  simOptPrimaryBtn: {
    padding: '0.5rem',
    fontSize: '0.75rem',
    width: '100%',
    textAlign: 'center',
    boxShadow: 'none',
  },
  welcomeBanner: {
    background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(168, 85, 247, 0.08) 100%)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
  },
  welcomeTitle: {
    fontSize: '1.75rem',
    fontFamily: 'var(--font-display)',
    fontWeight: '700',
  },
  welcomeSubtitle: {
    color: 'var(--text-secondary)',
    fontSize: '0.85rem',
    marginTop: '0.25rem',
  },
  freezeLogBlock: {
    padding: '1rem',
    background: 'rgba(255,255,255,0.01)',
    border: '1px solid var(--border-glass)',
    borderRadius: '0.75rem',
    display: 'flex',
    flexDirection: 'column',
  },
  freezeLogLabel: {
    fontSize: '0.7rem',
    textTransform: 'uppercase',
    color: 'var(--text-secondary)',
    fontWeight: 'bold',
    letterSpacing: '0.05em',
  },
  freezeLogVal: {
    fontSize: '1.25rem',
    fontFamily: 'var(--font-display)',
    fontWeight: 'bold',
    margin: '0.35rem 0',
  },
  simSecTitle: {
    fontSize: '0.95rem',
    fontFamily: 'var(--font-display)',
    borderBottom: '1px solid var(--border-glass)',
    paddingBottom: '0.4rem',
    marginBottom: '0.75rem',
  },
  inputGrp: {
    marginBottom: '0.75rem',
  },
  inputLbl: {
    fontSize: '0.75rem',
    color: 'var(--text-secondary)',
    display: 'block',
    marginBottom: '0.25rem',
  },
  slider: {
    width: '100%',
    accentColor: 'var(--color-primary)',
    height: '4px',
    cursor: 'pointer',
  },
  panelTitle: {
    fontSize: '1rem',
    fontFamily: 'var(--font-display)',
    color: 'var(--text-primary)',
  },
  ringWrapper: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringTextContainer: {
    position: 'absolute',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  ringPercentage: {
    fontSize: '2rem',
    fontFamily: 'var(--font-display)',
    fontWeight: 'bold',
  },
  statVal: {
    fontSize: '1.1rem',
    fontWeight: 'bold',
    fontFamily: 'var(--font-display)',
    display: 'block',
  },
  statLabel: {
    fontSize: '0.65rem',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    display: 'block',
    marginTop: '0.15rem',
  },
  archetypeBadge: {
    fontSize: '2rem',
    background: 'rgba(255,255,255,0.02)',
    borderRadius: '0.75rem',
    width: '50px',
    height: '50px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1.5px solid rgba(255,255,255,0.05)',
  },
  actionCard: {
    padding: '0.85rem 1.1rem',
    display: 'flex',
    flexDirection: 'column',
  },
  actionCardExpanded: {
    background: 'rgba(10, 11, 18, 0.9)',
    boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
  },
  statusButton: {
    width: '26px',
    height: '26px',
    borderRadius: '50%',
    border: '1.5px solid var(--border-glass)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    fontSize: '0.85rem',
    background: 'rgba(255,255,255,0.01)',
  },
  actionText: {
    fontSize: '0.95rem',
    fontWeight: '500',
    color: 'var(--text-primary)',
    lineHeight: '1.35',
  },
  expandButton: {
    fontSize: '0.65rem',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: '0.4rem',
  },
  actionCategoryBadge: (category) => {
    const colors = {
      Mindset: { bg: 'rgba(168, 85, 247, 0.08)', text: '#d8b4fe', border: 'rgba(168, 85, 247, 0.15)' },
      Physical: { bg: 'rgba(20, 184, 166, 0.08)', text: '#99f6e4', border: 'rgba(20, 184, 166, 0.15)' },
      Relationships: { bg: 'rgba(244, 63, 94, 0.08)', text: '#fecdd3', border: 'rgba(244, 63, 94, 0.15)' },
      'Work-Life': { bg: 'rgba(14, 165, 233, 0.08)', text: '#bae6fd', border: 'rgba(14, 165, 233, 0.15)' },
      Reflection: { bg: 'rgba(245, 158, 11, 0.08)', text: '#fde68a', border: 'rgba(245, 158, 11, 0.15)' },
    };
    const c = colors[category] || { bg: 'rgba(255,255,255,0.05)', text: '#cbd5e1', border: 'rgba(255,255,255,0.1)' };
    return {
      background: c.bg,
      color: c.text,
      border: `1px solid ${c.border}`,
      marginBottom: '0.25rem',
      fontSize: '0.6rem',
    };
  },
  actionDrawer: {
    marginTop: '0.75rem',
    borderTop: '1px solid var(--border-glass)',
    paddingTop: '0.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  drawerSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.15rem',
  },
  drawerSectionTitle: {
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    color: 'var(--text-secondary)',
    fontWeight: 'bold',
  },
  drawerSectionText: {
    fontSize: '0.85rem',
    color: 'var(--text-primary)',
    lineHeight: '1.45',
  },
  chatHeader: {
    padding: '0.6rem 1.1rem',
    borderRadius: '1rem 1rem 0 0',
    borderBottom: 'none',
  },
  avatar: {
    width: '38px',
    height: '38px',
    borderRadius: '0.6rem',
    background: 'rgba(99, 102, 241, 0.1)',
    border: '1px solid rgba(99, 102, 241, 0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.25rem',
  },
  onlineDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: 'var(--color-success)',
    boxShadow: '0 0 6px var(--color-success)',
    display: 'inline-block',
  },
  memoryStatus: {
    textAlign: 'right',
  },
  memoryStatusTitle: {
    fontSize: '0.65rem',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    fontWeight: 'bold',
  },
  chatViewport: {
    padding: '1rem',
    borderRadius: '0 0 1rem 1rem',
    borderTop: 'none',
    maxHeight: '320px',
    minHeight: '220px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
  },
  chatScrollArea: {
    width: '100%',
    maxHeight: '300px',
    overflowY: 'auto',
  },
  bubbleWrapper: {
    display: 'flex',
    gap: '0.5rem',
    width: '100%',
  },
  miniAvatar: {
    width: '24px',
    height: '24px',
    borderRadius: '0.4rem',
    background: 'rgba(99, 102, 241, 0.1)',
    border: '1px solid rgba(99, 102, 241, 0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.85rem',
    alignSelf: 'flex-end',
    marginBottom: '2px',
  },
  bubble: {
    maxWidth: '75%',
    padding: '0.7rem 0.95rem',
    borderRadius: '1rem',
    lineHeight: '1.45',
    position: 'relative',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
  },
  bubbleAi: {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid var(--border-glass)',
    color: 'var(--text-primary)',
    borderBottomLeftRadius: '0.15rem',
  },
  bubbleUser: {
    background: 'linear-gradient(135deg, var(--color-primary) 0%, rgba(99,102,241,0.6) 100%)',
    color: 'white',
    borderBottomRightRadius: '0.15rem',
  },
  bubbleText: {
    fontSize: '0.9rem',
  },
  bubbleTime: {
    fontSize: '0.6rem',
    color: 'rgba(255, 255, 255, 0.35)',
    display: 'block',
    textAlign: 'right',
    marginTop: '0.25rem',
  },
  typingIndicator: {
    alignItems: 'center',
    height: '12px',
    padding: '0 0.25rem',
    'span': {
      width: '4px',
      height: '4px',
      borderRadius: '50%',
      backgroundColor: 'var(--text-secondary)',
      animation: 'bounce 1.4s infinite ease-in-out both',
    }
  },
  chipsRow: {
    display: 'flex',
    overflowX: 'auto',
    gap: '0.5rem',
    scrollbarWidth: 'none',
  },
  chip: {
    padding: '0.35rem 0.75rem',
    fontSize: '0.75rem',
    borderRadius: '0.5rem',
    whiteSpace: 'nowrap',
  },
  chatInput: {
    flexGrow: 1,
    padding: '0.75rem 1.1rem',
    fontSize: '0.9rem',
    borderRadius: '0.75rem',
  },
  sendBtn: {
    padding: '0 1.25rem',
    fontSize: '0.9rem',
    borderRadius: '0.75rem',
  },

  // Onboarding Wizard Styles
  pageWrapper: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '85vh',
    padding: '1rem',
  },
  wizardContainer: {
    maxWidth: '520px',
    width: '100%',
    padding: '2rem 1.75rem',
    background: 'var(--bg-surface-glass)',
    boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
  },
  progressContainer: {
    width: '100%',
    height: '5px',
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '3px',
    marginBottom: '0.5rem',
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    background: 'linear-gradient(90deg, var(--color-primary) 0%, var(--color-secondary) 100%)',
    transition: 'width 0.4s ease',
  },
  stepIndicator: {
    fontSize: '0.7rem',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontWeight: 'bold',
    marginBottom: '1rem',
  },
  wizardTitle: {
    fontSize: '1.5rem',
    fontFamily: 'var(--font-display)',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: '1.5rem',
  },
  wizardStep: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  wizardStepTitle: {
    fontSize: '1.1rem',
    color: 'var(--text-primary)',
    fontWeight: 'bold',
    borderBottom: '1px solid var(--border-glass)',
    paddingBottom: '0.4rem',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
  },
  label: {
    fontSize: '0.8rem',
    color: 'var(--text-secondary)',
    fontWeight: '500',
  },
  buttonRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '1.25rem',
    gap: '1rem',
  },
  focusChip: {
    padding: '0.35rem 0.85rem',
    fontSize: '0.75rem',
    borderRadius: '0.5rem',
    border: '1px solid var(--border-glass)',
    transition: 'all var(--transition-fast)',
  },

  // Level Up Modal Celebration
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(3, 3, 5, 0.8)',
    backdropFilter: 'blur(8px)',
    zIndex: 99999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelUpModal: {
    width: '380px',
    padding: '2.5rem 2rem',
    textAlign: 'center',
    boxShadow: '0 0 40px rgba(168,85,247,0.3)',
    borderRadius: '1.5rem',
    border: '1.5px solid rgba(168,85,247,0.4)',
    background: 'rgba(12,13,20,0.95)',
  },
  levelUpHeader: {
    fontSize: '1.75rem',
    fontFamily: 'var(--font-display)',
    fontWeight: 'bold',
    color: '#fbbf24',
    textShadow: '0 0 10px rgba(251,191,36,0.4)',
  },
  levelUpBadge: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)',
    color: 'white',
    fontSize: '2.5rem',
    fontWeight: 'bold',
    fontFamily: 'var(--font-display)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '1.5rem auto 1rem auto',
    boxShadow: '0 0 25px rgba(99,102,241,0.6)',
  }
};
