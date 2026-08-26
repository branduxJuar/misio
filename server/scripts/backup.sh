#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# BACKUP AUTOMÁTICO DE MONGODB
#
# Uso: cron cada 6 horas (en el servidor de producción):
#   0 */6 * * * /ruta/a/misio/server/scripts/backup.sh >> /var/log/misio-backup.log 2>&1
#
# REQUISITOS:
#   - mongodump instalado (viene con mongoDB tools)
#   - aws cli configurado (si usas S3) o una carpeta de destino
#
# SIN ESTO: un db.dropDatabase() accidental, un disco corrupto o un
# ransomware es pérdida total. Con esto, pierdes máximo 6 horas de datos.
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

MONGO_URI="${MONGO_URI:-mongodb://localhost:27017/misio}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/misio}"
S3_BUCKET="${S3_BUCKET:-}"  # Vacío = solo disco local
RETENTION_DAYS="${RETENTION_DAYS:-14}"

DATE=$(date +%Y%m%d-%H%M%S)
DUMP_PATH="$BACKUP_DIR/$DATE"

echo "[$(date)] Iniciando backup → $DUMP_PATH"
mkdir -p "$BACKUP_DIR"
mongodump --uri="$MONGO_URI" --out="$DUMP_PATH" --gzip --quiet

# Comprimir en un solo archivo
tar -cf "$DUMP_PATH.tar.gz" -C "$BACKUP_DIR" "$DATE" --remove-files

echo "[$(date)] Dump comprimido: $(du -h "$DUMP_PATH.tar.gz" | cut -f1)"

# Si hay bucket S3: subir y confirmar
if [ -n "$S3_BUCKET" ]; then
  aws s3 cp "$DUMP_PATH.tar.gz" "s3://$S3_BUCKET/backups/misio/$DATE.tar.gz" --quiet
  echo "[$(date)] Subido a S3: s3://$S3_BUCKET/backups/misio/$DATE.tar.gz"
fi

# Limpiar backups locales viejos
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete
echo "[$(date)] Limpiados backups con más de $RETENTION_DAYS días"
echo "[$(date)] ✓ Backup completado"
