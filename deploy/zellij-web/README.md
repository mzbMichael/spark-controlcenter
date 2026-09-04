# Spark Dashboard with Zellij Web

This deployment adds a same-origin Zellij Web terminal to Spark Dashboard. The
React UI places the terminal on the right at or above the configured breakpoint
and below the dashboard on narrower viewports. Drag the green divider to resize
it; desktop width and mobile height are stored independently in the browser.

The recommended DGX Spark setup exposes nothing on the LAN: Spark Dashboard,
Zellij Web and nginx all listen on `127.0.0.1`. Access is through an SSH local
port forward. Zellij's own token authentication remains enabled.

## Prerequisites

- Ubuntu Linux on the target (aarch64 DGX Spark and x86_64 are supported)
- Rust 1.95+, Node.js/npm, `curl`, `tar`, `sha256sum`, `systemd`, and `sudo`
- The regular Linux user who should own and control the terminal sessions
- An SSH account on the target

The installer adds nginx with `apt-get` if it is not already installed. It
downloads Zellij 0.45.1's official musl release and verifies the published
SHA-256 checksum before installing it.

## Install or update

Clone this fork on the DGX Spark and run the script **without** `sudo`:

```bash
git clone https://github.com/mzbMichael/spark-controlcenter.git
cd spark-controlcenter
./deploy/zellij-web/install.sh
```

To serve terminals as another existing Linux user:

```bash
./deploy/zellij-web/install.sh --user alice
```

The same command is the patch/update path: after pulling a new revision, rerun
it. It rebuilds and replaces the dashboard binary, refreshes the Zellij binary,
configuration, nginx site and systemd unit, and restarts the services.

The script deliberately separates privilege domains:

- `spark-dashboard.service` runs as the locked-down `spark-dashboard` user;
- `zellij-web@USER.service` runs as the selected interactive user, because its
  shell has that user's permissions;
- nginx is the only listener reached by the browser.

## Create the login token

As the terminal owner, create a token once. Zellij displays it only once and
stores only its hash:

```bash
ZELLIJ_CONFIG_DIR="$HOME/.config/zellij-spark-dashboard" \
  zellij web --create-token
```

Open the UI and enter that token on the Zellij login screen. Token management:

```bash
ZELLIJ_CONFIG_DIR="$HOME/.config/zellij-spark-dashboard" zellij web --list-tokens
ZELLIJ_CONFIG_DIR="$HOME/.config/zellij-spark-dashboard" zellij web --revoke-token TOKEN_NAME
```

## Connect over SSH

Keep this command running on the workstation:

```bash
ssh -N -L 3080:127.0.0.1:3080 USER@DGX_HOST
```

Then open <http://127.0.0.1:3080>. A non-default SSH port is supported with
`-p`, for example:

```bash
ssh -p 2222 -N -L 3080:127.0.0.1:3080 USER@DGX_HOST
```

If local port 3080 is occupied, change only the first number:

```bash
ssh -N -L 8308:127.0.0.1:3080 USER@DGX_HOST
```

and open <http://127.0.0.1:8308>.

## Session lifetime

The URL `/zellij/spark-dashboard` creates or attaches to the named
`spark-dashboard` session. Closing or reloading the browser only detaches the
web client; the Zellij session and processes continue on the DGX. The systemd
unit also uses `KillMode=process`, so restarting only the web gateway does not
kill separately running Zellij session servers.

After a host reboot, Zellij can resurrect serialized sessions. This restores
the layout and eligible commands; it cannot preserve an in-memory process
across a power cycle. Browser disconnection, SSH disconnection and nginx
restart do preserve the live session.

CLI access to the same session is available on the DGX:

```bash
ZELLIJ_CONFIG_DIR="$HOME/.config/zellij-spark-dashboard" zellij attach spark-dashboard
```

## Panel configuration

Edit `frontend/public/terminal-config.json` before running the installer:

| Setting | Default | Meaning |
| --- | ---: | --- |
| `enabled` | `true` | Show or completely disable the terminal panel |
| `url` | `/zellij/spark-dashboard` | Same-origin Zellij base path and session name |
| `breakpoint` | `1024` | Width in pixels where the panel moves from bottom to right |
| `desktopWidth` | `520` | Initial right-panel width in pixels |
| `mobileHeight` | `360` | Initial bottom-panel height in pixels |
| `minSize` | `220` | Minimum draggable terminal dimension in pixels |

Dragged sizes are saved as `spark-dashboard:terminal-width` and
`spark-dashboard:terminal-height` in browser local storage. Remove those keys
to apply new initial values to an existing browser profile.

The Zellij path is coupled to `web_client { base_url "/zellij" }` in
`zellij-config.kdl` and the `/zellij/` nginx location. Change all three when
using another base path.

## Service operations

```bash
sudo systemctl status spark-dashboard
sudo systemctl status "zellij-web@$USER"
sudo systemctl status nginx

journalctl -u spark-dashboard -f
journalctl -u "zellij-web@$USER" -f
```

Run `sudo nginx -t` before manually reloading nginx configuration.

## Security notes

Zellij Web normally returns `X-Frame-Options: DENY`. The supplied nginx site
hides that one header and returns `SAMEORIGIN`, which permits embedding only
from the dashboard served by the same nginx origin. It does not disable
Zellij's login-token authentication or content security policy.

Do not expose port 8082 directly. The supplied config binds it to loopback. The
nginx listener is also loopback-only; SSH supplies encryption and access
control. If exposing nginx directly to a network, replace the listener with a
proper TLS virtual host, retain Zellij authentication, add rate limiting, and
restrict source networks or add a second authentication layer.

## Installed files

| Path | Purpose |
| --- | --- |
| `/usr/local/bin/spark-dashboard` | Dashboard server with embedded React build |
| `/usr/local/bin/zellij` | Web-capable Zellij binary |
| `/etc/systemd/system/zellij-web@.service` | Per-user Zellij Web service template |
| `/etc/spark-dashboard/zellij-web-USER.env` | Selected user's dedicated config path |
| `/etc/nginx/sites-available/spark-dashboard-zellij.conf` | Same-origin reverse proxy |
| `~/.config/zellij-spark-dashboard/config.kdl` | Dedicated Zellij Web configuration |

The installer does not delete existing Zellij sessions, tokens, dashboard
layouts, or a user's normal `~/.config/zellij/config.kdl`.
