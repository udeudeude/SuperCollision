# SuperCollision Cloudflare Pages deployment

## Automated build

GitHub Actions workflow `.github/workflows/prepare-site.yml` compiles official SuperCollider WebAssembly from source, tests the interpreter, assembles a static deployment, and publishes it to the `pages-build` branch. A successful build is required before deployment. Check the Actions tab for errors.

## Cloudflare Pages configuration

Use the Git-connected **Pages** project, not Workers.

- Repository: `udeudeude/SuperCollision`
- Project: `supercollision`
- Production branch: `pages-build`
- Framework preset: `None`
- Build command: `test -f runtime/sclang/sclang.js && test -f runtime/scsynth/scsynth.js`
- Build output directory: `.`
- Root directory: repository root (blank)

The build command deliberately fails until the actual engine has been published. The `_headers` file at the deployment root configures cross-origin isolation on Cloudflare Pages.

## Validation

1. Check that GitHub Actions `Build SuperCollision WebAssembly site` is green and `pages-build` contains `runtime/sclang/` and `runtime/scsynth/`.
2. Check Cloudflare deployment logs and ensure response headers include COOP `same-origin` and COEP `require-corp`.
3. On the iPhone open `https://supercollision.pages.dev/`, press **Check / boot engine**, and evaluate a small known-good SuperCollider composition.
4. Confirm sound and CmdPeriod stop.

Do not claim compatibility or audio playback until these tests pass. GitHub Pages cannot provide the necessary isolation headers.
