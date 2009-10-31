#### configuration

TOP           = $(shell pwd)
OS            = $(shell uname -s)
BUILD_DATE    = $(shell date "+%Y/%m/%d %H:%M:%S")
BASE          = $(TOP)/../common
GOOGLE_PROJ   = vimperator-labs
GOOGLE	      = https://$(GOOGLE_PROJ).googlecode.com/files

LOCALEDIR     = locale
DOC_FILES     = $(wildcard $(LOCALEDIR)/*/*.xml)

export VERSION BUILD_DATE
MAKE_JAR      = sh $(BASE)/make_jar.sh

# TODO: specify source files manually?
JAR_BASES     = $(TOP) $(BASE)
JAR_DIRS      = content skin locale
JAR_TEXTS     = js css dtd xml xul html xhtml
JAR_BINS      = png

JAR           = chrome/$(NAME).jar

XPI_BASES     = $(JAR_BASES) $(TOP)/..
XPI_FILES     = install.rdf TODO AUTHORS Donors NEWS License.txt
XPI_DIRS      = modules components chrome
XPI_TEXTS     = js jsm
XPI_BINS      = jar

XPI_NAME      = $(NAME)_$(VERSION)
XPI_PATH      = ../downloads/$(XPI_NAME)
XPI           = $(XPI_PATH).xpi

RDF           = ../downloads/update.rdf
RDF_IN        = $(RDF).in

BUILD_DIR     = build.$(VERSION).$(OS)

AWK = awk

.SILENT:

#### rules

TARGETS = all help info jar xpi install clean distclean $(JAR)
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
	@echo "  make jar       - build a JAR ($(JAR))"
	@echo "  make xpi       - build an XPI ($(XPI_NAME))"
	@echo "  make release   - updates update.rdf (this is not for you)"
	@echo "  make release   - uploads to Google Code (this is not for you)"
	@echo "  make clean     - clean up"
	@echo "  make distclean - clean up more"
	@echo
	@echo "running some commands with V=1 will show more build details"

info:
	@echo "version             $(VERSION)"
	@echo "release file        $(XPI)"
	@echo "doc files           $(DOC_FILES)"
	@echo "xpi files           $(XPI_FILES)"

xpi: $(XPI)
jar: $(JAR)

release: $(XPI) $(RDF)

# This is not for you!
dist: $(XPI)
	@echo DIST $(XPI) $(GOOGLE)
	proj=$$(echo -n $(NAME) | sed 's/\(.\).*/\1/' | tr a-z A-Z);    	\
	proj="$$proj$$(echo $(NAME) | sed 's/.//')";                    	\
	[ -z "$$summary" ] && summary="$$proj $(VERSION) Release"; 		\
	labels="Project-$$proj,$(labels)";					\
	[ -n "$(featured)" ] && labels="$$labels,Featured";             	\
								        	\
	IFS=,; for l in $$(echo $$labels); do					\
		set -- "$$@" --form-string "label=$$l";				\
	done;									\
	curl "$@" --form-string "summary=$$summary" 				\
		-F "filename=<$(XPI)"						\
		-H "Authorization: $$(echo "$(GOOGLE_USER):$(GOOGLE_PASS)" | base64)" \
		-i "$(GOOGLE)" | sed -n '/^Location/{p;q}'

$(RDF): $(RDF_IN) Makefile
	@echo "Preparing release..."
	$(SED) -e "s,###VERSION###,$(VERSION),g" \
	           -e "s,###DATE###,$(BUILD_DATE),g" \
	           < $< > $@
	@echo "SUCCESS: $@"

clean:
	@echo "General $(NAME) cleanup..."
	rm -f $(JAR) $(XPI)

distclean:
	@echo "More $(NAME) cleanup..."
	rm -rf $(BUILD_DIR)

#### xpi

$(XPI): $(JAR)
	@echo "Building XPI..."
	mkdir -p $(XPI_PATH)
	$(AWK) -v 'name=$(NAME)' -f $(BASE)/process_manifest.awk $(TOP)/chrome.manifest >$(XPI_PATH)/chrome.manifest
	$(MAKE_JAR) "$(XPI)" "$(XPI_BASES)" "$(XPI_DIRS)" "$(XPI_TEXTS)" "$(XPI_BINS)" "$(XPI_FILES)"
	@echo "SUCCESS: $@"

#### jar

$(JAR):
	@echo "Building JAR..."
	$(MAKE_JAR) "$(JAR)" "$(JAR_BASES)" "$(JAR_DIRS)" "$(JAR_TEXTS)" "$(JAR_BINS)" "$(JAR_FILES)"
	@echo "SUCCESS: $@"

