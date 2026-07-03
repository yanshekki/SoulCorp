import { getCatalogEntry } from "../../data/furnitureCatalog";
import { useGameStore } from "../../stores/gameStore";
import { formatAgentOptionLabel } from "../../utils/agentLabel";
import type { OfficeVisualConfig } from "../../types/visualDesign";
import {
  bindAgentToDesk,
  furnitureActionForCatalog,
  isMoraleDecorCatalog,
} from "../../utils/furnitureInteractions";
import { normalizeOfficeVisual } from "../../utils/officeVisualNormalize";
import { patchOfficeVisual } from "../../utils/syncVisualDesign";

interface FurnitureDetailPanelProps {
  buildingId: string;
  furnitureId: string;
  office: OfficeVisualConfig;
}

export function FurnitureDetailPanel({
  buildingId,
  furnitureId,
  office,
}: FurnitureDetailPanelProps) {
  const config = normalizeOfficeVisual(office, buildingId);
  const item = config.furniture.find((entry) => entry.id === furnitureId);
  const setSelectedFurnitureId = useGameStore((state) => state.setSelectedFurnitureId);
  const agentRecords = useGameStore((state) => state.agentRecords);
  const finance = useGameStore((state) => state.finance);
  const building = useGameStore((state) => state.buildings.find((entry) => entry.id === buildingId));

  if (!item) {
    return null;
  }

  const entry = getCatalogEntry(item.catalog_id);
  const action = furnitureActionForCatalog(item.catalog_id);
  const departmentAgents = agentRecords.filter(
    (record) => record.department === building?.department,
  );
  const linkedRecord = item.linked_agent_id
    ? agentRecords.find((record) => record.id === item.linked_agent_id)
    : undefined;
  const linkedWallet = item.linked_agent_id ? finance.agents[item.linked_agent_id] : undefined;

  const assignAgent = (agentId: string | null) => {
    const next = bindAgentToDesk(config, furnitureId, agentId);
    patchOfficeVisual(buildingId, { furniture: next }, { markBuildDirty: false });
    const name = agentId
      ? (agentRecords.find((record) => record.id === agentId)?.name ?? "Agent")
      : "Nobody";
    useGameStore.getState().setStatusMessage(`Desk assigned to ${name}.`);
  };

  return (
    <aside className="furniture-detail-panel" role="complementary">
      <header>
        <h3>{entry?.label ?? item.catalog_id}</h3>
        <button
          type="button"
          onClick={() => setSelectedFurnitureId(null)}
          aria-label="Close furniture panel"
        >
          ×
        </button>
      </header>
      <p className="muted">{item.zone} zone</p>

      {action === "desk_assign" ? (
        <section>
          <h4>Seat assignment</h4>
          <label className="furniture-assign-field">
            Agent at this desk
            <select
              value={item.linked_agent_id ?? ""}
              onChange={(event) => assignAgent(event.target.value || null)}
            >
              <option value="">Unassigned (auto hash)</option>
              {departmentAgents.map((record) => (
                <option key={record.id} value={record.id}>
                  {formatAgentOptionLabel(record)}
                </option>
              ))}
            </select>
          </label>
          {linkedRecord ? (
            <p className="furniture-detail-note">
              Morale {(linkedRecord.morale * 100).toFixed(0)}% · sim uses this desk position.
            </p>
          ) : (
            <p className="furniture-detail-note muted">
              Pick an agent to pin them to this desk.
            </p>
          )}
        </section>
      ) : null}

      {action === "equipment_info" ? (
        <section>
          <h4>Compute & skills</h4>
          <dl className="furniture-equipment-stats">
            <div>
              <dt>Company balance</dt>
              <dd>{finance.company_balance.toLocaleString()} tokens</dd>
            </div>
            <div>
              <dt>Monthly burn</dt>
              <dd>{finance.monthly_burn_tokens.toLocaleString()}</dd>
            </div>
            {linkedWallet ? (
              <div>
                <dt>Desk agent budget</dt>
                <dd>{linkedWallet.balance.toLocaleString()} tokens</dd>
              </div>
            ) : null}
          </dl>
          {linkedRecord ? (
            <ul className="agent-skill-list">
              {(linkedRecord.skills ?? []).map((skill) => (
                <li key={skill}>{skill}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">Assign an agent to the nearest desk to link skills.</p>
          )}
        </section>
      ) : null}

      {isMoraleDecorCatalog(item.catalog_id) ? (
        <section>
          <h4>Morale zone</h4>
          <p className="furniture-detail-note">
            Agents within 2m get a +5% morale boost in Game mode (shorter breaks, cozier status).
          </p>
        </section>
      ) : null}

      {action === "reception_hr" ? (
        <p className="furniture-detail-note">Opens Recruitment panel for hiring & morale heatmap.</p>
      ) : null}

      {action === "whiteboard_meeting" ? (
        <p className="furniture-detail-note">Creates a Meeting Notes page in Workspace.</p>
      ) : null}
    </aside>
  );
}