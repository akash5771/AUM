'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState({
    name: '',
    age: '',
    gender: '',
    job: '',
    workHours: '',
    maritalStatus: '',
    kids: '',
    goal: '',
    problem: ''
  });
  const [photos, setPhotos] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Generate previews when photos change
  useEffect(() => {
    if (photos.length === 0) {
      setPreviews([]);
      return;
    }

    const objectUrls = photos.map(file => URL.createObjectURL(file));
    setPreviews(objectUrls);

    // Free memory when component unmounts or photos change
    return () => {
      objectUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [photos]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setProfile((prev) => ({ ...prev, [name]: value }));
  };

  const handleFiles = (fileList) => {
    const validFiles = Array.from(fileList).filter(file => file.type.startsWith('image/'));
    setPhotos((prev) => [...prev, ...validFiles]);
  };

  const handlePhotoChange = (e) => {
    if (e.target.files) {
      handleFiles(e.target.files);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragActive(false);
    if (e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const removePhoto = (idxToRemove) => {
    setPhotos((prev) => prev.filter((_, idx) => idx !== idxToRemove));
  };

  const nextStep = () => setStep((s) => s + 1);
  const prevStep = () => setStep((s) => s - 1);

  const submitOnboarding = async () => {
    setIsSubmitting(true);
    try {
      // Upload photos first if any
      let photoUrls = [];
      if (photos.length) {
        const form = new FormData();
        photos.forEach((file) => form.append('files', file));
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: form });
        if (!uploadRes.ok) throw new Error('Failed to upload photos');
        const uploadData = await uploadRes.json();
        photoUrls = uploadData.urls || [];
      }
      // Send profile data
      const payload = { ...profile, photos: photoUrls };
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Failed to save profile');
      router.push('/');
    } catch (e) {
      console.error(e);
      alert('Something went wrong. Check console.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={styles.pageWrapper}>
      <div className="glass-panel" style={styles.container}>
        {/* Progress Bar */}
        <div style={styles.progressContainer}>
          <div style={{ ...styles.progressBar, width: `${(step / 3) * 100}%` }}></div>
        </div>
        <div style={styles.stepIndicator}>Step {step} of 3</div>

        <h2 style={styles.title}>Welcome! Let's set up your profile</h2>

        {step === 1 && (
          <div style={styles.step} className="animate-fade-in">
            <h3 style={styles.stepTitle}>Tell us about yourself</h3>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>Name</label>
              <input 
                name="name" 
                value={profile.name} 
                onChange={handleChange} 
                className="glass-input" 
                placeholder="e.g., Alex Mercer"
                required
              />
            </div>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>Age</label>
              <input 
                name="age" 
                type="number" 
                value={profile.age} 
                onChange={handleChange} 
                className="glass-input"
                placeholder="e.g., 34"
                required
              />
            </div>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>Gender</label>
              <select 
                name="gender" 
                value={profile.gender} 
                onChange={handleChange} 
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
              <div></div> {/* Spacer */}
              <button 
                onClick={nextStep} 
                className="btn btn-primary"
                disabled={!profile.name || !profile.age || !profile.gender}
              >
                Next Step →
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={styles.step} className="animate-fade-in">
            <h3 style={styles.stepTitle}>Life & Work Structure</h3>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>Job / Role</label>
              <input 
                name="job" 
                value={profile.job} 
                onChange={handleChange} 
                className="glass-input" 
                placeholder="e.g., Senior Engineering Manager"
                required
              />
            </div>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>Work Hours per day</label>
              <input 
                name="workHours" 
                type="number" 
                value={profile.workHours} 
                onChange={handleChange} 
                className="glass-input"
                placeholder="e.g., 9"
                required
              />
            </div>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>Marital Status</label>
              <select 
                name="maritalStatus" 
                value={profile.maritalStatus} 
                onChange={handleChange} 
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
                value={profile.kids} 
                onChange={handleChange} 
                className="glass-input"
                placeholder="e.g., 2"
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
                disabled={!profile.job || !profile.workHours || !profile.maritalStatus || profile.kids === ''}
              >
                Next Step →
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={styles.step} className="animate-fade-in">
            <h3 style={styles.stepTitle}>Purpose & Aspirations</h3>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>What do you want to achieve in 3‑5 years?</label>
              <input 
                name="goal" 
                value={profile.goal} 
                onChange={handleChange} 
                className="glass-input"
                placeholder="e.g., health, financial independence, executive role"
                required
              />
            </div>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>Current problems / bottlenecks you face</label>
              <input 
                name="problem" 
                value={profile.problem} 
                onChange={handleChange} 
                className="glass-input"
                placeholder="e.g., work stress, late-night burnout"
                required
              />
            </div>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>Upload Photos (Optional)</label>
              
              {/* Premium Drag and Drop Zone */}
              <div 
                style={{
                  ...styles.dropzone,
                  borderColor: isDragActive ? 'var(--color-primary)' : 'var(--border-glass)',
                  background: isDragActive ? 'rgba(99, 102, 241, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                  boxShadow: isDragActive ? '0 0 15px rgba(99, 102, 241, 0.15)' : 'none'
                }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => document.getElementById('photo-input').click()}
              >
                <div style={styles.uploadIcon}>📷</div>
                <div style={styles.uploadText}>
                  {isDragActive ? 'Drop your photos here!' : 'Drag & drop photos here, or click to browse'}
                </div>
                <div style={styles.uploadSubtext}>Supports JPG, PNG, WEBP files</div>
                <input 
                  id="photo-input"
                  type="file" 
                  multiple 
                  accept="image/*" 
                  onChange={handlePhotoChange} 
                  style={{ display: 'none' }}
                />
              </div>

              {/* Photos Previews */}
              {previews.length > 0 && (
                <div style={styles.previewContainer}>
                  {previews.map((url, idx) => (
                    <div key={idx} style={styles.previewCard}>
                      <img src={url} style={styles.previewImg} alt="Preview" />
                      <button 
                        type="button" 
                        onClick={(e) => {
                          e.stopPropagation();
                          removePhoto(idx);
                        }} 
                        style={styles.removeBtn}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div style={styles.buttonRow}>
              <button onClick={prevStep} className="btn btn-secondary">
                ← Back
              </button>
              <button 
                onClick={submitOnboarding} 
                disabled={isSubmitting || !profile.goal || !profile.problem} 
                className="btn btn-primary"
              >
                {isSubmitting ? 'Saving Evolution...' : 'Finish Setup ✓'}
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
    minHeight: '80vh',
    padding: '2rem 1.5rem',
  },
  container: {
    maxWidth: '550px',
    width: '100%',
    padding: '2.5rem 2rem',
    background: 'var(--bg-surface-glass)',
    borderRadius: '1.5rem',
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
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
    background: 'linear-gradient(90deg, var(--color-primary) 0%, var(--color-secondary) 100%)',
    transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  stepIndicator: {
    fontSize: '0.75rem',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontWeight: '600',
    marginBottom: '1rem',
  },
  title: {
    fontSize: '1.75rem',
    fontFamily: 'var(--font-display)',
    fontWeight: '700',
    marginBottom: '1.5rem',
    textAlign: 'center',
  },
  step: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  stepTitle: {
    fontSize: '1.15rem',
    color: 'var(--text-primary)',
    fontWeight: '600',
    borderBottom: '1px solid var(--border-glass)',
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
    color: 'var(--text-secondary)',
    fontWeight: '500',
  },
  buttonRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '1.5rem',
    gap: '1rem',
  },
  dropzone: {
    border: '2px dashed var(--border-glass)',
    borderRadius: '1rem',
    padding: '2rem 1rem',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all var(--transition-normal)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
  },
  uploadIcon: {
    fontSize: '2rem',
  },
  uploadText: {
    fontSize: '0.9rem',
    color: 'var(--text-primary)',
    fontWeight: '500',
  },
  uploadSubtext: {
    fontSize: '0.75rem',
    color: 'var(--text-muted)',
  },
  previewContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
    gap: '0.75rem',
    marginTop: '1rem',
  },
  previewCard: {
    position: 'relative',
    borderRadius: '0.75rem',
    overflow: 'hidden',
    aspectRatio: '1',
    border: '1px solid var(--border-glass)',
  },
  previewImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  removeBtn: {
    position: 'absolute',
    top: '4px',
    right: '4px',
    background: 'rgba(5, 5, 8, 0.75)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '50%',
    width: '20px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.7rem',
    cursor: 'pointer',
    color: '#fff',
    transition: 'background var(--transition-fast)',
  },
};
