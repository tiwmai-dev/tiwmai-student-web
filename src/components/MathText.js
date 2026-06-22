import React, { useMemo } from 'react';

const repairLatexArtifacts = (raw) => {
  if (!raw) return '';

  let text = String(raw);
  const escapedControls = [
    [String.fromCharCode(8), '\\'],  // backspace from \b...
    [String.fromCharCode(12), '\\'], // form feed from \f...
    [String.fromCharCode(9), '\\'],  // tab from \t...
  ];
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Common JSON-escape artifacts from LLM output (e.g. \times -> tab + "imes", \frac -> form-feed + "rac").
  escapedControls.forEach(([char, replacement]) => {
    text = text.split(char).join(replacement);
  });

  // Recover escaped LaTeX tokens coming from doubly-escaped JSON payloads.
  text = text
    .replace(/\\\$/g, '$')
    .replace(/\\\\(?=[a-zA-Z()[\]{}])/g, '\\');

  return text
    .replace(/\\imes(?=\b)/g, '\\times')
    .replace(/\\lat(?=\b)/g, '\\div')
    .replace(/\\extdiv(?=\b)/g, '\\div')
    .replace(/\\hickspace(?=\b)/g, '\\thickspace')
    .replace(/\\ext\{/g, '\\text{')
    .replace(/\\rac\{/g, '\\frac{')
    .replace(/(^|[^\w\\])extdiv(?=\b)/g, '$1\\div')
    .replace(/(?<=[)\]\d])\s+lat\s+(?=[([-\d])/g, ' \\div ')
    .replace(/(^|[^\w\\])imes(?=\b)/g, '$1\\times')
    .replace(/(^|[^\w\\])hickspace(?=\b)/g, '$1\\thickspace')
    .replace(/(^|[^\w\\])ext\{/g, '$1\\text{')
    .replace(/(^|[^\w\\])rac\{/g, '$1\\frac{')
    .replace(/(^|[^\w\\])div(?=\b)/g, '$1\\div');
};

const normalizeMathText = (raw) => {
  let text = repairLatexArtifacts(raw);

  // KaTeX auto-render requires balanced delimiters; broken payloads often contain odd '$'.
  const dollarCount = (text.match(/\$/g) || []).length;
  if (dollarCount % 2 !== 0) {
    text = text.replace(/\$/g, '');
  }

  // Keep LaTeX commands intact and add implicit delimiters for math-like segments.
  if (!text.includes('$') && !text.includes('\\(') && !text.includes('\\[')) {
    const runRegex = /([\\\d][\\\d\s()+\-*/^_=×÷{}[\].,:;]*[\\\d}\])])/g;
    text = text.replace(runRegex, (segment) => {
      const trimmed = segment.trim();
      if (!trimmed) return segment;
      if (!/\d/.test(trimmed)) return segment;
      if (!/[+\-*/^=×÷]|\\(times|div|cdot|frac|sqrt|pm|mp)\b/.test(trimmed)) return segment;
      return `$${trimmed}$`;
    });
  }
  text = text
    .replace(/\\left/g, '')
    .replace(/\\right/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return text;
};

const splitMathSegments = (value) => {
  const regex = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^$\n]+\$|\\\([^)\n]+\\\))/g;
  const segments = [];
  let lastIndex = 0;
  let match = regex.exec(value);
  while (match) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: value.slice(lastIndex, match.index) });
    }
    const token = match[0];
    if (token.startsWith('$$') && token.endsWith('$$')) {
      segments.push({ type: 'math', value: token.slice(2, -2), display: true });
    } else if (token.startsWith('\\[') && token.endsWith('\\]')) {
      segments.push({ type: 'math', value: token.slice(2, -2), display: true });
    } else if (token.startsWith('$') && token.endsWith('$')) {
      segments.push({ type: 'math', value: token.slice(1, -1), display: false });
    } else if (token.startsWith('\\(') && token.endsWith('\\)')) {
      segments.push({ type: 'math', value: token.slice(2, -2), display: false });
    } else {
      segments.push({ type: 'text', value: token });
    }
    lastIndex = regex.lastIndex;
    match = regex.exec(value);
  }
  if (lastIndex < value.length) {
    segments.push({ type: 'text', value: value.slice(lastIndex) });
  }
  return segments;
};

const renderMathHtml = (expression, display) => {
  const katex = typeof window !== 'undefined' ? window.katex : null;
  if (!katex || typeof katex.renderToString !== 'function') return null;
  try {
    return katex.renderToString(expression, {
      throwOnError: false,
      strict: 'ignore',
      displayMode: !!display,
    });
  } catch (_) {
    return null;
  }
};

const MathText = React.memo(({ text, inline = false, className = '' }) => {
  const content = useMemo(() => normalizeMathText(String(text || '')).trim(), [text]);
  const Wrapper = inline ? 'span' : 'div';
  const parts = useMemo(() => (content ? splitMathSegments(content) : []), [content]);
  const renderedParts = useMemo(() => (
    parts.map((part, index) => {
      if (part.type !== 'math') {
        return <React.Fragment key={`t-${index}`}>{part.value}</React.Fragment>;
      }
      const html = renderMathHtml(part.value, part.display);
      if (!html) {
        const fallback = part.display ? `$$${part.value}$$` : `$${part.value}$`;
        return <React.Fragment key={`f-${index}`}>{fallback}</React.Fragment>;
      }
      const tagClass = part.display ? 'math-segment display' : 'math-segment inline';
      return <span key={`m-${index}`} className={tagClass} dangerouslySetInnerHTML={{ __html: html }} />;
    })
  ), [parts]);

  if (!content) return null;

  return (
    <Wrapper className={`math-text ${inline ? 'inline' : ''} ${className}`.trim()}>
      {renderedParts}
    </Wrapper>
  );
});

export default MathText;
