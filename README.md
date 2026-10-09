# Games

Browser games by rownok-HR-LS. Play them at **https://rownok-hr-ls.github.io/games/**.

| Game | Play | About |
|------|------|-------|
| Brick Blaster | [rownok-hr-ls.github.io/games/brick-blaster/](https://rownok-hr-ls.github.io/games/brick-blaster/) | DX-Ball-style brick breaker in a hellscape: 10 levels, 10 power-ups, an original metal soundtrack for every level, full screen on phones. |

## Run locally

```bash
npm install
npm run dev
```

Then open http://localhost:5173/games/.

## Add a game

1. Make a folder `<game>/` with an `index.html` and its code in `<game>/src/`.
2. Add `<game>/index.html` to `build.rollupOptions.input` in `vite.config.ts`.
3. Call `reloadIfStale()` from `shared/autoUpdate.ts` at the top of its `main.tsx`, so players never get a stale copy after a deploy.
4. Add a card for it on the hub page (`index.html`) and a row to the table above.

## Deploy

```bash
npm run deploy
```

Builds every game and pushes `dist/` to the `gh-pages` branch.
