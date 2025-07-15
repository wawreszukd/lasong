#!/bin/bash
if pgrep "runbot.sh" > /dev/null
then
    echo "zabijam poprzedni proces"
    pkill -f runbot.sh
else
    echo "Uruchamiam bota..."
    nohup deno --allow-read --allow-write --allow-env --env-file --alow-net index.ts > logs.txt 2>&1 &

    echo "Nowy proces Node.js został uruchomiony w tle."
    echo "Logi są zapisywane do pliku logs.txt."
fi


