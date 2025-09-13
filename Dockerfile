FROM denoland/deno:alpine

COPY ./handledb.ts ./index.ts /bot/

VOLUME /bot/data

CMD ["deno", "run", "--allow-read", "--allow-write", "--allow-env", "--allow-net", "--unstable-cron", "/bot/index.ts"]