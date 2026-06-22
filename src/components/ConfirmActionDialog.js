import React from 'react';

const ConfirmActionDialog = ({
  open = false,
  title = 'ยืนยันการดำเนินการ',
  message = '',
  confirmText = 'ตกลง',
  cancelText = 'ยกเลิก',
  onConfirm,
  onClose,
}) => {
  if (!open) return null;

  return (
    <div className="quiz-dialog-overlay" onClick={onClose}>
      <div
        className="quiz-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-action-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="confirm-action-dialog-title">{title}</h3>
        <p className="quiz-dialog-message">{message}</p>
        <div className="quiz-dialog-actions">
          <button
            type="button"
            className="quiz-dialog-btn secondary"
            onClick={onClose}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className="quiz-dialog-btn primary"
            onClick={onConfirm}
            autoFocus
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmActionDialog;
