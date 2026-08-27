export const EXPORT_STATUSES = ["queued", "generating", "ready", "failed", "deleted"] as const;
export type ExportStatus = (typeof EXPORT_STATUSES)[number];

export const EVIDENCE_PACKET_FILES = ["summary.pdf", "manifest.json", "evidence/"] as const;
