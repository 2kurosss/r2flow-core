import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Centered modal rendered into a portal on document.body.
 *
 * A portal is required (not just position:fixed): page roots use the
 * `animate-enter` animation whose `transform` would otherwise make the
 * modal position itself against the page content instead of the viewport.
 *
 * The backdrop is intentionally transparent — the card's shadow separates
 * it from the table; clicking outside or pressing Escape closes it.
 */
export function Modal({
  title,
  onClose,
  children,
  width = "32rem",
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width }}
        className="max-h-[85vh] max-w-full overflow-y-auto rounded-xl bg-card shadow-2xl ring-1 ring-foreground/15"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-bold tracking-tight">{title}</span>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
