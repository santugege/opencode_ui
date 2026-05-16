import { FileText, Image, Table2, Video } from "lucide-react";
import type { FileAttachmentView } from "../types";

const statusLabel = {
  ready: "Ready",
  uploading: "Uploading",
  error: "Error",
} satisfies Record<FileAttachmentView["status"], string>;

export function FileCard({ file }: { file: FileAttachmentView }) {
  const Icon = iconForKind(file.kind);
  const progress = Math.max(0, Math.min(100, file.progress ?? 0));
  const label =
    file.status === "uploading" ? `Uploading ${progress}%` : statusLabel[file.status];

  return (
    <article className="file-card" aria-label={`${file.name} ${label}`}>
      <span className="file-card__icon" aria-hidden="true">
        <Icon size={18} strokeWidth={1.8} />
      </span>
      <span className="file-card__body">
        <span className="file-card__name">{file.name}</span>
        <span className="file-card__meta">{file.sizeLabel}</span>
        {file.status === "uploading" ? (
          <span className="file-card__progress" aria-hidden="true">
            <span style={{ width: `${progress}%` }} />
          </span>
        ) : null}
      </span>
      <span className={`file-card__status file-card__status--${file.status}`}>
        {label}
      </span>
    </article>
  );
}

function iconForKind(kind: FileAttachmentView["kind"]) {
  if (kind === "image") {
    return Image;
  }
  if (kind === "video") {
    return Video;
  }
  if (kind === "spreadsheet") {
    return Table2;
  }
  return FileText;
}
