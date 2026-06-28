# Deploying M7.1-Long (full backend + frontend, exactly as local)

This app is a **long-running Flask server** — background scan threads, an
in-process job queue, MoneyControl FII scraping, multi-minute scans, disk
caching. That is the opposite of serverless, so it is **not deployable to
Vercel** in a way that behaves like local. It deploys as a **Docker container
on an always-on host** — your Oracle Cloud VM, beside Prism.

| Prism | M7.1 |
|---|---|
| `ghcr.io/faiz9771/prism:slim`, port **3000** | `ghcr.io/faiz9771/m71:latest`, port **5050** |

Fidelity is preserved by running gunicorn as **one threaded worker with no
timeout** (`-w 1 -k gthread -t 0`), so the shared in-memory job state and long
scans behave exactly like the local `python app.py` (`app.run(threaded=True)`).
Your existing `.scan_cache` (18 ranges) and `.fii_cache` are baked into the
image and seeded into volumes on first boot, so the deployed app is instantly
populated.

---

## Option A — run on the Oracle VM via GHCR (recommended)

1. **Push to GitHub.** The workflow `.github/workflows/m71.yml` builds
   `linux/amd64` and pushes `ghcr.io/faiz9771/m71:latest` on any change under
   `Breakout/M7.1-Testing/**`.

   ```bash
   git add Breakout/M7.1-Testing .github/workflows/m71.yml
   git commit -m "Containerize M7.1 scanner for GHCR/Oracle deploy"
   git push
   ```

   Watch it build under the repo's **Actions** tab.

2. **On the VM**, copy `docker-compose.hybrid.yml` over (or `scp` it) and run:

   ```bash
   docker compose -f docker-compose.hybrid.yml up -d
   ```

   The VM pulls the prebuilt image — no build on the box. Open
   `http://<vm-ip>:5050`.

3. **Open the firewall** for 5050 (same as you did for Prism's 3000): allow TCP
   5050 in the Oracle **Security List / NSG**, and on the VM if `iptables` is
   used:

   ```bash
   sudo iptables -I INPUT 5 -p tcp --dport 5050 -j ACCEPT
   sudo netfilter-persistent save   # if installed
   ```

To update later: just `git push` again, then on the VM
`docker compose -f docker-compose.hybrid.yml pull && docker compose -f docker-compose.hybrid.yml up -d`.

---

## Option B — build and run locally (or directly on any Docker host)

```bash
docker compose up -d --build
open http://localhost:5050
```

---

## Memory note for the Oracle E2.1.Micro (1 GB RAM)

The 18 historical ranges are baked in, so the heavy scans are already done.
**New** multi-year live scans download 50 tickers of OHLCV via yfinance and can
be memory-hungry on a 1 GB box; prefer scanning shorter spans there, or run big
historical backfills locally (Option B) and let the VM serve the cached result.
If the VM is tight on RAM, add swap:

```bash
sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```
