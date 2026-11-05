#!/usr/bin/env bash
# Serves the patient chat locally and saves what happens in .logs/, outside git. The function's logs never carry the question.
#   bash tests/patient-chat-serve.sh
#   PATIENT_CHAT_ENV_FILE=<file> uses another env file, such as one with a fake key for checks without cost.
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p .logs
log_file=".logs/patient-chat-serve-$(date +%Y%m%dT%H%M%S).log"
env_file="${PATIENT_CHAT_ENV_FILE:-supabase/functions/.env}"

# The machine has already stalled under load, so each sample lets a timeout be compared with the load at that moment.
while sleep 5; do
  read -r load _ < /proc/loadavg
  available_mb=$(awk '/MemAvailable/ {print int($2 / 1024)}' /proc/meminfo)
  printf '%s {"event":"machine_load","load_1m":%s,"available_mb":%s}\n' "$(date -Is)" "$load" "$available_mb"
done >> "$log_file" &
sampler=$!
trap 'kill "$sampler" 2>/dev/null || true' EXIT

echo "Salvando os logs em $log_file"
npx supabase functions serve patient-chat --env-file "$env_file" 2>&1 | while IFS= read -r line; do
  printf '%s %s\n' "$(date -Is)" "$line"
done | tee -a "$log_file"
