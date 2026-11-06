const SITES = [
  ['bpando','https://bpando.org/'],
  ['thedieline','https://thedieline.com/'],
  ['brandnew','https://www.underconsideration.com/brandnew/'],
  ['itsnicethat','https://www.itsnicethat.com/'],
  ['awwwards','https://www.awwwards.com/'],
  ['pentagram','https://www.pentagram.com/'],
  ['collins','https://www.wearecollins.com/'],
  ['designstudio','https://design.studio/'],
  ['bedow','https://bedow.se/'],
  ['fontsinuse','https://fontsinuse.com/'],
  ['typewolf','https://www.typewolf.com/'],
  ['siteinspire','https://www.siteinspire.com/'],
  ['lovelypackage','https://lovelypackage.com/'],
  ['packagingoftheworld','https://packagingoftheworld.com/'],
  ['zcool','https://www.zcool.com.cn/'],
  ['topys','https://www.topys.cn/'],
  ['gtn9','https://www.gtn9.com/'],
  ['pentawards','https://www.pentawards.com/'],
  ['thedots','https://thedots.co/'],
  ['studiosos','https://studio-sofia.com/'],
];
const out = [];
for (const [key, url] of SITES) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36' } });
    clearTimeout(t);
    const html = await res.text();
    const pick = (re) => { const m = html.match(re); return m ? m[1].trim() : null; };
    const title = pick(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const og = pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) || pick(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    const desc = pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) || pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
    out.push({ key, url, status: res.status, finalUrl: res.url, title: title && title.replace(/\s+/g,' ').slice(0,120), og, desc: desc && desc.slice(0,200) });
  } catch (e) { out.push({ key, url, status: 0, error: String(e.name || e) }); }
}
console.log(JSON.stringify(out, null, 2));
