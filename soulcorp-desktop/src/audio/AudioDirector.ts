export type BgmTrack = "campus_day" | "campus_night" | "interior" | "studio" | "build";

export type SfxId =
  | "door_open"
  | "door_close"
  | "door_hover"
  | "ui_click"
  | "ui_open"
  | "ui_mode_switch"
  | "furniture_place"
  | "furniture_delete"
  | "save_success"
  | "agent_select"
  | "camera_whoosh"
  | "desk_tap"
  | "paper_rustle"
  | "keyboard_tap"
  | "soft_place";

const SFX_DEBOUNCE_MS: Partial<Record<SfxId, number>> = {
  door_hover: 500,
  ui_click: 80,
  desk_tap: 100,
  door_open: 180,
  camera_whoosh: 180,
};

const MAX_ACTIVE_SFX = 4;

export class AudioDirector {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicVolume = 0.25;
  private sfxVolume = 0.45;
  private musicEnabled = true;
  private sfxEnabled = true;
  private unlocked = false;
  private pendingTrack: BgmTrack | null = null;
  private playingTrack: BgmTrack | null = null;
  private lastSfxAt: Partial<Record<SfxId, number>> = {};
  private activeSfxNodes = 0;

  isUnlocked(): boolean {
    return this.unlocked;
  }

  unlock(): void {
    if (this.unlocked) {
      return;
    }
    this.ctx = new AudioContext({ latencyHint: "interactive" });
    this.masterGain = this.ctx.createGain();
    this.bgmGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
    this.bgmGain.connect(this.masterGain);
    this.sfxGain.connect(this.masterGain);
    this.applyVolumes();
    void this.ctx.resume();
    this.unlocked = true;
    this.flushBgm();
  }

  setMusicEnabled(enabled: boolean): void {
    this.musicEnabled = enabled;
    this.applyVolumes();
    if (enabled) {
      this.flushBgm();
    } else {
      this.playingTrack = null;
    }
  }

  setSfxEnabled(enabled: boolean): void {
    this.sfxEnabled = enabled;
    this.applyVolumes();
  }

  setMusicVolume(volume: number): void {
    this.musicVolume = Math.max(0, Math.min(1, volume));
    this.applyVolumes();
  }

  setSfxVolume(volume: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, volume));
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (this.bgmGain) {
      this.bgmGain.gain.value = this.musicEnabled ? this.musicVolume : 0;
    }
    if (this.sfxGain) {
      this.sfxGain.gain.value = this.sfxEnabled ? this.sfxVolume : 0;
    }
  }

  playBgm(track: BgmTrack): void {
    this.pendingTrack = track;
    this.flushBgm();
  }

  private flushBgm(): void {
    if (!this.unlocked || !this.musicEnabled || !this.pendingTrack) {
      return;
    }
    if (this.playingTrack === this.pendingTrack) {
      return;
    }
    // Real BGM assets are not wired yet. Procedural sine oscillators caused a
    // constant hum that users perceived as echo — keep music silent for now.
    this.playingTrack = this.pendingTrack;
  }

  stopBgm(): void {
    this.pendingTrack = null;
    this.playingTrack = null;
  }

  muteAll(): void {
    this.playingTrack = null;
    if (this.sfxGain) {
      this.sfxGain.gain.value = 0;
    }
    if (this.bgmGain) {
      this.bgmGain.gain.value = 0;
    }
  }

  playSfx(id: SfxId): void {
    if (!this.sfxEnabled || !this.unlocked || !this.ctx || !this.sfxGain) {
      return;
    }
    if (this.activeSfxNodes >= MAX_ACTIVE_SFX) {
      return;
    }

    const nowMs = performance.now();
    const minGap = SFX_DEBOUNCE_MS[id] ?? 55;
    const last = this.lastSfxAt[id] ?? 0;
    if (nowMs - last < minGap) {
      return;
    }
    this.lastSfxAt[id] = nowMs;

    const now = this.ctx.currentTime;
    const profiles: Record<SfxId, { freq: number; duration: number; type: OscillatorType }> = {
      door_open: { freq: 420, duration: 0.09, type: "triangle" },
      door_close: { freq: 280, duration: 0.09, type: "triangle" },
      door_hover: { freq: 520, duration: 0.035, type: "sine" },
      ui_click: { freq: 640, duration: 0.045, type: "triangle" },
      ui_open: { freq: 720, duration: 0.055, type: "triangle" },
      furniture_place: { freq: 340, duration: 0.07, type: "triangle" },
      furniture_delete: { freq: 220, duration: 0.09, type: "triangle" },
      save_success: { freq: 520, duration: 0.09, type: "sine" },
      ui_mode_switch: { freq: 560, duration: 0.055, type: "triangle" },
      agent_select: { freq: 480, duration: 0.065, type: "sine" },
      camera_whoosh: { freq: 180, duration: 0.12, type: "triangle" },
      desk_tap: { freq: 380, duration: 0.055, type: "triangle" },
      paper_rustle: { freq: 290, duration: 0.08, type: "triangle" },
      keyboard_tap: { freq: 880, duration: 0.03, type: "triangle" },
      soft_place: { freq: 240, duration: 0.07, type: "sine" },
    };
    const profile = profiles[id];
    const peak = 0.06 * this.sfxVolume;
    const attack = 0.004;
    const release = profile.duration;

    const osc = this.ctx.createOscillator();
    osc.type = profile.type;
    osc.frequency.setValueAtTime(profile.freq, now);
    osc.frequency.linearRampToValueAtTime(profile.freq * 0.82, now + profile.duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + attack);
    gain.gain.linearRampToValueAtTime(0, now + release);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    this.activeSfxNodes += 1;
    osc.onended = () => {
      this.activeSfxNodes = Math.max(0, this.activeSfxNodes - 1);
      try {
        gain.disconnect();
        osc.disconnect();
      } catch {
        /* noop */
      }
    };
    osc.start(now);
    osc.stop(now + profile.duration + 0.02);
  }

  dispose(): void {
    this.stopBgm();
    void this.ctx?.close();
    this.ctx = null;
    this.masterGain = null;
    this.bgmGain = null;
    this.sfxGain = null;
    this.unlocked = false;
    this.activeSfxNodes = 0;
  }
}

export const audioDirector = new AudioDirector();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    audioDirector.dispose();
  });
}