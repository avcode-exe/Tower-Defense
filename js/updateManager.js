// Update manager – orchestrates update flow from the renderer.
const DEFAULT_SETTINGS = {
  version: '1.2.0',
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
      dialog: document.getElementById('update-dialog'),
      ver: document.getElementById('update-dialog-ver'),
      type: document.getElementById('update-dialog-type'),
      skipLink: document.getElementById('update-skip-link'),
      downloadBtn: document.getElementById('update-download-btn'),
      progressWrap: document.getElementById('update-progress'),
      progressPct: document.getElementById('update-progress-pct'),
      progressVer: document.getElementById('update-progress-ver'),
      progressFill: document.getElementById('update-progress-fill'),
    };
    this._hideDialog();
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
      case 'available': this._handleAvailable(data); break;
      case 'progress': this._handleProgress(data); break;
      case 'downloaded': this._handleDownloaded(data); break;
      case 'not-available': this._hideDialog(); break;
      case 'error': console.error('[update]', data.message); break;
      default: console.warn('[update] unknown phase:', data.phase);
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

  _handleAvailable(info) {
    if (this.shouldSkip(info.version)) return;
    if (!this.passesFilter(info)) {
      console.log('[update] filtered (channel):', info.version);
      return;
    }
    this.settings.update.availableVersion = info.version;
    this.settings.update.releaseType = info.type;
    if (this.els.ver) this.els.ver.textContent = info.version;
    if (this.els.type) this.els.type.textContent = info.releaseType || (this._isPrerelease(info.version) ? 'Prerelease' : 'Release');
    if (this.els.dialog) this.els.dialog.style.display = 'block';
  }

  _hideDialog() {
    if (this.els.dialog) this.els.dialog.style.display = 'none';
  }
  _hideProgress() {
    if (this.els.progressWrap) this.els.progressWrap.style.display = 'none';
  }

  download() {
    this._hideDialog();
    window.electron?.downloadUpdate?.();
  }

  skip(version) {
    this.settings.update.skippedVersions = this.settings.update.skippedVersions || [];
    if (!this.settings.update.skippedVersions.includes(version)) {
      this.settings.update.skippedVersions.push(version);
    }
    this._hideDialog();
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
    this._hideDialog();
    this._showProgress(data.version, 100);
    setTimeout(() => {
      if (confirm('Version ' + data.version + ' is ready to install.\n\nRestart now to apply the update?')) {
        this.restart();
      }
    }, 300);
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
