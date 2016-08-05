#### configuration

BUILD_DATE    = $(shell date "+%Y/%m/%d %H:%M:%S")
COMMON_DIR    = ../common

DOC_FILES     = $(foreach dir,locale/en-US,$(wildcard $(dir)/*.xml))

XPI_FILES     = install.rdf TODO AUTHORS NEWS chrome.manifest ../License.txt
XPI_DIRS      = components $(COMMON_DIR)/components
CHROME_DIRS   = content skin
COMMON_CHROME_DIRS   = content skin modules

XPI_NAME      = $(NAME)-$(VERSION)
XPI_PATH      = ../downloads/$(XPI_NAME)
XPI           = $(XPI_PATH).xpi
XPI_SIGNED    = $(XPI_PATH)-signed.xpi

ifeq ($(TOPLEVEL),)
	XPI_FILE = $(XPI)
else
	XPI_FILE = downloads/$(XPI_NAME).xpi
endif

### Locales
L1 = $(shell ls locale)
L2 = $(shell ls ../common/locale)
L1_LEN = $(shell echo $(L1) | wc -c)
L2_LEN = $(shell echo $(L2) | wc -c)
OPTION = $(shell test $(L1_LEN) -gt $(L2_LEN) && echo 1)

ifeq ($(OPTION),1)
	SUPPORTED_LOCALES = $(L1)
else
	SUPPORTED_LOCALES = $(L2)
endif

LOCALE_MAP = . locale $(NAME)\n.. common/locale liberator\n

.SILENT:

#### rules

TARGETS = all help info xpi clean sign
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
	@echo "  make sign      - sign XPI (requires private.properties)"

info:
	@echo "version             $(VERSION)"
	@echo "release file        $(XPI)"
	@echo "doc files           $(DOC_FILES)"
	@echo "supported locales   $(SUPPORTED_LOCALES)"
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

	# Copy components and modules directories
	cp -LR $(XPI_DIRS) $(XPI_PATH)

	# Copy all chrome files from commmon/ folder
	cd $(COMMON_DIR) && \
	cp -LR $(COMMON_CHROME_DIRS) $(XPI_PATH)/common

	# Copy all chrome files from vimperator|muttator folder
	cp -LR $(CHROME_DIRS) $(XPI_PATH)

	# Remove existing locale entries from the manifest file
	for locale in $(SUPPORTED_LOCALES); do \
		sed -i -e "/$$locale/d" $(XPI_PATH)/chrome.manifest; \
	done

	# Package up locale specific documentation files
	#  * Create a folder for the requested locale in the build directory
	#  * Copy the English version of the documentation files there
	#  * Overwrite them with documentation files from the requested locale
	#  * Add an entry for the requested locale in the chrome.manifest file
	for locale in $(SUPPORTED_LOCALES); do \
		echo "Including $$locale documentation"; \
		printf "$(LOCALE_MAP)" | \
		while read parent dir name; do\
			src=$$parent/$$dir/$$locale; \
			dest=$(XPI_PATH)/$$dir/$$locale; \
			mkdir -p $$dest; \
			cp -LR $$parent/$$dir/en-US/. $$dest; \
			test -d $$src && \
				cp -LR $$src/. $$dest; \
			echo "locale $$name $$locale $$dir/$$locale/" >> $(XPI_PATH)/chrome.manifest; \
		done;\
	done

	# Update locale paths in manifest file
	sed -i -e 's# ./locale/# locale/#' $(XPI_PATH)/chrome.manifest
	sed -i -e 's#../common/#common/#' $(XPI_PATH)/chrome.manifest

	@echo "Replacing UUID, VERSION and DATE tags"
	for file in `grep -rl -e "###UUID###" -e "###VERSION###" -e "###DATE###" $(XPI_PATH)`; do \
		sed -i -e "s,###UUID###,$(UUID),g" $${file}; \
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

sign: xpi
	@echo "Signing XPI"
	jpm sign --api-key $(AMO_API_KEY) --api-secret $(AMO_API_SECRET) --xpi $(XPI)

	# Move downloaded file, see https://github.com/mozilla-jetpack/jpm/pull/544
	if [ `ls *-fx.xpi 2>/dev/null | wc -l` -eq 1 ]; then \
		mv *-fx.xpi $(XPI_SIGNED); \
	else \
		exit 1; \
	fi
