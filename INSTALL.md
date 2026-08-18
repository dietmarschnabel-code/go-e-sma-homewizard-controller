# Installation Guide

This guide covers multiple methods to install and run `go-e-sma-homewizard-controller` on a Debian/Ubuntu system.

## Prerequisites

Before installation, ensure you have:

1. A Linux system (Debian/Ubuntu or compatible)
2. Network connectivity to your go-e-charger and HomeWizard P1 Meter
3. The IP addresses of both devices
4. Root/sudo access for installation

### Required Dependencies

The following packages are required:

```bash
sudo apt-get update
sudo apt-get install bash curl jq
```

### Build Dependencies (only for building the Debian package)

```bash
sudo apt-get install build-essential devscripts debhelper
```

## Installation Methods

### Method 1: Quick Installation Script (Recommended for Development)

The quickest way to get started:

```bash
cd /path/to/go-e-sma-homewizard-controller
sudo bash install.sh
```

This script will:
- Validate dependencies
- Check script syntax
- Install the script to `/usr/bin/go-e-sma-homewizard-controller`
- Create configuration directory at `/etc/go-e-sma-homewizard-controller/`
- Setup systemd service
- Create logging directory at `/var/log/go-e-sma-homewizard-controller/`

### Method 2: Debian Package Installation (Recommended for Production)

Build and install using the Debian package system:

```bash
# Navigate to the project directory
cd /path/to/go-e-sma-homewizard-controller

# Build the Debian package
bash build-debian-package.sh
```

Or manually:

```bash
dpkg-buildpackage -us -uc -b
```

Then install:

```bash
sudo dpkg -i ../go-e-sma-homewizard-controller_*.deb
```

Or with apt (automatically handles dependencies):

```bash
sudo apt install ./go-e-sma-homewizard-controller_*.deb
```

### Method 3: Using Make

The project includes a Makefile for convenient installation:

```bash
# Check dependencies
make check-deps

# Direct installation
sudo make install

# Build Debian package
make deb

# Clean build artifacts
make clean
```

## Configuration

After installation, you must configure the script with your device IP addresses:

1. **Open the configuration file:**

   ```bash
   sudo nano /etc/go-e-sma-homewizard-controller/go-e-sma-homewizard-controller.conf
   ```

2. **Edit the following settings:**

   ```ini
   CHARGER_IP=192.168.1.100          # IP of your go-e-charger
   P1_IP=192.168.1.101                # IP of your HomeWizard P1 Meter
   MAX_POWER_LIMIT_WATTS=10000         # Power limit in watts
   SAFETY_MARGIN_WATTS=300             # Buffer in watts
   ```

3. **Save and close** the file (Ctrl+O, Enter, Ctrl+X in nano)

## Running the Service

### Start the service:

```bash
sudo systemctl start go-e-sma-homewizard-controller
```

### Enable auto-start on boot:

```bash
sudo systemctl enable go-e-sma-homewizard-controller
```

### Check service status:

```bash
sudo systemctl status go-e-sma-homewizard-controller
```

### View logs:

```bash
# Recent logs
sudo journalctl -u go-e-sma-homewizard-controller -n 50

# Follow logs in real-time
sudo journalctl -u go-e-sma-homewizard-controller -f

# Last 1 hour of logs
sudo journalctl -u go-e-sma-homewizard-controller --since "1 hour ago"
```

## Testing

Before running as a service, test the script manually:

```bash
# Test with debug output
sudo /usr/bin/go-e-sma-homewizard-controller --debug

# Run in foreground with output
sudo /usr/bin/go-e-sma-homewizard-controller
```

Press Ctrl+C to stop.

## Environment Variable Overrides

You can override configuration file settings using environment variables:

```bash
export CHARGER_IP_ENV=192.168.1.100
export P1_IP_ENV=192.168.1.101
export MAX_POWER_LIMIT_WATTS_ENV=10000
export SAFETY_MARGIN_WATTS_ENV=300

sudo -E /usr/bin/go-e-sma-homewizard-controller --debug
```

## Systemd Service Management

### Restart the service:

```bash
sudo systemctl restart go-e-sma-homewizard-controller
```

### Stop the service:

```bash
sudo systemctl stop go-e-sma-homewizard-controller
```

### Disable auto-start:

```bash
sudo systemctl disable go-e-sma-homewizard-controller
```

### View service file:

```bash
cat /etc/systemd/system/go-e-sma-homewizard-controller.service
```

## Uninstallation

### For direct installation:

```bash
sudo systemctl stop go-e-sma-homewizard-controller
sudo systemctl disable go-e-sma-homewizard-controller
sudo rm /usr/bin/go-e-sma-homewizard-controller
sudo rm /etc/systemd/system/go-e-sma-homewizard-controller.service
sudo systemctl daemon-reload
```

### For Debian package:

```bash
sudo apt-get remove go-e-sma-homewizard-controller
```

Or:

```bash
sudo dpkg -r go-e-sma-homewizard-controller
```

## Troubleshooting

### Service won't start

1. Check configuration file:
   ```bash
   sudo cat /etc/go-e-sma-homewizard-controller/go-e-sma-homewizard-controller.conf
   ```

2. Run with debug output:
   ```bash
   sudo /usr/bin/go-e-sma-homewizard-controller --debug
   ```

3. Check logs:
   ```bash
   sudo journalctl -u go-e-sma-homewizard-controller -n 100
   ```

### Can't reach charger or meter

1. Check IP addresses are correct:
   ```bash
   ping -c 1 <CHARGER_IP>
   ping -c 1 <P1_IP>
   ```

2. Verify devices are online and reachable
3. Check firewall rules
4. Verify network connectivity

### Script syntax errors

```bash
bash -n /usr/bin/go-e-sma-homewizard-controller
```

### Dependencies not found

Re-install dependencies:

```bash
sudo apt-get update
sudo apt-get install --reinstall bash curl jq
```

## Upgrading

### From direct installation to Debian package:

```bash
# Stop the service
sudo systemctl stop go-e-sma-homewizard-controller

# Uninstall old version
sudo rm /usr/bin/go-e-sma-homewizard-controller

# Build and install new Debian package
cd /path/to/go-e-sma-homewizard-controller
bash build-debian-package.sh
sudo dpkg -i ../go-e-sma-homewizard-controller_*.deb

# Start the service
sudo systemctl start go-e-sma-homewizard-controller
```

### Permissions issues due to systemd settings:

# Override default home directory restrictions to allow read access
ProtectHome=read-only
# Explicitly grant read-only access to the exact file path
ReadOnlyPaths=/home/username/sma-bluetooth/tmp/sma-update.log
# If ProtectHome=yes is enforced elsewhere, mount only this specific file as read-only
BindReadOnlyPaths=/home/username/sma-bluetooth/tmp/sma-update.log
# allow writing of csv files
ReadWritePaths=/var/www/html/p1


### Updating the Debian package:

```bash
cd /path/to/go-e-sma-homewizard-controller
bash build-debian-package.sh
sudo apt-get install ./go-e-sma-homewizard-controller_*.deb
```

## Additional Resources

- **GitHub Repository**: https://github.com/dietmarschnabel-code/go-e-sma-homewizard-controller
- **go-e-charger Documentation**: https://go-e.co/
- **HomeWizard P1 Meter**: https://www.homewizard.com/
- **Systemd Documentation**: https://systemd.io/

## Support

For issues or questions:

1. Check the troubleshooting section above
2. Review logs: `sudo journalctl -u go-e-sma-homewizard-controller -n 100`
3. Open an issue on GitHub
