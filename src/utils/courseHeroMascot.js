import defaultHeroMascotImage from '../assets/images/illustrations/auth-login-banner.webp';
import englishHeroMascotImage from '../assets/images/illustrations/course/course-hero-english.webp';
import mathHeroMascotImage from '../assets/images/illustrations/course/course-hero-math.webp';
import scienceHeroMascotImage from '../assets/images/illustrations/course/course-hero-sci.webp';
import socialHeroMascotImage from '../assets/images/illustrations/course/course-hero-social.webp';
import thaiHeroMascotImage from '../assets/images/illustrations/course/course-hero-thai.webp';
import { getCourseSubjectLabel } from './courseLabels';

const SUBJECT_MASCOT_IMAGES = [
  { match: (text) => text.includes('อังกฤษ') || text.includes('english'), image: englishHeroMascotImage },
  { match: (text) => text.includes('ไทย') || text.includes('thai'), image: thaiHeroMascotImage },
  { match: (text) => text.includes('คณิต') || text.includes('math'), image: mathHeroMascotImage },
  { match: (text) => text.includes('วิทย') || text.includes('science') || text.includes('sci'), image: scienceHeroMascotImage },
  { match: (text) => text.includes('สังคม') || text.includes('social'), image: socialHeroMascotImage },
];

export const getCourseHeroMascotImage = (course, fallback = defaultHeroMascotImage) => {
  if (!course) return fallback;

  const subjectLabel = getCourseSubjectLabel(course, '');
  const haystack = [
    subjectLabel,
    course?.name,
    course?.title,
    course?.category,
    course?.subject,
    course?.subject_name,
    ...(Array.isArray(course?.tags) ? course.tags : []),
    ...(Array.isArray(course?.course_tags) ? course.course_tags : []),
  ]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');

  const matched = SUBJECT_MASCOT_IMAGES.find(({ match }) => match(haystack));
  return matched?.image || fallback;
};

export default getCourseHeroMascotImage;
