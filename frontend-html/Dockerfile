# Save Point Finanças — Frontend (Nginx)
# Multi-arch: works on ARM64 (Oracle Free) and x86_64 (VPS)
FROM nginx:1.27-alpine

# Remove default nginx page
RUN rm -rf /usr/share/nginx/html/*

COPY index.html dashboard.html transactions.html reports.html settings.html subscriptions.html installments.html goals.html categories.html admin.html login.html register.html /usr/share/nginx/html/
COPY js/ /usr/share/nginx/html/js/
COPY css/ /usr/share/nginx/html/css/
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
