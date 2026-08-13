# Debian Installation Package - Quick Reference

This document provides a quick overview of all the files created to support Debian package installation and deployment.

## Directory Structure

```
go-e-sma-homewizard-controller/
├── debian/
│   ├── control                           # Package metadata
│   ├── changelog                         # Version history (Debian format)
│   ├── rules                             # Build instructions
│   ├── postinst                          # Post-installation script
│   ├── prerm                             # Pre-removal script
│   ├── compat                            # Debhelper compatibility level
│   ├── source/
│   │   └── format                        # Source format declaration
│   ├── systemd/
│   │   └── go-e-sma-homewizard-controller.service    # Systemd service file
│   └── init.d/
│       └── go-e-sma-homewizard-controller            # LSB init script (legacy)
├── install.sh                            # Quick direct installation script
├── build-debian-package.sh               # Automated Debian package builder
├── Makefile                              # Make targets for build/install
└── INSTALL.md                            # Comprehensive installation guide
```

## Quick Start

### Option 1: Direct Installation (Development)

```bash
cd /path/to/go-e-sma-homewizard-controller
sudo bash install.sh
```

**Installs to:**
- Script: `/usr/bin/go-e-sma-homewizard-controller`
- Config: `/etc/go-e-sma-homewizard-controller/`
- Systemd: `/etc/systemd/system/`
- Logs: `/var/log/go-e-sma-homewizard-controller/`

### Option 2: Debian Package (Production)

```bash
cd /path/to/go-e-sma-homewizard-controller
bash build-debian-package.sh
sudo dpkg -i ../go-e-sma-homewizard-controller_*.deb
```

Or with apt (auto-resolves dependencies):

```bash
sudo apt install ./go-e-sma-homewizard-controller_*.deb
```

### Option 3: Using Make

```bash
cd /path/to/go-e-sma-homewizard-controller

# Check dependencies
make check-deps

# Direct install
sudo make install

# Build Debian package
make deb
```

## File Descriptions

### Installation Scripts

| File | Purpose | Usage |
|------|---------|-------|
| `install.sh` | Quick direct installation | `sudo bash install.sh` |
| `build-debian-package.sh` | Automated package builder with colored output | `bash build-debian-package.sh` |
| `Makefile` | Convenient make targets | `make install` or `make deb` |

### Debian Package Files

| File | Purpose |
|------|---------|
| `debian/control` | Package metadata, dependencies, description |
| `debian/changelog` | Version history in Debian format |
| `debian/rules` | Build script (executes dpkg-buildpackage) |
| `debian/postinst` | Runs after package installation (setup dirs, config) |
| `debian/prerm` | Runs before package removal (stop service) |
| `debian/compat` | Debhelper compatibility level (13) |
| `debian/source/format` | Source format (3.0 quilt) |

### Systemd Integration

| File | Purpose |
|------|---------|
| `debian/systemd/go-e-sma-homewizard-controller.service` | Systemd service file for modern systems |
| `debian/init.d/go-e-sma-homewizard-controller` | LSB init script for legacy systems |

### Documentation

| File | Purpose |
|------|---------|
| `INSTALL.md` | Comprehensive installation and troubleshooting guide |

## Service Management

```bash
# Start service
sudo systemctl start go-e-sma-homewizard-controller

# Stop service
sudo systemctl stop go-e-sma-homewizard-controller

# Enable auto-start
sudo systemctl enable go-e-sma-homewizard-controller

# Check status
sudo systemctl status go-e-sma-homewizard-controller

# View logs
sudo journalctl -u go-e-sma-homewizard-controller -f

# Restart service
sudo systemctl restart go-e-sma-homewizard-controller
```

## Configuration

Edit configuration after installation:

```bash
sudo nano /etc/go-e-sma-homewizard-controller/go-e-sma-homewizard-controller.conf
```

Required settings:
- `CHARGER_IP` - IP address of go-e-charger
- `P1_IP` - IP address of HomeWizard P1 Meter
- `MAX_POWER_LIMIT_WATTS` - Power limit in watts (default: 10000)
- `SAFETY_MARGIN_WATTS` - Safety buffer (default: 300)

## Testing

Test before running as a service:

```bash
# Run with debug output
sudo /usr/bin/go-e-sma-homewizard-controller --debug

# Check script syntax
bash -n /usr/bin/go-e-sma-homewizard-controller
```

## Dependencies

**Runtime:**
- bash
- curl
- jq

**Build (optional, only for building package):**
- build-essential
- devscripts
- debhelper

Install:

```bash
sudo apt-get update
sudo apt-get install bash curl jq build-essential devscripts debhelper
```

## What Gets Installed

### Files
- `/usr/bin/go-e-sma-homewizard-controller` - Main script
- `/etc/systemd/system/go-e-sma-homewizard-controller.service` - Systemd service
- `/etc/go-e-sma-homewizard-controller/go-e-sma-homewizard-controller.conf` - Configuration
- `/var/log/go-e-sma-homewizard-controller/` - Log directory
- `/usr/share/doc/go-e-sma-homewizard-controller/` - Documentation

### Directories Created
- `/etc/go-e-sma-homewizard-controller/` - Configuration
- `/var/log/go-e-sma-homewizard-controller/` - Logs

### Systemd Service
- Runs as root
- Auto-restarts on failure
- Logs to systemd journal
- Resource limits: 64MB memory, 50% CPU

## Building for Distribution

To create a distribution-ready package:

```bash
cd /path/to/go-e-sma-homewizard-controller

# Update version in debian/changelog
nano debian/changelog

# Build signed package (for distribution)
dpkg-buildpackage -sa

# Build unsigned package (for testing)
dpkg-buildpackage -us -uc -b
```

## Troubleshooting

### Service won't start
```bash
sudo journalctl -u go-e-sma-homewizard-controller -n 50
sudo systemctl status go-e-sma-homewizard-controller
```

### Configuration issues
```bash
sudo nano /etc/go-e-sma-homewizard-controller/go-e-sma-homewizard-controller.conf
sudo systemctl restart go-e-sma-homewizard-controller
```

### Syntax errors
```bash
bash -n /usr/bin/go-e-sma-homewizard-controller
```

See [INSTALL.md](INSTALL.md) for more detailed troubleshooting.

## Uninstall

```bash
# Debian package
sudo apt-get remove go-e-sma-homewizard-controller

# Or
sudo dpkg -r go-e-sma-homewizard-controller

# Manual cleanup
sudo systemctl disable go-e-sma-homewizard-controller
sudo rm /usr/bin/go-e-sma-homewizard-controller
sudo rm /etc/systemd/system/go-e-sma-homewizard-controller.service
sudo systemctl daemon-reload
```

## Environment

- **Supported**: Debian 10+, Ubuntu 18.04+, Raspberry Pi OS
- **Language**: Bash (POSIX-compliant)
- **License**: GPL-3.0
- **Target System**: x86_64, ARM, ARM64

## Support

For issues and questions:
- Check [INSTALL.md](INSTALL.md)
- Review systemd logs
- Open an issue on GitHub: https://github.com/dietmarschnabel-code/go-e-sma-homewizard-controller
