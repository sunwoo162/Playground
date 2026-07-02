interface Props {
  step: 1 | 2;
  onConfirmStep1: () => void;
  onConfirmStep2: () => void;
  onCancel: () => void;
}

export function StopModal({ step, onConfirmStep1, onConfirmStep2, onCancel }: Props) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        {step === 1 ? (
          <>
            <p className="modal-emoji">⏸️</p>
            <p className="modal-title">오늘 공부는 여기서 끝인가요?</p>
            <div className="modal-actions">
              <button className="modal-btn-yes" onClick={onConfirmStep1}>네</button>
              <button className="modal-btn-no" onClick={onCancel}>아니요</button>
            </div>
          </>
        ) : (
          <>
            <p className="modal-emoji">📝</p>
            <p className="modal-title">오늘 공부한 내용을 한번 정리해 보아요</p>
            <div className="modal-actions">
              <a href="/apps/cornell-notes/" className="modal-btn-yes">코넬 노트 바로가기 →</a>
              <button className="modal-btn-no" onClick={onCancel}>아니요</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
