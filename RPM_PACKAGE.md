# RPM Installation Package - Quick Reference

This document provides a quick overview of the files created to support RPM package installation and deployment.

## Directory Structure

```
go-e-sma-homewizard-controller/
├── go-e-sma-homewizard-controller.spec   # RPM spec file
├── build-rpm-package.sh                  # Automated RPM package builder
├── Makefile                              # Make targets for build/install
├── debian/
│   ├── systemd/
│   │   └── go-e-sma-homewizard-controller.service    # Systemd service file
│   └── ...
├── install.sh                            # Quick direct installation script
└── RPM_PACKAGE.md                        # This file
```

## Quick Start

### Option 1: Using the Build Script (Recommended)

```bash
cd /path/to/go-e-sma-homewizard-controller
bash build-rpm-package.sh
```

This will:
- Check dependencies (rpmbuild)
- Validate bash syntax
- Create source tarball
- Build RPM package
- Display installation instructions

### Option 2: Using Make

```bash
cd /path/to/go-e-sma-homewizard-controller
make rpm
```

### Option 3: Manual rpmbuild

```bash
cd /path/to/go-e-sma-homewizard-controller
rpmbuild --define "_topdir $(pwd)/rpmbuild" -ba go-e-sma-homewizard-controller.spec
```

## Installation

### Option 1: Using dnf (Recommended for Fedora/RHEL 8+)

```bash
sudo dnf install ./go-e-sma-homewizard-controller-1.0.0-1.noarch.rpm
```

### Option 2: Using rpm

```bash
sudo rpm -ivh ./go-e-sma-homewizard-controller-1.0.0-1.noarch.rpm
```

### Option 3: Direct Installation (Development)

```bash
sudo bash install.sh
```

**Installs to:**
- Script: `/usr/bin/go-e-sma-homewizard-controller`
- Config: `/etc/go-e-sma-homewizard-controller/`
- Systemd: `/etc/systemd/system/`
- Logs: `/var/log/go-e-sma-homewizard-controller/`

## Post-Installation Setup

After installation, you **MUST** configure the application:

### 1. Edit Configuration

```bash
sudo nano /etc/go-e-sma-homewizard-controller/go-e-sma-homewizard-controller.conf
```

Update these settings with your actual values:
- Go-e charger IP address
- HomeWizard P1 Meter IP address
- SMA inverter connection details
- Load management thresholds

### 2. Enable and Start Service

```bash
# Enable auto-start on boot
sudo systemctl enable go-e-sma-homewizard-controller

# Start the service
sudo systemctl start go-e-sma-homewizard-controller
```

### 3. Verify Installation

```bash
# Check service status
sudo systemctl status go-e-sma-homewizard-controller

# View logs (real-time)
sudo journalctl -u go-e-sma-homewizard-controller -f

# View recent logs
sudo journalctl -u go-e-sma-homewizard-controller -n 50
```

## File Descriptions

### RPM Package Files

| File | Purpose |
|------|---------|
| `go-e-sma-homewizard-controller.spec` | RPM specification file (package metadata, build instructions) |
| `build-rpm-package.sh` | Automated RPM package builder with colored output |

### Key Directories After Installation

| Path | Purpose |
|------|---------|
| `/usr/bin/go-e-sma-homewizard-controller` | Main script executable |
| `/etc/go-e-sma-homewizard-controller/` | Configuration directory |
| `/var/log/go-e-sma-homewizard-controller/` | Log directory |
| `/etc/systemd/system/` | Systemd service file |

## Dependencies

The package requires:
- `bash` - Shell scripting environment
- `curl` - HTTP client for API calls
- `jq` - JSON query processor

These are installed automatically when using `dnf install` or `rpm -ivh`.

## Uninstallation

### Option 1: Using dnf

```bash
sudo dnf remove go-e-sma-homewizard-controller
```

### Option 2: Using rpm

```bash
sudo rpm -e go-e-sma-homewizard-controller
```

The uninstall process will:
- Stop the running service
- Remove the executable and service files
- Keep configuration files for reference

## Building on Different Systems

### Fedora/RHEL 9+

```bash
sudo dnf install rpm-build
bash build-rpm-package.sh
```

### Fedora/RHEL 8

```bash
sudo dnf install rpm-build
bash build-rpm-package.sh
```

### CentOS 7

```bash
sudo yum install rpm-build
bash build-rpm-package.sh
```

### Ubuntu/Debian (Cross-compilation)

```bash
sudo apt-get install rpm alien
bash build-rpm-package.sh

# Or convert Debian package to RPM:
sudo alien -r go-e-sma-homewizard-controller_*.deb
```

## Troubleshooting

### rpmbuild not found

**Error:**
```
rpmbuild: command not found
```

**Solution:**
```bash
# For Fedora/RHEL:
sudo dnf install rpm-build

# For CentOS 7:
sudo yum install rpm-build

# For Ubuntu/Debian:
sudo apt-get install rpm
```

### Permission Denied

**Error:**
```
permission denied: /etc/go-e-sma-homewizard-controller/
```

**Solution:**
All installation commands must be run with `sudo` or as root user.

### Service won't start

**Error:**
```
systemctl start go-e-sma-homewizard-controller: Job failed
```

**Solution:**
1. Check configuration:
   ```bash
   sudo nano /etc/go-e-sma-homewizard-controller/go-e-sma-homewizard-controller.conf
   ```

2. Verify IP addresses and settings are correct

3. Check logs:
   ```bash
   sudo journalctl -u go-e-sma-homewizard-controller -n 50
   ```

## Support

For issues and feature requests, visit:
https://github.com/dietmarschnabel-code/go-e-sma-homewizard-controller

## Related Documentation

- [README.md](README.md) - Project overview
- [INSTALL.md](INSTALL.md) - Comprehensive installation guide
- [DEBIAN_PACKAGE.md](DEBIAN_PACKAGE.md) - Debian package documentation
