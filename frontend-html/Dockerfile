# Save Point Finanças — Frontend (Nginx)
# Multi-arch: works on ARM64 (Oracle Free) and x86_64 (VPS)
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html

EXPOSE 80
