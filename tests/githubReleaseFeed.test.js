import { describe, expect, it } from 'vitest';
import { selectNewestNewerPrereleaseTag } from '../src/githubReleaseFeed.js';

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
});
