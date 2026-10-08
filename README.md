# Royal Band Premium Website + CMS

A dependency-free Node.js website with an integrated admin panel for content, SEO, GEO/AEO and enquiries.

## What is included

- Premium black/gold responsive frontend
- Home, About, Services, Performances, Gallery, Contact
- CMS for all page hero content and reusable content blocks
- Add new pages from Admin
- Draft / Published page status
- Image upload (up to 5 MB)
- Global brand/contact/footer controls
- Per-page SEO title, meta description, keywords, canonical, robots
- Open Graph / social sharing fields
- JSON-LD schema and auto FAQ schema
- GEO/AEO fields: AI summary, named entities, service areas, target questions, LLM summary
- Auto-generated `robots.txt`, `sitemap.xml`, `llms.txt`
- Contact enquiry form + admin lead inbox
- Secure signed admin session cookie
- No database or npm package installation required

## Local run

1. Copy `.env.example` to `.env`
2. Change `ADMIN_PASSWORD` and `SESSION_SECRET`
3. Run:

```bash
node server.js
```

Website: `http://localhost:3015`
Admin: `http://localhost:3015/admin`

Default demo login (change before deployment):

- Username: `admin`
- Password: `ChangeMe@123`

## VPS production deployment

Recommended folder:

```bash
/var/www/royal-band
```

Create `.env`:

```env
PORT=3015
SITE_URL=https://yourdomain.com
ADMIN_USER=admin
ADMIN_PASSWORD=USE-A-STRONG-PASSWORD
SESSION_SECRET=USE-A-RANDOM-64-CHARACTER-SECRET
NODE_ENV=production
```

### systemd

Create `/etc/systemd/system/royal-band.service`:

```ini
[Unit]
Description=Royal Band Website CMS
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/royal-band
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /var/www/royal-band/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo chown -R www-data:www-data /var/www/royal-band
sudo systemctl daemon-reload
sudo systemctl enable --now royal-band
sudo systemctl status royal-band
```

### Nginx

```nginx
server {
    server_name yourdomain.com www.yourdomain.com;

    client_max_body_size 8M;

    location / {
        proxy_pass http://127.0.0.1:3015;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Use Certbot for SSL after DNS is pointed to the VPS.

## Admin workflow

- **Pages:** edit hero + sections, add/remove sections, upload images, create draft pages.
- **Global:** update brand, phone, email, WhatsApp, address and social links.
- **SEO/GEO:** select a page and edit all metadata, canonical, index/follow, OG image, schema and AI-oriented fields.
- **Leads:** see website enquiries.
- **Tools:** quickly open robots, sitemap and llms files.

## Important

The supplied Emergent preview currently exposes only its loading iframe to crawlers, so this package uses a premium Royal Band black/gold design direction and is structured so screenshots/source can be matched quickly later without rebuilding the CMS.
