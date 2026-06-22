import React from 'react';
import { ArrowRight, BookOpen, Gauge, ClipboardCheck } from 'lucide-react';
import bannerImage from '../assets/images/illustrations/auth-login-banner.webp';

const DashboardHeader = ({
  headline,
  message,
  activeCourseLabel,
  averageProgress,
  completedQuizCount,
  onStartNow,
  loading = false,
}) => {
  const metrics = [
    {
      key: 'course',
      icon: BookOpen,
      label: 'คอร์สที่กำลังเรียน',
      value: activeCourseLabel || 'ยังไม่มีคอร์ส',
    },
    {
      key: 'progress',
      icon: Gauge,
      label: 'ความคืบหน้า',
      value: `${Math.max(0, Math.round(Number(averageProgress) || 0))}% จากทั้งหมด`,
    },
    {
      key: 'quiz',
      icon: ClipboardCheck,
      label: 'ชุดที่ทำแล้ว',
      value: `${Math.max(0, Math.round(Number(completedQuizCount) || 0))} ชุด`,
    },
  ];

  return (
    <section className="dashboard-hero">
      <div className="dashboard-hero-content-wrap">
        <div className="dashboard-hero-content">
          <p className="dashboard-hero-kicker">ภารกิจฝึกฝนวันนี้</p>
          <h2>{headline}</h2>
          <p className="dashboard-hero-headline">{message}</p>
          <div className="dashboard-hero-metrics">
            {metrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <div key={metric.key} className={`dashboard-hero-metric-card ${loading ? 'is-loading' : ''}`}>
                  <span className="dashboard-hero-metric-icon" aria-hidden="true">
                    <Icon size={20} strokeWidth={2.2} />
                  </span>
                  <div className="dashboard-hero-metric-copy">
                    {loading ? (
                      <>
                        <span className="dashboard-skeleton-line metric-label" aria-hidden="true" />
                        <span className="dashboard-skeleton-line metric-value" aria-hidden="true" />
                      </>
                    ) : (
                      <>
                        <span>{metric.label}</span>
                        <strong>{metric.value}</strong>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <button type="button" className="dashboard-hero-start-btn" onClick={onStartNow} disabled={loading}>
            <span>เริ่มทำเลย</span>
            <ArrowRight size={18} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </div>
        <div className="dashboard-hero-media" aria-hidden="true">
          <img src={bannerImage} alt="" loading="lazy" />
        </div>
      </div>
    </section>
  );
};

export default DashboardHeader;
