/**
 * Mozilla PDF.js official viewer — phone + desktop.
 * Prefer authenticated API URL (CORS-enabled) over blob: (more reliable in iframe).
 */
import { API_URL } from '../../shared/api';
import { useAuthStore } from '../auth/store';

type Props = {
  /** Same-origin blob URL (fallback) */
  fileUrl: string;
  /** Drive file id for authenticated fetch */
  driveFileId?: string;
  className?: string;
};

export default function MozillaPdfEmbed({ fileUrl, driveFileId, className = '' }: Props) {
  const token = useAuthStore((s) => s.accessToken) || '';
  const remote =
    driveFileId && token
      ? `${API_URL}/drive/download/${encodeURIComponent(driveFileId)}?token=${encodeURIComponent(token)}`
      : fileUrl;

  const src =
    `/pdfjs/web/viewer.html?file=${encodeURIComponent(remote)}#zoom=page-width`;

  return (
    <iframe
      title="PDF document"
      src={src}
      className={`w-full h-full border-0 bg-[#525659] ${className}`}
      allow="fullscreen"
    />
  );
}
