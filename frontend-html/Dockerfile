# Save Point Finanças — Frontend (Nginx)
# Multi-arch: works on ARM64 (Oracle Free) and x86_64 (VPS)
FROM nginx:1.27-alpine

# Remove default nginx page
RUN rm -rf /usr/share/nginx/html/*

COPY partials/ /usr/share/nginx/html/partials/
COPY js/ /usr/share/nginx/html/js/
COPY static/css/ /usr/share/nginx/html/css/
COPY nginx.conf /etc/nginx/conf.d/default.conf

# NÃO copiar arquivos HTML — eles são servidos pelo backend via Jinja2
# Os arquivos HTML ficam em /app/frontend-html no container do backend

EXPOSE 80
