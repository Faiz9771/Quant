# Deploying Prism for free on Oracle Cloud (Always Free)

This guide hosts the **entire** Prism stack — dashboards, Office workspace, the
Playwright scraper (`/scraper`), and the breakout tools (`/library`) — on a
single **Oracle Cloud Always Free** VM. It is genuinely free forever (not a
trial), and the Ampere ARM shape gives you 4 cores / 24 GB RAM, which is plenty
for Chromium + the Node server.

Everything runs in one Docker container built from this repo. The Python
scripts and data live in your `Dash/` and `Data-Fetch/` folders, which are
**bind-mounted** into the container at runtime — so secrets like
`Dash/auth.json` never get baked into an image or pushed anywhere.

> **Why a VM and not Vercel/Netlify?** The scraper needs Python + Chromium +
> long-running processes, and the Office DB needs a persistent writable disk.
> No free serverless host offers that combination. A free always-on VM does.

---

## What you'll end up with

```
Oracle VM (Ubuntu, ARM, always-free)
└── ~/Quant/
    ├── prism/         ← this repo (the dashboard + Docker setup)
    ├── Dash/          ← scraper scripts + data + auth.json   (bind-mounted, rw)
    └── Data-Fetch/    ← breakout scripts + data              (bind-mounted, rw)
```

A single `docker compose up -d` boots the whole thing on port 3000.

---

## Step 1 — Create the Always Free VM

1. Sign up at <https://www.oracle.com/cloud/free/> (needs a card for identity
   verification; the Always Free resources are never charged).
2. Console → **Compute → Instances → Create instance**.
3. **Image and shape:**
   - Image: **Canonical Ubuntu 22.04** (or 24.04).
   - Shape: **Ampere → VM.Standard.A1.Flex**. Set **2 OCPU / 12 GB** (or up to
     4 OCPU / 24 GB — all within the free allowance).
   - If A1 capacity is unavailable in your home region, retry in a day or pick a
     different availability domain; ARM capacity frees up regularly.
4. **Add SSH keys:** upload your public key (`~/.ssh/id_ed25519.pub`) or let
   Oracle generate one and download the private key.
5. Create. Note the VM's **public IP**.

---

## Step 2 — Open the firewall (two layers)

Oracle blocks everything by default. You must open the port in **both** the
cloud Security List and the VM's own firewall.

**A. Cloud Security List** (Console → your VM → Virtual Cloud Network →
Security Lists → default → Add Ingress Rule):

| Source CIDR | Protocol | Dest. Port | Purpose                |
|-------------|----------|------------|------------------------|
| `0.0.0.0/0` | TCP      | `80`       | HTTP (for HTTPS setup) |
| `0.0.0.0/0` | TCP      | `443`      | HTTPS                  |
| `0.0.0.0/0` | TCP      | `3000`     | Prism (skip once HTTPS is up) |

**B. The VM's host firewall.** SSH in first:

```bash
ssh ubuntu@<PUBLIC_IP>
```

Then (Ubuntu images ship with iptables rules):

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80   -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443  -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3000 -j ACCEPT
sudo netfilter-persistent save
```

---

## Step 3 — Install Docker on the VM

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl rsync
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin

# Run docker without sudo (log out/in afterwards for it to take effect)
sudo usermod -aG docker $USER
```

Log out and back in, then verify: `docker run --rm hello-world`.

---

## Step 4 — Get the code + data onto the VM

**Only `prism/` is in git.** `Dash/` and `Data-Fetch/` are deliberately NOT
tracked — they hold `auth.json` (your live MarketSmith session) and macOS
`.venv` binaries that don't belong in a public repo and wouldn't run on Linux
anyway. So:

- **prism** → `git clone` (it's pushed to `Faiz9771/Quant`)
- **Dash + Data-Fetch** → `rsync` from your Mac

**4a. Clone the repo on the VM:**

```bash
cd ~
git clone https://github.com/Faiz9771/Quant.git Quant
```

The repo contains `prism/` as a subfolder, so this leaves the app at
`~/Quant/prism`. (It also pulls some old `Analysis/Core/Testing` folders —
harmless, ignore them.) The `Dash/` and `Data-Fetch/` folders are created by
the rsync below as siblings of `prism`, exactly where the compose file's
`../Dash` / `../Data-Fetch` mounts expect them.

**4b. From your Mac**, push the scripts + data + secrets (excluding the macOS
virtualenvs and junk, which won't work on Linux anyway). This also carries the
`final-scraper.py --no-sandbox` patch, since it's already applied on disk here:

```bash
# Run these on your Mac, from ~/Documents/Quant
rsync -avz --delete \
  --exclude '.venv' --exclude '__pycache__' --exclude '*.log' \
  --exclude '.DS_Store' \
  Dash/        ubuntu@<PUBLIC_IP>:~/Quant/Dash/

rsync -avz --delete \
  --exclude '.venv' --exclude '__pycache__' --exclude '*.log' \
  --exclude 'output' --exclude '.cache' --exclude '.DS_Store' \
  Data-Fetch/  ubuntu@<PUBLIC_IP>:~/Quant/Data-Fetch/

# Optional: bring over your existing Office DB so docs/sheets carry over
rsync -avz prism/data/  ubuntu@<PUBLIC_IP>:~/Quant/prism/data/
```

This is also exactly how you'll **refresh the dashboard later** if you keep
scraping on your Mac — just re-run the `Dash/` rsync.

> **Verify `auth.json` made it over:** `ls -la ~/Quant/Dash/auth.json` on the
> VM. Without it the scraper can't log in to MarketSmith.

---

## Step 5 — Build and run

```bash
cd ~/Quant/prism
docker compose up --build -d
```

The first build takes a while (it installs Chromium + Python deps). When it's
done:

```bash
docker compose logs -f          # watch startup
curl -I http://localhost:3000   # should return HTTP 200
```

Open **`http://<PUBLIC_IP>:3000`** in your browser. The dashboard should load.

Check each tier:
- **Dashboards / compare / live-validation** — should show your data immediately.
- **Office** — create a doc; it persists in `prism/data/office.db`.
- **/scraper** — click run (keep it **headless** — there's no display on a
  server). Watch the live log console.
- **/library breakout** — run a breakout; results write to
  `Data-Fetch/breakout_results.csv`.

---

## Step 6 (recommended) — HTTPS + a clean URL with Caddy

Running on a raw `:3000` is fine to start, but for a real URL with automatic
HTTPS, add Caddy as a reverse proxy. You need a domain (a free one from
DuckDNS/`*.duckdns.org` works) pointed at `<PUBLIC_IP>`.

Create `~/Quant/prism/Caddyfile`:

```
prism.example.com {
    reverse_proxy prism:3000
}
```

Append a Caddy service to `docker-compose.yml` (or create a second compose
file):

```yaml
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - prism

volumes:
  caddy_data:
  caddy_config:
```

Then `docker compose up -d`. Caddy fetches a Let's Encrypt cert automatically.
Once it works, remove the `:3000` ingress rule from Step 2 so only 80/443 are
public, and drop the `ports:` mapping on the `prism` service so it's reachable
only through Caddy.

> **Lock it down:** Prism has no built-in login, and `/scraper` can spawn
> processes. Don't leave it open to the whole internet long-term. Either keep
> the security-list source CIDR restricted to your own IP, or put Basic Auth in
> front of it in the Caddyfile (`basic_auth` directive).

---

## Day-2 operations

| Task | Command (on the VM, in `~/Quant/prism`) |
|---|---|
| View logs | `docker compose logs -f` |
| Restart | `docker compose restart` |
| Update Prism code | `git -C ~/Quant/repo pull && docker compose up --build -d` |
| Refresh data from Mac | re-run the `Dash/` rsync from Step 4b |
| Stop everything | `docker compose down` |
| Check container Python | `docker compose exec prism /opt/venv/bin/python -c "import playwright, yfinance, pandas; print('ok')"` |

---

## Troubleshooting

**Build fails on `better-sqlite3`** — the deps stage already installs
`python3/make/g++`; if it still fails, run `docker compose build --no-cache`.

**`/scraper` says "failed to spawn" or Chromium crashes** — confirm the venv:
`docker compose exec prism /opt/venv/bin/playwright --version`. The
`--no-sandbox` patch in `final-scraper.py` is what lets Chromium run as root in
the container; make sure your `Dash/final-scraper.py` on the VM includes it.
It's already applied on your Mac and travels via the Step 4b rsync — verify on
the VM with `grep -n no-sandbox ~/Quant/Dash/final-scraper.py`.

**Scraper logs in but scrapes nothing** — `auth.json` is missing or its
MarketSmith session expired. Re-generate it on your Mac (`Dash/save_auth.py`)
and rsync it back up.

**Dashboard is empty** — `DASH_DATA_DIR` (`/app/external/Dash`) has no
`latest.parquet`. Confirm the `Dash/` rsync ran and the file exists on the VM.

**Out of disk** — the image is large (Chromium). The free Boot Volume is up to
200 GB; if you shrank it, grow it in the Console or run `docker system prune`.

**A1 capacity errors at create time** — Oracle frees ARM capacity in waves;
retry in another availability domain or after a few hours.
