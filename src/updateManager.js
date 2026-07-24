// Update manager – orchestrates update flow from the renderer.
import { DEFAULT_SETTINGS, isPrerelease, parseVersion, isNewerThan } from './config/settingsDefaults.js';

const isNewerVersion = isNewerThan;

export class UpdateManager {
  constructor(settings) {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    this.settings.update = Object.assign({}, DEFAULT_SETTINGS.update, this.settings.update || {});
    this.settings.collapsed = Object.assign({}, DEFAULT_SETTINGS.collapsed, this.settings.collapsed || {});

    this.els = {
      progressWrap: document.getElementById('update-progress'),
      progressPct: document.getElementById('update-progress-pct'),
      progressVer: document.getElementById('update-progress-ver'),
      progressFill: document.getElementById('update-progress-fill'),
    };
    this._hideProgress();
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
    return isPrerelease(version);
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

  _hideProgress() {
    if (this.els.progressWrap) this.els.progressWrap.style.display = 'none';
  }

  download() {
    window.electron?.downloadUpdate?.();
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
    const p = Math.min(100, Math.round(pct || 0));
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
