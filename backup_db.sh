#!/bin/bash
# backup_db.sh
# Dumps the PostgreSQL database and compresses it into a .sql.gz file.

BACKUP_DIR="/home/ubuntu/backups"
mkdir -p "$BACKUP_DIR"

DB_USER="smartguard"
DB_HOST="localhost"
DB_NAME="smartguard_db"

DATE=$(date +"%Y-%m-%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/db_backup_$DATE.sql.gz"

echo "Starting database backup to $BACKUP_FILE..."

# Provide password via PGPASSWORD environment variable
export PGPASSWORD="smgh123!"

pg_dump -U "$DB_USER" -h "$DB_HOST" "$DB_NAME" | gzip > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
  echo "Backup completed successfully!"
else
  echo "Backup failed!"
  exit 1
fi

# Keep only the last 7 days of backups
find "$BACKUP_DIR" -type f -name "*.sql.gz" -mtime +7 -exec rm {} \;
echo "Old backups cleaned up."
