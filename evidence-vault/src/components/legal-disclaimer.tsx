export function LegalDisclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <aside
      className={compact ? "legal-note legal-note--compact" : "legal-note"}
      aria-label="법률 안내"
    >
      <strong>법률 서비스가 아닙니다.</strong>
      <p>
        증빙함은 사용자가 입력한 사실과 첨부 자료를 정리하는 도구입니다. 개별 사건에 대한 법률 판단,
        법률상담 또는 법률대리를 제공하지 않습니다.
      </p>
    </aside>
  );
}
