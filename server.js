const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const SITE_FILE = path.join(DATA, 'site.json');
const LEADS_FILE = path.join(DATA, 'leads.json');

function loadEnv(){
  const f=path.join(ROOT,'.env'); if(!fs.existsSync(f)) return;
  for(const line of fs.readFileSync(f,'utf8').split(/\r?\n/)){
    const s=line.trim(); if(!s||s.startsWith('#')||!s.includes('=')) continue;
    const i=s.indexOf('='); const k=s.slice(0,i).trim(); let v=s.slice(i+1).trim();
    if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);
    if(!(k in process.env)) process.env[k]=v;
  }
}
loadEnv();
const PORT = Number(process.env.PORT || 3015);
const SITE_URL = (process.env.SITE_URL || `http://localhost:${PORT}`).replace(/\/$/,'');
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ChangeMe@123';
const SESSION_SECRET = process.env.SESSION_SECRET || 'development-secret-change-before-production-please';

function readJSON(file, fallback){ try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return fallback} }
function writeJSON(file,data){ const tmp=file+'.tmp'; fs.writeFileSync(tmp,JSON.stringify(data,null,2)); fs.renameSync(tmp,file); }
function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function safeJson(obj){return JSON.stringify(obj).replace(/</g,'\\u003c')}
function parseCookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('=');return [decodeURIComponent(v.slice(0,i)),decodeURIComponent(v.slice(i+1))]}))}
function sign(value){return crypto.createHmac('sha256',SESSION_SECRET).update(value).digest('hex')}
function issueSession(){const exp=Date.now()+12*60*60*1000;const payload=`${ADMIN_USER}|${exp}`;return Buffer.from(`${payload}|${sign(payload)}`).toString('base64url')}
function isAuthed(req){try{const token=parseCookies(req).royal_session;if(!token)return false;const decoded=Buffer.from(token,'base64url').toString();const parts=decoded.split('|');if(parts.length!==3)return false;const [user,exp,sig]=parts;const payload=`${user}|${exp}`;return user===ADMIN_USER&&Number(exp)>Date.now()&&crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(sign(payload)))}catch{return false}}
function send(res,status,body,type='text/html; charset=utf-8',headers={}){res.writeHead(status,{'Content-Type':type,'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'SAMEORIGIN',...headers});res.end(body)}
function json(res,status,obj,headers={}){send(res,status,JSON.stringify(obj),'application/json; charset=utf-8',headers)}
function getBody(req,limit=8*1024*1024){return new Promise((resolve,reject)=>{let chunks=[],size=0;req.on('data',c=>{size+=c.length;if(size>limit){reject(new Error('Payload too large'));req.destroy();return}chunks.push(c)});req.on('end',()=>{const raw=Buffer.concat(chunks).toString('utf8');if(!raw)return resolve({});try{resolve(JSON.parse(raw))}catch{reject(new Error('Invalid JSON'))}});req.on('error',reject)})}
function contentType(f){const e=path.extname(f).toLowerCase();return ({'.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.json':'application/json; charset=utf-8'}[e]||'application/octet-stream')}
function serveStatic(urlPath,res){const rel=urlPath.replace(/^\//,'');const f=path.normalize(path.join(PUBLIC,rel));if(!f.startsWith(PUBLIC)||!fs.existsSync(f)||fs.statSync(f).isDirectory())return false;send(res,200,fs.readFileSync(f),contentType(f),{'Cache-Control':urlPath.startsWith('/uploads/')?'public,max-age=86400':'public,max-age=3600'});return true}
function absUrl(value){if(!value)return SITE_URL;if(/^https?:\/\//i.test(value))return value;return SITE_URL+(value.startsWith('/')?'':'/')+value}
function splitPair(item){const i=String(item).indexOf('|');return i===-1?[String(item),'']:[String(item).slice(0,i),String(item).slice(i+1)]}
function pageByPath(site,pathname){return site.pages.find(p=>p.status==='published' && p.slug===pathname) || null}

function buildAutoSchema(site,page){
  const g=site.global, faq=(page.sections||[]).find(s=>s.type==='faq');
  const base={
    '@context':'https://schema.org',
    '@type': page.seo.schemaType || 'WebPage',
    name: page.seo.title || page.name,
    description: page.seo.description || page.geo.summary,
    url: absUrl(page.seo.canonical || page.slug),
    isPartOf:{'@type':'WebSite',name:g.brandName,url:SITE_URL},
    about:(page.geo.entities||'').split(',').map(x=>x.trim()).filter(Boolean).map(name=>({'@type':'Thing',name})),
    areaServed:(page.geo.serviceAreas||'').split(',').map(x=>x.trim()).filter(Boolean).map(name=>({'@type':'Place',name}))
  };
  if(page.slug==='/'){
    base.telephone=g.phone;base.email=g.email;base.address={'@type':'PostalAddress','streetAddress':g.address};base.sameAs=[g.instagram,g.youtube,g.facebook].filter(Boolean);
  }
  const graph=[base];
  if(faq && faq.items?.length){graph.push({'@type':'FAQPage',mainEntity:faq.items.map(it=>{const[q,a]=splitPair(it);return {'@type':'Question',name:q,acceptedAnswer:{'@type':'Answer',text:a}}})})}
  return {'@context':'https://schema.org','@graph':graph.map(({['@context']:_,...x})=>x)};
}
function head(site,page){const s=page.seo||{},g=page.geo||{};const robots=`${s.robotsIndex===false?'noindex':'index'},${s.robotsFollow===false?'nofollow':'follow'}`;let schema=buildAutoSchema(site,page);if(s.customSchema){try{schema=JSON.parse(s.customSchema)}catch{}}
return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(s.title||page.name)}</title><meta name="description" content="${esc(s.description||'')}"><meta name="keywords" content="${esc(s.keywords||'')}"><meta name="robots" content="${robots}"><link rel="canonical" href="${esc(absUrl(s.canonical||page.slug))}"><meta property="og:type" content="website"><meta property="og:site_name" content="${esc(site.global.brandName)}"><meta property="og:title" content="${esc(s.ogTitle||s.title||page.name)}"><meta property="og:description" content="${esc(s.ogDescription||s.description||'')}"><meta property="og:url" content="${esc(absUrl(s.canonical||page.slug))}"><meta property="og:image" content="${esc(absUrl(s.ogImage||page.hero.image))}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(s.ogTitle||s.title||page.name)}"><meta name="twitter:description" content="${esc(s.ogDescription||s.description||'')}"><meta name="twitter:image" content="${esc(absUrl(s.ogImage||page.hero.image))}"><meta name="ai-summary" content="${esc(g.summary||'')}"><meta name="subject" content="${esc(g.entities||'')}"><link rel="stylesheet" href="/style.css"><script type="application/ld+json">${safeJson(schema)}</script></head><body>`}
function nav(site,page){const g=site.global;return `<div class="topbar"><div class="shell"><span>Live Band • Weddings • Corporate • Private Events</span><span>${esc(g.phone)} &nbsp; • &nbsp; ${esc(g.email)}</span></div></div><header class="nav"><div class="shell"><a class="brand" href="/">${esc(g.logoText||g.brandName)}<span>THE ROYAL BAND</span></a><button class="mobile-toggle" aria-label="Menu">☰</button><nav class="navlinks" aria-label="Primary">${site.pages.filter(p=>p.status==='published').map(p=>`<a class="${p.id===page.id?'active':''}" href="${esc(p.slug)}">${esc(p.name)}</a>`).join('')}</nav><a class="btn nav-cta" href="/contact">${esc(g.primaryCta||'Book Now')}</a></div></header>`}
function hero(page){const h=page.hero||{};return `<section class="hero"><div class="hero-media"><img src="${esc(h.image)}" alt="${esc(page.name)} - The Royal Band" fetchpriority="high"></div><div class="shell"><div class="hero-content"><div class="eyebrow">${esc(h.eyebrow)}</div><h1>${esc(h.title)}</h1><p>${esc(h.subtitle)}</p><div class="actions"><a class="btn" href="/contact">${esc(h.primaryCta||'Book Now')}</a><a class="btn secondary" href="${page.slug==='/'?'/performances':'/gallery'}">${esc(h.secondaryCta||'Explore')}</a></div></div></div></section>`}
function sectionHtml(section,site){const t=section.type,items=section.items||[];const heading=`<div class="section-head">${section.eyebrow?`<div class="eyebrow">${esc(section.eyebrow)}</div>`:''}${section.heading?`<h2>${esc(section.heading)}</h2>`:''}${section.body?`<p>${esc(section.body)}</p>`:''}</div>`;
  if(t==='split')return `<section class="section"><div class="shell split"><div>${heading}${items.length?`<div class="bullets">${items.map(x=>`<div class="bullet">${esc(x)}</div>`).join('')}</div>`:''}</div><div class="split-media"><img loading="lazy" src="${esc(section.image||'/assets/band-stage.svg')}" alt="${esc(section.heading||'Royal Band')}"></div></div></section>`;
  if(t==='cards')return `<section class="section alt"><div class="shell">${heading}<div class="cards">${items.map((it,i)=>{const[a,b]=splitPair(it);return `<article class="card"><div class="num">0${i+1}</div><h3>${esc(a)}</h3><p>${esc(b)}</p></article>`}).join('')}</div></div></section>`;
  if(t==='stats')return `<section class="section"><div class="shell">${heading}<div class="stats">${items.map(it=>{const[a,b]=splitPair(it);return `<div class="stat"><strong>${esc(a)}</strong><span>${esc(b)}</span></div>`}).join('')}</div></div></section>`;
  if(t==='gallery')return `<section class="section alt"><div class="shell">${heading}<div class="gallery">${items.map((src,i)=>`<figure><img loading="lazy" src="${esc(src)}" alt="Royal Band event moment ${i+1}"></figure>`).join('')}</div></div></section>`;
  if(t==='testimonials')return `<section class="section"><div class="shell">${heading}<div class="quotes">${items.map(it=>{const[a,b]=splitPair(it);return `<article class="quote"><div class="stars">★★★★★</div><blockquote>“${esc(b)}”</blockquote><strong>${esc(a)}</strong></article>`}).join('')}</div></div></section>`;
  if(t==='faq')return `<section class="section alt"><div class="shell">${heading}<div class="faq">${items.map(it=>{const[q,a]=splitPair(it);return `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`}).join('')}</div></div></section>`;
  if(t==='timeline')return `<section class="section"><div class="shell">${heading}<div class="timeline">${items.map(it=>{const[a,b]=splitPair(it);return `<div class="step"><b>${esc(a)}</b><p>${esc(b)}</p></div>`}).join('')}</div></div></section>`;
  if(t==='cta')return `<section class="section"><div class="shell"><div class="cta"><div>${section.eyebrow?`<div class="eyebrow">${esc(section.eyebrow)}</div>`:''}<h2>${esc(section.heading)}</h2><p>${esc(section.body||'')}</p></div><div class="actions"><a class="btn" href="/contact">${esc(items[0]||'Book Now')}</a><a class="btn secondary" href="https://wa.me/${String(site.global.whatsapp||'').replace(/\D/g,'')}" target="_blank" rel="noopener">${esc(items[1]||'WhatsApp')}</a></div></div></div></section>`;
  if(t==='contact')return `<section class="section"><div class="shell">${heading}<div class="contact-grid"><aside class="contact-panel"><div class="eyebrow">DIRECT CONTACT</div><h2>Talk to Our Booking Team</h2><div class="contact-row"><small>Phone</small><b>${esc(site.global.phone)}</b></div><div class="contact-row"><small>Email</small><b>${esc(site.global.email)}</b></div><div class="contact-row"><small>WhatsApp</small><b>${esc(site.global.whatsapp)}</b></div><div class="contact-row"><small>Location</small><b>${esc(site.global.address)}</b></div></aside><div class="form-panel"><form id="enquiryForm"><div class="form-grid"><div class="field"><label>Name *</label><input name="name" required></div><div class="field"><label>Phone *</label><input name="phone" required></div><div class="field"><label>Email</label><input name="email" type="email"></div><div class="field"><label>City</label><input name="city"></div><div class="field"><label>Event type</label><select name="eventType"><option>Wedding</option><option>Baraat</option><option>Corporate Event</option><option>Private Celebration</option><option>Other</option></select></div><div class="field"><label>Event date</label><input name="eventDate" type="date"></div><div class="field full"><label>Message</label><textarea name="message" placeholder="Venue, timing, guest count or anything else…"></textarea></div><div class="field full"><button class="btn" type="submit">Send Enquiry</button><div class="notice"></div></div></div></form></div></div></div></section>`;
  return '';
}
function footer(site){const g=site.global;return `<footer class="footer"><div class="shell"><div class="footer-grid"><div><div class="brand">${esc(g.logoText||g.brandName)}<span>THE ROYAL BAND</span></div><p>${esc(g.footerBlurb)}</p></div><div><h4>Explore</h4>${site.pages.filter(p=>p.status==='published').map(p=>`<a href="${esc(p.slug)}">${esc(p.name)}</a>`).join('')}</div><div><h4>Contact</h4><a href="tel:${esc(g.phone)}">${esc(g.phone)}</a><a href="mailto:${esc(g.email)}">${esc(g.email)}</a><a target="_blank" rel="noopener" href="https://wa.me/${String(g.whatsapp||'').replace(/\D/g,'')}">WhatsApp</a></div></div><div class="footer-bottom"><span>${esc(g.copyright)}</span><span>Premium live entertainment for remarkable celebrations.</span></div></div></footer><script src="/site.js" defer></script></body></html>`}
function renderPage(site,page){return head(site,page)+nav(site,page)+hero(page)+(page.sections||[]).map(s=>sectionHtml(s,site)).join('')+footer(site)}
function adminHtml(){return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Royal CMS Admin</title><meta name="robots" content="noindex,nofollow"><link rel="stylesheet" href="/admin.css"></head><body><div style="min-height:100vh;display:grid;place-items:center;color:#d4af55;background:#070707;font-family:system-ui">Loading Royal CMS…</div><script src="/admin.js"></script></body></html>`}
function notFound(site){const p=site.pages.find(x=>x.slug==='/')||site.pages[0];return head(site,{...p,name:'Page Not Found',seo:{...p.seo,title:'404 | '+site.global.brandName,description:'Page not found',robotsIndex:false},hero:{...p.hero,eyebrow:'404',title:'This Page Missed the Beat',subtitle:'The page you requested could not be found.'}})+nav(site,p)+`<section class="section"><div class="shell"><div class="cta"><div><h2>Back to the celebration</h2><p>Return to the homepage or contact our booking team.</p></div><div class="actions"><a class="btn" href="/">Go Home</a><a class="btn secondary" href="/contact">Contact Us</a></div></div></div></section>`+footer(site)}

const server=http.createServer(async(req,res)=>{
  let u;try{u=new URL(req.url,`http://${req.headers.host||'localhost'}`)}catch{return send(res,400,'Bad Request')}
  const pathname=decodeURIComponent(u.pathname).replace(/\/+$/,'')||'/';
  if(pathname.startsWith('/assets/')||pathname.startsWith('/uploads/')||['/style.css','/site.js','/admin.css','/admin.js'].includes(pathname)){if(serveStatic(pathname,res))return;return send(res,404,'Not found','text/plain')}
  if(pathname==='/api/auth/login'&&req.method==='POST'){
    try{const b=await getBody(req);const user=String(b.username||''),pass=String(b.password||'');const ok=crypto.timingSafeEqual(Buffer.from(crypto.createHash('sha256').update(user).digest('hex')),Buffer.from(crypto.createHash('sha256').update(ADMIN_USER).digest('hex')))&&crypto.timingSafeEqual(Buffer.from(crypto.createHash('sha256').update(pass).digest('hex')),Buffer.from(crypto.createHash('sha256').update(ADMIN_PASSWORD).digest('hex')));if(!ok)return json(res,401,{error:'Invalid credentials'});return json(res,200,{ok:true},{'Set-Cookie':`royal_session=${issueSession()}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${process.env.NODE_ENV==='production'?'; Secure':''}`})}catch(e){return json(res,400,{error:e.message})}
  }
  if(pathname==='/api/auth/logout'&&req.method==='POST')return json(res,200,{ok:true},{'Set-Cookie':'royal_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'});
  if(pathname.startsWith('/api/admin/')&&!isAuthed(req))return json(res,401,{error:'Unauthorized'});
  if(pathname==='/api/admin/site'&&req.method==='GET')return json(res,200,readJSON(SITE_FILE,{global:{},pages:[]}));
  if(pathname==='/api/admin/site'&&req.method==='PUT'){
    try{const b=await getBody(req);if(!b||!b.global||!Array.isArray(b.pages))return json(res,400,{error:'Invalid site data'});for(const p of b.pages){if(!p.id||!p.name||!p.slug)return json(res,400,{error:'Every page needs id, name and slug'});if(!p.slug.startsWith('/'))p.slug='/'+p.slug;}const slugs=b.pages.map(p=>p.slug);if(new Set(slugs).size!==slugs.length)return json(res,400,{error:'Page URLs must be unique'});writeJSON(SITE_FILE,b);return json(res,200,{ok:true})}catch(e){return json(res,400,{error:e.message})}
  }
  if(pathname==='/api/admin/upload'&&req.method==='POST'){
    try{const b=await getBody(req,8*1024*1024);const m=String(b.dataUrl||'').match(/^data:(image\/(png|jpeg|jpg|webp|gif|svg\+xml));base64,(.+)$/);if(!m)return json(res,400,{error:'Only image uploads are allowed'});const buf=Buffer.from(m[3],'base64');if(buf.length>5*1024*1024)return json(res,400,{error:'Image exceeds 5MB'});const ext=({png:'png',jpeg:'jpg',jpg:'jpg',webp:'webp',gif:'gif','svg+xml':'svg'})[m[2]]||'img';const base=String(b.name||'image').replace(/\.[^.]+$/,'').replace(/[^a-z0-9_-]+/gi,'-').slice(0,50)||'image';const name=`${Date.now()}-${base}.${ext}`;fs.writeFileSync(path.join(PUBLIC,'uploads',name),buf);return json(res,200,{ok:true,url:'/uploads/'+name})}catch(e){return json(res,400,{error:e.message})}
  }
  if(pathname==='/api/admin/leads'&&req.method==='GET')return json(res,200,readJSON(LEADS_FILE,[]).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));
  if(pathname==='/api/contact'&&req.method==='POST'){
    try{const b=await getBody(req,128*1024);if(!String(b.name||'').trim()||!String(b.phone||'').trim())return json(res,400,{error:'Name and phone are required'});const leads=readJSON(LEADS_FILE,[]);leads.push({id:crypto.randomUUID(),createdAt:new Date().toISOString(),name:String(b.name).slice(0,120),phone:String(b.phone).slice(0,60),email:String(b.email||'').slice(0,160),city:String(b.city||'').slice(0,120),eventType:String(b.eventType||'').slice(0,120),eventDate:String(b.eventDate||'').slice(0,40),message:String(b.message||'').slice(0,3000)});writeJSON(LEADS_FILE,leads);return json(res,200,{ok:true})}catch(e){return json(res,400,{error:e.message})}
  }
  const site=readJSON(SITE_FILE,{global:{brandName:'Royal Band'},pages:[]});
  if(pathname==='/admin')return send(res,200,adminHtml());
  if(pathname==='/robots.txt')return send(res,200,`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ${SITE_URL}/sitemap.xml\n`,'text/plain; charset=utf-8');
  if(pathname==='/sitemap.xml')return send(res,200,`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${site.pages.filter(p=>p.status==='published'&&p.seo?.robotsIndex!==false).map(p=>`<url><loc>${esc(absUrl(p.slug))}</loc><changefreq>${p.slug==='/'?'weekly':'monthly'}</changefreq><priority>${p.slug==='/'?'1.0':'0.8'}</priority></url>`).join('')}</urlset>`,'application/xml; charset=utf-8');
  if(pathname==='/llms.txt')return send(res,200,`# ${site.global.brandName}\n\n> ${site.global.tagline}\n\n## Contact\n- Phone: ${site.global.phone}\n- Email: ${site.global.email}\n- Location: ${site.global.address}\n\n## Pages\n${site.pages.filter(p=>p.status==='published').map(p=>`- [${p.name}](${absUrl(p.slug)}): ${p.geo?.llmsSummary||p.geo?.summary||p.seo?.description||''}`).join('\n')}\n`,'text/plain; charset=utf-8');
  const p=pageByPath(site,pathname);if(p)return send(res,200,renderPage(site,p));
  return send(res,404,notFound(site));
});

server.listen(PORT,'0.0.0.0',()=>{
  console.log(`Royal Band CMS running on http://0.0.0.0:${PORT}`);
  if(ADMIN_PASSWORD==='ChangeMe@123') console.warn('WARNING: Change ADMIN_PASSWORD before production use.');
});
