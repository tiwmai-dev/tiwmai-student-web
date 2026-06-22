import { buildQuizRecommendation } from './quizRecommendation';

const makeQuiz = (id, difficulty) => ({ id, title: id, difficulty });
const makeResult = (score, day = 1) => ({
  score,
  submitted_at: `2026-06-${String(day).padStart(2, '0')}T00:00:00Z`,
});
const makeStats = (...scores) => ({
  attempts: scores.length,
  latestScore: scores[scores.length - 1],
  list: scores.map((score, index) => makeResult(score, index + 1)).reverse(),
});

test('starts by recommending an easy unseen exercise', () => {
  const recommendation = buildQuizRecommendation({
    quizzes: [makeQuiz('hard', 5), makeQuiz('easy', 2), makeQuiz('medium', 3)],
  });

  expect(recommendation.quiz.id).toBe('easy');
  expect(recommendation.mode).toBe('progress');
  expect(recommendation.reasons[1]).toBe('ผ่านระดับง่ายแล้ว 0/8 ชุด');
});

test('unlocks medium after eight distinct easy exercises score above 80', () => {
  const easyQuizzes = Array.from({ length: 8 }, (_, index) => makeQuiz(`easy-${index}`, 2));
  const resultsByQuiz = Object.fromEntries(easyQuizzes.map((quiz) => [quiz.id, makeStats(81)]));
  const recommendation = buildQuizRecommendation({
    quizzes: [...easyQuizzes, makeQuiz('medium', 3), makeQuiz('hard', 5)],
    resultsByQuiz,
  });

  expect(recommendation.quiz.id).toBe('medium');
  expect(recommendation.summary).toContain('ระดับปานกลาง');
});

test('does not count a score of exactly 80 as passed', () => {
  const easyQuizzes = Array.from({ length: 8 }, (_, index) => makeQuiz(`easy-${index}`, 2));
  const resultsByQuiz = Object.fromEntries(easyQuizzes.map((quiz) => [quiz.id, makeStats(80)]));
  const recommendation = buildQuizRecommendation({
    quizzes: [...easyQuizzes, makeQuiz('medium', 3)],
    resultsByQuiz,
  });

  expect(recommendation.quiz.id).toBe('easy-0');
  expect(recommendation.summary).toContain('ระดับง่าย');
});

test('unlocks hard after eight easy and eight medium exercises pass', () => {
  const easyQuizzes = Array.from({ length: 8 }, (_, index) => makeQuiz(`easy-${index}`, 2));
  const mediumQuizzes = Array.from({ length: 8 }, (_, index) => makeQuiz(`medium-${index}`, 3));
  const passedQuizzes = [...easyQuizzes, ...mediumQuizzes];
  const resultsByQuiz = Object.fromEntries(passedQuizzes.map((quiz) => [quiz.id, makeStats(90)]));
  const recommendation = buildQuizRecommendation({
    quizzes: [...passedQuizzes, makeQuiz('hard', 5)],
    resultsByQuiz,
  });

  expect(recommendation.quiz.id).toBe('hard');
  expect(recommendation.summary).toContain('ระดับยาก');
});

test('uses the highest score per exercise when counting passed exercises', () => {
  const easyQuizzes = Array.from({ length: 8 }, (_, index) => makeQuiz(`easy-${index}`, 2));
  const resultsByQuiz = Object.fromEntries(
    easyQuizzes.map((quiz) => [quiz.id, makeStats(95, 20)])
  );
  const recommendation = buildQuizRecommendation({
    quizzes: [...easyQuizzes, makeQuiz('medium', 3)],
    resultsByQuiz,
  });

  expect(recommendation.quiz.id).toBe('medium');
});

test('alternates to an exercise whose highest score is below 50', () => {
  const recommendation = buildQuizRecommendation({
    quizzes: [makeQuiz('low-score', 2), makeQuiz('unseen-easy', 2), makeQuiz('hard', 5)],
    resultsByQuiz: { 'low-score': makeStats(40) },
  });

  expect(recommendation.quiz.id).toBe('low-score');
  expect(recommendation.mode).toBe('review');
  expect(recommendation.reasons[0]).toContain('40%');
});

test('returns to level progression after the review turn', () => {
  const recommendation = buildQuizRecommendation({
    quizzes: [makeQuiz('low-score', 2), makeQuiz('unseen-easy', 2)],
    resultsByQuiz: { 'low-score': makeStats(40, 45) },
  });

  expect(recommendation.quiz.id).toBe('unseen-easy');
  expect(recommendation.mode).toBe('progress');
});

test('does not review an exercise that once scored above 50', () => {
  const recommendation = buildQuizRecommendation({
    quizzes: [makeQuiz('recovered', 2), makeQuiz('unseen-easy', 2)],
    resultsByQuiz: { recovered: makeStats(40, 70, 20) },
  });

  expect(recommendation.quiz.id).toBe('unseen-easy');
  expect(recommendation.mode).toBe('progress');
});
