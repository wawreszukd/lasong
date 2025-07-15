#!/bin/bash
if pgrep "deno" > /dev/null
then
    echo "zabijam poprzedni proces"
    pkill -f deno
else
    echo "Uruchamiam bota..."
    nohup deno --allow-read --allow-write --allow-env --env-file --alow-net index.ts > logs.txt 2>&1 &

    echo "Nowy proces bota został uruchomiony w tle."
    echo "Logi są zapisywane do pliku logs.txt."
fi


