"""Upload backup file to Backblaze B2 and remove files older than BACKUP_RETENTION_DAYS."""
import os
import sys
from datetime import datetime, timedelta
from b2sdk.v2 import InMemoryAccountInfo, B2Api

def main():
    local_path = sys.argv[1]
    remote_name = sys.argv[2]

    key_id = os.environ["B2_APPLICATION_KEY_ID"]
    app_key = os.environ["B2_APPLICATION_KEY"]
    bucket_name = os.environ["B2_BUCKET_NAME"]
    retention_days = int(os.environ.get("BACKUP_RETENTION_DAYS", "30"))

    info = InMemoryAccountInfo()
    api = B2Api(info)
    api.authorize_account("production", key_id, app_key)
    bucket = api.get_bucket_by_name(bucket_name)

    # Upload new backup
    bucket.upload_local_file(local_file=local_path, file_name=remote_name)
    print(f"Uploaded: {remote_name}")

    # Delete old backups
    cutoff = datetime.utcnow() - timedelta(days=retention_days)
    for file_info, _ in bucket.ls(show_versions=True):
        upload_ts = datetime.utcfromtimestamp(file_info.upload_timestamp / 1000)
        if upload_ts < cutoff:
            bucket.delete_file_version(file_info.id_, file_info.file_name)
            print(f"Deleted old backup: {file_info.file_name}")

if __name__ == "__main__":
    main()
