const ADVANCE_REQUIRED_PASSES = 8;
const PASS_SCORE = 80;
const REVIEW_SCORE = 50;

const clampPercent = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const percent = numeric > 0 && numeric <= 1 ? numeric * 100 : numeric;
  return Math.max(0, Math.min(100, Math.round(percent)));
};

const quizIdOf = (quiz) => String(
  quiz?.id || quiz?.quiz_id || quiz?.document_id || quiz?.quizId || ''
).trim();

const normalizeDifficultyStars = (value) => {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    if (numeric >= 1 && numeric <= 5) return Math.min(5, Math.max(1, Math.round(numeric)));
    if (numeric <= 1) return 2;
    if (numeric === 2) return 3;
    if (numeric >= 3) return 4;
  }
  const raw = String(value || '').trim().toLowerCase();
  if (['easy', 'ง่าย', 'low', 'เบา'].includes(raw)) return 2;
  if (['hard', 'ยาก', 'high'].includes(raw)) return 4;
  return 3;
};

const difficultyBucket = (stars) => {
  if (stars <= 2) return 'easy';
  if (stars === 3) return 'medium';
  return 'hard';
};

const difficultyLabel = (bucket) => ({
  easy: 'ง่าย',
  medium: 'ปานกลาง',
  hard: 'ยาก',
}[bucket] || 'ง่าย');

const timestampOf = (value) => {
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const getQuizStats = (quiz, resultsByQuiz) => {
  const stored = resultsByQuiz[quizIdOf(quiz)] || {};
  const results = [...(Array.isArray(stored.list) ? stored.list : [])].sort(
    (a, b) => timestampOf(b?.submitted_at || b?.created_at) - timestampOf(a?.submitted_at || a?.created_at)
  );
  const scores = results
    .map((result) => clampPercent(result?.score))
    .filter((score) => score != null);
  const fallbackScore = clampPercent(stored.latestScore);
  const maxScore = scores.length ? Math.max(...scores) : fallbackScore;
  const attempts = Math.max(Number(stored.attempts) || 0, results.length);
  const stars = normalizeDifficultyStars(
    quiz?.difficultyScore ?? quiz?.difficulty_avg ?? quiz?.difficulty
  );

  return {
    quiz,
    attempts,
    maxScore,
    stars,
    bucket: difficultyBucket(stars),
    lastAt: results[0]?.submitted_at || results[0]?.created_at || stored.lastAt || null,
  };
};

const sortProgressCandidates = (a, b) => {
  if ((a.attempts === 0) !== (b.attempts === 0)) return a.attempts === 0 ? -1 : 1;
  const aPassed = a.maxScore != null && a.maxScore > PASS_SCORE;
  const bPassed = b.maxScore != null && b.maxScore > PASS_SCORE;
  if (aPassed !== bPassed) return aPassed ? 1 : -1;
  if ((a.maxScore ?? -1) !== (b.maxScore ?? -1)) return (a.maxScore ?? -1) - (b.maxScore ?? -1);
  if (a.attempts !== b.attempts) return a.attempts - b.attempts;
  return a.stars - b.stars;
};

const sortReviewCandidates = (a, b) => {
  if ((a.maxScore ?? 100) !== (b.maxScore ?? 100)) return (a.maxScore ?? 100) - (b.maxScore ?? 100);
  return timestampOf(a.lastAt) - timestampOf(b.lastAt);
};

const resolveTargetBucket = (passedByBucket) => {
  if (passedByBucket.easy < ADVANCE_REQUIRED_PASSES) return 'easy';
  if (passedByBucket.medium < ADVANCE_REQUIRED_PASSES) return 'medium';
  return 'hard';
};

export const buildQuizRecommendation = ({
  quizzes = [],
  resultsByQuiz = {},
} = {}) => {
  const rows = quizzes
    .filter((quiz) => quizIdOf(quiz))
    .map((quiz) => getQuizStats(quiz, resultsByQuiz));
  if (!rows.length) return null;

  const passedByBucket = rows.reduce((counts, row) => {
    if (row.maxScore != null && row.maxScore > PASS_SCORE) counts[row.bucket] += 1;
    return counts;
  }, { easy: 0, medium: 0, hard: 0 });
  const totalAttempts = rows.reduce((sum, row) => sum + row.attempts, 0);
  const targetBucket = resolveTargetBucket(passedByBucket);
  const reviewCandidates = rows
    .filter((row) => row.attempts > 0 && row.maxScore != null && row.maxScore < REVIEW_SCORE)
    .sort(sortReviewCandidates);

  // Alternate after each submission. The first recommendation always follows the level path.
  const shouldReview = reviewCandidates.length > 0 && totalAttempts % 2 === 1;
  let mode = shouldReview ? 'review' : 'progress';
  let selected = shouldReview ? reviewCandidates[0] : null;

  if (!selected) {
    const targetCandidates = rows.filter((row) => row.bucket === targetBucket).sort(sortProgressCandidates);
    selected = targetCandidates[0] || [...rows].sort((a, b) => a.stars - b.stars)[0];
    mode = 'progress';
  }

  const selectedLabel = difficultyLabel(selected.bucket);
  const targetLabel = difficultyLabel(targetBucket);
  const targetPasses = passedByBucket[targetBucket];
  const remainingPasses = Math.max(0, ADVANCE_REQUIRED_PASSES - targetPasses);
  const topic = selected.quiz?.topic
    || selected.quiz?.category
    || selected.quiz?.subject
    || selected.quiz?.title
    || 'บทเรียนนี้';

  if (mode === 'review') {
    return {
      quiz: selected.quiz,
      hasHistory: totalAttempts > 0,
      topic,
      mode,
      reasons: [
        `คะแนนสูงสุดชุดนี้ ${selected.maxScore}% ยังต่ำกว่า ${REVIEW_SCORE}%`,
        `สลับมาทบทวนก่อนฝึกระดับ${targetLabel}ต่อ`,
        `ระดับ${selectedLabel}`,
      ],
      summary: 'รอบนี้แนะนำให้ซ่อมชุดที่คะแนนยังต่ำ ก่อนกลับไปไต่ระดับต่อ',
    };
  }

  const reasons = [];
  if (selected.attempts === 0) {
    reasons.push(`เริ่มจากแบบฝึกระดับ${selectedLabel}ที่ยังไม่เคยทำ`);
  } else if (selected.maxScore != null && selected.maxScore <= PASS_SCORE) {
    reasons.push(`คะแนนสูงสุดชุดนี้ ${selected.maxScore}% ยังไม่ผ่านเกณฑ์มากกว่า ${PASS_SCORE}%`);
  } else {
    reasons.push(`ฝึกต่อในระดับ${selectedLabel}`);
  }
  if (targetBucket === 'hard' && targetPasses >= ADVANCE_REQUIRED_PASSES) {
    reasons.push(`ผ่านระดับยากแล้ว ${targetPasses} ชุด`);
  } else {
    reasons.push(`ผ่านระดับ${targetLabel}แล้ว ${targetPasses}/${ADVANCE_REQUIRED_PASSES} ชุด`);
  }
  reasons.push(
    targetBucket === 'hard'
      ? `ทำอีก ${remainingPasses} ชุดให้ได้มากกว่า ${PASS_SCORE}% เพื่อผ่านระดับยาก`
      : `ทำอีก ${remainingPasses} ชุดให้ได้มากกว่า ${PASS_SCORE}% เพื่อปลดล็อกระดับถัดไป`
  );

  return {
    quiz: selected.quiz,
    hasHistory: totalAttempts > 0,
    topic,
    mode,
    reasons,
    summary: `กำลังไต่ระดับ${targetLabel} โดยนับคะแนนสูงสุดของแต่ละแบบฝึกหัด`,
  };
};
