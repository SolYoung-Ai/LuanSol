const urls = ['https://bpando.org/feed/?paged=2','https://bpando.org/feed/?paged=3'];
const strip = (s='') => s.replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&#8217;|&rsquo;/g,'’').replace(/&#8211;/g,'–').replace(/\s+/g,' ').trim();
const out = [];
for (const url of urls) {
  try {
    const ctrl = new AbortController(); const t = setTimeout(()=>ctrl.abort(), 18000);
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36' } });
    clearTimeout(t); const xml = await res.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m=>m[1]).map(raw=>({
      title: strip((raw.match(/<title>([\s\S]*?)<\/title>/)||[,''])[1]),
      link: ((raw.match(/<link>([\s\S]*?)<\/link>/)||[,''])[1]||'').trim(),
      image: (raw.match(/<media:content[^>]+url="([^"]+)"/)||raw.match(/<enclosure[^>]+url="([^"]+)"/)||raw.match(/<img[^>]+src="([^"]+)"/)||[])[1]||null,
      date: strip((raw.match(/<pubDate>([\s\S]*?)<\/pubDate>/)||[,''])[1]),
      desc: strip((raw.match(/<description>([\s\S]*?)<\/description>/)||[,''])[1]).slice(0,240),
    }));
    out.push({ url, status: res.status, items });
  } catch(e){ out.push({ url, status:0, error:String(e.name||e), items:[] }); }
}
console.log(JSON.stringify(out,null,2));
