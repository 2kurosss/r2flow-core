import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ListFilter } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Table-header filter: a free-text "contains" input with suggestions drawn
 * from the values already present in the table. Clicking a suggestion pins
 * that exact value; typing filters as you go.
 *
 * The suggestion list (and the panel itself) is height-capped and scrolls,
 * so a large value set never stretches the page.
 */
export function ColumnFilter({
  label,
  value,
  suggestions = [],
  onChange,
}: {
  label: string;
  value: string;
  suggestions?: string[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Anchor the panel under the trigger. Returns false when the trigger
  // scrolled out of view (nothing sane to anchor to — then close).
  function position(): boolean {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return false;
    if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
    const width = 224;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    setPos({ top: rect.bottom + 4, left });
    return true;
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }
    // Never close on scroll/resize: on mobile the keyboard opening fires a
    // resize and scrolls the input into view — both used to kill the panel
    // the instant it appeared. Re-anchor instead; close only when the
    // trigger itself left the viewport.
    function onMove() {
      if (!position()) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
      if (window.visualViewport) window.visualViewport.removeEventListener("resize", onMove);
    };
  }, [open]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    if (position()) setOpen(true);
  }

  const active = value !== "";
  const matching = suggestions.filter((s) =>
    s.toLowerCase().includes(value.trim().toLowerCase()),
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Filter by ${label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={`Filter by ${label}`}
        onClick={toggle}
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors hover:bg-muted hover:text-foreground",
          active ? "text-primary" : "text-muted-foreground",
        )}
      >
        <ListFilter className="h-3.5 w-3.5" />
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={`Filter by ${label}`}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: 224 }}
            className="z-50 overflow-hidden rounded-lg border border-border bg-card p-1 shadow-xl"
          >
            <input
              autoFocus
              value={value}
              placeholder="Filter…"
              onChange={(e) => onChange(e.target.value)}
              className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring"
            />
            {suggestions.length > 0 && (
              <div className="mt-1 max-h-44 overflow-y-auto">
                {matching.length === 0 ? (
                  <p className="px-2.5 py-1.5 text-xs text-muted-foreground">
                    No matches
                  </p>
                ) : (
                  matching.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => {
                        onChange(suggestion);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm font-normal transition-colors hover:bg-muted",
                        value === suggestion && "text-primary",
                      )}
                    >
                      <span className="truncate">{suggestion}</span>
                      {value === suggestion && (
                        <Check className="h-3.5 w-3.5 shrink-0" />
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
            {value && (
              <button
                type="button"
                onClick={() => onChange("")}
                className="mt-1 w-full rounded-md px-2 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
