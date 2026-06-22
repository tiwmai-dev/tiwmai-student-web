import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { secureAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

const getUserId = (user) => (user?.id || user?.user_id || user?.studentId || user?.username || '').toString();
const getMedalMeta = (rank) => {
  if (rank === 1) return { icon: '🥇', className: 'gold', label: 'อันดับ 1' };
  if (rank === 2) return { icon: '🥈', className: 'silver', label: 'อันดับ 2' };
  if (rank === 3) return { icon: '🥉', className: 'bronze', label: 'อันดับ 3' };
  return null;
};
const getInitial = (name) => {
  const text = String(name || '').trim();
  return text ? text.charAt(0).toUpperCase() : 'น';
};
const formatDuration = (seconds) => {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total < 0) return '-';
  const rounded = Math.round(total);
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  if (mins <= 0) return `${secs}s`;
  return `${mins}m ${String(secs).padStart(2, '0')}s`;
};
const RANKING_LOADING_ROWS = Array.from({ length: 4 }, (_, index) => index);
const RANKING_LOADING_COLUMNS = Array.from({ length: 6 }, (_, index) => index);
const MIN_RANKING_ROWS = 10;

const StudentRankingPage = ({ user }) => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [courses, setCourses] = useState([]);
  const [leaderboards, setLeaderboards] = useState({});
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [showAllRanks, setShowAllRanks] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const userId = getUserId(user);
        if (!userId) {
          setCourses([]);
          setLeaderboards({});
          setSelectedCourseId('');
          return;
        }

        const enrolled = await secureAPI.courseAPI.getUserCourses(userId);
        const normalizedCourses = Array.isArray(enrolled)
          ? enrolled.map((course) => ({
              id: course?.id || course?.course_id,
              name: course?.name || course?.title || 'คอร์สเรียน',
            })).filter((course) => course.id)
          : [];

        setCourses(normalizedCourses);
        if (normalizedCourses.length === 0) {
          setLeaderboards({});
          setSelectedCourseId('');
          return;
        }

        const allBoards = await Promise.all(
          normalizedCourses.map(async (course) => {
            try {
              const board = await secureAPI.courseAPI.getCourseMockExamLeaderboard(course.id, 100);
              return [course.id, board];
            } catch (_) {
              return [course.id, { rankings: [], course_name: course.name, mock_exam_count: 0 }];
            }
          })
        );

        setLeaderboards(Object.fromEntries(allBoards));
        setSelectedCourseId((prev) => prev || normalizedCourses[0].id);
        setShowAllRanks(false);
      } catch (err) {
        setError(err?.message || 'โหลดข้อมูลการจัดอันดับไม่สำเร็จ');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user]);

  const handleSelectTab = (tab) => {
    if (tab === 'ranking') return;
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

  const selectedLeaderboard = useMemo(
    () => leaderboards[selectedCourseId] || null,
    [leaderboards, selectedCourseId]
  );
  const sortedRankings = useMemo(() => {
    const sourceRows = Array.isArray(selectedLeaderboard?.rankings) ? selectedLeaderboard.rankings : [];
    return [...sourceRows]
      .sort((a, b) => {
        const avgA = Number(a?.average_score || 0);
        const avgB = Number(b?.average_score || 0);
        if (avgB !== avgA) return avgB - avgA;
        const attemptsA = Number(a?.attempt_count || 0);
        const attemptsB = Number(b?.attempt_count || 0);
        if (attemptsB !== attemptsA) return attemptsB - attemptsA;
        const lastA = String(a?.last_submitted_at || '');
        const lastB = String(b?.last_submitted_at || '');
        return lastB.localeCompare(lastA);
      })
      .map((row, index) => ({ ...row, rank: index + 1 }));
  }, [selectedLeaderboard]);

  const currentUserId = getUserId(user);
  const currentUserRow = useMemo(
    () => sortedRankings.find((row) => String(row?.user_id || '') === currentUserId) || null,
    [sortedRankings, currentUserId]
  );
  const focusedRows = useMemo(() => {
    const topRows = sortedRankings.slice(0, 3);
    if (!currentUserRow) return topRows;
    const aroundRows = sortedRankings.slice(
      Math.max(0, currentUserRow.rank - 3),
      Math.min(sortedRankings.length, currentUserRow.rank + 2)
    );
    const uniqueMap = new Map();
    [...topRows, ...aroundRows].forEach((row) => {
      uniqueMap.set(String(row.user_id), row);
    });
    const uniqueRows = Array.from(uniqueMap.values()).sort((a, b) => a.rank - b.rank);
    const withSeparators = [];
    uniqueRows.forEach((row, index) => {
      const prev = uniqueRows[index - 1];
      if (prev && row.rank - prev.rank > 1) {
        withSeparators.push({ is_separator: true, user_id: `sep_${prev.rank}_${row.rank}` });
      }
      withSeparators.push(row);
    });
    return withSeparators;
  }, [sortedRankings, currentUserRow]);
  const rowsToShow = useMemo(() => {
    if (showAllRanks) return sortedRankings;
    return focusedRows;
  }, [sortedRankings, focusedRows, showAllRanks]);
  const rowsWithDefaults = useMemo(() => {
    const actualRows = rowsToShow.filter((row) => !row?.is_separator);
    const missingCount = Math.max(0, MIN_RANKING_ROWS - actualRows.length);
    if (missingCount <= 0) return rowsToShow;

    const placeholders = Array.from({ length: missingCount }, (_, index) => ({
      is_placeholder: true,
      user_id: `placeholder_${index + 1}`,
    }));
    return [...rowsToShow, ...placeholders];
  }, [rowsToShow]);

  return (
    <div className="student-ranking-page">
      <Header
        user={user}
        onLogout={logout}
        activeTab="ranking"
        onSelectTab={handleSelectTab}
      />

      <main className="student-ranking-main">
        <section className="student-ranking-shell" aria-label="ลำดับคะแนน">
          {loading ? (
            <div className="student-ranking-loading" role="status" aria-live="polite">
              <div className="ranking-loading-head">
                <span className="ranking-loading-spinner" aria-hidden="true" />
                <p>กำลังเตรียมลำดับคะแนน...</p>
              </div>

              <div className="ranking-loading-tabs" aria-hidden="true">
                <span className="ranking-skeleton ranking-skeleton-chip long" />
                <span className="ranking-skeleton ranking-skeleton-chip short" />
                <span className="ranking-skeleton ranking-skeleton-chip medium" />
                <span className="ranking-skeleton ranking-skeleton-chip short" />
              </div>

              <div className="ranking-loading-panel" aria-hidden="true">
                <span className="ranking-skeleton ranking-skeleton-title" />
                <div className="ranking-loading-table">
                  <div className="ranking-loading-row heading">
                    {RANKING_LOADING_COLUMNS.map((columnIndex) => (
                      <span
                        key={`ranking-loading-heading-${columnIndex}`}
                        className={`ranking-skeleton ranking-skeleton-cell ${columnIndex === 1 ? 'wide' : ''}`}
                      />
                    ))}
                  </div>

                  {RANKING_LOADING_ROWS.map((rowIndex) => (
                    <div key={`ranking-loading-row-${rowIndex}`} className="ranking-loading-row">
                      <span className="ranking-skeleton ranking-skeleton-cell rank" />
                      <div className="ranking-loading-student-cell">
                        <span className="ranking-skeleton ranking-skeleton-avatar" />
                        <span className="ranking-skeleton ranking-skeleton-cell wide" />
                      </div>
                      <span className="ranking-skeleton ranking-skeleton-cell" />
                      <span className="ranking-skeleton ranking-skeleton-cell" />
                      <span className="ranking-skeleton ranking-skeleton-cell" />
                      <span className="ranking-skeleton ranking-skeleton-cell" />
                    </div>
                  ))}
                </div>

                <div className="ranking-loading-actions">
                  <span className="ranking-skeleton ranking-skeleton-button" />
                </div>
              </div>
            </div>
          ) : null}
          {!loading && error ? <p className="student-ranking-status error">{error}</p> : null}
          {!loading && !error && courses.length === 0 ? (
            <p className="student-ranking-status">ยังไม่มีคอร์สที่ลงทะเบียน</p>
          ) : null}

          {!loading && !error && courses.length > 0 ? (
            <>
              <div className="ranking-course-tabs">
                {courses.map((course) => (
                  <button
                    key={course.id}
                    type="button"
                    className={`ranking-course-tab ${selectedCourseId === course.id ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedCourseId(course.id);
                      setShowAllRanks(false);
                    }}
                  >
                    {course.name}
                  </button>
                ))}
              </div>

              <div className="ranking-course-panel">
                <>
                  <div className="ranking-table-wrap">
                    <table className="ranking-table">
                      <thead>
                        <tr>
                          <th>อันดับ</th>
                          <th>นักเรียน</th>
                          <th>คะแนนเฉลี่ย</th>
                          <th>ครั้งที่ทำ</th>
                          <th>เวลาเฉลี่ยที่ใช้</th>
                          <th>คะแนนสูงสุด</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rowsWithDefaults.map((row) => {
                          if (row?.is_separator) {
                            return (
                              <tr key={row.user_id} className="ranking-row-separator">
                                <td colSpan={6}>...</td>
                              </tr>
                            );
                          }
                          if (row?.is_placeholder) {
                            return (
                              <tr key={row.user_id} className="ranking-placeholder-row">
                                <td>-</td>
                                <td>-</td>
                                <td>-</td>
                                <td>-</td>
                                <td>-</td>
                                <td>-</td>
                              </tr>
                            );
                          }
                          const medalMeta = getMedalMeta(row.rank);
                          const isTop3 = Boolean(medalMeta);
                          const studentName = row.display_name || row.user_id;
                          return (
                            <tr
                              key={`${row.user_id}-${row.rank}`}
                              className={[
                                row.user_id === currentUserId ? 'current-user' : '',
                                isTop3 ? `top-rank top-rank-${row.rank}` : '',
                              ].filter(Boolean).join(' ')}
                            >
                              <td>
                                {isTop3 ? (
                                  <span className={`rank-medal ${medalMeta.className}`} title={medalMeta.label}>
                                    <span>{medalMeta.icon}</span>
                                    <strong>#{row.rank}</strong>
                                  </span>
                                ) : (
                                  row.rank
                                )}
                              </td>
                              <td>
                                <div className="ranking-student-cell">
                                  <div className={`ranking-avatar ${isTop3 ? `top-${row.rank}` : ''}`}>
                                    {row.rank === 1 ? <span className="ranking-crown">👑</span> : null}
                                    <span>{getInitial(studentName)}</span>
                                  </div>
                                  <div className="ranking-student-meta">
                                    <span className="ranking-student-name">{studentName}</span>
                                    {row.user_id === currentUserId ? (
                                      <span className="current-user-badge">คุณ</span>
                                    ) : null}
                                  </div>
                                </div>
                              </td>
                              <td>{Number(row.average_score || 0).toFixed(2)}%</td>
                              <td>{row.attempt_count || 0}</td>
                              <td>{formatDuration(row.average_time_seconds)}</td>
                              <td>{Number(row.best_score || 0).toFixed(2)}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {sortedRankings.length > 0 ? (
                    <div className="ranking-actions bottom-right">
                      <button
                        type="button"
                        className="ranking-toggle-button"
                        onClick={() => setShowAllRanks((prev) => !prev)}
                      >
                        {showAllRanks ? 'แสดงเฉพาะ Top 3 + รอบอันดับเรา' : 'ดูอันดับทั้งหมด'}
                      </button>
                    </div>
                  ) : null}
                </>
              </div>
            </>
          ) : null}
        </section>
      </main>
    </div>
  );
};

export default StudentRankingPage;
