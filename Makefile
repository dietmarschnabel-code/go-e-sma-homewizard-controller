.PHONY: help install uninstall build executable deb rpm clean check-deps

PACKAGE_NAME=go-e-sma-homewizard-controller
BINARY=$(PACKAGE_NAME)
GO ?= go
GO_SOURCES=go-e-sma-homewizard-controller.go nighttime_basic.go
BINARY_TARGET=/usr/bin/$(BINARY)
CONFIG_DIR=/etc/go-e-sma-homewizard-controller
CONFIG_FILE=go-e-sma-homewizard-controller.conf

help:
	@echo "go-e-sma-homewizard-controller - Build and Installation Targets"
	@echo ""
	@echo "Available targets:"
	@echo "  check-deps          Check system dependencies"
	@echo "  executable          Build the Go executable"
	@echo "  install             Install executable directly to system"
	@echo "  uninstall           Remove executable from system"
	@echo "  deb                 Build Debian package"
	@echo "  rpm                 Build RPM package"
	@echo "  clean               Clean build artifacts"
	@echo "  help                Show this help message"
	@echo ""
	@echo "Installation methods:"
	@echo "  1. Direct install (development): make install"
	@echo "  2. Debian package (recommended): make deb"
	@echo "  3. RPM package: make rpm"
	@echo ""

check-deps:
	@echo "Checking dependencies..."
	@command -v $(GO) >/dev/null 2>&1 || { echo "Go is required but not installed."; exit 1; }
	@echo "✓ All required dependencies found"

executable: check-deps
	@echo "Building $(BINARY)..."
	@$(GO) build -o $(BINARY) $(GO_SOURCES)
	@echo "✓ Executable built: $(BINARY)"

build: executable

install: executable
	@echo "Installing $(PACKAGE_NAME) executable..."
	@sudo mkdir -p $(CONFIG_DIR)
	@sudo install -m 0755 $(BINARY) $(BINARY_TARGET)
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
	@echo "  2. Test: $(BINARY_TARGET) --debug"
	@echo "  3. Install init script: sudo cp debian/systemd/$(PACKAGE_NAME).service /etc/systemd/system/"
	@echo "  4. Enable: sudo systemctl enable $(PACKAGE_NAME)"
	@echo "  5. Start: sudo systemctl start $(PACKAGE_NAME)"

uninstall:
	@echo "Uninstalling $(PACKAGE_NAME)..."
	@sudo systemctl stop $(PACKAGE_NAME) || true
	@sudo systemctl disable $(PACKAGE_NAME) || true
	@sudo rm -f $(BINARY_TARGET)
	@sudo rm -rf /var/log/go-e-sma-homewizard-controller
	@echo "✓ Uninstalled (configuration kept at $(CONFIG_DIR))"

deb: check-deps
	@echo "Building Debian package..."
	@dpkg-buildpackage -us -uc -b
	@echo "✓ Debian package built successfully"
	@echo ""
	@echo "To install the package:"
	@echo "  sudo dpkg -i ../$(PACKAGE_NAME)_*.deb"

rpm: check-deps
	@echo "Building RPM package..."
	@bash build-rpm-package.sh
	@echo "✓ RPM package built successfully"

clean:
	@echo "Cleaning build artifacts..."
	@rm -rf debian/go-e-sma-homewizard-controller
	@rm -f debian/debhelper-build-stamp
	@rm -f debian/files
	@rm -rf debian/.debhelper
	@rm -rf .debhelper-build-stamp
	@rm -f $(BINARY)
	@echo "✓ Clean complete"
