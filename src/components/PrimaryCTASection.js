import React from 'react';
import { Link } from 'react-router-dom';

const PrimaryCTASection = ({
  primaryLabel,
  primaryHref,
  onPrimaryClick,
  secondaryLabel,
  onSecondaryClick,
}) => {
  const PrimaryElement = primaryHref ? Link : 'button';
  const primaryProps = primaryHref
    ? { to: primaryHref }
    : { type: 'button' };

  return (
    <section className="dashboard-cta">
      <div className="dashboard-cta-card">
        {/* Single primary action reduces decision fatigue for new users. */}
        <PrimaryElement
          className="primary-cta-btn"
          onClick={onPrimaryClick}
          {...primaryProps}
        >
          {primaryLabel}
        </PrimaryElement>
        {secondaryLabel && (
          <button
            type="button"
            className="secondary-cta-btn"
            onClick={onSecondaryClick}
          >
            {secondaryLabel}
          </button>
        )}
      </div>
    </section>
  );
};

export default PrimaryCTASection;
