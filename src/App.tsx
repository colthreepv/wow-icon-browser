import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Check,
  ChevronRight,
  Clock3,
  Copy,
  Grid2X2,
  ImageOff,
  Search,
  SlidersHorizontal,
  Star,
  X,
  RotateCcw,
  Command,
  LoaderCircle,
} from "lucide-react";
import {
  assetUrl,
  loadCatalog,
  type Catalog,
  type Icon,
  type Atlas,
} from "./lib/catalog";
import { searchIcons } from "./lib/search";
import { makeMacroCommand } from "./lib/macro";
import {
  ancestors,
  countHierarchy,
  createBrowseGroups,
  withinGroup,
} from "./lib/groups";
import { CategoryTree } from "./components/CategoryTree";
import {
  DEFAULT_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  SidebarSplitter,
} from "./components/SidebarSplitter";

const format = (value: number) => value.toLocaleString("en-US");
type Route = {
  q: string;
  cat: string;
  group: string;
  icon: string;
  view: string;
};
const readRoute = (): Route => {
  const p = new URLSearchParams(location.search);
  return {
    q: p.get("q") ?? "",
    cat: p.get("cat") ?? "",
    group: p.get("group") ?? "",
    icon: p.get("icon") ?? "",
    view: p.get("view") ?? "",
  };
};
function useRoute() {
  const [route, setRoute] = useState(readRoute);
  const current = useRef(route);
  current.current = route;
  useEffect(() => {
    const pop = () => setRoute(readRoute());
    addEventListener("popstate", pop);
    return () => removeEventListener("popstate", pop);
  }, []);
  const update = useCallback((patch: Partial<Route>, replace = false) => {
    const next = { ...current.current, ...patch };
    current.current = next;
    const url = new URL(location.href);
    for (const [key, value] of Object.entries(next))
      value ? url.searchParams.set(key, value) : url.searchParams.delete(key);
    if (url.href !== location.href)
      history[replace ? "replaceState" : "pushState"]({}, "", url);
    setRoute(next);
  }, []);
  return [route, update] as const;
}
function useStored<T>(
  key: string,
  initial: T,
  valid: (value: unknown) => value is T,
) {
  const [persistent, setPersistent] = useState(true);
  const [value, setValue] = useState<T>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(`wib:${key}`) ?? "null");
      return valid(v) ? v : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(`wib:${key}`, JSON.stringify(value));
    } catch {
      setPersistent(false);
    }
  }, [key, value]);
  return [value, setValue, persistent] as const;
}
const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");
const text = (v: unknown): v is string => typeof v === "string";
const boolean = (v: unknown): v is boolean => typeof v === "boolean";
function useMobile() {
  const [mobile, set] = useState(
    () => matchMedia("(max-width: 760px)").matches,
  );
  useEffect(() => {
    const m = matchMedia("(max-width: 760px)");
    const change = () => set(m.matches);
    m.addEventListener("change", change);
    return () => m.removeEventListener("change", change);
  }, []);
  return mobile;
}

function Sprite({
  icon,
  atlas,
  size,
  preview = false,
}: {
  icon: Icon;
  atlas: Atlas;
  size: number;
  preview?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const scale = size / atlas.cellSize;
  useEffect(() => setFailed(false), [atlas.file]);
  return (
    <span
      className={`sprite ${preview ? "sprite-preview" : ""}`}
      role="img"
      aria-label={`${icon.name}${failed ? " (image unavailable)" : ""}`}
      style={{ width: size, height: size }}
    >
      {failed ? (
        <ImageOff size={Math.min(size / 2, 32)} />
      ) : (
        <img
          alt=""
          draggable={false}
          decoding="async"
          src={assetUrl(atlas.file)}
          onError={() => setFailed(true)}
          style={{
            width: atlas.width * scale,
            height: atlas.height * scale,
            left: -(icon.cell % atlas.columns) * size,
            top: -Math.floor(icon.cell / atlas.columns) * size,
          }}
        />
      )}
    </span>
  );
}

function CopyField({
  label,
  value,
  action,
  disabled = false,
  onCopy,
}: {
  label: string;
  value: string;
  action: string;
  disabled?: boolean;
  onCopy: () => void;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    setStatus("idle");
  }, [value]);
  useEffect(() => {
    if (status === "idle") return;
    const timer = setTimeout(() => setStatus("idle"), 4000);
    return () => clearTimeout(timer);
  }, [status]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
      onCopy();
    } catch {
      setStatus("failed");
      field.current?.focus();
      field.current?.select();
    }
  }
  return (
    <div className="copy-field">
      <div className="field-heading">
        <label htmlFor={`copy-${label.replaceAll(" ", "-")}`}>{label}</label>
        <button
          className={
            status === "copied" ? "copy-action success" : "copy-action"
          }
          onClick={copy}
          disabled={disabled}
          aria-label={action}
        >
          {status === "copied" ? <Check size={14} /> : <Copy size={14} />}{" "}
          {status === "copied" ? "Copied" : action}
        </button>
      </div>
      <textarea
        id={`copy-${label.replaceAll(" ", "-")}`}
        ref={field}
        readOnly
        rows={label === "EditMacro command" ? 4 : 2}
        value={value}
        spellCheck={false}
      />
      <span
        role="status"
        className={status === "failed" ? "copy-error" : "sr-only"}
      >
        {status === "failed"
          ? "Clipboard unavailable. Text selected — press Ctrl+C to copy."
          : status === "copied"
            ? "Copied to clipboard."
            : ""}
      </span>
    </div>
  );
}

function FocusTile({
  onFocusLost,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { onFocusLost: () => void }) {
  const button = useRef<HTMLButtonElement>(null);
  const fallback = useRef(onFocusLost);
  fallback.current = onFocusLost;
  useLayoutEffect(
    () => () => {
      if (button.current === document.activeElement) fallback.current();
    },
    [],
  );
  return <button ref={button} {...props} />;
}

type Section = { id: string; label: string; category: string; icons: Icon[] };
type Row =
  | { type: "heading"; section: Section }
  | { type: "icons"; icons: Icon[]; start: number };
function IconGrid({
  sections,
  catalog,
  size,
  names,
  selected,
  onSelect,
  resetKey,
}: {
  sections: Section[];
  catalog: Catalog;
  size: number;
  names: boolean;
  selected: string;
  onSelect: (icon: Icon, replace?: boolean) => void;
  resetKey: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<number | null>(null);
  const [width, setWidth] = useState(700);
  const [active, setActive] = useState("");
  useEffect(() => {
    const el = scroller.current!;
    const observer = new ResizeObserver(([entry]) => {
      const focused = document.activeElement as HTMLElement | null;
      const id = focused?.dataset.iconId;
      pendingFocus.current =
        focused && el.contains(focused) && id ? Number(id) : null;
      setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const columns = Math.max(
    1,
    Math.floor((width - 32) / (names ? Math.max(136, size + 20) : size + 20)),
  );
  const rowHeight = size + (names ? 44 : 24);
  const { rows, flat, rowById } = useMemo(() => {
    const rows: Row[] = [];
    const flat: Icon[] = [];
    const rowById = new Map<number, number>();
    for (const section of sections) {
      rows.push({ type: "heading", section });
      for (let i = 0; i < section.icons.length; i += columns) {
        const icons = section.icons.slice(i, i + columns);
        const start = flat.length;
        icons.forEach((icon) => rowById.set(icon.id, rows.length));
        flat.push(...icons);
        rows.push({ type: "icons", icons, start });
      }
    }
    return { rows, flat, rowById };
  }, [sections, columns]);
  const virtual = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: (index) => (rows[index]?.type === "heading" ? 46 : rowHeight),
    overscan: 3,
  });
  useLayoutEffect(() => {
    const id = pendingFocus.current;
    if (id === null) return;
    pendingFocus.current = null;
    const row = rowById.get(id);
    if (row === undefined) return;
    virtual.scrollToIndex(row, { align: "auto" });
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        scroller.current
          ?.querySelector<HTMLButtonElement>(`[data-icon-id="${id}"]`)
          ?.focus({ preventScroll: true }),
      ),
    );
    return () => cancelAnimationFrame(frame);
  }, [columns, rowById, virtual]);
  useEffect(() => {
    virtual.measure();
  }, [rowHeight, columns, virtual]);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
    setActive("");
  }, [resetKey]);
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (
      ![
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
      ].includes(event.key) ||
      event.altKey ||
      event.metaKey
    )
      return;
    event.preventDefault();
    const button = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-flat]",
    );
    const index = button
      ? Number(button.dataset.flat)
      : Math.max(
          0,
          flat.findIndex((i) => i.name === active),
        );
    const next = Math.max(
      0,
      Math.min(
        flat.length - 1,
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? flat.length - 1
            : index +
              ({
                ArrowLeft: -1,
                ArrowRight: 1,
                ArrowUp: -columns,
                ArrowDown: columns,
              }[event.key] ?? 0),
      ),
    );
    const icon = flat[next];
    if (!icon) return;
    setActive(icon.name);
    onSelect(icon, true);
    virtual.scrollToIndex(rowById.get(icon.id)!, { align: "auto" });
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        scroller.current
          ?.querySelector<HTMLButtonElement>(`[data-icon-id="${icon.id}"]`)
          ?.focus(),
      ),
    );
  }
  return (
    <div
      className="icon-grid"
      data-testid="icon-grid"
      ref={scroller}
      role="region"
      aria-label="Icon results"
      tabIndex={0}
      onKeyDown={navigate}
      onScrollCapture={() => {
        const el = scroller.current;
        const focused = document.activeElement as HTMLElement | null;
        if (!el || !focused?.dataset.iconId || !el.contains(focused)) return;
        const tile = focused.getBoundingClientRect();
        const viewport = el.getBoundingClientRect();
        if (tile.bottom < viewport.top || tile.top > viewport.bottom)
          el.focus({ preventScroll: true });
      }}
    >
      <div style={{ height: virtual.getTotalSize(), position: "relative" }}>
        {virtual.getVirtualItems().map((item) => {
          const row = rows[item.index];
          return (
            <div
              key={item.key}
              style={{
                position: "absolute",
                top: 0,
                left: 16,
                right: 16,
                height: item.size,
                transform: `translateY(${item.start}px)`,
              }}
            >
              {row.type === "heading" ? (
                <div className="group-heading">
                  <h2>
                    <span>{row.section.category}</span>
                    {row.section.label}
                  </h2>
                  <span>{format(row.section.icons.length)}</span>
                </div>
              ) : (
                <div
                  className="icon-row"
                  style={{
                    gridTemplateColumns: `repeat(${columns},minmax(0,1fr))`,
                  }}
                >
                  {row.icons.map((icon, i) => (
                    <FocusTile
                      key={icon.id}
                      onFocusLost={() =>
                        scroller.current?.focus({ preventScroll: true })
                      }
                      data-testid="icon-tile"
                      data-icon-id={icon.id}
                      data-flat={row.start + i}
                      className={`icon-tile ${selected === icon.name ? "selected" : ""} ${names ? "with-name" : ""}`}
                      aria-label={icon.name}
                      aria-pressed={selected === icon.name}
                      title={icon.filename}
                      tabIndex={
                        (active ? active === icon.name : row.start + i === 0)
                          ? 0
                          : -1
                      }
                      onClick={() => {
                        setActive(icon.name);
                        onSelect(icon);
                      }}
                    >
                      <Sprite
                        icon={icon}
                        atlas={catalog.atlases[icon.atlas]}
                        size={size}
                      />
                      {names && <span className="tile-name">{icon.name}</span>}
                    </FocusTile>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DialogShell({
  open,
  label,
  children,
  onClose,
  side,
}: {
  open: boolean;
  label: string;
  children: ReactNode;
  onClose: () => void;
  side: "left" | "right";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const el = ref.current!;
    el.querySelector<HTMLElement>("button,input,textarea")?.focus();
    function key(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
      }
      if (event.key === "Tab") {
        const controls = Array.from(
          el.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input,textarea,[tabindex="0"]',
          ),
        ).filter((e) => e.offsetParent !== null);
        const first = controls[0],
          last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    el.addEventListener("keydown", key);
    return () => {
      el.removeEventListener("keydown", key);
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="drawer-layer">
      <button
        className="drawer-backdrop"
        aria-label={`Close ${label}`}
        onClick={onClose}
        tabIndex={-1}
      />
      <div
        ref={ref}
        className={`drawer drawer-${side}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {children}
      </div>
    </div>
  );
}

function Browser({ catalog }: { catalog: Catalog }) {
  const [route, update] = useRoute();
  const mobile = useMobile();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [size, setSize, sizePersistent] = useStored(
    "size",
    56,
    (v): v is number =>
      typeof v === "number" && [32, 40, 48, 56, 64, 80].includes(v),
  );
  const [names, setNames, namesPersistent] = useStored("names", false, boolean);
  const [favorites, setFavorites, favoritesPersistent] = useStored(
    "favorites",
    [] as string[],
    strings,
  );
  const [recents, setRecents, recentsPersistent] = useStored(
    "recents",
    [] as string[],
    strings,
  );
  const [macroName, setMacroName, macroPersistent] = useStored(
    "macroName",
    "",
    text,
  );
  const storageAvailable =
    sizePersistent &&
    namesPersistent &&
    favoritesPersistent &&
    recentsPersistent &&
    macroPersistent;
  const [expanded, setExpanded, expandedPersistent] = useStored(
    "expandedCategories",
    ["Classes"],
    strings,
  );
  const [sidebarWidth, setSidebarWidth, sidebarPersistent] = useStored(
    "sidebarWidth",
    DEFAULT_SIDEBAR_WIDTH,
    (value): value is number =>
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= MIN_SIDEBAR_WIDTH &&
      value <= 520,
  );
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  useEffect(() => {
    const resize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const inspectorWidth =
    viewportWidth >= 1600 ? 350 : viewportWidth <= 1250 ? 304 : 326;
  const maxSidebarWidth = Math.max(
    MIN_SIDEBAR_WIDTH,
    Math.min(
      520,
      Math.floor(viewportWidth * 0.4),
      viewportWidth - inspectorWidth - 388,
    ),
  );
  const visibleSidebarWidth = Math.min(sidebarWidth, maxSidebarWidth);
  const browse = useMemo(() => createBrowseGroups(catalog), [catalog]);
  const browseGroupMap = useMemo(
    () => new Map(browse.groups.map((group) => [group.id, group])),
    [browse],
  );
  useEffect(() => {
    const selectedPath =
      (browse.paths.get(route.group) ?? route.group) || route.cat;
    const branches = ancestors(selectedPath);
    if (branches.length)
      setExpanded((old) => [...new Set([...old, ...branches])]);
  }, [route.group, route.cat, browse, setExpanded]);
  const input = useRef<HTMLInputElement>(null);
  const query = useDeferredValue(route.q);
  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
  const matches = useMemo(
    () => searchIcons(catalog.icons, query),
    [catalog, query],
  );
  const scoped = useMemo(
    () =>
      route.view === "favorites"
        ? matches.filter((i) => favoriteSet.has(i.name))
        : route.view === "recent"
          ? matches
              .filter((i) => recents.includes(i.name))
              .sort((a, b) => recents.indexOf(a.name) - recents.indexOf(b.name))
          : matches,
    [matches, route.view, favoriteSet, recents],
  );
  const groupMap = useMemo(
    () => new Map(catalog.groups.map((g) => [g.id, g])),
    [catalog],
  );
  const counts = useMemo(
    () => countHierarchy(scoped, browse.ancestry),
    [scoped, browse],
  );
  const filtered = useMemo(
    () =>
      scoped.filter((icon) =>
        icon.groups.some(
          (id) =>
            (!route.cat || groupMap.get(id)?.category === route.cat) &&
            (!route.group ||
              withinGroup(id, route.group) ||
              withinGroup(browse.paths.get(id)!, route.group)),
        ),
      ),
    [scoped, route.cat, route.group, groupMap, browse],
  );
  const sections = useMemo(() => {
    const sections = new Map<string, Section>();
    for (const icon of filtered) {
      const sourceId = icon.groups.find(
        (id) =>
          (!route.cat || groupMap.get(id)?.category === route.cat) &&
          (!route.group ||
            withinGroup(id, route.group) ||
            withinGroup(browse.paths.get(id)!, route.group)),
      )!;
      const id = browse.paths.get(sourceId)!;
      let section = sections.get(id);
      if (!section) {
        const g = browseGroupMap.get(id)!;
        section = { id, label: g.label, category: g.category, icons: [] };
        sections.set(id, section);
      }
      section.icons.push(icon);
    }
    return [...sections.values()];
  }, [filtered, groupMap, route.cat, route.group, browse, browseGroupMap]);
  const selected = useMemo(
    () => catalog.icons.find((i) => i.name === route.icon) ?? null,
    [catalog, route.icon],
  );
  const closeDetail = useCallback(() => {
    const id = selected?.id;
    update({ icon: "" });
    requestAnimationFrame(() => {
      const tile =
        id === undefined
          ? null
          : document.querySelector<HTMLButtonElement>(`[data-icon-id="${id}"]`);
      (
        tile ?? document.querySelector<HTMLElement>('[data-testid="icon-grid"]')
      )?.focus({ preventScroll: true });
    });
  }, [update, selected]);
  useEffect(() => {
    const listener = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const editing =
        target.matches("input,textarea,select") || target.isContentEditable;
      if (event.key === "/" && !editing && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        input.current?.focus();
      }
      if (event.key === "Escape") {
        if (filtersOpen) setFiltersOpen(false);
        else if (selected) closeDetail();
      }
    };
    addEventListener("keydown", listener);
    return () => removeEventListener("keydown", listener);
  }, [filtersOpen, selected, closeDetail]);
  const select = useCallback(
    (icon: Icon, replace = false) => {
      update({ icon: icon.name }, replace);
      setRecents((old) =>
        [icon.name, ...old.filter((n) => n !== icon.name)].slice(0, 32),
      );
    },
    [update, setRecents],
  );
  const recordCopy = () => {
    if (selected)
      setRecents((old) =>
        [selected.name, ...old.filter((n) => n !== selected.name)].slice(0, 32),
      );
  };
  function choose(patch: Partial<Route>) {
    update(patch);
    setFiltersOpen(false);
  }
  const rail = (
    <>
      <div className="rail-top">
        <span>Library</span>
        <button
          className="icon-button filters-close"
          aria-label="Close categories"
          onClick={() => setFiltersOpen(false)}
        >
          <X size={18} />
        </button>
      </div>
      <nav aria-label="Library views" className="views">
        <button
          className={!route.view && !route.cat ? "active" : ""}
          onClick={() => choose({ view: "", cat: "", group: "" })}
        >
          <Grid2X2 size={17} />
          All icons<span>{format(matches.length)}</span>
        </button>
        <button
          className={route.view === "favorites" ? "active" : ""}
          onClick={() => choose({ view: "favorites", cat: "", group: "" })}
        >
          <Star size={17} />
          Favorites
          <span>
            {format(matches.filter((i) => favoriteSet.has(i.name)).length)}
          </span>
        </button>
        <button
          className={route.view === "recent" ? "active" : ""}
          onClick={() => choose({ view: "recent", cat: "", group: "" })}
        >
          <Clock3 size={17} />
          Recent
          <span>
            {format(matches.filter((i) => recents.includes(i.name)).length)}
          </span>
        </button>
      </nav>
      <div className="rail-section-label">Categories</div>
      <p className="browse-hint">Curated themes and original folders</p>
      <nav aria-label="Categories" className="categories">
        <CategoryTree
          nodes={browse.tree}
          counts={counts}
          expanded={expanded}
          selected={(browse.paths.get(route.group) ?? route.group) || route.cat}
          onToggle={(id) =>
            setExpanded((old) =>
              old.includes(id)
                ? old.filter((value) => value !== id)
                : [...old, id],
            )
          }
          onSelect={(node) => {
            choose({
              cat: node.category,
              group: node.id === node.category ? "" : node.id,
            });
            if (node.children.length)
              setExpanded((old) => [...new Set([...old, node.id])]);
          }}
        />
      </nav>
      <div className="rail-footer">
        <span>
          {format(catalog.source.uniqueIconCount)} icons, fully searchable.
        </span>
        <span>
          {storageAvailable && expandedPersistent && sidebarPersistent
            ? "Favorites stay on this device."
            : "Browser storage unavailable. Preferences last for this visit."}
        </span>
        <span>Artwork © Blizzard Entertainment</span>
      </div>
    </>
  );
  const inspector = selected ? (
    <>
      <div className="inspector-heading">
        <span>Selected icon</span>
        <button
          className="icon-button"
          aria-label="Close detail"
          onClick={closeDetail}
        >
          <X size={18} />
        </button>
      </div>
      <div className="inspector-content">
        <div className="preview-row">
          <div className="preview-well">
            <Sprite
              icon={selected}
              atlas={catalog.atlases[selected.atlas]}
              size={112}
              preview
            />
          </div>
          <button
            className={`favorite-button ${favoriteSet.has(selected.name) ? "is-favorite" : ""}`}
            aria-label={
              favoriteSet.has(selected.name)
                ? "Remove from favorites"
                : "Add to favorites"
            }
            aria-pressed={favoriteSet.has(selected.name)}
            onClick={() =>
              setFavorites((old) =>
                old.includes(selected.name)
                  ? old.filter((n) => n !== selected.name)
                  : [...old, selected.name],
              )
            }
          >
            <Star
              size={20}
              fill={favoriteSet.has(selected.name) ? "currentColor" : "none"}
            />
          </button>
        </div>
        <p className="preview-caption">56 px source tile · enlarged preview</p>
        <h2 className="selected-name">{selected.name}</h2>
        {!filtered.some((i) => i.id === selected.id) && (
          <p className="context-note">Outside your current results</p>
        )}
        <p className="original-folder-label">
          Original folder{selected.groups.length === 1 ? "" : "s"}
        </p>
        <div className="category-tags">
          {selected.groups.map((id) => (
            <button
              key={id}
              onClick={() => {
                choose({ cat: groupMap.get(id)!.category, group: id });
                if (mobile) closeDetail();
              }}
            >
              {groupMap.get(id)!.category}
              <ChevronRight size={12} />
              {groupMap.get(id)!.label}
            </button>
          ))}
        </div>
        <section className="macro-section">
          <h3>Use in your macro</h3>
          <label className="macro-label" htmlFor="macro-name">
            Existing macro name
          </label>
          <input
            id="macro-name"
            placeholder="e.g. UI"
            value={macroName}
            onChange={(e) => setMacroName(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <CopyField
            label="EditMacro command"
            action="Copy command"
            value={makeMacroCommand(macroName, selected.texturePath)}
            disabled={!macroName.trim()}
            onCopy={recordCopy}
          />
          <p className="field-hint">
            Paste and run in-game to update that macro’s icon.
          </p>
        </section>
        <CopyField
          label="Filename"
          action="Copy filename"
          value={selected.filename}
          onCopy={recordCopy}
        />
        <CopyField
          label="Texture path"
          action="Copy texture path"
          value={selected.texturePath}
          onCopy={recordCopy}
        />
        <section className="usage-section">
          <h3>
            Used by <span>{format(selected.usage.length)}</span>
          </h3>
          {selected.usage.length ? (
            <>
              <ul>
                {selected.usage.slice(0, 20).map((u) => (
                  <li key={`${u.kind}-${u.id}`}>
                    <span className="usage-kind">{u.kind}</span>
                    <span>{u.name}</span>
                  </li>
                ))}
              </ul>
              {selected.usage.length > 20 && (
                <p className="field-hint">
                  First 20 of {format(selected.usage.length)} associations. All
                  imported names are searchable.
                </p>
              )}
            </>
          ) : (
            <p className="field-hint">
              No usage data imported for this icon. This does not mean it is
              unused.
            </p>
          )}
          <p className="coverage-note">
            Partial usage coverage: {format(catalog.usageCoverage.icons)} of{" "}
            {format(catalog.icons.length)} icons.
          </p>
        </section>
        <p className="compatibility-note">
          Mixed WoW catalog, including Retail. Preview and usage data do not
          verify availability in your Forever client.
        </p>
      </div>
    </>
  ) : (
    <div className="inspector-empty">
      <div className="empty-icon">
        <Command size={30} />
      </div>
      <h2>
        A better icon for
        <br />
        your next macro.
      </h2>
      <p>
        Select an icon to inspect its filename, preview it, and copy a command
        for your macro.
      </p>
      <div className="shortcut-list">
        <span>
          <kbd>/</kbd> Search the catalog
        </span>
        <span>
          <kbd>← ↑ ↓ →</kbd> Explore icons
        </span>
        <span>
          <kbd>Esc</kbd> Close detail
        </span>
      </div>
      <p className="empty-footnote">
        Everything runs in your browser.
        <br />
        No account. No tracking scripts.
      </p>
    </div>
  );
  return (
    <div className="app-shell">
      <div
        className="base-surface"
        inert={filtersOpen || (mobile && !!selected) ? true : undefined}
      >
        <header className="topbar">
          <div className="brand">
            <div className="brand-mark">
              <Grid2X2 size={21} />
            </div>
            <div>
              <h1>WoW Icon Browser</h1>
              <span>Your next macro starts here.</span>
            </div>
          </div>
          <div className="search-wrap">
            <Search size={19} />
            <input
              ref={input}
              type="search"
              aria-label="Search icons"
              placeholder="Search icons, items or spells…"
              value={route.q}
              onChange={(e) => update({ q: e.target.value }, true)}
            />
            <kbd>/</kbd>
          </div>
          <span className="local-label">Local favorites. Entire catalog.</span>
        </header>
        <div
          className="workspace"
          style={
            { "--sidebar-width": `${visibleSidebarWidth}px` } as CSSProperties
          }
        >
          <aside
            className="rail"
            id="category-sidebar"
            aria-label="Category sidebar"
          >
            {rail}
          </aside>
          <SidebarSplitter
            value={visibleSidebarWidth}
            max={maxSidebarWidth}
            onChange={setSidebarWidth}
          />
          <main className="gallery">
            <div className="gallery-toolbar">
              <div className="results-summary">
                <button
                  className="icon-button filter-toggle"
                  aria-label="Open categories"
                  onClick={() => setFiltersOpen(true)}
                >
                  <SlidersHorizontal size={18} />
                </button>
                <span data-testid="result-count">
                  <strong>{format(filtered.length)}</strong>{" "}
                  {filtered.length === 1 ? "icon" : "icons"}
                </span>
                {(route.cat || route.view) && (
                  <button
                    className="scope-chip"
                    onClick={() => update({ cat: "", group: "", view: "" })}
                  >
                    {route.group
                      ? (browseGroupMap.get(route.group)?.label ??
                        groupMap.get(route.group)?.label ??
                        route.group.split("/").slice(1).join(" / "))
                      : route.cat || route.view}
                    <X size={12} />
                  </button>
                )}
              </div>
              <div className="display-controls">
                <label className="names-toggle">
                  <input
                    type="checkbox"
                    checked={names}
                    onChange={(e) => setNames(e.target.checked)}
                  />
                  Show names
                </label>
                <div className="size-control">
                  <label htmlFor="icon-size">Size</label>
                  <input
                    id="icon-size"
                    type="range"
                    min={0}
                    max={5}
                    step={1}
                    value={[32, 40, 48, 56, 64, 80].indexOf(size)}
                    onChange={(e) =>
                      setSize([32, 40, 48, 56, 64, 80][Number(e.target.value)])
                    }
                  />
                  <span>{size}</span>
                </div>
              </div>
            </div>
            {filtered.length ? (
              <IconGrid
                sections={sections}
                catalog={catalog}
                size={size}
                names={names}
                selected={route.icon}
                onSelect={select}
                resetKey={`${query}|${route.cat}|${route.group}|${route.view}`}
              />
            ) : (
              <div className="empty-results">
                <Search size={32} />
                <h2>No icons found</h2>
                <p>
                  {route.view === "favorites" && !favorites.length
                    ? "Star an icon to save it here."
                    : route.view === "recent" && !recents.length
                      ? "Your selected icons will appear here."
                      : "Try fewer words or a different category."}
                </p>
                <button
                  onClick={() =>
                    update({ q: "", cat: "", group: "", view: "" })
                  }
                >
                  <RotateCcw size={15} />
                  Reset search and filters
                </button>
              </div>
            )}
            <footer className="gallery-footer">
              <span>
                {query
                  ? "Matches across the complete catalog"
                  : "Scroll to explore the complete catalog"}
              </span>
              <span>{sections.length} groups</span>
            </footer>
          </main>
          {!mobile && (
            <aside className="inspector" aria-label="Icon detail">
              {inspector}
            </aside>
          )}
        </div>
      </div>
      <DialogShell
        open={filtersOpen}
        label="categories"
        side="left"
        onClose={() => setFiltersOpen(false)}
      >
        {rail}
      </DialogShell>
      <DialogShell
        open={mobile && !!selected}
        label="icon detail"
        side="right"
        onClose={closeDetail}
      >
        {inspector}
      </DialogShell>
    </div>
  );
}

export default function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    loadCatalog(controller.signal)
      .then(setCatalog)
      .catch((e) => {
        if (e.name !== "AbortError")
          setError(
            e instanceof Error ? e.message : "The catalog could not be loaded.",
          );
      });
    return () => controller.abort();
  }, [attempt]);
  if (catalog) return <Browser catalog={catalog} />;
  return (
    <div className="load-state">
      <div className="brand-mark">
        <Grid2X2 size={24} />
      </div>
      <h1>WoW Icon Browser</h1>
      {error ? (
        <>
          <p role="alert">{error}</p>
          <button onClick={() => setAttempt((n) => n + 1)}>
            <RotateCcw size={16} />
            Try again
          </button>
        </>
      ) : (
        <>
          <LoaderCircle className="spinner" size={24} />
          <p>Loading the complete icon catalog…</p>
        </>
      )}
    </div>
  );
}
