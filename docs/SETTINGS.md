# Arrow Escape Settings And Operations

Last updated: 2026-05-06

## Public URL

`https://webgame.beta.menu/arrow-escape/`

## Local Entry Point

`file:///Volumes/work-ringo/2605-MineSweeper/arrow-escape/index.html`

## Cloudflare

- Account: `ZED Playground`
- Account ID: `524c8bd900e5189c6a55d88f45e0f2a0`
- Zone: `beta.menu`
- Worker: `webgame-arrow-escape`
- Route: `webgame.beta.menu/arrow-escape/*`

## Deployment Directory

Final upload files are under:

```text
dist/arrow-escape/
```

Before deploying:

```sh
rtk proxy cp -X index.html style.css app.js dist/arrow-escape/
rtk proxy find dist -name '._*' -delete -o -name '.DS_Store' -delete
```

Deploy:

```sh
rtk npx --yes wrangler deploy
```

## Storage

The game uses browser `localStorage` for best move counts.

No server-side database is required.
