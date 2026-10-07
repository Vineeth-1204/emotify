import { useState } from "react";
import { createPortal } from "react-dom";
import { X, User, Mail, Phone, Shield, CheckCircle, ChevronRight, Activity, Lock, Fingerprint, FileText, Check, Building } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function EnrollPatientModal({ onClose }: { onClose: () => void }) {
  const createPatient = useMutation(api.patients.createPatient);
  
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    fullName: '',
    preferredName: '',
    age: '' as any,
    gender: '',
    email: '',
    phone: '',
    emergencyContact: '',
    department: '',
    initialRiskLevel: '',
    deviceLock: true,
    singleDevice: true,
    consentRequired: true,
    clinicalMonitoring: true,
    emergencyAgreement: true,
    researchParticipation: false
  });

  const handleEnroll = async () => {
    if (!formData.initialRiskLevel) {
      alert("Please select an initial risk level.");
      setStep(2);
      return;
    }
    
    setIsSubmitting(true);
    try {
      const result = await createPatient({
        fullName: formData.fullName,
        age: parseInt(formData.age) || 0,
        gender: formData.gender || 'Not specified',
        email: formData.email,
        phone: formData.phone,
        initialRiskLevel: formData.initialRiskLevel,
      });
      // The temporary password is not stored anywhere; this is the only time it can be shown.
      alert(
        `Patient enrolled (ID ${result.patientId}).\n\nTemporary password: ${result.tempPassword}\n\n` +
        "Share it securely now — it cannot be retrieved later. The student must change it at first login."
      );
      onClose();
    } catch (error) {
      console.error(error);
      alert("Failed to enroll patient");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getRiskColor = (risk: string) => {
    switch(risk) {
      case 'low': return '#10B981'; // Muted Green
      case 'moderate': return '#F59E0B'; // Amber
      case 'high': return '#F97316'; // Orange
      case 'critical': return '#EF4444'; // Muted Red
      default: return 'var(--text-secondary)';
    }
  };

  const getRiskBg = (risk: string) => {
    switch(risk) {
      case 'low': return 'rgba(16, 185, 129, 0.15)';
      case 'moderate': return 'rgba(245, 158, 11, 0.15)';
      case 'high': return 'rgba(249, 115, 22, 0.15)';
      case 'critical': return 'rgba(239, 68, 68, 0.15)';
      default: return 'rgba(255,255,255,0.05)';
    }
  };

  const renderRecommendations = () => {
    if (!formData.initialRiskLevel) {
      return <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontStyle: 'italic' }}>Awaiting Risk Assessment</div>;
    }

    switch(formData.initialRiskLevel) {
      case 'low':
        return (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            <li style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}><Check size={16} color={getRiskColor('low')}/> Self-guided wellness tools</li>
            <li style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}><Check size={16} color={getRiskColor('low')}/> Monthly check-ins</li>
          </ul>
        );
      case 'moderate':
        return (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            <li style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}><Check size={16} color={getRiskColor('moderate')}/> Guided self-help</li>
            <li style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}><Check size={16} color={getRiskColor('moderate')}/> Weekly emotional monitoring</li>
            <li style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}><Check size={16} color={getRiskColor('moderate')}/> Reframe exercises prioritized</li>
          </ul>
        );
      case 'high':
        return (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            <li style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}><Check size={16} color={getRiskColor('high')}/> Counselor check-in required</li>
            <li style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}><Check size={16} color={getRiskColor('high')}/> Enhanced monitoring enabled</li>
            <li style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}><Check size={16} color={getRiskColor('high')}/> Escalation readiness active</li>
          </ul>
        );
      case 'critical':
        return (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            <li style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}><Check size={16} color={getRiskColor('critical')}/> Immediate supervisor review</li>
            <li style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}><Check size={16} color={getRiskColor('critical')}/> Emergency intervention readiness</li>
            <li style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}><Check size={16} color={getRiskColor('critical')}/> Restricted therapeutic mode</li>
          </ul>
        );
      default: return null;
    }
  };

  return createPortal(
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(16px)', zIndex: 9999, display: 'flex', flexDirection: 'column', padding: '32px 20px' }}>
      
      {/* Ambient background glows for modal */}
      <div style={{ position: 'absolute', width: '70vw', height: '70vw', background: 'radial-gradient(circle, rgba(37, 99, 235, 0.05) 0%, transparent 65%)', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none' }}></div>

      <div className="glass-panel animate-fade-in hide-scrollbar" style={{ width: '100%', maxWidth: '1100px', margin: 'auto', flex: '0 1 auto', maxHeight: '100%', padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: '20px', border: '1px solid var(--border-color)', boxShadow: '0 32px 80px rgba(0,0,0,0.15)', background: '#ffffff' }}>
        
        {/* Header */}
        <div style={{ padding: '20px 36px', borderBottom: '1px solid var(--border-color)', background: '#f8fafc', flex: '0 0 auto', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, rgba(37, 99, 235, 0.7), transparent)' }}></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h2 style={{ fontSize: '1.45rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '3px', letterSpacing: '-0.02em', fontFamily: "'DM Sans', sans-serif" }}>Enroll New Patient</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.87rem' }}>Create a secure clinical profile and initialize therapeutic monitoring.</p>
            </div>
            <button onClick={onClose} style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: 'var(--text-secondary)', cursor: 'pointer', padding: '7px', borderRadius: '50%', transition: 'all 0.2s', flexShrink: 0 }} className="modal-close-btn">
              <X size={20} />
            </button>
          </div>

          {/* Stepper */}
          <div style={{ display: 'flex', alignItems: 'center', marginTop: '16px', gap: '8px' }}>
             {[1, 2, 3, 4].map(num => (
               <div key={num} style={{ display: 'flex', alignItems: 'center', flex: num < 4 ? 1 : 0 }}>
                 <div style={{ 
                   display: 'flex', alignItems: 'center', gap: '10px',
                   color: step === num ? 'var(--accent-primary)' : step > num ? 'var(--success)' : 'var(--text-secondary)',
                   fontWeight: step === num ? 600 : 500,
                   transition: 'all 0.3s'
                 }}>
                   <div style={{ 
                     width: '26px', height: '26px', borderRadius: '50%', 
                     display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem',
                     background: step === num ? 'rgba(37, 99, 235, 0.15)' : step > num ? 'rgba(16, 185, 129, 0.15)' : '#e2e8f0',
                     border: `1px solid ${step === num ? 'var(--accent-primary)' : step > num ? 'var(--success)' : '#cbd5e1'}`,
                     boxShadow: step === num ? '0 0 12px rgba(37, 99, 235, 0.2)' : 'none'
                   }}>
                     {step > num ? <Check size={16} /> : num}
                   </div>
                   <span style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                     {num === 1 ? 'Basic Info' : num === 2 ? 'Clinical' : num === 3 ? 'Security' : 'Consent'}
                   </span>
                 </div>
                 {num < 4 && (
                   <div style={{ flex: 1, height: '1px', background: step > num ? 'var(--success)' : '#e2e8f0', margin: '0 12px', borderRadius: '2px', transition: 'all 0.3s' }}></div>
                 )}
               </div>
             ))}
          </div>
        </div>

        {/* 2-Column Content (Scrollable) */}
        <div className="hide-scrollbar" style={{ display: 'flex', alignItems: 'flex-start', padding: '28px 36px', gap: '36px', overflowY: 'auto', flex: '1 1 auto', minHeight: 0 }}>
          
          {/* Left: Form Area */}
          <div style={{ flex: '1.5', display: 'flex', flexDirection: 'column' }}>
            
            {/* STEP 1 */}
            {step === 1 && (
              <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <h3 style={{ fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '10px', fontFamily: "'DM Sans', sans-serif" }}><User size={18} color="var(--accent-primary)" /> Basic Information</h3>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label>Full Legal Name</label>
                    <div className="input-with-icon">
                      <User size={18} className="input-icon" />
                      <input type="text" placeholder="John Doe" value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} autoFocus />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Preferred Name (Optional)</label>
                    <div className="input-with-icon">
                      <User size={18} className="input-icon" />
                      <input type="text" placeholder="Johnny" value={formData.preferredName} onChange={e => setFormData({...formData, preferredName: e.target.value})} />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Age</label>
                    <div style={{ position: 'relative' }}>
                      <input 
                        type="number" 
                        placeholder="25" 
                        value={formData.age} 
                        onChange={e => setFormData({...formData, age: e.target.value})} 
                        className="age-input"
                      />
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label>Gender Identity</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                    {['Male', 'Female', 'Non-Binary', 'Prefer Not To Say'].map(g => (
                      <div 
                        key={g}
                        onClick={() => setFormData({...formData, gender: g})}
                        style={{
                          padding: '14px 10px',
                          textAlign: 'center',
                          borderRadius: '12px',
                          cursor: 'pointer',
                          fontSize: '0.9rem',
                          fontWeight: 500,
                          transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                          border: `1px solid ${formData.gender === g ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                          background: formData.gender === g ? 'rgba(37, 99, 235, 0.08)' : '#f8fafc',
                          color: formData.gender === g ? 'var(--accent-primary)' : 'var(--text-secondary)',
                          boxShadow: formData.gender === g ? '0 4px 16px rgba(37, 99, 235, 0.15)' : 'none',
                          transform: formData.gender === g ? 'translateY(-1px)' : 'none'
                        }}
                      >
                        {g}
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                  <div className="form-group">
                    <label>Email Address</label>
                    <div className="input-with-icon">
                      <Mail size={18} className="input-icon" />
                      <input type="email" placeholder="patient@example.com" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Phone Number</label>
                    <div className="input-with-icon">
                      <Phone size={18} className="input-icon" />
                      <input type="tel" placeholder="+1 (555) 000-0000" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Emergency Contact</label>
                    <div className="input-with-icon">
                      <Shield size={18} className="input-icon" />
                      <input type="tel" placeholder="Next of Kin Phone" value={formData.emergencyContact} onChange={e => setFormData({...formData, emergencyContact: e.target.value})} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Department / Campus (Optional)</label>
                    <div className="input-with-icon">
                      <Building size={18} className="input-icon" />
                      <input type="text" placeholder="Psychology Dept." value={formData.department} onChange={e => setFormData({...formData, department: e.target.value})} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2 */}
            {step === 2 && (
              <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <h3 style={{ fontSize: '1.2rem', color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px', fontFamily: "'DM Sans', sans-serif" }}><Activity size={22} color="var(--accent-primary)" /> Clinical Information</h3>
                
                <div className="form-group">
                  <label>Initial Risk Assessment Level</label>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>Select the initial triage level based on intake evaluation. This dictates the patient's therapeutic track.</p>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    {['low', 'moderate', 'high', 'critical'].map(r => (
                      <div 
                        key={r}
                        onClick={() => setFormData({...formData, initialRiskLevel: r})}
                        style={{ 
                          padding: '16px', 
                          borderRadius: '10px', 
                          border: `1px solid ${formData.initialRiskLevel === r ? getRiskColor(r) : 'var(--border-color)'}`,
                          background: formData.initialRiskLevel === r ? getRiskBg(r) : '#f8fafc',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                          transform: formData.initialRiskLevel === r ? 'translateY(-1px)' : 'none'
                        }}
                      >
                        <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: formData.initialRiskLevel === r ? getRiskColor(r) : '#cbd5e1', transition: 'all 0.3s' }}></div>
                        <span style={{ color: formData.initialRiskLevel === r ? 'var(--text-primary)' : 'var(--text-secondary)', textTransform: 'capitalize', fontWeight: formData.initialRiskLevel === r ? 600 : 500, fontSize: '1.05rem' }}>{r} Risk</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3 */}
            {step === 3 && (
              <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                 <h3 style={{ fontSize: '1.3rem', color: 'white', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px', fontFamily: "'DM Sans', sans-serif" }}><Shield size={22} color="var(--accent-primary)" /> Security & Access Setup</h3>
                 
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div className="toggle-row" onClick={() => setFormData({...formData, deviceLock: !formData.deviceLock})}>
                      <div>
                        <h4 style={{ color: 'white', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}><Lock size={16}/> Device Lock Enabled</h4>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Require FaceID/Biometrics to open the mobile application.</p>
                      </div>
                      <div className={`custom-toggle ${formData.deviceLock ? 'active' : ''}`}></div>
                    </div>

                    <div className="toggle-row" onClick={() => setFormData({...formData, singleDevice: !formData.singleDevice})}>
                      <div>
                        <h4 style={{ color: 'white', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}><Fingerprint size={16}/> Single Device Enforcement</h4>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Bind the account to a single mobile hardware fingerprint.</p>
                      </div>
                      <div className={`custom-toggle ${formData.singleDevice ? 'active' : ''}`}></div>
                    </div>
                 </div>
              </div>
            )}

            {/* STEP 4 */}
            {step === 4 && (
              <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <h3 style={{ fontSize: '1.2rem', color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px', fontFamily: "'DM Sans', sans-serif" }}><FileText size={22} color="var(--accent-primary)" /> Clinical Consent Agreements</h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                    <input type="checkbox" checked={formData.consentRequired} onChange={e => setFormData({...formData, consentRequired: e.target.checked})} style={{ marginTop: '3px' }} />
                    <div>
                      <strong style={{ color: 'var(--text-primary)', display: 'block' }}>Mandatory Intake Consent</strong>
                      <span style={{ fontSize: '0.83rem', color: 'var(--text-secondary)' }}>Patient has signed terms of engagement for digital therapy telemonitoring.</span>
                    </div>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                    <input type="checkbox" checked={formData.emergencyAgreement} onChange={e => setFormData({...formData, emergencyAgreement: e.target.checked})} style={{ marginTop: '3px' }} />
                    <div>
                      <strong style={{ color: 'var(--text-primary)', display: 'block' }}>Emergency Escalation Protocol</strong>
                      <span style={{ fontSize: '0.83rem', color: 'var(--text-secondary)' }}>Permission to dispatch urgent alerts to emergency contact if suicide flag triggers.</span>
                    </div>
                  </label>
                </div>
              </div>
            )}

          </div>

          {/* Right: Summary Panel */}
          <div style={{ flex: '1', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
             <div>
               <h4 style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--accent-primary)', letterSpacing: '0.1em', marginBottom: '10px', fontWeight: 700 }}>Patient Summary</h4>
               <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.88rem', background: '#ffffff', padding: '14px', borderRadius: '10px', border: '1px solid #cbd5e1' }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-secondary)', fontSize: '0.83rem' }}>Full Name:</span> <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formData.fullName || 'Awaiting…'}</span></div>
                 <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-secondary)', fontSize: '0.83rem' }}>Age:</span> <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formData.age ? formData.age : 'Awaiting…'}</span></div>
                 <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-secondary)', fontSize: '0.83rem' }}>Gender:</span> <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formData.gender || 'Awaiting…'}</span></div>
                 <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-secondary)', fontSize: '0.83rem' }}>Contact:</span> <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formData.phone || formData.email || 'Awaiting…'}</span></div>
               </div>
             </div>
             <div>
               <h4 style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--accent-primary)', letterSpacing: '0.1em', marginBottom: '10px', fontWeight: 700 }}>Security Status</h4>
               <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', fontSize: '0.88rem', background: '#ffffff', padding: '14px', borderRadius: '10px', border: '1px solid #cbd5e1' }}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--success)', fontWeight: 500 }}><Lock size={16}/> Device Lock Enabled</div>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--success)', fontWeight: 500 }}><Fingerprint size={16}/> Single Device Active</div>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--accent-primary)', fontWeight: 500 }}><Shield size={16}/> Secure Credentials Pending</div>
               </div>
             </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div style={{ flex: '0 0 auto', padding: '14px 36px', borderTop: '1px solid var(--border-color)', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button className="btn btn-secondary" onClick={onClose} style={{ padding: '10px 20px', fontSize: '0.9rem' }}>Cancel Enrollment</button>
          
          <div style={{ display: 'flex', gap: '12px' }}>
            {step > 1 && (
              <button className="btn btn-secondary" onClick={() => setStep(step - 1)} style={{ padding: '10px 20px', fontSize: '0.9rem' }}>Back</button>
            )}
            {step < 4 ? (
              <button className="btn btn-primary" onClick={() => setStep(step + 1)} style={{ padding: '10px 24px', fontSize: '0.9rem' }}>Continue <ChevronRight size={18} /></button>
            ) : (
              <button className="btn btn-primary" onClick={handleEnroll} disabled={isSubmitting} style={{ padding: '10px 24px', fontSize: '0.9rem' }}>
                {isSubmitting ? 'Creating Profile...' : 'Create Patient Profile'} <CheckCircle size={18} />
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  , document.body);
}
