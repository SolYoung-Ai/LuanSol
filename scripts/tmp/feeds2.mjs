const FEEDS = [
  ['lovelypackage-a', 'https://lovelypackage.com/rss'],
  ['lovelypackage-b', 'https://www.lovelypackage.com/feed/'],
  ['potw', 'https://packagingoftheworld.com/feed/'],
  ['fontsinuse-a', 'https://fontsinuse.com/rss'],
  ['fontsinuse-b', 'https://fontsinuse.com/feeds/rss'],
  ['dezeen', 'https://www.dezeen.com/feed/'],
  ['creativereview', 'https://www.creativereview.co.uk/feed/'],
  ['itsnicethat', 'https://www.itsnicethat.com/rss'],
  ['awwwards-blog', 'https://www.awwwards.com/blog/feed/'],
  ['designweek', 'https://www.designweek.co.uk/feed/'],
];
const strip = (s='') => s.replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&#8217;|&rsquo;/g,'’').replace(/\s+/g,' ').trim();
const out = [];
for (const [key, url] of FEEDS) {
  try {
    const ctrl = new AbortController(); const t = setTimeout(()=>ctrl.abort(), 18000);
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36' } });
    clearTimeout(t);
    const txt = await res.text();
    const items = [...txt.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1]).slice(0, 8);
    const parsed = items.map(raw => ({
      title: strip((raw.match(/<title>([\s\S]*?)<\/title>/) || [,''])[1]),
      link: ((raw.match(/<link>([\s\S]*?)<\/link>/) || [,''])[1] || '').trim(),
      image: (raw.match(/<media:content[^>]+url="([^"]+)"/) || raw.match(/<enclosure[^>]+url="([^"]+)"/) || raw.match(/<img[^>]+src="([^"]+)"/) || [])[1] || null,
      date: strip((raw.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [,''])[1]),
    }));
    out.push({ key, url, status: res.status, count: parsed.length, items: parsed });
  } catch (e) { out.push({ key, url, status: 0, error: String(e.name||e), items: [] }); }
}
console.log(JSON.stringify(out, null, 2));
