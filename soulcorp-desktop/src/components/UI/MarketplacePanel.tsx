import { useCallback, useEffect, useState } from "react";
import { createHubGig, listHubGigs, syncWithHub } from "../../services/hubClient";
import { useGameStore } from "../../stores/gameStore";
import type { HubGig } from "../../types/game";

export function MarketplacePanel() {
  const settings = useGameStore((state) => state.settings);
  const hubStatus = useGameStore((state) => state.hubStatus);
  const tierBenefits = useGameStore((state) => state.tierBenefits);
  const setHubStatus = useGameStore((state) => state.setHubStatus);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);

  const [gigs, setGigs] = useState<HubGig[]>([]);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState(250);
  const [skills, setSkills] = useState("react, tailwind");

  const refreshGigs = useCallback(async () => {
    setLoading(true);
    try {
      const next = await listHubGigs();
      setGigs(next);
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setLoading(false);
    }
  }, [setStatusMessage]);

  useEffect(() => {
    void refreshGigs();
  }, [refreshGigs]);

  const handleSync = async () => {
    try {
      const pull = await syncWithHub();
      setGigs(pull.open_gigs);
      setHubStatus({
        ...hubStatus,
        connected: true,
        user_tier: pull.tier,
        soul_balance: pull.soul_balance,
        pending_queue_items: 0,
        last_sync_at: new Date().toISOString(),
      });
      setStatusMessage(`Synced with hub. Tier: ${pull.tier}, $SOUL: ${pull.soul_balance.toFixed(2)}`);
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const handleCreateGig = async () => {
    if (!title.trim() || !description.trim()) {
      setStatusMessage("Title and description are required.");
      return;
    }

    try {
      const result = await createHubGig({
        title: title.trim(),
        description: description.trim(),
        budget_usdt: budget,
        required_skills: skills
          .split(",")
          .map((skill) => skill.trim())
          .filter(Boolean),
      });
      setStatusMessage(`Gig queued: ${JSON.stringify(result)}`);
      setTitle("");
      setDescription("");
      await refreshGigs();
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  return (
    <section className="panel-card marketplace-panel">
      <h2>Marketplace</h2>
      <p className="muted">
        Browse open gigs from soulmd-hub or publish work for other companies.
        Platform fee: {tierBenefits.platform_fee_percent.toFixed(0)}%.
      </p>
      {tierBenefits.executive_lounge ? (
        <p className="tier-highlight">Executive Lounge gigs are visible on your tier.</p>
      ) : null}

      <div className="hub-status-row">
        <span className={`hub-pill ${hubStatus.connected ? "online" : "offline"}`}>
          {hubStatus.connected ? "Connected" : "Offline"}
        </span>
        <span className="hub-pill tier">{hubStatus.user_tier}</span>
        <span className="hub-pill balance">${hubStatus.soul_balance.toFixed(2)} SOUL</span>
      </div>

      {settings.pure_local_mode ? (
        <p className="hub-warning">
          Pure Local Mode is on. Showing mock marketplace data only.
        </p>
      ) : null}

      <div className="panel-actions">
        <button type="button" onClick={() => void refreshGigs()} disabled={loading}>
          {loading ? "Loading..." : "Refresh gigs"}
        </button>
        <button type="button" onClick={() => void handleSync()} disabled={settings.pure_local_mode}>
          Sync with hub
        </button>
      </div>

      <div className="gig-list">
        {gigs.length === 0 ? (
          <p className="muted">No open gigs found.</p>
        ) : (
          gigs.map((gig) => (
            <article key={gig.gig_id} className="gig-card">
              <header>
                <strong>{gig.title}</strong>
                <span>${gig.budget_usdt.toFixed(0)} USDT</span>
              </header>
              <p>{gig.description}</p>
              <div className="skill-tags">
                {gig.required_skills.map((skill) => (
                  <span key={skill}>{skill}</span>
                ))}
              </div>
            </article>
          ))
        )}
      </div>

      <div className="gig-form">
        <h3>Post a gig</h3>
        <label className="field-label">
          Title
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={settings.pure_local_mode}
          />
        </label>
        <label className="field-label">
          Description
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            disabled={settings.pure_local_mode}
          />
        </label>
        <label className="field-label">
          Budget (USDT)
          <input
            type="number"
            min={50}
            value={budget}
            onChange={(event) => setBudget(Number(event.target.value))}
            disabled={settings.pure_local_mode}
          />
        </label>
        <label className="field-label">
          Required skills (comma-separated)
          <input
            type="text"
            value={skills}
            onChange={(event) => setSkills(event.target.value)}
            disabled={settings.pure_local_mode}
          />
        </label>
        <button
          type="button"
          className="primary-action"
          onClick={() => void handleCreateGig()}
          disabled={settings.pure_local_mode}
        >
          Publish gig
        </button>
      </div>
    </section>
  );
}