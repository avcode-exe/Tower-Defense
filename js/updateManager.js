// Update manager – orchestrates update flow from the renderer.
const DEFAULT_SETTINGS = {
  version: '1.3.0-beta.2',
  update: {
    channel: 'release',
    autoDownload: true,
    checkOnStartup: true,
    checkIntervalMinutes: 60,
    skippedVersions: [],
    showProgressBar: true,
    availableVersion: null,
    releaseType: null,
  },
  collapsed: { hud: false, shop: false, preview: false, shieldShop: false, help: true, monsterInfo: true, settings: true },
};

const PRERELEASE_RE = /-(?:beta|alpha|rc)\./i;

class UpdateManager {
  constructor(settings) {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    this.settings.update = Object.assign({}, DEFAULT_SETTINGS.update, this.settings.update || {});
    this.settings.collapsed = Object.assign({}, DEFAULT_SETTINGS.collapsed, this.settings.collapsed || {});
    this._ensureArrays();

    this.els = {
      progressWrap: document.getElementById('update-progress'),
      progressPct: document.getElementById('update-progress-pct'),
      progressVer: document.getElementById('update-progress-ver'),
      progressFill: document.getElementById('update-progress-fill'),
    };
    this._hideProgress();
  }

  _ensureArrays() {
    if (!Array.isArray(this.settings.update.skippedVersions)) {
      this.settings.update.skippedVersions = [];
    }
  }

  init() {
    if (!window.electron) return;
    window.electron.onUpdateStatus((data) => this._onStatus(data));
    if (this.settings.update.checkOnStartup !== false) {
      setTimeout(() => this.check(), 3000);
    }
  }

  check() {
    window.electron?.sendManualCheck?.();
  }

  _onStatus(data) {
    switch (data.phase) {
      case 'progress': this._handleProgress(data); break;
      case 'downloaded': this._handleDownloaded(data); break;
      case 'not-available': break;
      case 'error': console.error('[update]', data.message); break;
      default: break;
    }
  }

  _isPrerelease(version) {
    return PRERELEASE_RE.test(version || '');
  }

  passesFilter(info) {
    const channel = this.settings.update?.channel || 'release';
    if (channel === 'release' && this._isPrerelease(info.version)) return false;
    return true;
  }

  shouldSkip(version) {
    return (this.settings.update.skippedVersions || []).includes(version);
  }

  _hideProgress() {
    if (this.els.progressWrap) this.els.progressWrap.style.display = 'none';
  }

  download() {
    window.electron?.downloadUpdate?.();
  }

  skip(version) {
    this.settings.update.skippedVersions = this.settings.update.skippedVersions || [];
    if (!this.settings.update.skippedVersions.includes(version)) {
      this.settings.update.skippedVersions.push(version);
    }
    this._persist();
  }

  restart() {
    window.electron?.requestRestartToUpdate?.();
  }

  _handleProgress(data) {
    if (this.settings.update.showProgressBar !== false) {
      this._showProgress(data.version || this.settings.update.availableVersion, data.percent);
    }
  }

  _showProgress(version, pct) {
    const p = Math.round(pct || 0);
    if (!this.els.progressWrap || !this.els.progressPct || !this.els.progressVer || !this.els.progressFill) return;
    this.els.progressWrap.style.display = 'block';
    this.els.progressPct.textContent = p + '%';
    this.els.progressVer.textContent = version;
    this.els.progressFill.style.width = p + '%';
  }

  _handleDownloaded(data) {
    if (data.version) this.settings.update.availableVersion = data.version;
    this._showProgress(data.version, 100);
    // Show restart button in progress area
    if (this.els.progressWrap) {
      const existingRestart = this.els.progressWrap.querySelector('.update-restart-btn');
      if (existingRestart) existingRestart.remove();
      const btn = document.createElement('button');
      btn.className = 'update-restart-btn';
      btn.textContent = 'Restart & Install';
      btn.style.cssText = 'margin-top:8px; background:#238636; color:#fff; border:none; padding:5px 14px; border-radius:6px; cursor:pointer; font-size:10px; font-family:inherit;';
      btn.addEventListener('click', () => this.restart());
      this.els.progressWrap.appendChild(btn);
    }
  }

  _persist() {
    if (window.electron?.saveSettings) window.electron.saveSettings(JSON.parse(JSON.stringify(this.settings)));
  }

  setChannel(ch) { this.settings.update.channel = ch; this._persist(); this.check(); }
  setAutoDownload(v) { this.settings.update.autoDownload = v; this._persist(); }
  setCheckInterval(m) { this.settings.update.checkIntervalMinutes = m; this._persist(); }
  getCollapsed() { return this.settings.collapsed; }
  setCollapsed(key, val) { this.settings.collapsed[key] = val; this._persist(); }
  getAnnouncedVersion() { return this.settings.update.availableVersion; }
}

window.UpdateManager = UpdateManager;
