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

module.exports = {
  selectNewestNewerPrereleaseTag,
};
