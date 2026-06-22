const QUESTION_CONTEXT_KEYS = [
  'question_context_text',
  'context',
  'question_context',
  'questionContext',
  'shared_context',
  'sharedContext',
  'passage',
  'reading_passage',
  'readingPassage',
  'instructions',
  'instruction',
  'stimulus',
  'common_stem',
  'commonStem',
];

export const extractQuestionContextText = (source = null) => {
  if (!source) return '';
  if (typeof source === 'string') return source.trim();

  return QUESTION_CONTEXT_KEYS
    .map((key) => source?.[key])
    .map((value) => String(value ?? '').trim())
    .find(Boolean) || '';
};

export default extractQuestionContextText;
