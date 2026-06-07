# QA Inventory

## User Requirements

- New public GitHub repository exists.
- Work starts from a local clone created for this app.
- README, license, and basic project settings exist.
- App is a browser-only three.js miniature planet exploration web app.
- Player can explore a small spherical planet surface immediately after load.
- Movement follows the planet tangent plane with gravity toward the planet center.
- Controls: WASD move, mouse look, Space jump, Shift dash, E or left click collect/interact, R respawn, M guide/minimap toggle, Esc pointer unlock.
- Planet includes hills, craters, rocks, trees, grass, crystals, and multiple material colors.
- 10 to 20 collectible items exist.
- HUD shows collected count, remaining count, exploration rate, center crosshair, bottom status bar, and top-right FPS.
- Day/night cycle changes sky color, ambient light, sun direction, color, and intensity.
- Items are visible through glow, rotation, or floating motion.
- All items collected shows a completion message.
- Canvas and HUD survive window resize.
- Low-poly geometry keeps rendering load modest.
- GitHub Actions deploys to GitHub Pages from pushes to `main`.
- Published GitHub Pages URL is checked with Playwright separately from local QA.
- README includes a real gameplay screenshot near the top.

## Implementation Targets

- Vite + TypeScript + three.js project.
- `vite.config.ts` uses `/miniature-planet-explorer/` base for Pages subpath publishing.
- `.github/workflows/deploy.yml` builds and deploys static output through GitHub Pages.
- Planet mesh is procedurally displaced from a sphere.
- Object placement is procedural and deterministic.
- Player controller clamps to terrain surface while grounded.
- Jump velocity moves outward from the planet center and gravity pulls inward.
- Safety clamp returns player near surface if altitude grows too large.
- HUD updates every frame from game state.
- Collectibles can be obtained by proximity through E or left click.
- Pointer lock mouse look works after clicking the game.
- README documents overview, features, controls, local run, Pages URL, deployment, and QA.

## Completion Report Claims To Verify

- Repository name and URL.
- GitHub Pages public URL.
- Features implemented.
- CI/CD workflow file and trigger.
- Local Playwright checks completed.
- Published Playwright checks completed.
- Any unverified items or remaining issues.
- README screenshot path.
- Representative Playwright-observed screen states.
