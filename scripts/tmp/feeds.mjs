const FEEDS = [
  ['bpando', 'https://bpando.org/feed/'],
  ['lovelypackage', 'https://lovelypackage.com/feed/'],
  ['packagingoftheworld', 'https://packagingoftheworld.com/feed/'],
  ['fontsinuse', 'https://fontsinuse.com/feeds/rss/all.xml'],
  ['thedieline', 'https://thedieline.com/feed/'],
];
const strip = (s='') => s.replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&#8217;|&rsquo;/g,'’').replace(/&#8220;|&ldquo;/g,'“').replace(/&#8221;|&rdquo;/g,'”').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
const out = [];
for (const [key, url] of FEEDS) {
  try {
    const ctrl = new AbortController(); const t = setTimeout(()=>ctrl.abort(), 20000);
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36' } });
    clearTimeout(t);
    const xml = await res.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1]);
    const parsed = items.slice(0, 10).map(raw => {
      const title = strip((raw.match(/<title>([\s\S]*?)<\/title>/) || [,''])[1]);
      const link = ((raw.match(/<link>([\s\S]*?)<\/link>/) || raw.match(/<guid[^>]*>([\s\S]*?)<\/guid>/) || [,''])[1] || '').trim();
      const imgFromMedia = (raw.match(/<media:content[^>]+url="([^"]+)"/) || [])[1];
      const imgFromEnclosure = (raw.match(/<enclosure[^>]+url="([^"]+)"/) || [])[1];
      const imgFromHtml = (raw.match(/<img[^>]+src="([^"]+)"/) || [])[1];
      const desc = strip((raw.match(/<description>([\s\S]*?)<\/description>/) || [,''])[1]).slice(0, 220);
      const date = strip((raw.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [,''])[1]);
      return { title, link, image: imgFromMedia || imgFromEnclosure || imgFromHtml || null, desc, date };
    });
    out.push({ key, url, status: res.status, count: parsed.length, items: parsed });
  } catch (e) { out.push({ key, url, status: 0, error: String(e.name || e), items: [] }); }
}
console.log(JSON.stringify(out, null, 2));
