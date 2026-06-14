interface ConfirmModalProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({ message, onConfirm, onCancel }: ConfirmModalProps) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <p className="modal-message">{message}</p>
        <div className="modal-actions">
          <button className="btn-modal-cancel" onClick={onCancel}>취소</button>
          <button className="btn-modal-confirm" onClick={onConfirm}>삭제</button>
        </div>
      </div>
    </div>
  );
}
