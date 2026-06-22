const CATEGORY_LABEL_MAP = {
  general: 'ทั่วไป',
  math: 'คณิตศาสตร์',
  science: 'วิทยาศาสตร์',
  language: 'ภาษา',
  social: 'สังคมศึกษา',
  art: 'ศิลปะ',
  technology: 'เทคโนโลยี',
};

const GENERAL_LABELS = new Set(['general', 'basic', 'ทั่วไป', 'วิชาพื้นฐาน']);

const toTagList = (course) => {
  const rawTags = course?.tags ?? course?.course_tags ?? course?.tag ?? [];
  if (Array.isArray(rawTags)) {
    return rawTags.map((item) => String(item || '').trim()).filter(Boolean);
  }
  return String(rawTags || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

export const normalizeCourseLabel = (value, fallback = 'ทั่วไป') => {
  const text = String(value || '').trim();
  if (!text) return fallback;

  const lowered = text.toLowerCase();
  if (GENERAL_LABELS.has(lowered)) return fallback;
  if (CATEGORY_LABEL_MAP[lowered]) return CATEGORY_LABEL_MAP[lowered];

  if (lowered.includes('social') || text.includes('สังคม')) return 'สังคมศึกษา';
  if (lowered.includes('english') || text.includes('อังกฤษ')) return 'ภาษาอังกฤษ';
  if (lowered.includes('thai') || text.includes('ไทย')) return 'ภาษาไทย';
  if (lowered.includes('math') || text.includes('คณิต')) return 'คณิตศาสตร์';
  if (lowered.includes('science') || text.includes('วิทย')) return 'วิทยาศาสตร์';
  if (lowered.includes('art') || text.includes('ศิลปะ')) return 'ศิลปะ';
  if (lowered.includes('tech') || lowered.includes('computer') || text.includes('เทคโน')) return 'เทคโนโลยี';
  if (lowered.includes('language') || text.includes('ภาษา')) return 'ภาษา';

  return text;
};

export const getCourseSubjectLabel = (course, fallback = 'ทั่วไป') => {
  const tags = toTagList(course)
    .map((item) => normalizeCourseLabel(item, ''))
    .filter(Boolean);

  const tagSubject = tags.find((item) => !GENERAL_LABELS.has(String(item || '').trim().toLowerCase()));
  if (tagSubject) return tagSubject;

  return normalizeCourseLabel(
    course?.subject || course?.subject_name || course?.category,
    fallback
  );
};
