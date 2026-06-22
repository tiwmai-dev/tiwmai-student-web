import React, { useMemo, useState } from 'react';

export const PageHeader = ({ breadcrumb, title, subtitle, action, align = 'left' }) => (
  <div className={`qa-header ${align === 'center' ? 'center' : ''}`}>
    <div className="qa-header-left">
      {breadcrumb ? (
        <div className="qa-breadcrumb" aria-label="breadcrumb">
          {breadcrumb}
        </div>
      ) : null}
      <h1 className="qa-title">{title}</h1>
      {subtitle && <div className="qa-subtitle">{subtitle}</div>}
    </div>
    <div className="qa-actions">{action}</div>
  </div>
);

export const SectionCard = ({ title, subtitle, action, children }) => (
  <section className="qa-section-card">
    <div className="qa-section-header">
      <div>
        <h2 className="qa-section-title">{title}</h2>
        {subtitle && <div className="qa-section-subtitle">{subtitle}</div>}
      </div>
      {action && <div className="qa-section-action">{action}</div>}
    </div>
    {children}
  </section>
);

export const KpiCard = ({ label, value, helper, icon, tone = 'neutral' }) => (
  <div className={`qa-kpi-card qa-kpi-${tone}`}>
    <div className="qa-kpi-label">
      {icon && <span className="qa-kpi-icon" aria-hidden="true">{icon}</span>}
      {label}
    </div>
    <div className="qa-kpi-value">{value}</div>
    {helper && <div className="qa-kpi-helper">{helper}</div>}
  </div>
);

export const ScoreBadge = ({ score }) => {
  const value = Number(score) || 0;
  const tone = value >= 80 ? 'green' : value >= 50 ? 'amber' : 'red';
  return (
    <span className={`qa-score-badge ${tone}`} aria-label={`คะแนน ${value} เปอร์เซ็นต์`}>
      {value}%
    </span>
  );
};

export const LoadingSkeleton = ({ variant = 'block', rows = 1 }) => {
  if (variant === 'kpi') {
    return (
      <div className="qa-kpi-card qa-skeleton">
        <div className="qa-skeleton-line short" />
        <div className="qa-skeleton-line tall" />
        <div className="qa-skeleton-line medium" />
      </div>
    );
  }
  if (variant === 'table') {
    return (
      <div className="qa-table-skeleton">
        {Array.from({ length: rows }).map((_, idx) => (
          <div key={idx} className="qa-skeleton-line full" />
        ))}
      </div>
    );
  }
  return (
    <div className="qa-skeleton">
      <div className="qa-skeleton-line full" />
    </div>
  );
};

export const ErrorState = ({ message, onRetry }) => (
  <div className="qa-state">
    <div className="qa-state-title">เกิดข้อผิดพลาด</div>
    <div className="qa-state-body">{message}</div>
    <button
      type="button"
      className="qa-button primary"
      onClick={onRetry}
      aria-label="ลองใหม่อีกครั้ง"
    >
      ลองใหม่
    </button>
  </div>
);

export const EmptyState = ({ title, body, action }) => (
  <div className="qa-state">
    <div className="qa-state-title">{title}</div>
    <div className="qa-state-body">{body}</div>
    {action}
  </div>
);

export const ScoreTrendChart = ({ attempts, formatDate, formatDuration }) => {
  const [hovered, setHovered] = useState(null);
  const width = 860;
  const height = 240;
  const pad = { top: 18, right: 20, bottom: 32, left: 40 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const points = useMemo(() => {
    const n = attempts.length;
    const step = n > 1 ? plotW / (n - 1) : 0;
    return attempts.map((a, i) => {
      const score = Math.min(100, Math.max(0, Number(a.score) || 0));
      return {
        ...a,
        x: pad.left + i * step,
        y: pad.top + (1 - score / 100) * plotH,
      };
    });
  }, [attempts, plotW, plotH, pad.left, pad.top]);

  if (attempts.length < 2) {
    return (
      <div className="qa-chart-empty">
        ทำแบบทดสอบอีกครั้งเพื่อดูแนวโน้ม
      </div>
    );
  }

  const hoveredPoint = hovered !== null ? points[hovered] : null;
  const tooltipLeft = hoveredPoint
    ? Math.min(Math.max((hoveredPoint.x / width) * 100, 12), 88)
    : 0;
  const tooltipTop = hoveredPoint
    ? Math.min(Math.max((hoveredPoint.y / height) * 100, 10), 70)
    : 0;

  return (
    <div className="qa-chart">
      <div className="qa-chart-legend">
        <span className="qa-chart-dot" aria-hidden="true" />
        คะแนน (%)
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="260">
        <text x={pad.left} y={14} fontSize="11" fill="#6b7280">คะแนน (%)</text>
        {[0, 25, 50, 75, 100].map((g) => {
          const y = pad.top + (1 - g / 100) * plotH;
          return (
            <g key={g}>
              <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke="#e5e7eb" strokeDasharray="4 4" />
              <text x={10} y={y + 4} fontSize="11" fill="#9ca3af">{g}%</text>
            </g>
          );
        })}
        {points.map((p, i) => {
          const y = height - pad.bottom;
          return (
            <g key={`tick-${i}`}>
              <line x1={p.x} y1={y} x2={p.x} y2={y + 4} stroke="#9ca3af" />
              <text x={p.x} y={y + 18} fontSize="11" fill="#6b7280" textAnchor="middle">
                {i + 1}
              </text>
            </g>
          );
        })}
        <defs>
          <linearGradient id="scoreLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#4ecdc4" />
            <stop offset="100%" stopColor="#2ab3a8" />
          </linearGradient>
        </defs>
        <polyline
          fill="none"
          stroke="url(#scoreLine)"
          strokeWidth="3"
          points={points.map((p) => `${p.x},${p.y}`).join(' ')}
        />
        {points.map((p, i) => (
          <circle
            key={`pt-${i}`}
            cx={p.x}
            cy={p.y}
            r={5}
            fill="#2ab3a8"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
      </svg>
      <div className="qa-chart-axis">
        <span>ครั้งที่ทำ</span>
      </div>
      {hoveredPoint && (
        <div
          className="qa-tooltip"
          role="status"
          style={{ left: `${tooltipLeft}%`, top: `${tooltipTop}%` }}
        >
          <div>ครั้งที่ {hoveredPoint.attemptNo}</div>
          <div>คะแนน {hoveredPoint.score}%</div>
          <div>{formatDate(hoveredPoint.submitted_at)}</div>
          <div>เวลาใช้ {formatDuration(hoveredPoint.time_spent_seconds)}</div>
        </div>
      )}
    </div>
  );
};

export const AttemptTable = ({
  attempts,
  sortBy,
  onSortChange,
  formatDate,
  formatDuration,
}) => {
  const [openRow, setOpenRow] = useState(null);

  return (
    <>
      <div className="qa-sort-group" role="group" aria-label="จัดเรียงข้อมูล">
        {[
          { key: 'latest', label: 'ล่าสุด' },
          { key: 'highest', label: 'คะแนนสูงสุด' },
          { key: 'fastest', label: 'เร็วที่สุด' },
        ].map((opt) => (
          <button
            key={opt.key}
            type="button"
            className={`qa-sort-button ${sortBy === opt.key ? 'active' : ''}`}
            onClick={() => onSortChange(opt.key)}
            aria-label={`เรียงตาม ${opt.label}`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="qa-table qa-desktop-only">
        <div className="qa-table-header">
          <div>ครั้งที่ทำ</div>
          <div>คะแนน</div>
          <div>ถูก/ทั้งหมด</div>
          <div>เวลาใช้</div>
          <div>วันที่ทำ</div>
          <div className="qa-align-right">Action</div>
        </div>
        {attempts.map((attempt) => (
          <div className="qa-table-row" key={attempt.id}>
            <div className="qa-cell">ครั้งที่ {attempt.attemptNo}</div>
            <div className="qa-cell">
              <ScoreBadge score={attempt.score} />
            </div>
            <div className="qa-cell">
              {attempt.correct_count ?? 0}/{attempt.total_questions ?? 0}
            </div>
            <div className="qa-cell">{formatDuration(attempt.time_spent_seconds)}</div>
            <div className="qa-cell">{formatDate(attempt.submitted_at)}</div>
            <div className="qa-cell qa-align-right">
              <button
                type="button"
                className="qa-button ghost"
                aria-label="ดูรายละเอียดการทำแบบทดสอบ"
                onClick={() => setOpenRow(openRow === attempt.id ? null : attempt.id)}
              >
                {openRow === attempt.id ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียด'}
              </button>
            </div>
            {openRow === attempt.id && (
              <div className="qa-table-expand" aria-live="polite">
                <div className="qa-expand-title">คำตอบที่เลือก</div>
                <div className="qa-expand-content">
                  {(attempt.answers || []).map((a, i) => (
                    <span className="qa-answer-chip" key={i}>
                      ข้อ {i + 1}: {a === null || a === undefined ? '-' : String.fromCharCode(65 + Number(a))}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="qa-mobile-only">
        {attempts.map((attempt) => (
          <div className="qa-attempt-card" key={`${attempt.id}-mobile`}>
            <div className="qa-attempt-card-header">
              <div>ครั้งที่ {attempt.attemptNo}</div>
              <ScoreBadge score={attempt.score} />
            </div>
            <div className="qa-attempt-card-body">
              <div>
                <span>ถูก/ทั้งหมด</span>
                <strong>{attempt.correct_count ?? 0}/{attempt.total_questions ?? 0}</strong>
              </div>
              <div>
                <span>เวลาใช้</span>
                <strong>{formatDuration(attempt.time_spent_seconds)}</strong>
              </div>
              <div>
                <span>วันที่ทำ</span>
                <strong>{formatDate(attempt.submitted_at)}</strong>
              </div>
            </div>
            <button
              type="button"
              className="qa-button ghost full"
              onClick={() => setOpenRow(openRow === attempt.id ? null : attempt.id)}
              aria-label="ดูรายละเอียดการทำแบบทดสอบ"
            >
              {openRow === attempt.id ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียด'}
            </button>
            {openRow === attempt.id && (
              <div className="qa-table-expand">
                <div className="qa-expand-title">คำตอบที่เลือก</div>
                <div className="qa-expand-content">
                  {(attempt.answers || []).map((a, i) => (
                    <span className="qa-answer-chip" key={`m-${i}`}>
                      ข้อ {i + 1}: {a === null || a === undefined ? '-' : String.fromCharCode(65 + Number(a))}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
};
