#### configuration

BUILD_DATE    = $(shell date "+%Y/%m/%d %H:%M:%S")
COMMON_DIR    = ../common

LOCALEDIR     = locale
ifeq ($(LOCALE),)
	LOCALEDIR = locale/en-US
else
	LOCALEDIR = locale/en-US locale/$(LOCALE)
endif
DOC_FILES     = $(foreach dir,$(LOCALEDIR),$(wildcard $(dir)/*.xml))

XPI_FILES     = install.rdf TODO AUTHORS NEWS chrome.manifest ../License.txt
XPI_DIRS      = components $(COMMON_DIR)/components
CHROME_DIRS   = content skin
COMMON_CHROME_DIRS   = content skin modules

XPI_NAME      = $(NAME)-$(VERSION)
XPI_PATH      = ../downloads/$(XPI_NAME)
XPI           = $(XPI_PATH).xpi

ifeq ($(TOPLEVEL),)
	XPI_FILE = $(XPI)
else
	XPI_FILE = downloads/$(XPI_NAME).xpi
endif

.SILENT:

#### rules

TARGETS = all help info xpi clean
$(TARGETS:%=\%.%):
	@echo MAKE $* $(@:$*.%=%)
	$(MAKE) -C $* $(@:$*.%=%)

.PHONY: $(TARGETS)
all: help

help:
	@echo "$(NAME) $(VERSION) build"
	@echo
	@echo "  make help      - display this help"
	@echo "  make info      - show some info about the system"
	@echo "  make xpi       - build an XPI ($(XPI_NAME))"
	@echo "  make clean     - clean up"
	@echo
	@echo "running some commands with V=1 will show more build details"

info:
	@echo "version             $(VERSION)"
	@echo "release file        $(XPI)"
	@echo "doc files           $(DOC_FILES)"
	@echo "xpi files           $(XPI_FILES)"

clean:
	@echo "General $(NAME) cleanup..."
	rm -f $(XPI)

xpi:
	@echo "Building XPI..."
	# Create folder structure
	mkdir -p $(XPI_PATH)/common/locale
	mkdir -p $(XPI_PATH)/locale

	# Copy top level files
	cp -L $(XPI_FILES) $(XPI_PATH)

	@echo "Update chrome.manifest for paths used inside the XPI..."
	sed -i -e 's#../common/#common/#' $(XPI_PATH)/chrome.manifest

	if [ "x$(LOCALE)" != "x" ]; then \
		echo "locale $(NAME) $(LOCALE) locale/$(LOCALE)/" >> $(XPI_PATH)/chrome.manifest; \
		echo "locale liberator $(LOCALE) common/locale/$(LOCALE)/" >> $(XPI_PATH)/chrome.manifest; \
	fi

	# Copy components and modules directories
	cp -LR $(XPI_DIRS) $(XPI_PATH)

	# Copy all chrome files from commmon/ folder
	cd $(COMMON_DIR) && \
	cp -LR $(COMMON_CHROME_DIRS) $(XPI_PATH)/common && \
	cp -LR $(LOCALEDIR) $(XPI_PATH)/common/locale || true

	# Copy all chrome files from vimperator|muttator folder
	cp -LR $(CHROME_DIRS) $(XPI_PATH)
	cp -LR $(LOCALEDIR) $(XPI_PATH)/locale || true

	@echo "Replacing ###VERSION### and ###DATE### tags"
	for file in `grep -rl -e "###VERSION###" -e "###DATE###" $(XPI_PATH)`; do \
		sed -i -e "s,###VERSION###,$(VERSION),g" $${file}; \
		sed -i -e "s,###DATE###,$(BUILD_DATE),g" $${file}; \
	done

	# Delete unknown file types
	find $(XPI_PATH) -type f         \
		   ! -name 'AUTHORS'         \
		-a ! -name 'TODO'            \
		-a ! -name 'NEWS'            \
		-a ! -name 'install.rdf'     \
		-a ! -name 'chrome.manifest' \
		-a ! -name 'License.txt'     \
		-a ! -name 'Makefile'        \
		-a ! -name '*.css'           \
		-a ! -name '*.dtd'           \
		-a ! -name '*.xml'           \
		-a ! -name '*.xul'           \
		-a ! -name '*.html'          \
		-a ! -name '*.xhtml'         \
		-a ! -name '*.xsl'           \
		-a ! -name '*.png'           \
		-a ! -name '*.svg'           \
		-a ! -name '*.js'            \
		-a ! -name '*.jsm'           \
		-delete

	# Zip the whole directory and remove dist folder
	@echo Packaging up $(XPI_NAME).xpi
	cd $(XPI_PATH) && zip -q -9r ../$(XPI_NAME).xpi *

	# Clean out build files
	rm -rf $(XPI_PATH)
	rm -rf ../downloads/common

	@echo "SUCCESS: $(XPI_FILE)"

