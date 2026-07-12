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
import { useI18n } from "../../i18n/I18nProvider";

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
  const { t } = useI18n();
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
        <h3>{(entry ? t(`furniture.${entry.id}`) : null) ?? item.catalog_id}</h3>
        <button
          type="button"
          onClick={() => setSelectedFurnitureId(null)}
          aria-label={t("world.closeFurniture")}
        >
          ×
        </button>
      </header>
      <p className="muted">{t("furniture.zoneSuffix", { zone: item.zone })}</p>

      {action === "desk_assign" ? (
        <section>
          <h4>{t("furniture.seatAssign")}</h4>
          <label className="furniture-assign-field">
            {t("furniture.agentAtDesk")}
            <select
              value={item.linked_agent_id ?? ""}
              onChange={(event) => assignAgent(event.target.value || null)}
            >
              <option value="">{t("furniture.unassignedAuto")}</option>
              {departmentAgents.map((record) => (
                <option key={record.id} value={record.id}>
                  {formatAgentOptionLabel(record)}
                </option>
              ))}
            </select>
          </label>
          {linkedRecord ? (
            <p className="furniture-detail-note">
              {t("furniture.moraleSim", { pct: (linkedRecord.morale * 100).toFixed(0) })}
            </p>
          ) : (
            <p className="furniture-detail-note muted">
              {t("furniture.pickAgent")}
            </p>
          )}
        </section>
      ) : null}

      {action === "equipment_info" ? (
        <section>
          <h4>{t("furniture.computeSkills")}</h4>
          <dl className="furniture-equipment-stats">
            <div>
              <dt>{t("furniture.companyBalance")}</dt>
              <dd>{t("furniture.tokensUnit", { n: finance.company_balance.toLocaleString() })}</dd>
            </div>
            <div>
              <dt>{t("furniture.monthlyBurn")}</dt>
              <dd>{finance.monthly_burn_tokens.toLocaleString()}</dd>
            </div>
            {linkedWallet ? (
              <div>
                <dt>{t("furniture.deskBudget")}</dt>
                <dd>{t("furniture.tokensUnit", { n: linkedWallet.balance.toLocaleString() })}</dd>
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
            <p className="muted">{t("furniture.assignForSkills")}</p>
          )}
        </section>
      ) : null}

      {isMoraleDecorCatalog(item.catalog_id) ? (
        <section>
          <h4>{t("furniture.moraleZone")}</h4>
          <p className="furniture-detail-note">
            {t("furniture.moraleZoneNote")}
          </p>
        </section>
      ) : null}

      {action === "reception_hr" ? (
        <p className="furniture-detail-note">{t("furniture.receptionNote")}</p>
      ) : null}

      {action === "whiteboard_meeting" ? (
        <p className="furniture-detail-note">{t("furniture.whiteboardNote")}</p>
      ) : null}
    </aside>
  );
}