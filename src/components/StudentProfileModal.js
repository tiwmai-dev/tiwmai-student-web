import React, { useEffect, useMemo, useState } from 'react';

const GRADE_OPTIONS = ['ประถมต้น', 'ประถมปลาย', 'มัธยมต้น', 'มัธยมปลาย'];
const SUBJECT_OPTIONS = [
  'คณิตศาสตร์',
  'วิทยาศาสตร์',
  'ภาษาไทย',
  'ภาษาอังกฤษ',
  'สังคมศึกษา',
  'ฟิสิกส์',
  'เคมี',
  'ชีววิทยา',
];
const GOAL_OPTIONS = [
  { value: 'daily_practice', label: 'ทบทวนบทเรียนรายวัน' },
  { value: 'exam_preparation', label: 'เตรียมสอบวัดผล' },
  { value: 'learn_ahead', label: 'เรียนรู้ล่วงหน้า' },
];

const clampAge = (value) => Math.max(5, Math.min(100, Number(value) || 0));

const StudentProfileModal = ({ isOpen, onClose, initialProfile = null, onSave }) => {
  const [nickname, setNickname] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [age, setAge] = useState(12);
  const [interestedSubjects, setInterestedSubjects] = useState([]);
  const [primaryGoal, setPrimaryGoal] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setNickname(initialProfile?.nickname || '');
    setGradeLevel(initialProfile?.grade_level || '');
    setAge(clampAge(initialProfile?.age || 12));
    setInterestedSubjects(
      Array.isArray(initialProfile?.interested_subjects) ? initialProfile.interested_subjects.slice(0, 4) : []
    );
    setPrimaryGoal(initialProfile?.primary_goal || '');
    setErrorMessage('');
  }, [isOpen, initialProfile]);

  const canSave = useMemo(() => {
    return (
      nickname.trim().length > 0 &&
      gradeLevel.length > 0 &&
      clampAge(age) >= 5 &&
      interestedSubjects.length > 0 &&
      primaryGoal.length > 0
    );
  }, [nickname, gradeLevel, age, interestedSubjects, primaryGoal]);

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

  const handleSave = async () => {
    if (!canSave || isSaving) return;
    setIsSaving(true);
    setErrorMessage('');
    const payload = {
      nickname: nickname.trim(),
      grade_level: gradeLevel,
      age: clampAge(age),
      interested_subjects: interestedSubjects,
      primary_goal: primaryGoal,
    };

    const result = await onSave(payload);
    if (!result?.success) {
      setErrorMessage(result?.error || 'บันทึกข้อมูลไม่สำเร็จ');
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    onClose();
  };

  return (
    <div className="profile-edit-overlay" role="dialog" aria-modal="true" aria-label="แก้ไขโปรไฟล์">
      <div className="profile-edit-modal">
        <div className="profile-edit-header">
          <div>
            <span className="profile-edit-kicker">โปรไฟล์นักเรียน</span>
            <h2>แก้ไขโปรไฟล์</h2>
            <p>อัปเดตข้อมูลเพื่อปรับแผนการเรียนและคำแนะนำให้ตรงกับคุณ</p>
          </div>
          <button type="button" className="profile-edit-close" onClick={onClose} aria-label="ปิดหน้าต่าง">
            ✕
          </button>
        </div>

        <div className="profile-edit-body">
          <section className="profile-edit-section">
            <label className="profile-edit-label" htmlFor="profile-edit-nickname">ชื่อเล่น</label>
            <input
              id="profile-edit-nickname"
              type="text"
              className="profile-edit-input"
              maxLength={50}
              placeholder="เช่น โดเรมี"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
            />
          </section>

          <section className="profile-edit-section">
            <span className="profile-edit-label">ระดับชั้น</span>
            <div className="profile-edit-chip-grid">
              {GRADE_OPTIONS.map((item) => (
                <button
                  type="button"
                  key={item}
                  className={`profile-edit-chip ${gradeLevel === item ? 'active' : ''}`}
                  onClick={() => setGradeLevel(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </section>

          <section className="profile-edit-section">
            <label className="profile-edit-label" htmlFor="profile-edit-age">อายุ</label>
            <input
              id="profile-edit-age"
              type="number"
              className="profile-edit-input"
              min={5}
              max={100}
              value={age}
              onChange={(event) => setAge(clampAge(event.target.value))}
            />
          </section>

          <section className="profile-edit-section">
            <span className="profile-edit-label">วิชาที่สนใจ (สูงสุด 4 วิชา)</span>
            <div className="profile-edit-chip-grid subjects">
              {SUBJECT_OPTIONS.map((item) => (
                <button
                  type="button"
                  key={item}
                  className={`profile-edit-chip ${interestedSubjects.includes(item) ? 'active' : ''}`}
                  onClick={() => toggleSubject(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </section>

          <section className="profile-edit-section">
            <span className="profile-edit-label">เป้าหมายหลัก</span>
            <div className="profile-edit-goals">
              {GOAL_OPTIONS.map((item) => (
                <button
                  type="button"
                  key={item.value}
                  className={`profile-edit-goal ${primaryGoal === item.value ? 'active' : ''}`}
                  onClick={() => setPrimaryGoal(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </section>
        </div>

        {errorMessage ? <p className="profile-edit-error">{errorMessage}</p> : null}

        <div className="profile-edit-footer">
          <button type="button" className="profile-edit-cancel" onClick={onClose} disabled={isSaving}>
            ยกเลิก
          </button>
          <button type="button" className="profile-edit-save" onClick={handleSave} disabled={!canSave || isSaving}>
            {isSaving ? 'กำลังบันทึก...' : 'บันทึกโปรไฟล์'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StudentProfileModal;
