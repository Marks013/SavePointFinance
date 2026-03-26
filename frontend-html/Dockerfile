# Save Point Finanças — Frontend (Nginx)
# Multi-arch: works on ARM64 (Oracle Free) and x86_64 (VPS)
FROM nginx:1.27-alpine

# Remove default nginx page
RUN rm -rf /usr/share/nginx/html/*

COPY . /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Remove Dockerfile and nginx.conf from served files
RUN rm -f /usr/share/nginx/html/Dockerfile /usr/share/nginx/html/nginx.conf

EXPOSE 80
