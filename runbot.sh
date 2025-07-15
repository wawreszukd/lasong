#!/bin/bash


if pgrep -f "index.ts" > /dev/null
then
    echo "Zabijam poprzedni proces bota..."

    pkill -f "index.ts"
    sleep 2
else
    echo "Nie znaleziono aktywnego procesu bota."
fi

# Zawsze uruchamiamy nowego bota.
echo "Uruchamiam nowego bota..."
# ... (reszta Twojego polecenia Deno)
nohup deno run --allow-read --allow-write --allow-env --env-file --allow-net index.ts > logs.txt 2>&1 &

echo "Nowy proces bota został uruchomiony w tle."
echo "Logi są zapisywane do pliku logs.txt."