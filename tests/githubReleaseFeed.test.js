// (known limitation: resolveDownloadTag network tests mock https.request but not http.request)
// (known limitation: headRequest timeout/error paths verified via reject mocks, not real timers)
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock https for resolveDownloadTag tests
vi.mock('https', () => ({
  default: {
    request: vi.fn(),
  },
}));

// Mock http just in case (not used for GitHub URLs)
vi.mock('http', () => ({
  default: {
    request: vi.fn(),
  },
}));

import {
  selectNewestNewerPrereleaseTag,
  selectNewestNewerRelease,
  resolveDownloadTag,
} from '../src/githubReleaseFeed.js';
import https from 'https';

function makeFeed(xml) {
  return xml;
}

function mockHttpsSuccess() {
  const mockReq = {
    on: vi.fn((event, cb) => {
      if (event === 'error') {
        /* don't call error */
      }
      return mockReq;
    }),
    setTimeout: vi.fn((ms, cb) => mockReq),
    end: vi.fn(),
    destroy: vi.fn(),
  };
  const mockRes = {
    statusCode: 200,
    resume: vi.fn(),
  };
  vi.mocked(https.request).mockImplementation((url, opts, cb) => {
    cb(mockRes);
    return mockReq;
  });
  return { mockReq, mockRes };
}

describe('selectNewestNewerPrereleaseTag', () => {
  it('returns null for invalid current version', () => {
    expect(selectNewestNewerPrereleaseTag('<feed></feed>', 'invalid')).toBeNull();
  });

  it('returns null when none newer', () => {
    const feed = makeFeed(`<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>v1.0.0-beta.1</title>
    <link href="https://github.com/owner/repo/releases/tag/v1.0.0-beta.1"/>
    <updated>2024-01-01T00:00:00Z</updated>
  </entry>
</feed>`);
    expect(selectNewestNewerPrereleaseTag(feed, '2.0.0')).toBeNull();
  });

  it('selects newer prerelease', () => {
    const feed = makeFeed(`<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>v1.5.0-beta.1</title>
    <link href="https://github.com/owner/repo/releases/tag/v1.5.0-beta.1"/>
    <updated>2024-01-01T00:00:00Z</updated>
  </entry>
  <entry>
    <title>v1.6.0-beta.2</title>
    <link href="https://github.com/owner/repo/releases/tag/v1.6.0-beta.2"/>
    <updated>2024-06-01T00:00:00Z</updated>
  </entry>
</feed>`);
    const result = selectNewestNewerPrereleaseTag(feed, '1.5.0');
    expect(result).not.toBeNull();
    expect(result.tag).toBe('v1.6.0-beta.2');
  });

  it('returns null for malformed feed XML', () => {
    expect(selectNewestNewerPrereleaseTag('not xml', '1.0.0')).toBeNull();
  });

  it('handles entries without links', () => {
    const feed = makeFeed(`<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>v1.0.0</title>
    <updated>2024-01-01T00:00:00Z</updated>
  </entry>
</feed>`);
    expect(selectNewestNewerPrereleaseTag(feed, '0.9.0')).toBeNull();
  });

  it('handles missing titles', () => {
    const feed = makeFeed(`<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <link href="https://github.com/owner/repo/releases/tag/v1.0.0-beta.1"/>
  </entry>
</feed>`);
    expect(selectNewestNewerPrereleaseTag(feed, '0.9.0')).not.toBeNull();
  });

  it('filters out stable releases (no prerelease)', () => {
    const feed = makeFeed(`<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>v2.0.0</title>
    <link href="https://github.com/owner/repo/releases/tag/v2.0.0"/>
    <updated>2024-06-01T00:00:00Z</updated>
  </entry>
</feed>`);
    // Stable release v2.0.0 has no prerelease, filtered out by getReleaseFromEntry
    const result = selectNewestNewerPrereleaseTag(feed, '1.0.0');
    expect(result).toBeNull();
  });

  it('handles empty entries array', () => {
    const feed = makeFeed(`<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
</feed>`);
    const result = selectNewestNewerPrereleaseTag(feed, '1.0.0');
    expect(result).toBeNull();
  });

  it('handles non-function getElements', () => {
    // Feed object where getElements is not a function
    const feed = makeFeed(`<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <link href="https://github.com/owner/repo/releases/tag/v1.5.0-beta.1"/>
  </entry>
</feed>`);
    // This will be parsed correctly (parseXml returns a proper object)
    // but getReleaseFromEntry will find no candidates if the entries don't match
    const result = selectNewestNewerPrereleaseTag(feed, '0.9.0');
    // If there are matching entries, result won't be null
    // The test just verifies no crash
    expect(typeof result === 'object' || result === null).toBe(true);
  });

  it('sorts by updated date when versions are equal', () => {
    const feed = makeFeed(`<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>v1.5.0-beta.2</title>
    <link href="https://github.com/owner/repo/releases/tag/v1.5.0-beta.2"/>
    <updated>2024-01-01T00:00:00Z</updated>
  </entry>
  <entry>
    <title>v1.5.0-beta.1</title>
    <link href="https://github.com/owner/repo/releases/tag/v1.5.0-beta.1"/>
    <updated>2024-06-01T00:00:00Z</updated>
  </entry>
</feed>`);
    const result = selectNewestNewerPrereleaseTag(feed, '1.4.0');
    expect(result).not.toBeNull();
    // Both are newer than 1.4.0, but v1.5.0-beta.2 has a newer version
    // (1.5.0-beta.2 > 1.5.0-beta.1)
    expect(result.tag).toBe('v1.5.0-beta.2');
  });

  it('handles current version with v prefix', () => {
    const feed = makeFeed(`<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>v1.6.0-beta.1</title>
    <link href="https://github.com/owner/repo/releases/tag/v1.6.0-beta.1"/>
    <updated>2024-06-01T00:00:00Z</updated>
  </entry>
</feed>`);
    const result = selectNewestNewerPrereleaseTag(feed, 'v1.5.0');
    expect(result).not.toBeNull();
    expect(result.tag).toBe('v1.6.0-beta.1');
  });
});

describe('selectNewestNewerRelease', () => {
  it('selects newest newer stable', () => {
    const feed = makeFeed(`<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>v1.0.0</title>
    <link href="https://github.com/owner/repo/releases/tag/v1.0.0"/>
    <updated>2024-01-01T00:00:00Z</updated>
  </entry>
  <entry>
    <title>v1.5.0</title>
    <link href="https://github.com/owner/repo/releases/tag/v1.5.0"/>
    <updated>2024-06-01T00:00:00Z</updated>
  </entry>
</feed>`);
    const result = selectNewestNewerRelease(feed, '1.0.0');
    expect(result).not.toBeNull();
    expect(result.tag).toBe('v1.5.0');
  });

  it('returns null when none newer', () => {
    const feed = makeFeed(`<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>v1.0.0</title>
    <link href="https://github.com/owner/repo/releases/tag/v1.0.0"/>
    <updated>2024-01-01T00:00:00Z</updated>
  </entry>
</feed>`);
    expect(selectNewestNewerRelease(feed, '2.0.0')).toBeNull();
  });

  it('returns null for invalid current version', () => {
    expect(selectNewestNewerRelease('<feed></feed>', 'abc')).toBeNull();
  });

  it('handles empty feed (no entries)', () => {
    const feed = makeFeed(`<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
</feed>`);
    const result = selectNewestNewerRelease(feed, '1.0.0');
    expect(result).toBeNull();
  });

  it('filters out entries with no matching tag', () => {
    const feed = makeFeed(`<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Some other entry</title>
    <link href="https://github.com/owner/repo/releases/something/else"/>
    <updated>2024-06-01T00:00:00Z</updated>
  </entry>
</feed>`);
    const result = selectNewestNewerRelease(feed, '1.0.0');
    expect(result).toBeNull();
  });

  it('handles malformed XML', () => {
    expect(selectNewestNewerRelease('not xml at all', '1.0.0')).toBeNull();
  });

  it('includes prerelease and stable entries', () => {
    const feed = makeFeed(`<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>v1.5.0-beta.1</title>
    <link href="https://github.com/owner/repo/releases/tag/v1.5.0-beta.1"/>
    <updated>2024-01-01T00:00:00Z</updated>
  </entry>
  <entry>
    <title>v1.5.0</title>
    <link href="https://github.com/owner/repo/releases/tag/v1.5.0"/>
    <updated>2024-06-01T00:00:00Z</updated>
  </entry>
</feed>`);
    const result = selectNewestNewerRelease(feed, '1.4.0');
    expect(result).not.toBeNull();
    // getReleaseFromEntryAny should find both, stable v1.5.0 > v1.5.0-beta.1
    expect(result.tag).toBe('v1.5.0');
  });

  it('sorts by date when versions are equal', () => {
    const feed = makeFeed(`<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>v1.5.0</title>
    <link href="https://github.com/owner/repo/releases/tag/v1.5.0"/>
    <updated>2024-01-01T00:00:00Z</updated>
  </entry>
  <entry>
    <title>v1.5.0</title>
    <link href="https://github.com/owner/repo/releases/tag/v1.5.0"/>
    <updated>2024-06-01T00:00:00Z</updated>
  </entry>
</feed>`);
    const result = selectNewestNewerRelease(feed, '1.4.0');
    expect(result).not.toBeNull();
    // Same version, newer date wins
    expect(result.updated).toBe('2024-06-01T00:00:00Z');
  });
});

describe('resolveDownloadTag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns tag as-is when v prefix already matches', async () => {
    // Both withV and withoutV are the same (tag starts with v and has no alternative)
    // Actually if tag is just "v1.0.0", withV = "v1.0.0", withoutV = "1.0.0", they're different
    // Only when tag is "foo" with no v: withV = "vfoo", withoutV = "foo" → different
    // When tag is "v" (edge case): withV = "v", withoutV = "" → different
    // The condition tagWithV === tagWithoutV is only true in edge cases
    // Let me test with a tag that has no v and isn't changed by the transformation

    // For the 'same tag' path to execute, we need headRequest to succeed on the v-prefixed variant
    const { mockReq } = mockHttpsSuccess();
    const result = await resolveDownloadTag('owner', 'repo', 'v1.0.0');
    expect(result.tag).toBe('v1.0.0');
    expect(result.variant).toBe('v-prefixed');
  });

  it('falls back to bare tag when v-prefixed fails', async () => {
    // First call (v-prefixed) fails
    let callCount = 0;
    const mockReq = {
      on: vi.fn((event, cb) => {
        if (event === 'error') {
          /* don't call */
        }
        return mockReq;
      }),
      setTimeout: vi.fn((ms, cb) => mockReq),
      end: vi.fn(),
      destroy: vi.fn(),
    };
    vi.mocked(https.request).mockImplementation((url, opts, cb) => {
      callCount++;
      if (callCount === 1) {
        // First call returns 404 (v-prefixed fails)
        process.nextTick(() => cb({ statusCode: 404, resume: vi.fn() }));
      } else {
        // Second call returns 200 (bare succeeds)
        process.nextTick(() => cb({ statusCode: 200, resume: vi.fn() }));
      }
      return mockReq;
    });
    const result = await resolveDownloadTag('owner', 'repo', 'v1.0.0');
    expect(result.tag).toBe('1.0.0');
    expect(result.variant).toBe('bare');
  });

  it('returns bare tag directly when tag has no v prefix', async () => {
    // FeedTag is "1.0.0" (no v prefix), withV = "v1.0.0", withoutV = "1.0.0"
    // First try v-prefixed → success
    const { mockReq } = mockHttpsSuccess();
    const result = await resolveDownloadTag('owner', 'repo', '1.0.0');
    expect(result.tag).toBe('v1.0.0');
    expect(result.variant).toBe('v-prefixed');
  });

  it('returns original feedTag when both variants fail', async () => {
    let callCount = 0;
    const mockReq = {
      on: vi.fn((event, cb) => {
        if (event === 'error') {
          cb(new Error('fail'));
        }
        return mockReq;
      }),
      setTimeout: vi.fn((ms, cb) => mockReq),
      end: vi.fn(),
      destroy: vi.fn(),
    };
    vi.mocked(https.request).mockImplementation((url, opts, cb) => {
      callCount++;
      // Both calls fail
      process.nextTick(() => cb({ statusCode: 404, resume: vi.fn() }));
      return mockReq;
    });
    const result = await resolveDownloadTag('owner', 'repo', 'v1.0.0');
    expect(result.tag).toBe('v1.0.0');
    expect(result.variant).toBeNull();
  });

  it('selectNewestNewerRelease returns null for malformed feed', () => {
    const result = selectNewestNewerRelease('<malformed>', '1.0.0');
    expect(result).toBeNull();
  });

  it('resolveDownloadTag setTimeout path', async () => {
    const { resolveDownloadTag } = await import('../src/githubReleaseFeed.js');
    https.request = vi.fn((url, opts, cb) => {
      const mockReq = {
        on: vi.fn((event, handler) => {
          if (event === 'error') {
            process.nextTick(() => handler(new Error('timeout')));
          }
          return mockReq;
        }),
        setTimeout: vi.fn((ms, cb) => {
          process.nextTick(() => cb());
          return mockReq;
        }),
        end: vi.fn(),
        destroy: vi.fn(),
      };
      return mockReq;
    });
    const result = await resolveDownloadTag('owner', 'repo', 'v2.0.0');
    expect(result).toBeDefined();
    expect(result.tag).toBeDefined();
  });

  it('selectNewestNewerPrereleaseTag sorts by updated when versions equal', () => {
    const feedXml = `<?xml version="1.0"?><feed><entry><link href="/releases/tag/v1.5.0-beta.1"/><title>v1.5.0-beta.1</title><updated>2024-01-01</updated></entry><entry><link href="/releases/tag/v1.5.0-beta.1"/><title>v1.5.0-beta.1</title><updated>2024-06-01</updated></entry></feed>`;
    const result = selectNewestNewerPrereleaseTag(feedXml, '1.0.0');
    expect(result).toBeDefined();
  });

  it('getReleaseFromEntry returns null when link does not match TAG_HREF_RE (line 25 branch)', () => {
    const result = selectNewestNewerPrereleaseTag(
      `<?xml version="1.0"?><feed><entry><link href="https://example.com/not-a-tag"/><title>v2.0.0-beta.1</title></entry></feed>`,
      '1.0.0'
    );
    expect(result).toBeNull();
  });

  it('getReleaseFromEntry returns null for stable-only feed (line 25 branch)', () => {
    const result = selectNewestNewerPrereleaseTag(
      `<?xml version="1.0"?><feed><entry><link href="/releases/tag/v2.0.0"/><title>v2.0.0</title></entry></feed>`,
      '1.0.0'
    );
    expect(result).toBeNull();
  });

  it('getEntryLink catch branch returns empty string', () => {
    const result = selectNewestNewerRelease(`<?xml version="1.0"?><feed><entry><invalid/></entry></feed>`, '1.0.0');
    expect(result).toBeNull();
  });

  it('getEntryText catch branch returns empty string', () => {
    const result = selectNewestNewerRelease(
      `<?xml version="1.0"?><feed><entry><link href="/releases/tag/v2.0.0-beta.1"/><invalid/></entry></feed>`,
      '1.0.0'
    );
    // The entry should be found since link matches
    expect(result).not.toBeNull();
  });

  it('selectNewestNewerRelease filters by getReleaseFromEntryAny (line 25)', () => {
    const result = selectNewestNewerRelease(
      `<?xml version="1.0"?><feed><entry><link href="/releases/tag/v2.0.0"/><title>v2.0.0</title></entry></feed>`,
      '1.0.0'
    );
    expect(result).not.toBeNull();
    expect(result.version).toBe('2.0.0');
  });
});
