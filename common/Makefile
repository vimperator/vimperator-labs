#### configuration

TOP           = $(shell pwd)
OS            = $(shell uname -s)
BUILD_DATE    = $(shell date "+%Y/%m/%d %H:%M:%S")
COMMON_DIR    = $(TOP)/../common
GOOGLE_PROJ   = vimperator-labs
GOOGLE	      = https://$(GOOGLE_PROJ).googlecode.com/files

LOCALEDIR     = locale
ifeq ($(LOCALE),)
	LOCALEDIR = locale/en-US
else
	LOCALEDIR = locale/en-US locale/$(LOCALE)
endif
DOC_FILES     = $(foreach dir,$(LOCALEDIR),$(wildcard $(dir)/*.xml))

# TODO: only add these file types?
# JAR_TEXTS     = js css dtd xml xul html xhtml xsl
# JAR_BINS      = png
# XPI_TEXTS     = js jsm

XPI_FILES     = install.rdf TODO AUTHORS NEWS chrome.manifest ../License.txt
XPI_DIRS      = $(COMMON_DIR)/components components
CHROME_DIRS   = content skin $(LOCALEDIR)
COMMON_CHROME_DIRS   = content skin modules $(LOCALEDIR)

XPI_NAME      = $(NAME)-$(VERSION)
XPI_PATH      = ../downloads/$(XPI_NAME)
XPI           = $(XPI_PATH).xpi

AWK  = awk
CURL = curl
B64ENCODE = base64
# Mac OS X's sed and cp is not run because BSD's syntax
SED  = sed
CP   = cp

.SILENT:

#### rules

TARGETS = all help info xpi clean
$(TARGETS:%=\%.%):
	echo MAKE $* $(@:$*.%=%)
	$(MAKE) -C $* $(@:$*.%=%)

.PHONY: $(TARGETS)
all: help

help:
	@echo "$(NAME) $(VERSION) build"
	@echo
	@echo "  make help      - display this help"
	@echo "  make info      - show some info about the system"
	@echo "  make xpi       - build an XPI ($(XPI_NAME))"
	@echo "  make dist      - uploads to Google Code (this is not for you)"
	@echo "  make clean     - clean up"
	@echo
	@echo "running some commands with V=1 will show more build details"

info:
	@echo "version             $(VERSION)"
	@echo "release file        $(XPI)"
	@echo "doc files           $(DOC_FILES)"
	@echo "xpi files           $(XPI_FILES)"

# This is not for you!
dist: $(XPI)
	@echo DIST $(XPI) $(GOOGLE)
	set -e;							        	\
	which $$(echo $(B64ENCODE) | $(AWK) '{print $1}') >/dev/null;		\
								        	\
	proj=$$(echo -n $(NAME) | $(SED) 's/\(.\).*/\1/' | tr a-z A-Z);    	\
	proj="$$proj$$(echo $(NAME) | $(SED) 's/.//')";                    	\
	[ -z "$$summary" ] && summary="$$proj $(VERSION) Release"; 		\
	labels="Project-$$proj,$(labels)";					\
	[ -n "$(featured)" ] && labels="$$labels,Featured";             	\
								        	\
	IFS=,; for l in $$labels; do						\
		set -- "$$@" --form-string "label=$$l";				\
	done;									\
	$(CURL) "$$@" --form-string "summary=$$summary" 			\
		-F "filename=@$(XPI)"						\
		-H "Authorization: Basic $$(echo -n "$(GOOGLE_USER):$(GOOGLE_PASS)" | $(B64ENCODE))" \
		-i "$(GOOGLE)" | $(SED) -n '/^Location/{p;q;}'

clean:
	@echo "General $(NAME) cleanup..."
	rm -f $(XPI)

xpi:
	@echo "Building XPI..."
	# Create folder structure
	mkdir -p $(XPI_PATH)/common
	# Copy top level files
	$(CP) -L $(XPI_FILES) -t $(XPI_PATH) || true
	@echo "Update chrome.manifest for paths used inside the XPI..."
	$(SED) -i -e 's#../common/#common/#' $(XPI_PATH)/chrome.manifest
	# Copy components and modules directories
	$(CP) -Lr $(XPI_DIRS) -t $(XPI_PATH) || true
	# Copy all chrome files, from both commmon/ and vimperator/ folders
	cd $(COMMON_DIR) && $(CP) -Lr --parents $(COMMON_CHROME_DIRS) -t $(XPI_PATH)/common || true
	$(CP) -Lr --parents $(CHROME_DIRS) -t $(XPI_PATH) || true
	# TODO: Replace ###VERSION### tags
	@echo "Replacing ###VERSION### and ###DATE### tags"
	find $(XPI_PATH) -type f ! -name "*.png" -exec $(SED) -i -e "s,###VERSION###,$(VERSION),g" -e "s,###DATE###,$(BUILD_DATE),g" {} \;
	# Zip the whole directory and remove dist folder
	cd $(XPI_PATH) && zip -9r ../$(XPI_NAME).xpi *
	rm -rf $(XPI_PATH)
	@echo "SUCCESS: $(XPI_PATH).xpi"

