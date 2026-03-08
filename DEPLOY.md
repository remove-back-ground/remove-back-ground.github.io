# ClearCut AI – Deployment Guide
# ================================

## Netlify (Recommended – Free Tier)

1. Push all files to a GitHub repository
2. Go to netlify.com → New site from Git
3. Connect your repository
4. Build settings: None (static site)
5. Publish directory: / (root)
6. Click "Deploy site"

Create netlify.toml for headers:

```toml
[[headers]]
  for = "/*"
  [headers.values]
    Cross-Origin-Opener-Policy = "same-origin"
    Cross-Origin-Embedder-Policy = "require-corp"
    Cross-Origin-Resource-Policy = "cross-origin"
    Cache-Control = "public, max-age=3600"

[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
```

## Vercel

1. npm install -g vercel
2. vercel --prod

Create vercel.json:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
        { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" }
      ]
    }
  ]
}
```

## Docker

```dockerfile
FROM nginx:alpine
COPY . /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

nginx.conf:
```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;
    
    add_header Cross-Origin-Opener-Policy "same-origin";
    add_header Cross-Origin-Embedder-Policy "require-corp";
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    location ~* \.(js|css|png|jpg|svg|ico|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

## Apache .htaccess

```apache
Header always set Cross-Origin-Opener-Policy "same-origin"
Header always set Cross-Origin-Embedder-Policy "require-corp"
Header always set Cross-Origin-Resource-Policy "cross-origin"

<IfModule mod_expires.c>
    ExpiresActive On
    ExpiresByType image/jpeg "access plus 1 year"
    ExpiresByType image/png "access plus 1 year"
    ExpiresByType text/css "access plus 1 month"
    ExpiresByType application/javascript "access plus 1 month"
</IfModule>

ErrorDocument 404 /404.html
```

## Environment Variables (for Stripe)

Set in Netlify/Vercel dashboard:
- STRIPE_PUBLIC_KEY=pk_live_...
- STRIPE_SECRET_KEY=sk_live_...
- GA_MEASUREMENT_ID=G-...
- MONETAG_ZONE_ID=...
