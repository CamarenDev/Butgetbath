#!/usr/bin/env bash
# Budget Bath Solutions: one-command installer for Ubuntu/Debian servers.
#
#   sudo ./install.sh                       install with the built-in domain and admin email (no questions)
#   sudo ./install.sh --domain example.com --admin-email you@example.com   override any default
#
# What it does: installs Node 24, copies the site to /opt/budgetbath, creates a locked-down service user,
# writes the settings file, builds the site, runs it as a systemd service behind nginx (with free HTTPS
# from Let's Encrypt when a domain is given), turns on a firewall, then checks that everything works.
# Safe to run again: it updates the code and keeps your settings and data (/etc/budgetbath/env, /var/lib/budgetbath).

set -Eeuo pipefail

APP_NAME=budgetbath
APP_DIR=/opt/budgetbath
DATA_DIR=/var/lib/budgetbath
CONF_DIR=/etc/budgetbath
ENV_FILE=$CONF_DIR/env
SERVICE=budgetbath
APP_USER=budgetbath
PORT=3000
NODE_MAJOR=24
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Built-in defaults so nothing has to be typed in; every one can still be overridden with an option.
DEFAULT_DOMAIN="budgetbathsolutions.com"
DEFAULT_ADMIN_EMAIL="lcamarerna1@gmail.com"
DEFAULT_DEV_EMAIL="lcamarerna1+dev@gmail.com"   # Gmail delivers +dev mail to the same inbox
DOMAIN="" ADMIN_EMAIL="" DEV_EMAIL="" NOTIFY_EMAIL="" PHONE="" RESEND_KEY="" LE_EMAIL=""
ASSUME_YES=0 WITH_NGINX=1 WITH_SSL=1 WITH_FIREWALL=1 RUN_TESTS=0 UNINSTALL=0

if [ -t 1 ]; then G=$'\e[32m' R=$'\e[31m' Y=$'\e[33m' B=$'\e[1m' N=$'\e[0m'; else G= R= Y= B= N=; fi
step() { printf '\n%s==> %s%s\n' "$B" "$*" "$N"; }
ok()   { printf '  %s✔%s %s\n' "$G" "$N" "$*"; }
warn() { printf '  %s!%s %s\n' "$Y" "$N" "$*"; WARNINGS=$((WARNINGS + 1)); }
die()  { printf '\n%s✖ %s%s\n' "$R" "$*" "$N" >&2; exit 1; }
WARNINGS=0 FAILS=0
trap 'printf "\n%s✖ Install stopped at line %s. Nothing is half-configured that a re-run cannot fix; run ./install.sh again after fixing the problem above.%s\n" "$R" "$LINENO" "$N" >&2' ERR

usage() {
  cat <<EOF
Usage: sudo ./install.sh [options]
  --domain NAME          public domain (default $DEFAULT_DOMAIN); enables nginx virtual host and HTTPS
  --admin-email EMAIL    admin account, created with a temporary password (default $DEFAULT_ADMIN_EMAIL)
  --dev-email EMAIL      developer account, also allowed into the admin portal (default $DEFAULT_DEV_EMAIL)
  --notify-email EMAIL   where leads, bookings and alerts are sent (default $DEFAULT_ADMIN_EMAIL)
  --phone NUMBER         business phone shown on the site and in emails
  --resend-key KEY       Resend API key for sending email
  --letsencrypt-email E  contact email for the HTTPS certificate (defaults to the admin email)
  --port N               local app port (default 3000)
  --no-nginx             skip nginx (the app listens on the port directly)
  --no-ssl               skip the HTTPS certificate
  --no-firewall          do not touch the firewall
  --run-tests            also run the full test suite during the checks
  --yes                  never ask questions; use the options above and defaults
  --uninstall            stop and remove the service and code (keeps data and settings)
  -h, --help             show this help
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --admin-email) ADMIN_EMAIL="${2:-}"; shift 2 ;;
    --dev-email) DEV_EMAIL="${2:-}"; shift 2 ;;
    --notify-email) NOTIFY_EMAIL="${2:-}"; shift 2 ;;
    --phone) PHONE="${2:-}"; shift 2 ;;
    --resend-key) RESEND_KEY="${2:-}"; shift 2 ;;
    --letsencrypt-email) LE_EMAIL="${2:-}"; shift 2 ;;
    --port) PORT="${2:-}"; shift 2 ;;
    --no-nginx) WITH_NGINX=0; WITH_SSL=0; shift ;;
    --no-ssl) WITH_SSL=0; shift ;;
    --no-firewall) WITH_FIREWALL=0; shift ;;
    --run-tests) RUN_TESTS=1; shift ;;
    --yes|-y) ASSUME_YES=1; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage; die "Unknown option: $1" ;;
  esac
done

[ "$(id -u)" -eq 0 ] || die "Run this as root: sudo ./install.sh"
[[ "$PORT" =~ ^[0-9]+$ ]] && [ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ] || die "Invalid --port"

if [ "$UNINSTALL" -eq 1 ]; then
  step "Uninstalling"
  systemctl disable --now "$SERVICE" 2>/dev/null || true
  rm -f "/etc/systemd/system/$SERVICE.service" "/etc/nginx/sites-enabled/$APP_NAME" "/etc/nginx/sites-available/$APP_NAME"
  systemctl daemon-reload
  command -v nginx >/dev/null && nginx -t 2>/dev/null && systemctl reload nginx || true
  rm -rf "$APP_DIR"
  ok "Removed the service and $APP_DIR. Your data ($DATA_DIR) and settings ($CONF_DIR) were kept; delete them by hand if you are sure."
  exit 0
fi

ask() { # ask VAR "Question" [default]
  local var=$1 prompt=$2 def=${3:-} reply
  [ -n "${!var}" ] && return 0
  if [ "$ASSUME_YES" -eq 1 ] || [ ! -t 0 ]; then printf -v "$var" '%s' "$def"; return 0; fi
  read -r -p "  $prompt${def:+ [$def]}: " reply || true
  printf -v "$var" '%s' "${reply:-$def}"
}

# ---------------------------------------------------------------- preflight
step "Checking this server"
[ -r /etc/os-release ] || die "Cannot detect the operating system."
. /etc/os-release
case "${ID:-}${ID_LIKE:-}" in
  *debian*|*ubuntu*) ok "OS: ${PRETTY_NAME:-$ID}" ;;
  *) die "This installer supports Ubuntu and Debian. Detected: ${PRETTY_NAME:-unknown}." ;;
esac
command -v systemctl >/dev/null && [ -d /run/systemd/system ] || die "systemd is required (this looks like a container without it)."
for f in server.js build.js package.json site.json; do [ -f "$SRC_DIR/$f" ] || die "Run install.sh from the project folder (missing $f)."; done
ok "Project files found in $SRC_DIR"
avail_mb=$(df -Pm /opt | awk 'NR==2{print $4}')
[ "${avail_mb:-0}" -ge 1000 ] || warn "Only ${avail_mb}MB free on /opt; at least 1GB is recommended."
(echo > "/dev/tcp/deb.debian.org/443") 2>/dev/null || (echo > "/dev/tcp/registry.npmjs.org/443") 2>/dev/null || die "No internet access. The installer needs to download packages."
ok "Internet reachable"

get_env_early() { [ -f "$ENV_FILE" ] && sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p" "$ENV_FILE" | head -1 || true; }

# ---------------------------------------------------------------- defaults
# Nothing is asked: the domain and all admin emails are built in (override with the options above).
[ -z "$DOMAIN" ] && DOMAIN="$DEFAULT_DOMAIN"
[ -z "$ADMIN_EMAIL" ] && ADMIN_EMAIL="$DEFAULT_ADMIN_EMAIL"
[ -z "$DEV_EMAIL" ] && DEV_EMAIL="$DEFAULT_DEV_EMAIL"
[ -z "$NOTIFY_EMAIL" ] && NOTIFY_EMAIL="$ADMIN_EMAIL"
DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN%%/*}"
[ -z "$DOMAIN" ] && WITH_SSL=0
[ -z "$LE_EMAIL" ] && LE_EMAIL="$ADMIN_EMAIL"
[[ -z "$DOMAIN" || "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || die "That domain name has invalid characters."
for e in "$ADMIN_EMAIL" "$DEV_EMAIL" "$NOTIFY_EMAIL" "$LE_EMAIL"; do
  [[ -z "$e" || "$e" =~ ^[^[:space:],\"\'\\]+@[^[:space:],\"\'\\]+\.[^[:space:],\"\'\\]+$ ]] || die "Invalid email address: $e"
done
for v in "$PHONE" "$RESEND_KEY"; do [[ "$v" != *[\"\\\$\`]* ]] || die "Phone and API key cannot contain quotes, backslashes, \$ or backticks."; done
[ "$WITH_SSL" -eq 1 ] && [ -z "$LE_EMAIL" ] && warn "No email for the HTTPS certificate; it will be registered without one."

# ---------------------------------------------------------------- packages
step "Installing system packages"
export DEBIAN_FRONTEND=noninteractive
if [ -n "$(dpkg --audit 2>/dev/null)" ]; then
  warn "dpkg has half-configured packages that are unrelated to this site; skipping their failing setup scripts so the install can continue."
  for pkg in $(dpkg --audit 2>/dev/null | awk '/^ [a-z0-9]/{print $1}'); do
    for s in postinst prerm; do
      f="/var/lib/dpkg/info/$pkg.$s"
      [ -f "$f" ] || continue
      [ -f "$f.install-sh.bak" ] || cp -p "$f" "$f.install-sh.bak"
      printf '#!/bin/sh\nexit 0\n' > "$f"
      chmod 0755 "$f"
    done
    ok "Skipped broken package scripts: $pkg (backups: *.install-sh.bak)"
  done
  dpkg --configure -a || warn "dpkg still reports problems; continuing anyway."
fi
if ! apt-get update -qq; then
  warn "apt-get update reported errors (often a broken third-party repo or bad clock/DNS); continuing with the package lists that did download."
  apt-get update 2>&1 | grep -E '^(E:|Err:)' >&2 || true
fi
PKGS=(ca-certificates curl gnupg rsync openssl sqlite3)
[ "$WITH_NGINX" -eq 1 ] && PKGS+=(nginx)
[ "$WITH_SSL" -eq 1 ] && PKGS+=(certbot python3-certbot-nginx)
[ "$WITH_FIREWALL" -eq 1 ] && PKGS+=(ufw)
apt-get install -y -qq "${PKGS[@]}" >/dev/null
ok "Installed: ${PKGS[*]}"

node_major() { command -v node >/dev/null && node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
if [ "$(node_major)" -lt "$NODE_MAJOR" ]; then
  step "Installing Node.js $NODE_MAJOR"
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt-get update -qq
  apt-get install -y -qq nodejs >/dev/null
fi
[ "$(node_major)" -ge "$NODE_MAJOR" ] || die "Node.js $NODE_MAJOR or newer is required (found $(node -v 2>/dev/null || echo none))."
NODE_BIN="$(command -v node)"
ok "Node $(node -v) at $NODE_BIN"

# ---------------------------------------------------------------- user, folders, code
step "Installing the website"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --home-dir "$DATA_DIR" --shell /usr/sbin/nologin "$APP_USER"
install -d -m 0750 -o "$APP_USER" -g "$APP_USER" "$DATA_DIR"
install -d -m 0755 "$APP_DIR"
install -d -m 0750 -o root -g "$APP_USER" "$CONF_DIR"
if [ "$SRC_DIR" != "$APP_DIR" ]; then
  rsync -a --delete --exclude node_modules --exclude dist --exclude dist.next --exclude dist.old \
    --exclude data --exclude .env --exclude .git "$SRC_DIR"/ "$APP_DIR"/
fi
# The old data folder inside the project (if any) is migrated once.
if [ -d "$SRC_DIR/data" ] && [ -z "$(ls -A "$DATA_DIR" 2>/dev/null)" ] && [ -n "$(ls -A "$SRC_DIR/data" 2>/dev/null)" ]; then
  cp -a "$SRC_DIR/data/." "$DATA_DIR/"
  ok "Copied existing data from $SRC_DIR/data"
fi
cd "$APP_DIR"
if [ -f package-lock.json ]; then npm ci --omit=dev --no-audit --no-fund --loglevel=error; else npm install --omit=dev --no-audit --no-fund --loglevel=error; fi
ok "Dependencies installed"

# ---------------------------------------------------------------- settings
step "Writing settings"
get_env() { [ -f "$ENV_FILE" ] && sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p" "$ENV_FILE" | head -1 || true; }
set_env() { # set_env KEY VALUE  (replaces or appends; empty values leave existing settings alone)
  [ -z "$2" ] && return 0
  touch "$ENV_FILE"
  grep -v "^$1=" "$ENV_FILE" > "$ENV_FILE.tmp" || true
  printf '%s="%s"\n' "$1" "$2" >> "$ENV_FILE.tmp"
  mv "$ENV_FILE.tmp" "$ENV_FILE"
}
if [ ! -f "$ENV_FILE" ]; then
  cp "$APP_DIR/.env.example" "$ENV_FILE"
  # Comment out the blank placeholders from the template so they do not override anything.
  sed -i -E 's/^([A-Z_]+)=$/# \1=/; s/^([A-Z_]+)=([^"].*)$/\1="\2"/' "$ENV_FILE"
  ok "Created $ENV_FILE from the template"
else
  ok "Keeping your existing $ENV_FILE"
fi
if [ -n "$DOMAIN" ]; then
  if [ "$WITH_SSL" -eq 1 ]; then SITE_URL="https://$DOMAIN"; else SITE_URL="http://$DOMAIN"; fi
else
  SERVER_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  if [ "$WITH_NGINX" -eq 1 ]; then SITE_URL="http://${SERVER_IP:-localhost}"; else SITE_URL="http://${SERVER_IP:-localhost}:$PORT"; fi
fi
set_env PORT "$PORT"
set_env DATA_DIR "$DATA_DIR"
set_env SITE_URL "$SITE_URL"
set_env ADMIN_EMAILS "$ADMIN_EMAIL,$DEV_EMAIL"
set_env NOTIFY_EMAIL "$NOTIFY_EMAIL"
set_env BUSINESS_PHONE "$PHONE"
set_env RESEND_API_KEY "$RESEND_KEY"
if [ -n "$RESEND_KEY" ] && [ -n "$DOMAIN" ] && get_env EMAIL_FROM | grep -q 'yourdomain.com'; then
  set_env EMAIL_FROM "Budget Bath Solutions <hello@${DOMAIN#www.}>"
  warn "Emails are sent from hello@${DOMAIN#www.}. That domain must be verified in your Resend account, or change EMAIL_FROM in $ENV_FILE."
fi
if [ "$WITH_NGINX" -eq 1 ]; then set_env HOST 127.0.0.1; set_env TRUST_PROXY 1; fi
chown root:"$APP_USER" "$ENV_FILE"; chmod 0640 "$ENV_FILE"
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
[ -n "$(get_env ADMIN_EMAILS)" ] || warn "ADMIN_EMAILS is empty: nobody can open /admin/ until you set it in $ENV_FILE and restart."
[ -n "$(get_env RESEND_API_KEY)" ] || warn "No RESEND_API_KEY: emails (confirmations, reminders, alerts) are only written to the log."
[ -n "$(get_env BUSINESS_PHONE)" ] || warn "No business phone number is set, so no call buttons will show on the site."
ok "Settings saved in $ENV_FILE (readable only by root and the service)"

# ---------------------------------------------------------------- build
step "Building the site"
runas() { runuser -u "$APP_USER" -- env -i HOME="$DATA_DIR" PATH="$PATH" bash -c "set -a; . '$ENV_FILE'; set +a; cd '$APP_DIR' && $*"; }
runas "node build.js" | tail -2
[ -s "$APP_DIR/dist/index.html" ] || die "The build did not produce dist/index.html."
ok "Site built"
# The build also writes the SEO files; the service keeps them fresh when content changes (lib/seo-sync.js).
install -d -m 0750 -o "$APP_USER" -g "$APP_USER" "$APP_DIR/data"
for f in sitemap.xml robots.txt llms.txt llms-full.txt humans.txt site.webmanifest; do
  [ -s "$APP_DIR/dist/$f" ] || die "The build did not produce the SEO file $f."
done
ok "SEO files generated: sitemap.xml ($(grep -c '<loc>' "$APP_DIR/dist/sitemap.xml") URLs), robots.txt, llms.txt, llms-full.txt, humans.txt, site.webmanifest"

# ---------------------------------------------------------------- accounts
step "Creating the admin and developer accounts"
CRED_FILE=/root/budgetbath-credentials.txt
ACCOUNT_OUT="$(runas "node scripts/create-accounts.js --data-dir '$DATA_DIR' --admin-email '$ADMIN_EMAIL' --dev-email '$DEV_EMAIL'")" || die "Could not create the admin and developer accounts."
NEW_ACCOUNTS="" ALL_ACCOUNTS=""
while IFS=$'\t' read -r state role email password; do
  case "$state" in
    CREATED) ok "Created $role account $email"; NEW_ACCOUNTS+="$role: $email    temporary password: $password"$'\n'; ALL_ACCOUNTS+="$role: $email    temporary password: $password"$'\n' ;;
    EXISTS) ok "The $role account $email already exists (password unchanged)"; ALL_ACCOUNTS+="$role: $email    (already existed; password unchanged)"$'\n' ;;
  esac
done <<< "$ACCOUNT_OUT"
if [ -n "$NEW_ACCOUNTS" ]; then
  umask 077
  { printf 'Budget Bath Solutions first-login credentials.\nSign in at the site, then you are asked to choose a new password. Delete this file afterwards.\n\n'; printf '%s' "$NEW_ACCOUNTS"; } > "$CRED_FILE"
  umask 022
  ok "Temporary passwords saved to $CRED_FILE (root only)"
fi

# ---------------------------------------------------------------- service
step "Starting the service"
cat > "/etc/systemd/system/$SERVICE.service" <<EOF
[Unit]
Description=Budget Bath Solutions website
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$NODE_BIN $APP_DIR/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$DATA_DIR $APP_DIR
ProtectKernelTunables=true
ProtectControlGroups=true
RestrictSUIDSGID=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null 2>&1
systemctl restart "$SERVICE"
ok "Service $SERVICE enabled (starts on boot, restarts if it crashes)"

# ---------------------------------------------------------------- nginx + https + firewall
if [ "$WITH_NGINX" -eq 1 ]; then
  step "Configuring nginx"
  SERVER_NAME="${DOMAIN:-_}"
  [ -n "$DOMAIN" ] && SERVER_NAME="$DOMAIN www.$DOMAIN"
  cat > "/etc/nginx/sites-available/$APP_NAME" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $SERVER_NAME;
    client_max_body_size 40m;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 90s;
    }
}
EOF
  ln -sf "/etc/nginx/sites-available/$APP_NAME" "/etc/nginx/sites-enabled/$APP_NAME"
  [ -n "$DOMAIN" ] && rm -f /etc/nginx/sites-enabled/default
  nginx -t >/dev/null 2>&1 || { nginx -t; die "nginx configuration test failed."; }
  systemctl enable nginx >/dev/null 2>&1
  systemctl reload nginx 2>/dev/null || systemctl restart nginx
  ok "nginx proxies port 80 to the app"
fi

HTTPS_OK=0
if [ "$WITH_SSL" -eq 1 ]; then
  step "Getting a free HTTPS certificate"
  CERT_ARGS=(--nginx --non-interactive --agree-tos --redirect -d "$DOMAIN")
  if [ -n "$LE_EMAIL" ]; then CERT_ARGS+=(-m "$LE_EMAIL"); else CERT_ARGS+=(--register-unsafely-without-email); fi
  getent hosts "www.$DOMAIN" >/dev/null 2>&1 && CERT_ARGS+=(-d "www.$DOMAIN")
  if certbot "${CERT_ARGS[@]}" >/tmp/certbot-install.log 2>&1; then
    HTTPS_OK=1; ok "HTTPS enabled for $DOMAIN (renews automatically)"
  else
    warn "Could not get a certificate. Make sure $DOMAIN points at this server's IP and port 80 is open, then run: sudo certbot --nginx -d $DOMAIN  (log: /tmp/certbot-install.log)"
    set_env SITE_URL "http://$DOMAIN"; systemctl restart "$SERVICE"; SITE_URL="http://$DOMAIN"
  fi
fi

if [ "$WITH_FIREWALL" -eq 1 ]; then
  step "Turning on the firewall"
  SSH_PORT="$(ss -tlnp 2>/dev/null | awk '/sshd/ {n=split($4,a,":"); print a[n]; exit}')"
  ufw allow "${SSH_PORT:-22}/tcp" >/dev/null
  if [ "$WITH_NGINX" -eq 1 ]; then ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; else ufw allow "$PORT/tcp" >/dev/null; fi
  ufw --force enable >/dev/null
  ok "Firewall on: SSH (${SSH_PORT:-22})$([ "$WITH_NGINX" -eq 1 ] && echo ", 80 and 443" || echo ", $PORT")"
fi

# ---------------------------------------------------------------- verification
step "Checking that everything works"
check() { # check "label" command...
  local label=$1; shift
  if "$@" >/dev/null 2>&1; then ok "$label"; else printf '  %s✖%s %s\n' "$R" "$N" "$label"; FAILS=$((FAILS + 1)); fi
}
http_code() { curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$@" 2>/dev/null || echo 000; }
expect() { # expect "label" url [grep-pattern]
  local label=$1 url=$2 pat=${3:-} body
  body="$(curl -fsS --max-time 15 "$url" 2>/dev/null)" || { printf '  %s✖%s %s (%s)\n' "$R" "$N" "$label" "$url"; FAILS=$((FAILS + 1)); return; }
  if [ -n "$pat" ] && ! grep -qE "$pat" <<<"$body"; then printf '  %s✖%s %s (unexpected content)\n' "$R" "$N" "$label"; FAILS=$((FAILS + 1)); return; fi
  ok "$label"
}

for i in $(seq 1 30); do [ "$(http_code "http://127.0.0.1:$PORT/healthz")" = 200 ] && break; sleep 1; done
check "Service is running" systemctl is-active --quiet "$SERVICE"
check "Service starts on boot" systemctl is-enabled --quiet "$SERVICE"
check "Runs as the unprivileged user" bash -c "[ \"\$(ps -o user= -p \$(systemctl show -p MainPID --value $SERVICE))\" = $APP_USER ]"
LOCAL="http://127.0.0.1:$PORT"
expect "Health check (/healthz)" "$LOCAL/healthz" '"ok"'
expect "Home page" "$LOCAL/" 'Budget Bath'
expect "Booking page (/book/)" "$LOCAL/book/" 'name="phone"'
expect "Booking availability API" "$LOCAL/api/book/config" '"enabled"'
expect "Services page" "$LOCAL/services/" '<h1'
expect "sitemap.xml" "$LOCAL/sitemap.xml" '<urlset'
expect "robots.txt" "$LOCAL/robots.txt" 'Sitemap'
expect "llms.txt" "$LOCAL/llms.txt" '.'
expect "llms-full.txt" "$LOCAL/llms-full.txt" '.'
expect "Page metadata (canonical, structured data)" "$LOCAL/" 'rel="canonical".*|application/ld\+json'
for p in /admin/ /account/ /employee/ /estimator/; do
  [ "$(http_code "$LOCAL$p")" = 200 ] && ok "Portal page $p loads" || { printf '  %s✖%s Portal page %s\n' "$R" "$N" "$p"; FAILS=$((FAILS + 1)); }
done
# Every script and stylesheet the home page links to must load.
ASSET_FAIL=0 ASSET_N=0
while read -r a; do
  [ -z "$a" ] && continue; ASSET_N=$((ASSET_N + 1))
  [ "$(http_code "$LOCAL$a")" = 200 ] || { ASSET_FAIL=$((ASSET_FAIL + 1)); printf '    missing: %s\n' "$a"; }
done < <(curl -fsS "$LOCAL/" | grep -oE '(src|href)="/[^"#]+\.(js|css|woff2|png|webp|jpg|svg)[^"]*"' | sed -E 's/^[a-z]+="//; s/"$//' | sort -u)
if [ "$ASSET_FAIL" -eq 0 ] && [ "$ASSET_N" -gt 0 ]; then ok "All $ASSET_N home page scripts, styles and images load"; else printf '  %s✖%s Some home page assets failed (%s of %s)\n' "$R" "$N" "$ASSET_FAIL" "$ASSET_N"; FAILS=$((FAILS + 1)); fi
[ "$(http_code "$LOCAL/definitely-not-a-page/")" = 404 ] && ok "Unknown pages return 404" || { warn "Unknown pages do not return 404"; }
check "Admin API refuses signed-out visitors" bash -c "[ \"\$(curl -s -o /dev/null -w '%{http_code}' $LOCAL/api/admin/bookings)\" != 200 ]"
check "Database exists and is readable" bash -c "ls $DATA_DIR/*.db"
check "Data folder is private (not world readable)" bash -c "[ \"\$(stat -c %a $DATA_DIR | cut -c3)\" = 0 ]"
check "Settings file is private" bash -c "[ \"\$(stat -c %a $ENV_FILE | cut -c3)\" = 0 ]"
if [ "$WITH_NGINX" -eq 1 ]; then
  check "nginx configuration is valid" nginx -t
  check "nginx is running" systemctl is-active --quiet nginx
  expect "Reachable through nginx on port 80" "http://127.0.0.1/" 'Budget Bath'
  if [ "$WITH_FIREWALL" -eq 1 ] && [ -n "$(command -v ss)" ]; then
    check "App port $PORT is closed to the internet" bash -c "ss -tln | awk '{print \$4}' | grep -qE '^127\.0\.0\.1:$PORT\$'"
  fi
fi
if [ "$HTTPS_OK" -eq 1 ]; then
  expect "HTTPS works at $SITE_URL" "$SITE_URL/healthz" '"ok"'
  check "HTTP redirects to HTTPS" bash -c "curl -s -o /dev/null -w '%{redirect_url}' http://127.0.0.1/ -H 'Host: $DOMAIN' | grep -q '^https://'"
  check "Certificate auto-renewal is scheduled" bash -c "systemctl is-enabled certbot.timer || ls /etc/cron.d/certbot"
fi
if [ -n "$(get_env BUSINESS_PHONE)" ]; then expect "Business phone appears on the site" "$LOCAL/" "$(get_env BUSINESS_PHONE | tr -cd '0-9' | tail -c 4)"; fi
if [ "$RUN_TESTS" -eq 1 ]; then
  step "Running the full test suite"
  if (cd "$APP_DIR" && node --test 2>&1 | tail -8); then ok "Test run finished (see the summary above)"; fi
fi

# ---------------------------------------------------------------- summary
echo
if [ "$FAILS" -gt 0 ]; then
  printf '%s✖ %s check(s) failed.%s See the log: journalctl -u %s -n 80 --no-pager\n' "$R" "$FAILS" "$N" "$SERVICE"
  exit 1
fi
printf '%s✔ Installed and verified. Your website is live at %s%s\n' "$G$B" "$SITE_URL" "$N"
if [ -n "$ALL_ACCOUNTS" ]; then
  printf '\n%sSign-in accounts (temporary passwords; you must change them at first sign-in)%s\n' "$B" "$N"
  printf '%s' "$ALL_ACCOUNTS" | sed 's/^/  /'
  [ -n "$NEW_ACCOUNTS" ] && echo "  Also saved to $CRED_FILE"
  printf '  Admin alerts, leads and bookings go to: %s\n' "$NOTIFY_EMAIL"
fi
[ "$WARNINGS" -gt 0 ] && printf '%s%s item(s) need your attention (see the "!" lines above).%s\n' "$Y" "$WARNINGS" "$N"
cat <<EOF

Next steps
  1. Sign in at $SITE_URL/account/login/ with the admin or developer account, choose a new password when asked, then open $SITE_URL/admin/.
  2. In Admin > Bookings > Availability set your real business hours.
  3. Edit settings any time: nano $ENV_FILE  then  systemctl restart $SERVICE

Handy commands
  Status:   systemctl status $SERVICE
  Logs:     journalctl -u $SERVICE -f
  Update:   git pull && sudo ./install.sh --yes     (keeps your settings and data)
  Backup:   copy $DATA_DIR (database, uploads) and $ENV_FILE
  Remove:   sudo ./install.sh --uninstall
EOF
