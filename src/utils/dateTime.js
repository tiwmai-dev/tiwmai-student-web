const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T/;
const ISO_TIMEZONE_SUFFIX = /(?:[zZ]|[+-]\d{2}:?\d{2})$/;

export const parseApiDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const text = String(value).trim();
  if (!text) return null;

  const normalized = ISO_DATE_TIME.test(text) && !ISO_TIMEZONE_SUFFIX.test(text)
    ? `${text}Z`
    : text;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const getApiDateTimeMs = (value) => {
  const date = parseApiDate(value);
  return date ? date.getTime() : NaN;
};
