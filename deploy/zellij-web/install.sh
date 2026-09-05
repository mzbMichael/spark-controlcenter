#!/usr/bin/env bash
# Install the dashboard fork, Zellij Web and the loopback-only nginx proxy on
# Ubuntu (including aarch64 NVIDIA DGX Spark hosts).

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TERMINAL_USER="${SUDO_USER:-$(id -un)}"
ZELLIJ_VERSION="0.45.1"

usage() {
    cat <<'EOF'
Usage: ./deploy/zellij-web/install.sh [--user USER] [--zellij-version VERSION]

Run as the regular Linux user who should own the terminal sessions. The script
uses sudo only for system packages, binaries, systemd and nginx configuration.
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --user)
            TERMINAL_USER="${2:?--user requires a value}"
            shift 2
            ;;
        --zellij-version)
            ZELLIJ_VERSION="${2:?--zellij-version requires a value}"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "error: unknown option: $1" >&2
            usage >&2
            exit 2
            ;;
    esac
done

if [[ ${EUID:-$(id -u)} -eq 0 ]]; then
    echo "error: run as the terminal owner, not with sudo" >&2
    exit 1
fi

if [[ "$(uname -s)" != "Linux" ]]; then
    echo "error: this installer supports Linux only" >&2
    exit 1
fi

if ! id "$TERMINAL_USER" >/dev/null 2>&1; then
    echo "error: user '$TERMINAL_USER' does not exist" >&2
    exit 1
fi
if [[ ! "$TERMINAL_USER" =~ ^[a-z_][a-z0-9_-]*[$]?$ ]]; then
    echo "error: unsupported user name: '$TERMINAL_USER'" >&2
    exit 1
fi

for command in curl getent sha256sum tar sudo systemctl; do
    if ! command -v "$command" >/dev/null 2>&1; then
        echo "error: '$command' is required" >&2
        exit 1
    fi
done

case "$(uname -m)" in
    aarch64|arm64) ZELLIJ_TARGET="aarch64-unknown-linux-musl" ;;
    x86_64|amd64) ZELLIJ_TARGET="x86_64-unknown-linux-musl" ;;
    *)
        echo "error: unsupported CPU architecture: $(uname -m)" >&2
        exit 1
        ;;
esac

if ! command -v nginx >/dev/null 2>&1; then
    if ! command -v apt-get >/dev/null 2>&1; then
        echo "error: nginx is missing and apt-get is unavailable" >&2
        exit 1
    fi
    sudo apt-get update
    sudo apt-get install -y nginx
fi

echo "==> Installing dashboard"
"${PROJECT_ROOT}/deploy/host/install.sh"

echo "==> Restricting dashboard backend to loopback"
sudo install -d -m 0755 /etc/spark-dashboard
if [[ ! -f /etc/spark-dashboard/config.env ]]; then
    sudo install -m 0640 "${PROJECT_ROOT}/deploy/host/config.env.example" /etc/spark-dashboard/config.env
fi
if sudo grep -q '^SPARK_DASHBOARD_BIND=' /etc/spark-dashboard/config.env; then
    sudo sed -i 's/^SPARK_DASHBOARD_BIND=.*/SPARK_DASHBOARD_BIND=127.0.0.1/' /etc/spark-dashboard/config.env
else
    printf '\nSPARK_DASHBOARD_BIND=127.0.0.1\n' | sudo tee -a /etc/spark-dashboard/config.env >/dev/null
fi
if sudo grep -q '^SPARK_DASHBOARD_PORT=' /etc/spark-dashboard/config.env; then
    sudo sed -i 's/^SPARK_DASHBOARD_PORT=.*/SPARK_DASHBOARD_PORT=3000/' /etc/spark-dashboard/config.env
else
    printf 'SPARK_DASHBOARD_PORT=3000\n' | sudo tee -a /etc/spark-dashboard/config.env >/dev/null
fi

echo "==> Installing Zellij ${ZELLIJ_VERSION} for ${ZELLIJ_TARGET}"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf -- "$TEMP_DIR"' EXIT
ASSET="zellij-${ZELLIJ_TARGET}.tar.gz"
CHECKSUM_ASSET="zellij-${ZELLIJ_TARGET}.sha256sum"
RELEASE_BASE="https://github.com/zellij-org/zellij/releases/download/v${ZELLIJ_VERSION}"
curl --fail --location --proto '=https' --tlsv1.2 "${RELEASE_BASE}/${ASSET}" -o "${TEMP_DIR}/${ASSET}"
curl --fail --location --proto '=https' --tlsv1.2 "${RELEASE_BASE}/${CHECKSUM_ASSET}" -o "${TEMP_DIR}/${CHECKSUM_ASSET}"
(
    cd "$TEMP_DIR"
    tar --no-same-owner -xzf "$ASSET" zellij
    EXPECTED_SHA256="$(awk 'NF { print $1; exit }' "$CHECKSUM_ASSET")"
    if [[ ! "$EXPECTED_SHA256" =~ ^[[:xdigit:]]{64}$ ]]; then
        echo "error: invalid checksum in ${CHECKSUM_ASSET}" >&2
        exit 1
    fi
    printf '%s  zellij\n' "$EXPECTED_SHA256" | sha256sum --check -
)
sudo install -m 0755 "${TEMP_DIR}/zellij" /usr/local/bin/zellij

echo "==> Installing Zellij configuration and services"
TERMINAL_HOME="$(getent passwd "$TERMINAL_USER" | cut -d: -f6)"
if [[ -z "$TERMINAL_HOME" || ! -d "$TERMINAL_HOME" ]]; then
    echo "error: no home directory found for '$TERMINAL_USER'" >&2
    exit 1
fi
sudo install -d -o "$TERMINAL_USER" -g "$(id -gn "$TERMINAL_USER")" -m 0700 \
    "${TERMINAL_HOME}/.config/zellij-spark-dashboard"
sudo install -o "$TERMINAL_USER" -g "$(id -gn "$TERMINAL_USER")" -m 0600 \
    "${PROJECT_ROOT}/deploy/zellij-web/zellij-config.kdl" \
    "${TERMINAL_HOME}/.config/zellij-spark-dashboard/config.kdl"
printf 'ZELLIJ_CONFIG_DIR=%s/.config/zellij-spark-dashboard\n' "$TERMINAL_HOME" | \
    sudo tee "/etc/spark-dashboard/zellij-web-${TERMINAL_USER}.env" >/dev/null
sudo chmod 0644 "/etc/spark-dashboard/zellij-web-${TERMINAL_USER}.env"
sudo install -m 0644 "${PROJECT_ROOT}/deploy/zellij-web/systemd/zellij-web@.service" \
    /etc/systemd/system/zellij-web@.service
sudo install -m 0644 "${PROJECT_ROOT}/deploy/zellij-web/nginx/spark-dashboard-zellij.conf" \
    /etc/nginx/sites-available/spark-dashboard-zellij.conf
sudo ln -sfn /etc/nginx/sites-available/spark-dashboard-zellij.conf \
    /etc/nginx/sites-enabled/spark-dashboard-zellij.conf

sudo nginx -t
sudo systemctl daemon-reload
sudo systemctl enable --now "zellij-web@${TERMINAL_USER}.service"
sudo systemctl restart spark-dashboard nginx

echo
echo "Installation complete. Create a Zellij login token once with:"
echo "  ZELLIJ_CONFIG_DIR=${TERMINAL_HOME}/.config/zellij-spark-dashboard zellij web --create-token"
echo
echo "From your workstation, tunnel the loopback listener:"
echo "  ssh -N -L 3080:127.0.0.1:3080 ${TERMINAL_USER}@<dgx-host>"
echo "Then open http://127.0.0.1:3080"
