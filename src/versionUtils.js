const PRERELEASE_RE = /-(?:beta|alpha|rc)\./i;

export function isPrerelease(version) {
  return PRERELEASE_RE.test(version || '');
}

export function parseVersion(v) {
  if (!v) return { major: 0, minor: 0, patch: 0, prerelease: [] };
  const match = v.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
  if (!match) return { major: 0, minor: 0, patch: 0, prerelease: [] };
  const prerelease = match[4] ? match[4].split('.').map((p) => (/^\d+$/.test(p) ? parseInt(p, 10) : p)) : [];
  return { major: parseInt(match[1], 10), minor: parseInt(match[2], 10), patch: parseInt(match[3], 10), prerelease };
}

export function isNewerThan(version, current) {
  const a = parseVersion(version);
  const b = parseVersion(current);
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
