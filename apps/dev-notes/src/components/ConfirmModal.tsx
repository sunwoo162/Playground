interface Props {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({ message, onConfirm, onCancel }: Props) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <p className="modal-msg">{message}</p>
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onCancel}>취소</button>
          <button className="btn-danger" onClick={onConfirm}>삭제</button>
        </div>
      </div>
    </div>
  );
}
