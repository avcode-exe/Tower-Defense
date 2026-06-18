import { describe, expect, it } from 'vitest';
import { selectNewestNewerPrereleaseTag, selectNewestNewerRelease } from '../src/githubReleaseFeed.js';

const FEED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>tag:github.com,2008:Repository/1256735643/1.4.1-beta.2</id>
    <updated>2026-06-10T08:33:02Z</updated>
    <link rel="alternate" type="text/html" href="https://github.com/avcode-exe/Tower-Defense/releases/tag/1.4.1-beta.2"/>
    <title>1.4.1-beta.2</title>
    <content type="html">&lt;p&gt;Older beta&lt;/p&gt;</content>
  </entry>
  <entry>
    <id>tag:github.com,2008:Repository/1256735643/v1.5.0-beta.1</id>
    <updated>2026-06-10T16:34:57Z</updated>
    <link rel="alternate" type="text/html" href="https://github.com/avcode-exe/Tower-Defense/releases/tag/v1.5.0-beta.1"/>
    <title>1.5.0-beta.1</title>
    <content type="html">&lt;p&gt;Newer beta&lt;/p&gt;</content>
  </entry>
  <entry>
    <id>tag:github.com,2008:Repository/1256735643/v1.4.1</id>
    <updated>2026-06-10T11:30:22Z</updated>
    <link rel="alternate" type="text/html" href="https://github.com/avcode-exe/Tower-Defense/releases/tag/v1.4.1"/>
    <title>v1.4.1</title>
    <content type="html">&lt;p&gt;Stable&lt;/p&gt;</content>
  </entry>
</feed>`;

describe('selectNewestNewerRelease', () => {
  it('selects the newest newer stable release', () => {
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <link rel="alternate" type="text/html" href="https://github.com/avcode-exe/Tower-Defense/releases/tag/v1.4.1"/>
    <updated>2026-06-10T08:00:00Z</updated>
    <title>1.4.1</title>
  </entry>
  <entry>
    <link rel="alternate" type="text/html" href="https://github.com/avcode-exe/Tower-Defense/releases/tag/v1.6.0"/>
    <updated>2026-06-10T09:00:00Z</updated>
    <title>1.6.0</title>
  </entry>
  <entry>
    <link rel="alternate" type="text/html" href="https://github.com/avcode-exe/Tower-Defense/releases/tag/v1.5.0"/>
    <updated>2026-06-10T10:00:00Z</updated>
    <title>1.5.0</title>
  </entry>
</feed>`;

    const selected = selectNewestNewerRelease(feed, '1.5.0');

    expect(selected).toMatchObject({
      tag: 'v1.6.0',
      version: '1.6.0',
      title: '1.6.0',
    });
  });

  it('returns null when no release is newer', () => {
    expect(selectNewestNewerRelease(FEED_XML, '1.5.0')).toBeNull();
  });

  it('returns null for invalid current versions and malformed feeds', () => {
    expect(selectNewestNewerRelease(FEED_XML, 'not-a-version')).toBeNull();
    expect(selectNewestNewerRelease('<feed>', '1.5.0')).toBeNull();
  });
});

describe('selectNewestNewerPrereleaseTag', () => {
  it('skips older prerelease feed entries and chooses the highest newer prerelease', () => {
    const selected = selectNewestNewerPrereleaseTag(FEED_XML, '1.4.1');

    expect(selected).toMatchObject({
      tag: 'v1.5.0-beta.1',
      version: '1.5.0-beta.1',
      title: '1.5.0-beta.1',
    });
  });

  it('returns null when no prerelease is newer than the current version', () => {
    const selected = selectNewestNewerPrereleaseTag(FEED_XML, '1.5.0-beta.1');

    expect(selected).toBeNull();
  });

  it('returns null for invalid current versions and malformed feeds', () => {
    expect(selectNewestNewerPrereleaseTag(FEED_XML, 'not-a-version')).toBeNull();
    expect(selectNewestNewerPrereleaseTag('<feed>', '1.5.0-beta.1')).toBeNull();
  });
});
