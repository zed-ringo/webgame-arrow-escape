# Arrow Escape

Static tap-out style arrow puzzle for `webgame.beta.menu/arrow-escape/`.

## Play

Open `index.html` locally, or use the deployed URL:

```text
https://webgame.beta.menu/arrow-escape/
```

## Files

- `index.html`, `style.css`, `app.js`: game source.
- `dist/arrow-escape/`: final upload assets for Cloudflare Workers Assets.
- `docs/`: game rules and deployment settings.
- `HANDOFF.md`: maintainer handoff notes.

## Deploy

```sh
rtk proxy cp -X index.html style.css app.js dist/arrow-escape/
rtk proxy find dist -name '._*' -delete -o -name '.DS_Store' -delete
rtk npx --yes wrangler deploy
```
