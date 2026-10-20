'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    nicheScore,
    trafficValue,
    trafficScore,
    parseTrendsRss,
    parseNewsRss,
    sameStory,
    mapCategory,
    freshnessScore,
    suggestAngle,
    buildScoutPicks,
} = require('../blog_trend_scout');

test('nicheScore rewards study/jobs/current-affairs, blocks entertainment/sports', () => {
    assert.ok(nicheScore('SSC CGL 2026 admit card released') > 20);
    assert.ok(nicheScore('Railway RRB NTPC recruitment 2026 vacancy') > 20);
    assert.ok(nicheScore('UP Board result 2026 date') > 10);
    assert.ok(nicheScore('daily current affairs for UPSC') > 10);
    assert.equal(nicheScore('IPL 2026 match score highlights'), -1);
    assert.equal(nicheScore('new bollywood movie box office'), -1);
    assert.equal(nicheScore('sensex today stock market'), -1);
    assert.equal(nicheScore('random viral video'), 0);
});

test('trafficValue parses K/M/B suffixes', () => {
    assert.equal(trafficValue('100K+'), 100000);
    assert.equal(trafficValue('2M+'), 2000000);
    assert.equal(trafficValue('5000+'), 5000);
    assert.equal(trafficValue(''), 0);
    assert.ok(trafficScore('2M+') > trafficScore('100K+'));
    assert.ok(trafficScore('100K+') > trafficScore('2K+'));
});

test('parseTrendsRss extracts topics + traffic + news items', () => {
    const xml = `<rss><channel>
<item><title>SSC CGL Result 2026</title><ht:approx_traffic>100K+</ht:approx_traffic>
<pubDate>Tue, 20 Oct 2026 05:00:00 GMT</pubDate>
<ht:news_item><ht:news_item_title>SSC declares CGL result</ht:news_item_title>
<ht:news_item_url>https://example.com/ssc-result</ht:news_item_url>
<ht:news_item_source>Example News</ht:news_item_source></ht:news_item>
</item>
<item><title>x</title></item>
</channel></rss>`;
    const items = parseTrendsRss(xml);
    assert.equal(items.length, 1);
    assert.equal(items[0].title, 'SSC CGL Result 2026');
    assert.equal(items[0].traffic, 100000);
    assert.equal(items[0].news.length, 1);
    assert.equal(items[0].news[0].url, 'https://example.com/ssc-result');
});

test('parseNewsRss strips source suffix from titles', () => {
    const xml = `<rss><channel><item>
<title><![CDATA[RRB NTPC admit card out - Dainik Bhaskar]]></title>
<link>https://news.google.com/rss/articles/xyz</link>
<pubDate>Tue, 20 Oct 2026 06:00:00 GMT</pubDate>
<source url="https://example.com">Dainik Bhaskar</source>
</item></channel></rss>`;
    const items = parseNewsRss(xml);
    assert.equal(items.length, 1);
    assert.equal(items[0].title, 'RRB NTPC admit card out');
    assert.equal(items[0].source, 'Dainik Bhaskar');
});

test('sameStory clusters same-event headlines', () => {
    assert.equal(sameStory('SSC CGL admit card 2026 released', 'SSC CGL 2026 admit card download link'), true);
    assert.equal(sameStory('SSC CGL admit card released', 'IPL match tickets booking'), false);
});

test('mapCategory routes to MASTER_POOL categories', () => {
    assert.equal(mapCategory('Railway recruitment 2026 vacancy'), 'Job_Alerts');
    assert.equal(mapCategory('SSC CGL syllabus and exam pattern'), 'Syllabus_Guide');
    assert.equal(mapCategory('SSC CGL admit card released'), 'Trending_Education_News');
    assert.equal(mapCategory('how to crack UPSC strategy'), 'Exam_Strategies');
    assert.equal(mapCategory('career after 12th salary scope'), 'Career_Guidance');
});

test('freshnessScore prefers last-24h news', () => {
    const now = Date.parse('2026-10-20T12:00:00Z');
    assert.equal(freshnessScore('2026-10-20T06:00:00Z', now), 10);
    assert.equal(freshnessScore('2026-10-19T06:00:00Z', now), 6);
    assert.equal(freshnessScore('2026-10-17T06:00:00Z', now), 3);
    assert.equal(freshnessScore('2026-10-10T06:00:00Z', now), 0);
});

test('suggestAngle gives actionable blog angles', () => {
    assert.match(suggestAngle('SSC CGL admit card out'), /download/i);
    assert.match(suggestAngle('RRB NTPC result declared'), /cut-off/i);
    assert.match(suggestAngle('UP Police bharti notification'), /Eligibility/i);
});

test('buildScoutPicks: shield + already-queued topics repeat nahi hote', () => {
    const now = Date.parse('2026-10-20T12:00:00Z');
    const news = [
        { title: 'SSC CGL admit card 2026 released download', link: 'https://a.com/1', pubDate: '2026-10-20T08:00:00Z', source: 'A' },
        { title: 'SSC CGL 2026 admit card download link active', link: 'https://b.com/2', pubDate: '2026-10-20T09:00:00Z', source: 'B' },
        { title: 'Railway RRB NTPC recruitment 2026 vacancy notification', link: 'https://c.com/3', pubDate: '2026-10-20T07:00:00Z', source: 'C' },
    ];
    const picks = buildScoutPicks({
        trendItems: [{ title: 'SSC CGL admit card', traffic: 100000, trafficRaw: '100K+', pubDate: '', news: [] }],
        newsItems: news,
        shieldTitles: [],
        alreadyQueued: [],
        now,
        maxPicks: 3,
    });
    assert.ok(picks.length >= 2, `picks=${picks.length}`);
    assert.equal(picks[0].sources.length >= 2, true); // corroborated cluster
    assert.match(picks[0].trendEvidence, /Trends|news sources/);

    // Shield: SSC wala topic site pe hai → sirf Railway pick hona chahiye
    const shielded = buildScoutPicks({
        trendItems: [], newsItems: news,
        shieldTitles: ['SSC CGL admit card 2026 released download'],
        alreadyQueued: [], now, maxPicks: 3,
    });
    assert.ok(shielded.every((p) => !/SSC CGL/i.test(p.topic)), JSON.stringify(shielded.map((p) => p.topic)));
});

test('buildScoutPicks: blocked niche kabhi pick nahi hota', () => {
    const picks = buildScoutPicks({
        trendItems: [{ title: 'IPL match score', traffic: 2000000, trafficRaw: '2M+', pubDate: '', news: [] }],
        newsItems: [{ title: 'IPL match score highlights video', link: 'https://x.com', pubDate: '', source: 'X' }],
        shieldTitles: [], alreadyQueued: [], now: Date.now(), maxPicks: 3,
    });
    assert.equal(picks.length, 0);
});
