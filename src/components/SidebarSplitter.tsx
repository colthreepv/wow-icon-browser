import { useEffect, useRef, useState } from "react";

export const MIN_SIDEBAR_WIDTH = 200;
export const DEFAULT_SIDEBAR_WIDTH = 240;

export function SidebarSplitter({
  value,
  max,
  onChange,
}: {
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const drag = useRef<{
    x: number;
    width: number;
    cursor: string;
    select: string;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const clamp = (width: number) =>
    Math.round(Math.max(MIN_SIDEBAR_WIDTH, Math.min(max, width)));
  function finish() {
    if (!drag.current) return;
    document.body.style.cursor = drag.current.cursor;
    document.body.style.userSelect = drag.current.select;
    drag.current = null;
    setDragging(false);
  }
  useEffect(
    () => () => {
      if (!drag.current) return;
      document.body.style.cursor = drag.current.cursor;
      document.body.style.userSelect = drag.current.select;
    },
    [],
  );
  return (
    <>
      <div
        className={`sidebar-splitter ${dragging ? "dragging" : ""}`}
        role="separator"
        tabIndex={0}
        aria-label="Resize category sidebar"
        aria-orientation="vertical"
        aria-controls="category-sidebar"
        aria-valuemin={MIN_SIDEBAR_WIDTH}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${value} pixels`}
        aria-describedby="sidebar-resize-help"
        title="Drag to resize. Double-click to reset."
        onPointerDown={(event) => {
          if (event.button !== 0 || !event.isPrimary) return;
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            x: event.clientX,
            width: value,
            cursor: document.body.style.cursor,
            select: document.body.style.userSelect,
          };
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
          setDragging(true);
        }}
        onPointerMove={(event) => {
          if (drag.current)
            onChange(
              clamp(drag.current.width + event.clientX - drag.current.x),
            );
        }}
        onPointerUp={(event) => {
          finish();
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={finish}
        onLostPointerCapture={finish}
        onDoubleClick={() => onChange(clamp(DEFAULT_SIDEBAR_WIDTH))}
        onKeyDown={(event) => {
          if (event.altKey || event.metaKey || event.ctrlKey) return;
          const step = event.shiftKey ? 40 : 10;
          const next =
            event.key === "ArrowLeft"
              ? value - step
              : event.key === "ArrowRight"
                ? value + step
                : event.key === "Home"
                  ? MIN_SIDEBAR_WIDTH
                  : event.key === "End"
                    ? max
                    : null;
          if (next !== null) {
            event.preventDefault();
            onChange(clamp(next));
          }
        }}
      />
      <span id="sidebar-resize-help" className="sr-only">
        Drag or use the left and right arrow keys to resize the category
        sidebar. Home and End set the minimum and maximum width. Double-click to
        reset.
      </span>
    </>
  );
}
