import React from 'react';
import { useUi } from '../theme';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  isAlert?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({ isOpen, onClose, onConfirm, title, message, isAlert = false }) => {
  const ui = useUi();
  if (!isOpen) return null;

  return (
    <div className="mback top-most" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className={`${ui.box} sm`}>
        <div className="mhead">
          <h2 id="confirm-title">{title}</h2>
        </div>
        <div className="mbody">
          <p className="msg">{message}</p>
          <div className="mfoot">
            {!isAlert && (
              <button type="button" className={ui.btn} onClick={onClose}>取消</button>
            )}
            <button
              type="button"
              className={ui.btnConfirm}
              autoFocus
              onClick={() => {
                // 先關再執行：onConfirm 可能會開啟下一個對話框
                onClose();
                onConfirm();
              }}
            >
              確定
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
