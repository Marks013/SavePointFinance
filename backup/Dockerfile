FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client cron gzip && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir b2sdk==2.5.0
COPY backup.sh /backup.sh
COPY b2_upload.py /b2_upload.py
RUN chmod +x /backup.sh
RUN echo "0 3 * * * /backup.sh >> /var/log/backup.log 2>&1" | crontab -
CMD ["cron", "-f"]
