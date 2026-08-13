#!/bin/bash
# Build script for go-e-sma-homewizard-controller Debian package
# This script automates the Debian package build process

set -e

PACKAGE_NAME="go-e-sma-homewizard-controller"
VERSION="1.0.0"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Check for required commands
check_dependencies() {
    print_header "Checking Dependencies"
    
    local missing_deps=0
    
    # Check for build tools
    if ! command -v dpkg-buildpackage &> /dev/null; then
        print_error "dpkg-buildpackage not found (install: sudo apt-get install build-essential devscripts debhelper)"
        missing_deps=1
    else
        print_success "dpkg-buildpackage"
    fi
    
    if ! command -v debhelper &> /dev/null; then
        print_error "debhelper not found (install: sudo apt-get install debhelper)"
        missing_deps=1
    else
        print_success "debhelper"
    fi
    
    if ! command -v bash &> /dev/null; then
        print_error "bash not found"
        missing_deps=1
    else
        print_success "bash"
    fi
    
    if ! command -v curl &> /dev/null; then
        print_warning "curl not found (required at runtime)"
    else
        print_success "curl (runtime dependency)"
    fi
    
    if ! command -v jq &> /dev/null; then
        print_warning "jq not found (required at runtime)"
    else
        print_success "jq (runtime dependency)"
    fi
    
    if [ $missing_deps -eq 1 ]; then
        print_error "Missing build dependencies. Install with:"
        echo "  sudo apt-get install build-essential devscripts debhelper"
        exit 1
    fi
    
    echo ""
}

# Validate script syntax
validate_script() {
    print_header "Validating Script Syntax"
    
    if bash -n "$SCRIPT_DIR/go-e-sma-homewizard-controller.sh"; then
        print_success "Script syntax is valid"
    else
        print_error "Script has syntax errors"
        exit 1
    fi
    
    echo ""
}

# Build the package
build_package() {
    print_header "Building Debian Package"
    
    cd "$SCRIPT_DIR"
    
    if dpkg-buildpackage -us -uc -b 2>&1 | tee build.log; then
        print_success "Package built successfully"
        echo ""
        
        # Find the built package
        local deb_file=$(ls -t ../go-e-sma-homewizard-controller_*.deb 2>/dev/null | head -1)
        if [ -n "$deb_file" ]; then
            print_info "Built package: $(basename "$deb_file")"
            print_info "Location: $deb_file"
            print_info "Size: $(du -h "$deb_file" | cut -f1)"
        fi
    else
        print_error "Package build failed. Check build.log for details."
        exit 1
    fi
    
    echo ""
}

# Show installation instructions
show_installation_instructions() {
    print_header "Installation Instructions"
    
    local deb_file=$(ls -t ../go-e-sma-homewizard-controller_*.deb 2>/dev/null | head -1)
    
    echo ""
    echo "To install the package:"
    echo -e "${YELLOW}sudo dpkg -i $(basename "$deb_file")${NC}"
    echo ""
    echo "Or use apt to satisfy dependencies automatically:"
    echo -e "${YELLOW}sudo apt install ./$(basename "$deb_file")${NC}"
    echo ""
    echo "After installation, configure and start the service:"
    echo ""
    echo "1. Edit configuration:"
    echo -e "   ${YELLOW}sudo nano /etc/go-e-sma-homewizard-controller/go-e-sma-homewizard-controller.conf${NC}"
    echo ""
    echo "2. Start the service:"
    echo -e "   ${YELLOW}sudo systemctl start $PACKAGE_NAME${NC}"
    echo ""
    echo "3. Enable auto-start:"
    echo -e "   ${YELLOW}sudo systemctl enable $PACKAGE_NAME${NC}"
    echo ""
    echo "4. Check status:"
    echo -e "   ${YELLOW}sudo systemctl status $PACKAGE_NAME${NC}"
    echo ""
    echo "5. View logs:"
    echo -e "   ${YELLOW}sudo journalctl -u $PACKAGE_NAME -f${NC}"
    echo ""
}

# Main execution
main() {
    print_header "go-e-sma-homewizard-controller - Debian Package Builder"
    
    check_dependencies
    validate_script
    build_package
    show_installation_instructions
    
    print_header "Build Complete!"
    echo -e "${GREEN}The Debian package is ready for installation.${NC}"
    echo ""
}

# Run main function
main "$@"
