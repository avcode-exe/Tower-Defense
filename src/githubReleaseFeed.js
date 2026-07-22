import http from 'http';
import https from 'https';
import { URL } from 'url';
import semver from 'semver';
import { parseXml } from 'builder-util-runtime';

const TAG_HREF_RE = /\/tag\/([^/]+)$/;

function stripLeadingV(value) {
  return String(value || '').replace(/^v/i, '');
}

function getEntryLink(entry) {
  try {
    return entry.element('link').attribute('href') || '';
  } catch (_) {
    return '';
  }
}

function getEntryText(entry, name) {
  try {
    return entry.elementValueOrEmpty(name) || '';
  } catch (_) {
    return '';
  }
}

function getReleaseFromEntry(entry) {
  const href = getEntryLink(entry);
  const match = TAG_HREF_RE.exec(href);
  if (!match) return null;

  const tag = match[1];
  const version = stripLeadingV(tag);
  const parsed = semver.parse(version);
  if (!parsed || !semver.prerelease(parsed)) return null;

  return {
    tag,
    version: parsed.version,
    title: getEntryText(entry, 'title'),
    updated: getEntryText(entry, 'updated'),
    link: href,
  };
}

function getReleaseFromEntryAny(entry) {
  const href = getEntryLink(entry);
  const match = TAG_HREF_RE.exec(href);
  if (!match) return null;

  const tag = match[1];
  const version = stripLeadingV(tag);
  const parsed = semver.parse(version);
  if (!parsed) return null;

  return {
    tag,
    version: parsed.version,
    title: getEntryText(entry, 'title'),
    updated: getEntryText(entry, 'updated'),
    link: href,
  };
}

function selectNewestNewerPrereleaseTag(feedXml, currentVersion) {
  const current = semver.parse(stripLeadingV(currentVersion));
  if (!current) return null;

  let feed;
  try {
    feed = parseXml(feedXml);
  } catch (_) {
    return null;
  }

  const entries = typeof feed.getElements === 'function' ? feed.getElements('entry') : [];
  const candidates = entries
    .map(getReleaseFromEntry)
    .filter((release) => release && semver.gt(release.version, current));

  candidates.sort((a, b) => {
    const byVersion = semver.rcompare(a.version, b.version);
    if (byVersion !== 0) return byVersion;
    return Date.parse(b.updated) - Date.parse(a.updated);
  });

  return candidates.length > 0 ? candidates[0] : null;
}

function selectNewestNewerRelease(feedXml, currentVersion) {
  const current = semver.parse(stripLeadingV(currentVersion));
  if (!current) return null;

  let feed;
  try {
    feed = parseXml(feedXml);
  } catch (_) {
    return null;
  }

  const entries = typeof feed.getElements === 'function' ? feed.getElements('entry') : [];
  const candidates = entries
    .map(getReleaseFromEntryAny)
    .filter((release) => release && semver.gt(release.version, current));

  candidates.sort((a, b) => {
    const byVersion = semver.rcompare(a.version, b.version);
    if (byVersion !== 0) return byVersion;
    return Date.parse(b.updated) - Date.parse(a.updated);
  });

  return candidates.length > 0 ? candidates[0] : null;
}

function headRequest(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    const req = client.request(
      parsedUrl,
      {
        method: 'HEAD',
        headers: {
          'User-Agent': 'tower-defense-update-checker',
        },
      },
      (res) => {
        res.resume();
        resolve(res.statusCode >= 200 && res.statusCode < 300);
      }
    );

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy(new Error('Request timed out'));
    });
    req.end();
  });
}

// Try to resolve the correct GitHub release tag for download URLs.
// The Atom feed tag may lack the "v" prefix while the actual release uses it.
async function resolveDownloadTag(owner, repo, feedTag) {
  const tagWithV = feedTag.startsWith('v') ? feedTag : 'v' + feedTag;
  const tagWithoutV = feedTag.startsWith('v') ? feedTag.slice(1) : feedTag;

  const testUrl = (tag) =>
    `https://github.com/${owner}/${repo}/releases/download/${encodeURIComponent(tag)}/latest.yml`;

  // Run both HEAD requests in parallel to avoid sequential timeout delays.
  const [withVResult, withoutVResult] = await Promise.allSettled([
    headRequest(testUrl(tagWithV)),
    headRequest(testUrl(tagWithoutV)),
  ]);

  if (withVResult.status === 'fulfilled' && withVResult.value) return { tag: tagWithV, variant: 'v-prefixed' };
  if (withoutVResult.status === 'fulfilled' && withoutVResult.value) return { tag: tagWithoutV, variant: 'bare' };

  return { tag: feedTag, variant: null };
}

export { selectNewestNewerPrereleaseTag, selectNewestNewerRelease, resolveDownloadTag };
