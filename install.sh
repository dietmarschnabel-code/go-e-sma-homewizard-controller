#!/bin/bash
# Direct installation script for go-e-sma-homewizard-controller
# Use this for quick development/testing without building a full Debian package

set -e

PACKAGE_NAME="go-e-sma-homewizard-controller"
GO_SOURCE="./go-e-sma-homewizard-controller.go"
GO_NIGHTTIME_SOURCE="./nighttime_basic.go"
SCRIPT_TARGET="/usr/bin/go-e-sma-homewizard-controller"
CONFIG_DIR="/etc/go-e-sma-homewizard-controller"
CONFIG_FILE="go-e-sma-homewizard-controller.conf"
SERVICE_FILE="/etc/systemd/system/go-e-sma-homewizard-controller.service"
LOG_DIR="/var/log/go-e-sma-homewizard-controller"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo -e "${BLUE}===============================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}===============================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# Check if running as root
check_root() {
    if [ "$EUID" -ne 0 ]; then
        print_error "This script must be run as root"
        echo "Please run: sudo bash $0"
        exit 1
    fi
}

# Check dependencies
check_dependencies() {
    print_header "Checking Dependencies"
    
    if ! command -v go &> /dev/null; then
        print_error "go not found"
        exit 1
    fi
    print_success "go"
    
    echo ""
}

# Build executable
validate_script() {
    print_header "Building Go Executable"

    if [ ! -f "$GO_SOURCE" ] || [ ! -f "$GO_NIGHTTIME_SOURCE" ]; then
        print_error "Go source files not found"
        exit 1
    fi

    if go build -o "$PACKAGE_NAME" "$GO_SOURCE" "$GO_NIGHTTIME_SOURCE"; then
        print_success "Go executable built"
    else
        print_error "Go build failed"
        exit 1
    fi
    
    echo ""
}

# Install executable
install_script() {
    print_header "Installing Executable"
    
    if [ -f "$SCRIPT_TARGET" ]; then
        print_warning "Executable already exists at $SCRIPT_TARGET (backing up to $SCRIPT_TARGET.bak)"
        cp "$SCRIPT_TARGET" "$SCRIPT_TARGET.bak"
    fi
    
    install -m 0755 "$PACKAGE_NAME" "$SCRIPT_TARGET"
    print_success "Executable installed to $SCRIPT_TARGET"
    
    echo ""
}

# Setup configuration
setup_config() {
    print_header "Setting Up Configuration"
    
    if [ ! -d "$CONFIG_DIR" ]; then
        mkdir -p "$CONFIG_DIR"
        chmod 755 "$CONFIG_DIR"
        print_success "Created configuration directory: $CONFIG_DIR"
    fi
    
    if [ ! -f "$CONFIG_DIR/$CONFIG_FILE" ]; then
        install -m 0644 "$CONFIG_FILE" "$CONFIG_DIR/$CONFIG_FILE"
        print_success "Created configuration file: $CONFIG_DIR/$CONFIG_FILE"
        print_warning "IMPORTANT: Edit the configuration file with your IP addresses!"
    else
        print_warning "Configuration file already exists (keeping original)"
        install -m 0644 "$CONFIG_FILE" "$CONFIG_DIR/$CONFIG_FILE.new"
        print_info "New version saved to: $CONFIG_DIR/$CONFIG_FILE.new"
    fi
    
    echo ""
}

# Setup logging directory
setup_logging() {
    print_header "Setting Up Logging"
    
    if [ ! -d "$LOG_DIR" ]; then
        mkdir -p "$LOG_DIR"
        chmod 755 "$LOG_DIR"
        print_success "Created log directory: $LOG_DIR"
    fi
    
    echo ""
}

# Setup systemd service
setup_systemd() {
    print_header "Setting Up Systemd Service"
    
    if [ -f "debian/systemd/go-e-sma-homewizard-controller.service" ]; then
        install -m 0644 "debian/systemd/go-e-sma-homewizard-controller.service" "$SERVICE_FILE"
        print_success "Installed systemd service: $SERVICE_FILE"
        
        # Reload systemd daemon
        if command -v systemctl &> /dev/null; then
            systemctl daemon-reload
            print_success "Reloaded systemd daemon"
        fi
    else
        print_warning "Systemd service file not found at debian/systemd/go-e-sma-homewizard-controller.service"
        print_info "You can still run the script manually: $SCRIPT_TARGET"
    fi
    
    echo ""
}

# Show next steps
show_next_steps() {
    print_header "Installation Complete!"
    
    echo ""
    echo -e "${GREEN}Next Steps:${NC}"
    echo ""
    echo "1. ${YELLOW}Configure the service:${NC}"
    echo "   sudo nano $CONFIG_DIR/$CONFIG_FILE"
    echo ""
    echo "   Required settings:"
    echo "   - CHARGER_IP: IP address of your go-e-charger"
    echo "   - P1_IP: IP address of your HomeWizard P1 Meter"
    echo ""
    echo "2. ${YELLOW}Test the script:${NC}"
    echo "   $SCRIPT_TARGET --debug"
    echo ""
    echo "3. ${YELLOW}Start the service:${NC}"
    echo "   sudo systemctl start $PACKAGE_NAME"
    echo ""
    echo "4. ${YELLOW}Enable auto-start (optional):${NC}"
    echo "   sudo systemctl enable $PACKAGE_NAME"
    echo ""
    echo "5. ${YELLOW}Check status:${NC}"
    echo "   sudo systemctl status $PACKAGE_NAME"
    echo ""
    echo "6. ${YELLOW}View logs:${NC}"
    echo "   sudo journalctl -u $PACKAGE_NAME -f"
    echo ""
    echo -e "${GREEN}Documentation:${NC}"
    echo "  GitHub: https://github.com/dietmarschnabel-code/go-e-sma-homewizard-controller"
    echo ""
}

# Main execution
main() {
    print_header "$PACKAGE_NAME - Direct Installation"
    
    check_root
    check_dependencies
    validate_script
    install_script
    setup_config
    setup_logging
    setup_systemd
    show_next_steps
}

# Run main function
main "$@"
