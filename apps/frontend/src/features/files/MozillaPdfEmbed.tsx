/**
 * Mozilla PDF.js official viewer (full zoom/pan/scroll) — phone + desktop.
 * Hosted same-origin under /pdfjs/web/viewer.html
 */
type Props = {
  /** Same-origin blob: URL of the PDF */
  fileUrl: string;
  className?: string;
};

export default function MozillaPdfEmbed({ fileUrl, className = '' }: Props) {
  // page-width = readable full stage; viewer handles zoom/pan/scroll itself
  const src =
    `/pdfjs/web/viewer.html?file=${encodeURIComponent(fileUrl)}#zoom=page-width`;

  return (
    <iframe
      title="PDF document"
      src={src}
      className={`w-full h-full border-0 bg-[#525659] ${className}`}
      // allow clipboard/download inside viewer
      allow="fullscreen"
    />
  );
}
