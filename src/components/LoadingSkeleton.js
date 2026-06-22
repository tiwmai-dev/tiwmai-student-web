import React from 'react';

const SkeletonBase = ({ width = '100%', height = '1rem', className = '', style = {} }) => (
  <div
    className={`skeleton-loader ${className}`}
    style={{
      width,
      height,
      backgroundColor: '#f3f4f6',
      borderRadius: '0.375rem',
      animation: 'skeleton-pulse 1.5s ease-in-out infinite',
      ...style
    }}
    aria-hidden="true"
  />
);

const LoadingSkeleton = ({ type = 'course', count = 1 }) => {
  const skeletonStyles = `
    @keyframes skeleton-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    
    .skeleton-loader {
      background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%);
      background-size: 200% 100%;
      animation: skeleton-shimmer 1.5s infinite;
    }
    
    @keyframes skeleton-shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    
    .skeleton-container {
      padding: 1rem;
    }
  `;

  const CourseHeaderSkeleton = () => (
    <div className="skeleton-container" style={{ marginBottom: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        <SkeletonBase width="4rem" height="4rem" style={{ borderRadius: '0.5rem' }} />
        <div style={{ flex: 1 }}>
          <SkeletonBase width="300px" height="2rem" style={{ marginBottom: '0.5rem' }} />
          <SkeletonBase width="200px" height="1rem" style={{ marginBottom: '0.5rem' }} />
          <SkeletonBase width="150px" height="1rem" />
        </div>
      </div>
      <SkeletonBase width="100%" height="3rem" />
    </div>
  );

  const LessonCardSkeleton = () => (
    <div 
      className="skeleton-container" 
      style={{ 
        border: '1px solid #e5e7eb', 
        borderRadius: '0.75rem', 
        padding: '1.5rem',
        marginBottom: '1rem'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
        <SkeletonBase width="3rem" height="3rem" style={{ borderRadius: '50%', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <SkeletonBase width="70%" height="1.5rem" style={{ marginBottom: '0.75rem' }} />
          <SkeletonBase width="100%" height="1rem" style={{ marginBottom: '0.5rem' }} />
          <SkeletonBase width="80%" height="1rem" style={{ marginBottom: '1rem' }} />
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <SkeletonBase width="6rem" height="1.5rem" />
            <SkeletonBase width="6rem" height="1.5rem" />
          </div>
          <SkeletonBase width="8rem" height="2.5rem" />
        </div>
      </div>
    </div>
  );

  const QuizCardSkeleton = () => (
    <div 
      className="skeleton-container" 
      style={{ 
        border: '1px solid #e5e7eb', 
        borderRadius: '0.75rem', 
        padding: '1.5rem',
        marginBottom: '1rem'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <div style={{ flex: 1 }}>
          <SkeletonBase width="80%" height="1.5rem" style={{ marginBottom: '0.5rem' }} />
          <SkeletonBase width="100%" height="1rem" />
        </div>
        <SkeletonBase width="5rem" height="2rem" />
      </div>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <SkeletonBase width="4rem" height="1rem" />
        <SkeletonBase width="4rem" height="1rem" />
        <SkeletonBase width="4rem" height="1rem" />
      </div>
      <SkeletonBase width="6rem" height="2rem" />
    </div>
  );

  const TabsSkeleton = () => (
    <div className="skeleton-container" style={{ marginBottom: '2rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBase 
            key={i} 
            width="8rem" 
            height="3rem" 
            style={{ borderRadius: '0.5rem' }} 
          />
        ))}
      </div>
    </div>
  );

  const CourseContentSkeleton = () => (
    <div>
      <style>{skeletonStyles}</style>
      <CourseHeaderSkeleton />
      <TabsSkeleton />
      <div role="status" aria-label="กำลังโหลดเนื้อหาคอร์ส">
        {Array.from({ length: count }).map((_, index) => (
          <LessonCardSkeleton key={index} />
        ))}
      </div>
    </div>
  );

  const QuizListSkeleton = () => (
    <div>
      <style>{skeletonStyles}</style>
      <div role="status" aria-label="กำลังโหลดรายการแบบทดสอบ">
        {Array.from({ length: count }).map((_, index) => (
          <QuizCardSkeleton key={index} />
        ))}
      </div>
    </div>
  );

  const GenericSkeleton = () => (
    <div>
      <style>{skeletonStyles}</style>
      <div className="skeleton-container" role="status" aria-label="กำลังโหลดข้อมูล">
        {Array.from({ length: count }).map((_, index) => (
          <div key={index} style={{ marginBottom: '1rem' }}>
            <SkeletonBase width="60%" height="1.5rem" style={{ marginBottom: '0.5rem' }} />
            <SkeletonBase width="100%" height="1rem" style={{ marginBottom: '0.5rem' }} />
            <SkeletonBase width="80%" height="1rem" />
          </div>
        ))}
      </div>
    </div>
  );

  switch (type) {
    case 'course':
      return <CourseContentSkeleton />;
    case 'lesson':
      return (
        <div>
          <style>{skeletonStyles}</style>
          <div role="status" aria-label="กำลังโหลดบทเรียน">
            {Array.from({ length: count }).map((_, index) => (
              <LessonCardSkeleton key={index} />
            ))}
          </div>
        </div>
      );
    case 'quiz':
      return <QuizListSkeleton />;
    case 'card':
      return (
        <div>
          <style>{skeletonStyles}</style>
          <div role="status" aria-label="กำลังโหลดข้อมูล">
            {Array.from({ length: count }).map((_, index) => (
              <div 
                key={index}
                className="skeleton-container" 
                style={{ 
                  border: '1px solid #e5e7eb', 
                  borderRadius: '0.75rem', 
                  padding: '1.5rem',
                  marginBottom: '1rem'
                }}
              >
                <SkeletonBase width="70%" height="1.5rem" style={{ marginBottom: '0.75rem' }} />
                <SkeletonBase width="100%" height="1rem" style={{ marginBottom: '0.5rem' }} />
                <SkeletonBase width="50%" height="1rem" />
              </div>
            ))}
          </div>
        </div>
      );
    default:
      return <GenericSkeleton />;
  }
};

export default LoadingSkeleton;