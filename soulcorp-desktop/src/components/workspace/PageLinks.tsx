import { invoke } from "../../utils/tauriInvoke";
import { useEffect, useState } from "react";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import type { LinkableEntity, LinkedEntity, WorkspacePage } from "../../types/workspace";
import { useI18n } from "../../i18n/I18nProvider";

interface PageLinksProps {
  page: WorkspacePage;
  onPageUpdated: (page: WorkspacePage) => void;
  onOpenPage: (pageId: string) => void;
}

export function PageLinks({ page, onPageUpdated, onOpenPage }: PageLinksProps) {
  const { t } = useI18n();
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
        <h3>{t("workspace.links.title")}</h3>
        <p className="muted">{t("workspace.links.lead")}</p>
      </header>

      {page.linked_entities.length > 0 ? (
        <ul className="page-link-list">
          {page.linked_entities.map((link) => (
            <li key={`${link.entity_type}:${link.id}`}>
              <span className={`link-pill link-${link.entity_type}`}>
                {link.entity_type}: {link.title}
              </span>
              <button type="button" onClick={() => void removeLink(link)}>
                {t("common.remove")}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{t("workspace.links.empty")}</p>
      )}

      <div className="page-link-form">
        <select value={selectedType} onChange={(event) => {
          setSelectedType(event.target.value);
          setSelectedId("");
        }}>
          <option value="project">{t("workspace.links.project")}</option>
          <option value="agent">{t("workspace.links.agent")}</option>
          <option value="meeting">{t("workspace.links.meeting")}</option>
          <option value="event">{t("workspace.links.event")}</option>
        </select>
        <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
          <option value="">{t("workspace.links.selectEntity")}</option>
          {filteredLinkables.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
              {item.subtitle ? ` — ${item.subtitle}` : ""}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => void addLink()} disabled={!selectedId}>
          {t("workspace.links.add")}
        </button>
      </div>

      {backlinks.length > 0 && (
        <div className="page-backlinks">
          <h4>{t("workspace.links.related")}</h4>
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