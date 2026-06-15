// Update manager – orchestrates update flow from the renderer.
const DEFAULT_SETTINGS = {
  version: '1.5.2',
  update: {
    channel: 'release',
    autoDownload: false,
    checkOnStartup: true,
    checkIntervalMinutes: 60,
    skippedVersions: [],
    showProgressBar: true,
    availableVersion: null,
    releaseType: null,
  },
  collapsed: {
    hud: false,
    shop: false,
    preview: false,
    shieldShop: false,
    help: true,
    monsterInfo: true,
    settings: true,
  },
};

const PRERELEASE_RE = /-(?:beta|alpha|rc)\./i;
const isNewerVersion = _isNewerThan;

// Parse semver for comparison (mirrors electron-main.js logic).
function _parseVersion(v) {
  if (!v) return { major: 0, minor: 0, patch: 0, prerelease: [] };
  const match = v.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
  if (!match) return { major: 0, minor: 0, patch: 0, prerelease: [] };
  const prerelease = match[4] ? match[4].split('.').map((p) => (/^\d+$/.test(p) ? parseInt(p, 10) : p)) : [];
  return { major: parseInt(match[1], 10), minor: parseInt(match[2], 10), patch: parseInt(match[3], 10), prerelease };
}

function _isNewerThan(version, current) {
  const a = _parseVersion(version);
  const b = _parseVersion(current);
  if (a.major !== b.major) return a.major > b.major;
  if (a.minor !== b.minor) return a.minor > b.minor;
  if (a.patch !== b.patch) return a.patch > b.patch;
  if (a.prerelease.length === 0 && b.prerelease.length > 0) return true;
  if (a.prerelease.length > 0 && b.prerelease.length === 0) return false;
  const len = Math.min(a.prerelease.length, b.prerelease.length);
  for (let i = 0; i < len; i++) {
    const ap = a.prerelease[i],
      bp = b.prerelease[i];
    if (ap === bp) continue;
    if (typeof ap === 'number' && typeof bp === 'number') return ap > bp;
    return String(ap) > String(bp);
  }
  return a.prerelease.length > b.prerelease.length;
}

export class UpdateManager {
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
      case 'progress':
        this._handleProgress(data);
        break;
      case 'downloaded':
        this._handleDownloaded(data);
        break;
      case 'not-available':
        break;
      case 'error':
        console.error('[update]', data.message);
        break;
      default:
        break;
    }
  }

  _isPrerelease(version) {
    return PRERELEASE_RE.test(version || '');
  }

  passesFilter(info) {
    const channel = this.settings.update?.channel || 'release';
    const currentVersion = this.settings.version || '0.0.0';
    const isPrerelease = this._isPrerelease(info.version);
    const newer = isNewerVersion(info.version, currentVersion);
    if (channel === 'release' && isPrerelease) return false;
    if (!isPrerelease && channel === 'pre-release' && !newer) return false;
    return newer;
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
      btn.style.cssText =
        'margin-top:8px; background:#238636; color:#fff; border:none; padding:5px 14px; border-radius:6px; cursor:pointer; font-size:10px; font-family:inherit;';
      btn.addEventListener('click', () => this.restart());
      this.els.progressWrap.appendChild(btn);
    }
  }

  _persist() {
    if (window.electron?.saveSettings) window.electron.saveSettings(JSON.parse(JSON.stringify(this.settings)));
  }

  setChannel(ch) {
    this.settings.update.channel = ch;
    this._persist();
    this.check();
  }
  setAutoDownload(v) {
    this.settings.update.autoDownload = v;
    this._persist();
  }
  setCheckInterval(m) {
    const parsed = Number(m);
    this.settings.update.checkIntervalMinutes = Number.isFinite(parsed) ? Math.max(15, Math.floor(parsed)) : 15;
    this._persist();
  }
  getCollapsed() {
    return this.settings.collapsed;
  }
  setCollapsed(key, val) {
    this.settings.collapsed[key] = val;
    this._persist();
  }
  getAnnouncedVersion() {
    return this.settings.update.availableVersion;
  }
}
