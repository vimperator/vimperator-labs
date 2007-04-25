#### configuration

VERSION  = 0.4

JAR_FILES     = ${shell find chrome/content/ -type f -a ! -path '*CVS*' ! -name 'tags'} chrome.manifest
JAR           = chrome/vimperator.jar

RELEASE_FILES = ${JAR} install.rdf chrome.manifest TODO AUTHORS Donators ChangeLog Makefile
RELEASE_DIR   = ../downloads
RELEASE_XPI   = vimperator_${VERSION}.xpi
RELEASE       = ${RELEASE_DIR}/${RELEASE_XPI}

ZIP = zip

# find the vimperator chrome dir

FIREFOX_DEFAULT = $(wildcard ${HOME}/.mozilla/firefox/*.default)
VIMPERATOR_CHROME = ${FIREFOX_DEFAULT}/extensions/vimperator@mozdev.org/chrome/

# specify V=1 on make line to see more verbose output
Q=$(if ${V},,@)
CP_V=$(if ${V},-v)

#### rules

.PHONY: all help info needs_chrome_dir jar xpi install clean
all: help

help:
	@echo "vimperator ${VERSION} build"
	@echo
	@echo "  make help      - display this help"
	@echo "  make info      - shome some info about the system"
	@echo "  make jar       - build a JAR (${JAR})"
	@echo "  make install   - install into your firefox dir (run info)"
	@echo "  make xpi       - build an XPI (${RELEASE_XPI})"
	@echo "  make clean     - clean up"
	@echo
	@echo "running some commands with V=1 will show more build details"

info:
	@echo    "version             ${VERSION}"
	@echo    "release file        ${RELEASE}"
	@echo -e "jar files           $(shell echo ${JAR_FILES} | sed 's/ /\\n                    /g' )"
	@test -d "${FIREFOX_DEFAULT}" || ( echo "E: didn't find your .mozilla/firefox/*.default/ dir" ; false )
	@echo    "firefox default     ${FIREFOX_DEFAULT}"
	@test -d "${VIMPERATOR_CHROME}" || ( echo "E: didn't find an existing vimperator chrome dir" ; false )
	@echo    "vimperator chrome   ${VIMPERATOR_CHROME}"

needs_chrome_dir:
	@echo "Checking chrome dir..."
	-${Q}mkdir -p "${VIMPERATOR_CHROME}"
	${Q}test -d "${VIMPERATOR_CHROME}"

xpi: ${RELEASE}
jar: ${JAR}

install: needs_chrome_dir ${JAR}
	@echo "Installing JAR..."
	${Q}cp ${CP_V} ${JAR} ${VIMPERATOR_CHROME}

clean:
	@echo "Cleanup..."
	${Q}rm -f ${JAR} ${XPI}
	${Q}find . -name '*~' -exec rm -f {} \;

${RELEASE}: ${RELEASE_FILES}
	@echo "Building XPI..."
	@mkdir -p ${RELEASE_DIR}
	${Q}${ZIP} -r ${RELEASE} ${RELEASE_FILES}
	@echo "SUCCESS: ${RELEASE}"

${JAR}: ${JAR_FILES}
	@echo "Building JAR..."
	${Q}${ZIP} -r ${JAR} ${JAR_FILES}
	@echo "SUCCESS: ${JAR}"
