import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import Header from '../components/Header';
import ErrorBoundary from '../components/ErrorBoundary';
import {
  AttemptTable,
  EmptyState,
  ErrorState,
  KpiCard,
  LoadingSkeleton,
  PageHeader,
  ScoreTrendChart,
  SectionCard,
} from '../components/QuizAnalysisComponents';
import { secureAPI } from '../utils/api';
import MathText from '../components/MathText';
import { useAuth } from '../contexts/AuthContext';

const toThaiDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatRelativeTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return `ล่าสุด ${diff} วินาทีที่แล้ว`;
  if (diff < 3600) return `ล่าสุด ${Math.floor(diff / 60)} นาทีที่แล้ว`;
  if (diff < 86400) return `ล่าสุด ${Math.floor(diff / 3600)} ชั่วโมงที่แล้ว`;
  return `ล่าสุด ${Math.floor(diff / 86400)} วันที่แล้ว`;
};

const formatDuration = (seconds) => {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const mm = Math.floor(safe / 60);
  const ss = safe % 60;
  return `${mm}m ${ss}s`;
};

const QuizAnalysisPage = ({ user, initialTab = 'analysis' }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const { courseId, lessonId, quizId } = useParams();
  const isMockExamRoute = !lessonId;
  const breadcrumbCourseTitle = String(location?.state?.courseName || location?.state?.course_title || 'คอร์สเรียน').trim() || 'คอร์สเรียน';
  const startExamHref = isMockExamRoute
    ? `/course/${courseId}/mock-exam/${quizId}`
    : `/course/${courseId}/lesson/${lessonId}`;
  const [quiz, setQuiz] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState('latest');
  const [activeTab, setActiveTab] = useState(initialTab);
  const [activeResultId, setActiveResultId] = useState(null);

  const handleSelectHeaderTab = (tab) => {
    if (tab === 'ranking') {
      navigate('/ranking');
      return;
    }
    if (tab === 'browse') {
      navigate('/dashboard', { state: { activeTab: 'browse' } });
      return;
    }
    if (tab === 'analysis') {
      navigate('/dashboard', { state: { activeTab: 'analysis' } });
      return;
    }
    navigate('/dashboard');
  };

  const userId = (user?.user_id || user?.id || user?.username || user?.studentId || '').toString();

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        try {
          const q = await secureAPI.courseAPI.getQuizById(quizId, {
            userId: userId || undefined,
            courseId: courseId || undefined,
          });
          setQuiz({
            id: q.quiz_id || q.id || quizId,
            title: q.title || q.name || 'แบบทดสอบ',
            questions: Array.isArray(q.questions) ? q.questions : [],
          });
        } catch (_) {
          setQuiz({ id: quizId, title: 'แบบทดสอบ', questions: [] });
        }
        const res = await secureAPI.courseAPI.getQuizResults(userId, quizId);
        const list = Array.isArray(res?.results) ? res.results : [];
        setResults(list);
        setActiveResultId(list[0]?.result_id || null);
        setError(null);
      } catch (e) {
        setError('ไม่สามารถโหลดข้อมูลการวิเคราะห์ได้');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [quizId, userId]);

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    secureAPI.courseAPI.getQuizResults(userId, quizId)
      .then((res) => {
        const list = Array.isArray(res?.results) ? res.results : [];
        setResults(list);
        setActiveResultId(list[0]?.result_id || null);
      })
      .catch(() => setError('ไม่สามารถโหลดข้อมูลการวิเคราะห์ได้'))
      .finally(() => setLoading(false));
  };

  const attempts = results.length;
  const normalizedAttempts = useMemo(() => (
    results.map((r, idx) => ({
      ...r,
      id: r.result_id || `${idx}-${r.submitted_at || ''}`,
      attemptNo: attempts - idx,
      score: r && r.score != null ? Number(r.score) : 0,
    }))
  ), [results, attempts]);

  const stats = useMemo(() => {
    const chronological = [...normalizedAttempts].reverse();
    const scores = chronological.map((r) => r.score || 0);
    const avg = attempts ? Math.round(scores.reduce((a, b) => a + b, 0) / attempts) : 0;
    const best = attempts ? Math.max(...scores) : 0;
    const lastAt = attempts ? normalizedAttempts[0]?.submitted_at : null;
    return { scores, avg, best, lastAt, chronological };
  }, [normalizedAttempts, attempts]);

  const sortedAttempts = useMemo(() => {
    const list = [...normalizedAttempts];
    if (sortBy === 'highest') {
      return list.sort((a, b) => (b.score || 0) - (a.score || 0));
    }
    if (sortBy === 'fastest') {
      return list.sort((a, b) => (a.time_spent_seconds || 0) - (b.time_spent_seconds || 0));
    }
    return list;
  }, [normalizedAttempts, sortBy]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab === 'history' || tab === 'analysis') {
      setActiveTab(tab);
    }
  }, [location.search]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(location.search);
    params.set('tab', tab);
    navigate({ search: params.toString() }, { replace: true });
  };

  const getQuestionText = (q) => q?.question || q?.text || q?.prompt || q?.title || '';
  const getChoices = (q) => Array.isArray(q?.choices) ? q.choices : (Array.isArray(q?.options) ? q.options : []);
  const getCorrectIndex = (q) => {
    const keys = ['correct_answer', 'correct_index', 'answer_index', 'correct', 'answer'];
    for (const key of keys) {
      const val = q?.[key];
      if (val === 0 || val) {
        if (Number.isInteger(val)) return val;
        if (typeof val === 'string') {
          const s = val.trim().toLowerCase();
          const mapping = { a: 0, b: 1, c: 2, d: 3, '1': 0, '2': 1, '3': 2, '4': 3, 'ก': 0, 'ข': 1, 'ค': 2, 'ง': 3 };
          if (mapping[s] !== undefined) return mapping[s];
          const match = s.match(/\d+/);
          if (match) {
            const n = Number(match[0]) - 1;
            if (n >= 0) return n;
          }
          const choices = getChoices(q);
          const idx = choices.findIndex(choice => String(choice).trim().toLowerCase() === s);
          if (idx >= 0) return idx;
        }
      }
    }
    return -1;
  };

  const activeResult = results.find(r => r.result_id === activeResultId) || results[0] || null;

  return (
    <ErrorBoundary>
      <div className="course-page">
        <Header user={user} onLogout={logout} activeTab="courses" onSelectTab={handleSelectHeaderTab} />
        <section className="course-hero lesson-breadcrumb-hero">
          <div className="course-hero-inner">
            <div className="course-breadcrumb">
              <Link className="course-breadcrumb-link" to="/dashboard">หน้าแรก</Link>
              <span className="course-breadcrumb-separator" aria-hidden="true">/</span>
              <Link className="course-breadcrumb-link" to={`/course/${courseId}`}>{breadcrumbCourseTitle}</Link>
              <span className="course-breadcrumb-separator" aria-hidden="true">/</span>
              {isMockExamRoute ? (
                <>
                  <span className="course-breadcrumb-item">แบบทดสอบจำลอง</span>
                  <span className="course-breadcrumb-separator" aria-hidden="true">/</span>
                </>
              ) : (
                <>
                  <Link className="course-breadcrumb-link" to={`/course/${courseId}/lesson/${lessonId}`}>บทเรียน</Link>
                  <span className="course-breadcrumb-separator" aria-hidden="true">/</span>
                </>
              )}
              <span className="course-breadcrumb-current">วิเคราะห์</span>
            </div>
          </div>
        </section>
        <div className="course-content qa-container">
          {loading ? (
            <div className="qa-loading">
              <div className="qa-kpi-grid">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <LoadingSkeleton key={idx} variant="kpi" />
                ))}
              </div>
              <SectionCard title="แนวโน้มคะแนนต่อครั้งที่ทำ">
                <LoadingSkeleton variant="block" />
              </SectionCard>
              <SectionCard title="รายละเอียดแต่ละครั้ง">
                <LoadingSkeleton variant="table" rows={4} />
              </SectionCard>
            </div>
          ) : error ? (
            <ErrorState message={error} onRetry={handleRetry} />
          ) : (
            <>
              <PageHeader
                title={quiz?.title || 'แบบทดสอบ'}
              />

              <div className="qa-tabs" role="tablist" aria-label="มุมมองแบบทดสอบ">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'analysis'}
                  className={`qa-tab ${activeTab === 'analysis' ? 'active' : ''}`}
                  onClick={() => handleTabChange('analysis')}
                >
                  วิเคราะห์
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'history'}
                  className={`qa-tab ${activeTab === 'history' ? 'active' : ''}`}
                  onClick={() => handleTabChange('history')}
                >
                  ประวัติ
                </button>
              </div>

              <div className="qa-kpi-grid">
                <KpiCard label="จำนวนครั้งที่ทำ" value={attempts} icon="🧾" />
                <KpiCard label="คะแนนเฉลี่ย" value={`${stats.avg}%`} helper="ภาพรวมทั้งหมด" />
                <KpiCard label="คะแนนสูงสุด" value={`${stats.best}%`} tone="positive" icon="🏆" />
                <KpiCard
                  label="ทำล่าสุด"
                  value={formatRelativeTime(stats.lastAt)}
                  helper={stats.lastAt ? toThaiDateTime(stats.lastAt) : '-'}
                />
              </div>

              {activeTab === 'analysis' ? (
                <>
                  <SectionCard
                    title="แนวโน้มคะแนนต่อครั้งที่ทำ"
                    subtitle="เส้นกราฟแสดงคะแนนต่อการทำแต่ละครั้ง"
                  >
                    <ScoreTrendChart
                      attempts={stats.chronological}
                      formatDate={toThaiDateTime}
                      formatDuration={formatDuration}
                    />
                  </SectionCard>

                  <SectionCard title="รายละเอียดแต่ละครั้ง">
                    {attempts === 0 ? (
                      <EmptyState
                        title="ยังไม่มีข้อมูลการทำแบบทดสอบ"
                        body="เริ่มทำแบบทดสอบเพื่อให้ระบบสร้างสรุปการวิเคราะห์"
                        action={
                          <button
                            type="button"
                            className="qa-button primary"
                            onClick={() => navigate(startExamHref)}
                            aria-label="เริ่มทำแบบทดสอบ"
                          >
                            เริ่มทำแบบทดสอบ
                          </button>
                        }
                      />
                    ) : (
                      <AttemptTable
                        attempts={sortedAttempts}
                        sortBy={sortBy}
                        onSortChange={setSortBy}
                        formatDate={toThaiDateTime}
                        formatDuration={formatDuration}
                      />
                    )}
                  </SectionCard>
                </>
              ) : (
                <>
                  <SectionCard title="รายละเอียดผลลัพธ์">
                    {attempts === 0 ? (
                      <EmptyState
                        title="ยังไม่มีประวัติการทำแบบทดสอบ"
                        body="เริ่มทำแบบทดสอบเพื่อให้มีประวัติการทำ"
                        action={
                          <button
                            type="button"
                            className="qa-button primary"
                            onClick={() => navigate(startExamHref)}
                            aria-label="เริ่มทำแบบทดสอบ"
                          >
                            เริ่มทำแบบทดสอบ
                          </button>
                        }
                      />
                    ) : (
                      <div className="qa-history-table-wrap">
                        <table className="quiz-history-table">
                          <thead>
                            <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                              <th style={{ padding: 10, borderBottom: '1px solid #e5e7eb' }}>ครั้งที่</th>
                              <th style={{ padding: 10, borderBottom: '1px solid #e5e7eb' }}>คะแนน</th>
                              <th style={{ padding: 10, borderBottom: '1px solid #e5e7eb' }}>จำนวนข้อที่ถูก</th>
                              <th style={{ padding: 10, borderBottom: '1px solid #e5e7eb' }}>จำนวนข้อทั้งหมด</th>
                              <th style={{ padding: 10, borderBottom: '1px solid #e5e7eb' }}>เวลา</th>
                              <th style={{ padding: 10, borderBottom: '1px solid #e5e7eb' }}>ทำเมื่อ</th>
                              <th style={{ padding: 10, borderBottom: '1px solid #e5e7eb' }}>ดูคำตอบ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {results.map((r, idx) => {
                              const spent = Number.isFinite(r.time_spent_seconds) ? r.time_spent_seconds : 0;
                              const mm = Math.floor(spent / 60), ss = spent % 60;
                              const isActive = r.result_id === activeResultId;
                              return (
                                <tr key={r.result_id || idx} className={isActive ? 'active' : ''}>
                                  <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6' }}>{idx + 1}</td>
                                  <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6' }}>{r.score ?? 0}%</td>
                                  <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6' }}>{r.correct_count ?? '-'}</td>
                                  <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6' }}>{r.total_questions ?? '-'}</td>
                                  <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6' }}>{mm}m {ss}s</td>
                                  <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6' }}>{r.submitted_at ? new Date(r.submitted_at).toLocaleString() : '-'}</td>
                                  <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6' }}>
                                    <button
                                      type="button"
                                      className="qa-button ghost"
                                      onClick={() => setActiveResultId(r.result_id)}
                                    >
                                      ดูคำตอบ
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </SectionCard>

                  {activeResult && quiz?.questions?.length ? (
                    <SectionCard title="ข้อสอบและคำตอบที่ตอบไป" subtitle={`ครั้งที่ ${results.findIndex(r => r.result_id === activeResult.result_id) + 1}`}>
                      <div className="quiz-history-detail-body">
                        {quiz.questions.map((q, index) => {
                          const choices = getChoices(q);
                          const selectedIndex = Array.isArray(activeResult.answers) ? activeResult.answers[index] : null;
                          const correctIndex = getCorrectIndex(q);
                          const selectedText = selectedIndex != null && choices[selectedIndex] ? choices[selectedIndex] : null;
                          return (
                            <div key={q.id || `${index}-q`} className="quiz-history-question">
                              <div className="quiz-history-question-title">
                                <span>ข้อ {index + 1}</span>
                                <MathText text={getQuestionText(q)} />
                              </div>
                              <div className="quiz-history-choices">
                                {choices.map((choice, choiceIdx) => {
                                  const isSelected = choiceIdx === selectedIndex;
                                  const isCorrect = choiceIdx === correctIndex;
                                  return (
                                    <div
                                      key={`${index}-${choiceIdx}`}
                                      className={`quiz-history-choice${isSelected ? ' selected' : ''}${isCorrect ? ' correct' : ''}`}
                                    >
                                      <span>{choiceIdx + 1}.</span>
                                      <MathText text={choice} />
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="quiz-history-answer">
                                <span>คำตอบที่เลือก:</span>
                                <strong><MathText text={selectedText || 'ไม่ได้เลือกคำตอบ'} inline /></strong>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </SectionCard>
                  ) : null}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default QuizAnalysisPage;
