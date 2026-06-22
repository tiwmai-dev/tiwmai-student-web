import React, { useEffect, useMemo, useState } from 'react';

const GRADE_OPTIONS = [
  { value: 'ประถมต้น', icon: '🧩', description: 'ป.1 - ป.3' },
  { value: 'ประถมปลาย', icon: '📘', description: 'ป.4 - ป.6' },
  { value: 'มัธยมต้น', icon: '🧠', description: 'ม.1 - ม.3' },
  { value: 'มัธยมปลาย', icon: '🎯', description: 'ม.4 - ม.6' },
];

const SUBJECT_OPTIONS = [
  { value: 'คณิตศาสตร์', icon: '➗' },
  { value: 'วิทยาศาสตร์', icon: '🔬' },
  { value: 'ภาษาไทย', icon: '📝' },
  { value: 'ภาษาอังกฤษ', icon: '🌎' },
  { value: 'สังคมศึกษา', icon: '🗺️' },
  { value: 'ฟิสิกส์', icon: '⚛️' },
  { value: 'เคมี', icon: '🧪' },
  { value: 'ชีววิทยา', icon: '🌿' },
];

const GOAL_OPTIONS = [
  { value: 'daily_practice', label: 'ทำแบบฝึกหัดทบทวนบทเรียนรายวัน', icon: '📅' },
  { value: 'exam_preparation', label: 'เตรียมตัวสอบวัดผล', icon: '📚' },
  { value: 'learn_ahead', label: 'เรียนรู้ล่วงหน้า', icon: '🚀' },
];

const clampAge = (value) => Math.max(5, Math.min(100, Number(value) || 0));

const StudentOnboardingModal = ({
  isOpen,
  initialProfile = null,
  onComplete,
  allowClose = false,
  onClose,
}) => {
  const [step, setStep] = useState(0);
  const [nickname, setNickname] = useState(initialProfile?.nickname || '');
  const [gradeLevel, setGradeLevel] = useState(initialProfile?.grade_level || '');
  const [age, setAge] = useState(initialProfile?.age || 12);
  const [interestedSubjects, setInterestedSubjects] = useState(
    Array.isArray(initialProfile?.interested_subjects) ? initialProfile.interested_subjects : []
  );
  const [primaryGoal, setPrimaryGoal] = useState(initialProfile?.primary_goal || '');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setStep(0);
    setNickname(initialProfile?.nickname || '');
    setGradeLevel(initialProfile?.grade_level || '');
    setAge(initialProfile?.age || 12);
    setInterestedSubjects(Array.isArray(initialProfile?.interested_subjects) ? initialProfile.interested_subjects : []);
    setPrimaryGoal(initialProfile?.primary_goal || '');
    setErrorMessage('');
  }, [isOpen, initialProfile]);

  const totalSteps = 5;
  const progressPercent = Math.round(((step + 1) / totalSteps) * 100);

  const canNext = useMemo(() => {
    if (step === 0) return nickname.trim().length > 0;
    if (step === 1) return gradeLevel.length > 0;
    if (step === 2) return clampAge(age) >= 5;
    if (step === 3) return interestedSubjects.length > 0;
    if (step === 4) return primaryGoal.length > 0;
    return false;
  }, [step, nickname, gradeLevel, age, interestedSubjects, primaryGoal]);

  if (!isOpen) return null;

  const toggleSubject = (subject) => {
    setInterestedSubjects((prev) => {
      if (prev.includes(subject)) {
        return prev.filter((item) => item !== subject);
      }
      if (prev.length >= 4) return prev;
      return [...prev, subject];
    });
  };

  const goNext = () => {
    if (!canNext || step >= totalSteps - 1) return;
    setStep((prev) => prev + 1);
  };

  const goBack = () => {
    if (step <= 0) return;
    setStep((prev) => prev - 1);
  };

  const handleSubmit = async () => {
    if (!canNext || isSaving) return;
    setIsSaving(true);
    setErrorMessage('');
    const payload = {
      nickname: nickname.trim(),
      grade_level: gradeLevel,
      age: clampAge(age),
      interested_subjects: interestedSubjects,
      primary_goal: primaryGoal,
    };

    const result = await onComplete(payload);
    if (!result?.success) {
      setErrorMessage(result?.error || 'บันทึกข้อมูลไม่สำเร็จ');
    } else if (allowClose && onClose) {
      onClose();
    }
    setIsSaving(false);
  };

  return (
    <div className="onboarding-modal-overlay" role="dialog" aria-modal="true" aria-label="ตั้งค่าโปรไฟล์นักเรียน">
      <div className="onboarding-modal">
        <div className="onboarding-header">
          {allowClose ? (
            <button type="button" className="onboarding-close" onClick={onClose} aria-label="ปิดหน้าต่าง">
              ✕
            </button>
          ) : null}
          <span className="onboarding-kicker">ตั้งค่าบัญชีก่อนเริ่มเรียน</span>
          <h2>ขอข้อมูลสั้น ๆ 5 ขั้นตอน</h2>
          <p>ใช้เวลาไม่ถึง 1 นาที เพื่อแนะนำคอร์สและแบบฝึกหัดที่เหมาะกับคุณ</p>
          <div className="onboarding-progress-track" aria-hidden="true">
            <span style={{ width: `${progressPercent}%` }} />
          </div>
          <small>ขั้นตอน {step + 1} / {totalSteps}</small>
        </div>

        <div className="onboarding-body">
          {step === 0 ? (
            <section>
              <h3>ชื่อเล่นของคุณคืออะไร?</h3>
              <input
                type="text"
                className="onboarding-input"
                placeholder="เช่น มินต์, ต้นกล้า"
                value={nickname}
                maxLength={50}
                onChange={(event) => setNickname(event.target.value)}
                autoFocus
              />
            </section>
          ) : null}

          {step === 1 ? (
            <section>
              <h3>ตอนนี้คุณอยู่ระดับชั้นไหน?</h3>
              <div className="onboarding-grid">
                {GRADE_OPTIONS.map((item) => (
                  <button
                    type="button"
                    key={item.value}
                    className={`onboarding-card ${gradeLevel === item.value ? 'active' : ''}`}
                    onClick={() => setGradeLevel(item.value)}
                  >
                    <span className="emoji">{item.icon}</span>
                    <strong>{item.value}</strong>
                    <small>{item.description}</small>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {step === 2 ? (
            <section>
              <h3>อายุเท่าไหร่?</h3>
              <div className="age-picker">
                <button type="button" onClick={() => setAge((prev) => clampAge(Number(prev) - 1))}>−</button>
                <div className="age-value">
                  <strong>{clampAge(age)}</strong>
                  <span>ปี</span>
                </div>
                <button type="button" onClick={() => setAge((prev) => clampAge(Number(prev) + 1))}>+</button>
              </div>
            </section>
          ) : null}

          {step === 3 ? (
            <section>
              <h3>วิชาที่สนใจ (เลือกได้สูงสุด 4 วิชา)</h3>
              <div className="onboarding-grid subjects">
                {SUBJECT_OPTIONS.map((item) => (
                  <button
                    type="button"
                    key={item.value}
                    className={`onboarding-card ${interestedSubjects.includes(item.value) ? 'active' : ''}`}
                    onClick={() => toggleSubject(item.value)}
                  >
                    <span className="emoji">{item.icon}</span>
                    <strong>{item.value}</strong>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {step === 4 ? (
            <section>
              <h3>เป้าหมายหลักในการใช้งาน</h3>
              <div className="onboarding-pill-group">
                {GOAL_OPTIONS.map((item) => (
                  <button
                    type="button"
                    key={item.value}
                    className={`onboarding-pill ${primaryGoal === item.value ? 'active' : ''}`}
                    onClick={() => setPrimaryGoal(item.value)}
                  >
                    <span>{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        {errorMessage ? <p className="onboarding-error">{errorMessage}</p> : null}

        <div className="onboarding-footer">
          <button type="button" className="onboarding-back" onClick={goBack} disabled={step === 0 || isSaving}>
            ย้อนกลับ
          </button>
          {step < totalSteps - 1 ? (
            <button type="button" className="onboarding-next" onClick={goNext} disabled={!canNext || isSaving}>
              ถัดไป
            </button>
          ) : (
            <button type="button" className="onboarding-next" onClick={handleSubmit} disabled={!canNext || isSaving}>
              {isSaving ? 'กำลังบันทึก...' : allowClose ? 'บันทึกโปรไฟล์' : 'เริ่มใช้งาน'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default StudentOnboardingModal;
