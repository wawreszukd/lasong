#!/bin/bash

echo "Zabijam poprzedni proces jesli chodzi run.sh..."
pkill -f runbot.sh

echo "Uruchamiam bota..."
nohup deno index.ts > logs.txt 2>&1 &

echo "Nowy proces Node.js został uruchomiony w tle."
echo "Logi są zapisywane do pliku logs.txt."