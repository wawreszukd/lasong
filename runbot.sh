#!/bin/bash


if pgrep -f "deno run" > /dev/null
then
    echo "Zabijam poprzedni proces Deno..."
    pkill -f "deno run"

    sleep 2
else
    echo "Nie znaleziono aktywnego procesu Deno."
fi


echo "Uruchamiam nowego bota..."

nohup deno run --allow-read --allow-write --allow-env --env-file --allow-net index.ts > logs.txt 2>&1 &

echo "Nowy proces bota został uruchomiony w tle."
echo "Logi są zapisywane do pliku logs.txt."