.PHONY: help install uninstall build deb clean check-deps

PACKAGE_NAME=go-e-sma-homewizard-controller
SCRIPT_SOURCE=go-e-sma-homewizard-controller.sh
SCRIPT_TARGET=/usr/bin/go-e-sma-homewizard-controller
CONFIG_DIR=/etc/go-e-sma-homewizard-controller
CONFIG_FILE=go-e-sma-homewizard-controller.conf

help:
	@echo "go-e-sma-homewizard-controller - Build and Installation Targets"
	@echo ""
	@echo "Available targets:"
	@echo "  check-deps          Check system dependencies"
	@echo "  install             Install script directly to system"
	@echo "  uninstall           Remove script from system"
	@echo "  deb                 Build Debian package"
	@echo "  clean               Clean build artifacts"
	@echo "  test-syntax         Test bash script syntax"
	@echo "  help                Show this help message"
	@echo ""
	@echo "Installation methods:"
	@echo "  1. Direct install (development): make install"
	@echo "  2. Debian package (recommended): make deb"
	@echo ""

check-deps:
	@echo "Checking dependencies..."
	@command -v bash >/dev/null 2>&1 || { echo "bash is required but not installed."; exit 1; }
	@command -v curl >/dev/null 2>&1 || { echo "curl is required but not installed."; exit 1; }
	@command -v jq >/dev/null 2>&1 || { echo "jq is required but not installed."; exit 1; }
	@echo "✓ All required dependencies found"

test-syntax: check-deps
	@echo "Testing bash script syntax..."
	@bash -n $(SCRIPT_SOURCE)
	@echo "✓ Script syntax is valid"

install: check-deps test-syntax
	@echo "Installing $(PACKAGE_NAME)..."
	@sudo mkdir -p $(CONFIG_DIR)
	@sudo install -m 0755 $(SCRIPT_SOURCE) $(SCRIPT_TARGET)
	@if [ ! -f $(CONFIG_DIR)/$(CONFIG_FILE) ]; then \
		sudo install -m 0644 $(CONFIG_FILE) $(CONFIG_DIR)/$(CONFIG_FILE).example; \
		sudo install -m 0644 $(CONFIG_FILE) $(CONFIG_DIR)/$(CONFIG_FILE); \
		echo "✓ Configuration created at $(CONFIG_DIR)/$(CONFIG_FILE)"; \
		echo "  IMPORTANT: Update configuration with your IP addresses!"; \
	else \
		sudo install -m 0644 $(CONFIG_FILE) $(CONFIG_DIR)/$(CONFIG_FILE).example; \
		echo "✓ Configuration example updated at $(CONFIG_DIR)/$(CONFIG_FILE).example"; \
	fi
	@sudo mkdir -p /var/log/go-e-sma-homewizard-controller
	@echo "✓ Installation complete!"
	@echo ""
	@echo "Next steps:"
	@echo "  1. Edit: sudo nano $(CONFIG_DIR)/$(CONFIG_FILE)"
	@echo "  2. Test: $(SCRIPT_TARGET) --debug"
	@echo "  3. Install init script: sudo cp debian/systemd/$(PACKAGE_NAME).service /etc/systemd/system/"
	@echo "  4. Enable: sudo systemctl enable $(PACKAGE_NAME)"
	@echo "  5. Start: sudo systemctl start $(PACKAGE_NAME)"

uninstall:
	@echo "Uninstalling $(PACKAGE_NAME)..."
	@sudo systemctl stop $(PACKAGE_NAME) || true
	@sudo systemctl disable $(PACKAGE_NAME) || true
	@sudo rm -f $(SCRIPT_TARGET)
	@sudo rm -rf /var/log/go-e-sma-homewizard-controller
	@echo "✓ Uninstalled (configuration kept at $(CONFIG_DIR))"

deb: check-deps test-syntax
	@echo "Building Debian package..."
	@dpkg-buildpackage -us -uc -b 2>&1 | grep -v "^dpkg-buildpackage: info:"
	@echo "✓ Debian package built successfully"
	@echo ""
	@echo "To install the package:"
	@echo "  sudo dpkg -i ../$(PACKAGE_NAME)_*.deb"

clean:
	@echo "Cleaning build artifacts..."
	@rm -rf debian/go-e-sma-homewizard-controller
	@rm -f debian/debhelper-build-stamp
	@rm -f debian/files
	@rm -f debian/.debhelper
	@rm -rf .debhelper-build-stamp
	@echo "✓ Clean complete"
