# soulshot.online

The public site: landing page, `/privacy/`, `/terms/`, `/support/`, the shared-shot
player at `/s/?t=<token>`, and a 404. Plain HTML and CSS, no build step.

Hosted on GitHub Pages from the public repo `japcidro/soulshot-share` (branch
`main`, root), with `CNAME` pointing it at `soulshot.online`. The source of truth
is this folder in the app repo; publish by copying it over:

```bash
scripts/publish-site.sh
```

Old share links (`japcidro.github.io/soulshot-share/?t=…`) still work: GitHub
redirects the old host to the custom domain and the landing page forwards any
`?t=` to `/s/`.

Images in `img/` are real simulator captures (`home`, `welcome`) and the approved
design renders (`thread`, `player`, `library`, `paywall`), the app's own shot
photos, and the Welcome orb clip. `og.png` is rendered from `og.html`.
