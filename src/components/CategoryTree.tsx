import { ChevronDown, ChevronRight } from "lucide-react";
import type { CategoryNode } from "../lib/groups";

export function CategoryTree({
  nodes,
  counts,
  expanded,
  selected,
  onToggle,
  onSelect,
}: {
  nodes: CategoryNode[];
  counts: Map<string, number>;
  expanded: string[];
  selected: string;
  onToggle: (id: string) => void;
  onSelect: (node: CategoryNode) => void;
}) {
  return (
    <ul className="category-tree">
      {nodes.map((node) => {
        const open = expanded.includes(node.id);
        const count = counts.get(node.id) ?? 0;
        return (
          <li key={node.id} data-group-path={node.id}>
            <div className={`category-line ${count === 0 ? "zero-count" : ""}`}>
              {node.children.length > 0 ? (
                <button
                  className="expand-button"
                  aria-label={`${open ? "Collapse" : "Expand"} ${node.id.replaceAll("/", " / ")}`}
                  aria-expanded={open}
                  onClick={() => onToggle(node.id)}
                >
                  {open ? (
                    <ChevronDown size={15} />
                  ) : (
                    <ChevronRight size={15} />
                  )}
                </button>
              ) : (
                <span className="expand-spacer" />
              )}
              <button
                className={`category-button ${selected === node.id ? "active" : ""}`}
                title={node.id}
                aria-current={selected === node.id ? "true" : undefined}
                onClick={() => onSelect(node)}
              >
                <span className="category-name">{node.label}</span>
                <span className="category-count">
                  {count.toLocaleString("en-US")}
                </span>
              </button>
            </div>
            {node.children.length > 0 && open && (
              <div className="category-children">
                <CategoryTree
                  nodes={node.children}
                  counts={counts}
                  expanded={expanded}
                  selected={selected}
                  onToggle={onToggle}
                  onSelect={onSelect}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
