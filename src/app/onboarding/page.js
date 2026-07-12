'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const VALUES_OPTIONS = ["Family", "Learning", "Health", "Freedom", "Curiosity"];
const CHAPTERS_OPTIONS = ["Stable Routine", "Startup Journey", "New Parent", "High Stress Project"];

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [basics, setBasics] = useState({
    name: '',
    age: '',
    gender: '',
    job: '',
    city: 'Bengaluru'
  });

  const [constraints, setConstraints] = useState({
    current_chapter: 'Stable Routine',
    financial_stance: 'balanced',
    core_values: [],
    goal_category: 'Health',
    goal_subgoal: 'Sleep Better'
  });

  const [purpose, setPurpose] = useState({
    whyItMatters: '',
    whoBenefits: '',
    futureBuilding: ''
  });

  const handleBasicsChange = (e) => {
    const { name, value } = e.target;
    setBasics((prev) => ({ ...prev, [name]: value }));
  };

  const handleConstraintsChange = (e) => {
    const { name, value } = e.target;
    setConstraints((prev) => ({ ...prev, [name]: value }));
  };

  const handlePurposeChange = (e) => {
    const { name, value } = e.target;
    setPurpose((prev) => ({ ...prev, [name]: value }));
  };

  const toggleValueChip = (val) => {
    setConstraints((prev) => {
      const current = prev.core_values;
      if (current.includes(val)) {
        return { ...prev, core_values: current.filter(item => item !== val) };
      } else {
        return { ...prev, core_values: [...current, val] };
      }
    });
  };

  const nextStep = () => setStep((s) => s + 1);
  const prevStep = () => setStep((s) => s - 1);

  const submitOnboarding = async () => {
    setIsSubmitting(true);
    try {
      const payload = {
        name: basics.name,
        age: parseInt(basics.age) || 30,
        gender: basics.gender,
        job: basics.job,
        city: basics.city,
        current_chapter: constraints.current_chapter,
        financial_stance: constraints.financial_stance,
        core_values: constraints.core_values,
        active_goal: {
          category: constraints.goal_category,
          subGoal: constraints.goal_subgoal
        },
        purpose: purpose
      };

      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Failed to save profile');
      router.push('/');
    } catch (e) {
      console.error(e);
      alert('Failed to save onboarding. Please check backend.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={styles.pageWrapper}>
      <div style={styles.container}>
        {/* Progress Bar */}
        <div style={styles.progressContainer}>
          <div style={{ ...styles.progressBar, width: `${(step / 3) * 100}%` }}></div>
        </div>
        <div style={styles.stepIndicator}>Step {step} of 3</div>

        <h2 style={styles.title}>Initialize Your Life Momentum</h2>

        {step === 1 && (
          <div style={styles.step}>
            <h3 style={styles.stepTitle}>Step 1: Identity & Environment</h3>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>Full Name</label>
              <input 
                name="name" 
                value={basics.name} 
                onChange={handleBasicsChange} 
                className="glass-input" 
                placeholder="e.g., Akash Sharma"
                required
              />
            </div>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>Age</label>
              <input 
                name="age" 
                type="number" 
                value={basics.age} 
                onChange={handleBasicsChange} 
                className="glass-input"
                placeholder="e.g., 32"
                required
              />
            </div>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>Gender</label>
              <select 
                name="gender" 
                value={basics.gender} 
                onChange={handleBasicsChange} 
                className="glass-select"
                required
              >
                <option value="">Select Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Non-Binary">Non-Binary</option>
              </select>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Professional Role / Job</label>
              <input 
                name="job" 
                value={basics.job} 
                onChange={handleBasicsChange} 
                className="glass-input" 
                placeholder="e.g., Software Architect"
                required
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Metro City Location (for World Engine integration)</label>
              <select 
                name="city" 
                value={basics.city} 
                onChange={handleBasicsChange} 
                className="glass-select"
                required
              >
                <option value="Bengaluru">Bengaluru (Bangalore)</option>
                <option value="Gurgaon">Gurgaon (Delhi NCR)</option>
                <option value="Mumbai">Mumbai</option>
                <option value="Hyderabad">Hyderabad</option>
              </select>
            </div>
            
            <div style={styles.buttonRow}>
              <div></div> {/* Spacer */}
              <button 
                onClick={nextStep} 
                className="btn btn-primary"
                disabled={!basics.name || !basics.age || !basics.gender || !basics.job}
              >
                Next: Constraints & Goals →
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={styles.step}>
            <h3 style={styles.stepTitle}>Step 2: Chapter & Core Values</h3>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>Current Life Chapter (Sets limits & constraints)</label>
              <select 
                name="current_chapter" 
                value={constraints.current_chapter} 
                onChange={handleConstraintsChange} 
                className="glass-select"
                required
              >
                {CHAPTERS_OPTIONS.map(ch => (
                  <option key={ch} value={ch}>{ch}</option>
                ))}
              </select>
            </div>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>Financial Stance (Restricts premium options)</label>
              <div style={styles.radioGroup}>
                <label style={styles.radioLabel}>
                  <input 
                    type="radio" 
                    name="financial_stance" 
                    value="balanced" 
                    checked={constraints.financial_stance === 'balanced'} 
                    onChange={handleConstraintsChange} 
                  /> Balanced
                </label>
                <label style={styles.radioLabel}>
                  <input 
                    type="radio" 
                    name="financial_stance" 
                    value="saving_aggressively" 
                    checked={constraints.financial_stance === 'saving_aggressively'} 
                    onChange={handleConstraintsChange} 
                  /> Saving Aggressively
                </label>
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Core Values (Select your focus values - restricts conflicts)</label>
              <div style={styles.chipsContainer}>
                {VALUES_OPTIONS.map(val => {
                  const isActive = constraints.core_values.includes(val);
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => toggleValueChip(val)}
                      style={{
                        ...styles.chip,
                        background: isActive ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255, 255, 255, 0.03)',
                        borderColor: isActive ? 'var(--color-primary)' : 'var(--border-glass)',
                        color: isActive ? '#fff' : 'var(--text-secondary)',
                        boxShadow: isActive ? '0 0 10px rgba(99, 102, 241, 0.3)' : 'none'
                      }}
                    >
                      {val} {isActive ? '✓' : '+'}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Active Goal Category</label>
              <select 
                name="goal_category" 
                value={constraints.goal_category} 
                onChange={handleConstraintsChange} 
                className="glass-select"
                required
              >
                <option value="Health">Health / Sleep</option>
                <option value="Career">Career / Building</option>
                <option value="Mindfulness">Mindfulness / Recovery</option>
                <option value="Relationships">Relationships / Family</option>
              </select>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Active Subgoal Focus</label>
              <input 
                name="goal_subgoal" 
                value={constraints.goal_subgoal} 
                onChange={handleConstraintsChange} 
                className="glass-input" 
                placeholder="e.g., Sleep Better, Lose Fat, Code Side Project"
                required
              />
            </div>
            
            <div style={styles.buttonRow}>
              <button onClick={prevStep} className="btn btn-secondary">
                ← Back
              </button>
              <button 
                onClick={nextStep} 
                className="btn btn-primary"
                disabled={constraints.core_values.length === 0 || !constraints.goal_subgoal}
              >
                Next: Purpose Anchors →
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={styles.step}>
            <h3 style={styles.stepTitle}>Step 3: Purpose & Meaning</h3>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>Why does building life momentum matter to you? (Purpose statement)</label>
              <textarea 
                name="whyItMatters" 
                value={purpose.whyItMatters} 
                onChange={handlePurposeChange} 
                style={styles.textarea} 
                placeholder="e.g., I want to stay focused on my career goals without burning out, so I can provide long-term support for my family."
                required
              />
            </div>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>Who in your life benefits when you stay consistent?</label>
              <textarea 
                name="whoBenefits" 
                value={purpose.whoBenefits} 
                onChange={handlePurposeChange} 
                style={styles.textarea} 
                placeholder="e.g., My wife and children benefit from me being present, positive, and energetic."
                required
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>What future are you building?</label>
              <textarea 
                name="futureBuilding" 
                value={purpose.futureBuilding} 
                onChange={handlePurposeChange} 
                style={styles.textarea} 
                placeholder="e.g., A future where I lead a tech startup and maintain a highly disciplined, healthy daily routine."
                required
              />
            </div>
            
            <div style={styles.buttonRow}>
              <button onClick={prevStep} className="btn btn-secondary">
                ← Back
              </button>
              <button 
                onClick={submitOnboarding} 
                disabled={isSubmitting || !purpose.whyItMatters || !purpose.whoBenefits || !purpose.futureBuilding} 
                className="btn btn-primary"
              >
                {isSubmitting ? 'Building Life System...' : 'Finish Setup & Generate Daily 5 ✓'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  pageWrapper: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '85vh',
    padding: '2rem 1.5rem',
  },
  container: {
    maxWidth: '600px',
    width: '100%',
    padding: '2.5rem 2rem',
    background: 'rgba(10, 10, 15, 0.7)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '1.5rem',
    boxShadow: '0 20px 45px rgba(0, 0, 0, 0.5)',
  },
  progressContainer: {
    width: '100%',
    height: '6px',
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '3px',
    marginBottom: '0.75rem',
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    background: 'linear-gradient(90deg, #6366f1 0%, #a855f7 100%)',
    transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  stepIndicator: {
    fontSize: '0.75rem',
    color: '#a855f7',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontWeight: '600',
    marginBottom: '1rem',
  },
  title: {
    fontSize: '1.75rem',
    fontWeight: '700',
    marginBottom: '1.5rem',
    textAlign: 'center',
    background: 'linear-gradient(135deg, #ffffff 0%, #a855f7 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  step: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  stepTitle: {
    fontSize: '1.15rem',
    color: '#fff',
    fontWeight: '600',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    paddingBottom: '0.5rem',
    marginBottom: '0.5rem',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  label: {
    fontSize: '0.85rem',
    color: '#9ca3af',
    fontWeight: '500',
  },
  buttonRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '1.5rem',
    gap: '1rem',
  },
  radioGroup: {
    display: 'flex',
    gap: '2rem',
    marginTop: '0.25rem',
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.9rem'
  },
  chipsContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.75rem',
    marginTop: '0.25rem'
  },
  chip: {
    border: '1px solid',
    borderRadius: '2rem',
    padding: '0.5rem 1.25rem',
    fontSize: '0.85rem',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  textarea: {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '0.75rem',
    padding: '0.75rem 1rem',
    color: '#fff',
    fontSize: '0.9rem',
    fontFamily: 'inherit',
    minHeight: '80px',
    resize: 'vertical',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
};
