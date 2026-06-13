'use strict';

const semver = require('semver');
const { parseXml } = require('builder-util-runtime');

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

// Try to resolve the correct GitHub release tag for download URLs.
// The Atom feed tag may lack the "v" prefix while the actual release uses it.
async function resolveDownloadTag(owner, repo, feedTag) {
  const tagWithV = feedTag.startsWith('v') ? feedTag : 'v' + feedTag;
  const tagWithoutV = feedTag.startsWith('v') ? feedTag.slice(1) : feedTag;

  if (tagWithV === tagWithoutV) return { tag: tagWithV, variant: null };

  const testUrl = (tag) =>
    `https://github.com/${owner}/${repo}/releases/download/${encodeURIComponent(tag)}/latest.yml`;

  try {
    const response = await fetch(testUrl(tagWithV), { method: 'HEAD' });
    if (response.ok) return { tag: tagWithV, variant: 'v-prefixed' };
  } catch (_) {
  }

  try {
    const response = await fetch(testUrl(tagWithoutV), { method: 'HEAD' });
    if (response.ok) return { tag: tagWithoutV, variant: 'bare' };
  } catch (_) {
  }

  return { tag: feedTag, variant: null };
}

module.exports = {
  selectNewestNewerPrereleaseTag,
  selectNewestNewerRelease,
  resolveDownloadTag,
};
