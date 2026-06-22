import React from 'react';
import loadingImage from '../assets/images/illustrations/loading.webp';
import loadingLogoImage from '../assets/images/logos/tewmai_remove_logo.webp';

const PageLoading = ({
  label = 'กำลังโหลด...',
  title = 'น้องติวขอเตรียมข้อมูลสักครู่นะครับ',
  note = 'โปรดรอสักครู่ ระบบจะพร้อมในไม่ช้า',
}) => {
  return (
    <div className="page-loading" role="status" aria-live="polite" aria-busy="true">
      <div className="page-loading-backdrop" aria-hidden="true">
        <div className="page-loading-blur-shell">
          <div className="page-loading-blur-nav">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="page-loading-blur-main">
            <div className="page-loading-blur-panel panel-left">
              <span />
              <span />
              <span />
              <span />
            </div>
            <div className="page-loading-blur-panel panel-center">
              <span />
              <span />
              <span />
            </div>
            <div className="page-loading-blur-panel panel-right">
              <span />
              <span />
            </div>
          </div>
          <div className="page-loading-blur-footer">
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>
      <div className="page-loading-scene">
        <div className="page-loading-brand" aria-hidden="true">
          <img className="page-loading-brand-logo" src={loadingLogoImage} alt="" />
        </div>

        <div className="page-loading-hero" aria-hidden="true">
          <span className="page-loading-star star-a">✦</span>
          <span className="page-loading-star star-b">✦</span>
          <span className="page-loading-star star-c">✦</span>
          <img className="page-loading-image" src={loadingImage} alt="" />
        </div>

        <h1 className="page-loading-title">{title}</h1>
        <p className="page-loading-subtitle">{label}</p>

        <div className="page-loading-indicator" aria-hidden="true">
          <span className="page-loading-dot dot-a" />
          <span className="page-loading-dot dot-b" />
          <span className="page-loading-dot dot-c" />
        </div>

        <p className="page-loading-note">{note}</p>
      </div>
    </div>
  );
};

export default PageLoading;
