import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import type { LinkableEntity, LinkedEntity, WorkspacePage } from "../../types/workspace";

interface PageLinksProps {
  page: WorkspacePage;
  onPageUpdated: (page: WorkspacePage) => void;
  onOpenPage: (pageId: string) => void;
}

export function PageLinks({ page, onPageUpdated, onOpenPage }: PageLinksProps) {
  const [linkables, setLinkables] = useState<LinkableEntity[]>([]);
  const [selectedType, setSelectedType] = useState("project");
  const [selectedId, setSelectedId] = useState("");
  const [backlinks, setBacklinks] = useState<{ page_id: string; title: string }[]>([]);

  useEffect(() => {
    void invoke<LinkableEntity[]>("list_linkable_entities")
      .then(setLinkables)
      .catch(() => setLinkables([]));
  }, [page.id]);

  useEffect(() => {
    if (page.linked_entities.length === 0) {
      setBacklinks([]);
      return;
    }

    void Promise.all(
      page.linked_entities.map((link) =>
        invoke<{ page_id: string; title: string }[]>("find_workspace_backlinks", {
          entityType: link.entity_type,
          entityId: link.id,
        }),
      ),
    )
      .then((results) => {
        const merged = new Map<string, { page_id: string; title: string }>();
        for (const batch of results) {
          for (const item of batch) {
            if (item.page_id !== page.id) {
              merged.set(item.page_id, item);
            }
          }
        }
        setBacklinks([...merged.values()]);
      })
      .catch(() => setBacklinks([]));
  }, [page.id, page.linked_entities]);

  const filteredLinkables = linkables.filter((item) => item.entity_type === selectedType);
  const selectedLinkable = filteredLinkables.find((item) => item.id === selectedId);

  const addLink = async () => {
    if (!selectedLinkable) {
      return;
    }
    const updated = await invoke<WorkspacePage>("link_workspace_entity", {
      request: {
        page_id: page.id,
        entity_type: selectedLinkable.entity_type,
        entity_id: selectedLinkable.id,
        title: selectedLinkable.title,
      },
    });
    onPageUpdated(updated);
    useWorkspaceStore.getState().setSelectedPage(updated);
  };

  const removeLink = async (link: LinkedEntity) => {
    const updated = await invoke<WorkspacePage>("unlink_workspace_entity", {
      request: {
        page_id: page.id,
        entity_type: link.entity_type,
        entity_id: link.id,
      },
    });
    onPageUpdated(updated);
    useWorkspaceStore.getState().setSelectedPage(updated);
  };

  return (
    <section className="page-links">
      <header>
        <h3>Linked entities</h3>
        <p className="muted">Connect this page to agents, projects, meetings, or events.</p>
      </header>

      {page.linked_entities.length > 0 ? (
        <ul className="page-link-list">
          {page.linked_entities.map((link) => (
            <li key={`${link.entity_type}:${link.id}`}>
              <span className={`link-pill link-${link.entity_type}`}>
                {link.entity_type}: {link.title}
              </span>
              <button type="button" onClick={() => void removeLink(link)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No links yet. Meeting notes and daily journals auto-link on save.</p>
      )}

      <div className="page-link-form">
        <select value={selectedType} onChange={(event) => {
          setSelectedType(event.target.value);
          setSelectedId("");
        }}>
          <option value="project">Project</option>
          <option value="agent">Agent</option>
          <option value="meeting">Meeting</option>
          <option value="event">Event</option>
        </select>
        <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
          <option value="">Select entity...</option>
          {filteredLinkables.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
              {item.subtitle ? ` — ${item.subtitle}` : ""}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => void addLink()} disabled={!selectedId}>
          Add link
        </button>
      </div>

      {backlinks.length > 0 && (
        <div className="page-backlinks">
          <h4>Related pages</h4>
          <ul>
            {backlinks.map((item) => (
              <li key={item.page_id}>
                <button type="button" onClick={() => onOpenPage(item.page_id)}>
                  {item.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}