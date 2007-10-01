#### configuration

TOP           = $(shell pwd)

VERSION       = 0.5.2pre
OS            = $(shell uname -s)
BUILD_DATE    = $(shell date "+%Y/%m/%d %H:%M:%S")

JAR_FILES     = ${shell find content skin	\
			-type f			\
			-a ! -path '*CVS*'	\
			-a \(			\
				-path '*.js'	\
			     -o -path '*.css'	\
			     -o -path '*.xul'	\
			     -o -path '*.png'	\
			   \)			\
		}
JAR_DIRS      = $(foreach f,${JAR_FILES},$(dir $f))
JAR           = chrome/vimperator.jar

XPI_TXT_FILES = install.rdf chrome.manifest TODO AUTHORS Donators NEWS
XPI_DIRS      = $(foreach f,${XPI_FILES},$(dir $f))
XPI_BIN_FILES = ${JAR} Makefile
XPI_FILES     = ${XPI_BIN_FILES} ${XPI_TXT_FILES}
XPI_NAME      = vimperator_${VERSION}.xpi
XPI           = ../downloads/${XPI_NAME}

RDF           = ../downloads/update.rdf
RDF_IN        = ${RDF}.in

BUILD_DIR     = build.${VERSION}.${OS}
BUILD_JAR_DIR = ${BUILD_DIR}/jar
BUILD_XPI_DIR = ${BUILD_DIR}/xpi

BUILD_JAR_SUBDIRS = $(sort ${JAR_DIRS:%=${BUILD_JAR_DIR}/%})
BUILD_XPI_SUBDIRS = $(sort ${XPI_DIRS:%=${BUILD_XPI_DIR}/%})

ZIP = zip
SED = sed

# find the vimperator chrome dir

ifeq (${OS},Darwin)
FIREFOX_DEFAULT = $(wildcard ${HOME}/Library/Application\ Support/Firefox/Profiles/*default)
else
ifeq ($(findstring CYGWIN,${OS}),CYGWIN)
HOME = $(shell cygpath -sm "${USERPROFILE}")
FIREFOX_DEFAULT = $(wildcard ${HOME}/Application\ Data/Mozilla/Firefox/Profiles/*default)
else
FIREFOX_DEFAULT = $(wildcard ${HOME}/.mozilla/firefox/*.default)
endif
endif

VIMPERATOR_CHROME_EMAIL = ${FIREFOX_DEFAULT}/extensions/vimperator@mozdev.org/chrome/
FOUND_CHROME_UUID = $(dir $(wildcard ${FIREFOX_DEFAULT}/extensions/{*-*-*-*-*}/chrome/vimperator.jar))
FOUND_CHROME_EMAIL = $(dir $(wildcard ${VIMPERATOR_CHROME_EMAIL}))
FOUND_CHROME = $(if ${FOUND_CHROME_UUID},${FOUND_CHROME_UUID},${FOUND_CHROME_EMAIL})
INSTALL_CHROME = $(if ${FOUND_CHROME},${FOUND_CHROME},${VIMPERATOR_CHROME_EMAIL})

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
	@echo "  make info      - show some info about the system"
	@echo "  make jar       - build a JAR (${JAR})"
	@echo "  make install   - install into your firefox dir (run info)"
	@echo "  make xpi       - build an XPI (${XPI_NAME})"
	@echo "  make release   - updates update.rdf (this is not for you)"
	@echo "  make clean     - clean up"
	@echo
	@echo "running some commands with V=1 will show more build details"

info:
	@echo    "version             ${VERSION}"
	@echo    "release file        ${XPI}"
	@echo -e "jar files           $(shell echo ${JAR_FILES} | sed 's/ /\\n                    /g' )"
	@test -d "${FIREFOX_DEFAULT}" || ( echo "E: didn't find your .mozilla/firefox/*.default/ dir" ; false )
	@echo    "firefox default     ${FIREFOX_DEFAULT}"
	@test -d "${FOUND_CHROME}" || ( echo "E: didn't find an existing vimperator chrome dir" ; false )
	@[ -n "${FOUND_CHROME_UUID}" ] && \
	 echo    "vimperator chrome   ${FOUND_CHROME_UUID}" || true
	@[ -n "${FOUND_CHROME_EMAIL}" ] && \
	 echo    "vimperator chrome   ${FOUND_CHROME_EMAIL}" || true
	@[ -z "${FOUND_CHROME_UUID}" -o -z "${FOUND_CHROME_EMAIL}" ] || \
	(echo    "E: you have multiple vimperator's installed, you need to fix that" ; false)

needs_chrome_dir:
	@echo "Checking chrome dir..."
	-${Q}mkdir -p "${INSTALL_CHROME}"
	${Q}test -d "${INSTALL_CHROME}"

xpi: ${XPI}
jar: ${JAR}

install: needs_chrome_dir ${JAR}
	@echo "Installing JAR..."
	${Q}cp ${CP_V} ${JAR} "${INSTALL_CHROME}"

release: ${XPI} ${RDF}

${RDF}: ${RDF_IN} Makefile
	@echo "Preparing release..."
	${Q}${SED} -e "s,###VERSION###,${VERSION},g" \
	           -e "s,###DATE###,${BUILD_DATE},g" \
	           < $< > $@
	@echo "SUCCESS: $@"

clean:
	@echo "Cleanup..."
	${Q}rm -f ${JAR} ${XPI}
	${Q}find . -name '*~' -exec rm -f {} \;
	${Q}rm -rf ${BUILD_DIR}

#### xpi

${BUILD_XPI_SUBDIRS}:
	${Q}mkdir -p $@

${XPI}: ${BUILD_XPI_SUBDIRS} ${XPI_FILES}
	@echo "Building XPI..."
	${Q}mkdir -p $(dir ${XPI})
	${Q}for f in ${XPI_BIN_FILES} ; do \
		cp $$f ${BUILD_XPI_DIR}/$$f ; \
	    done
	${Q}for f in ${XPI_TXT_FILES} ; do \
		${SED} -e "s,###VERSION###,${VERSION},g" \
		       -e "s,###DATE###,${BUILD_DATE},g" \
		       < $$f > ${BUILD_XPI_DIR}/$$f ; \
		( diff -q $$f ${BUILD_XPI_DIR}/$$f 1>/dev/null ) || \
		( echo "modified: $$f" ; \
		  diff -u $$f ${BUILD_XPI_DIR}/$$f | grep '^[-+][^-+]' ) ; \
	    done
	${Q}( cd ${BUILD_XPI_DIR} && ${ZIP} -r ${TOP}/${XPI} ${XPI_FILES} )
	@echo "SUCCESS: $@"

#### jar

${BUILD_JAR_SUBDIRS}:
	${Q}mkdir -p $@

${JAR}: ${BUILD_JAR_SUBDIRS} ${JAR_FILES}
	@echo "Building JAR..."
	${Q}mkdir -p $(dir ${JAR}) #FIXME
	${Q}for f in ${JAR_FILES} ; do \
		${SED} -e "s,###VERSION###,${VERSION},g" \
		       -e "s,###DATE###,${BUILD_DATE},g" \
		       < $$f > ${BUILD_JAR_DIR}/$$f ; \
		( diff -q $$f ${BUILD_JAR_DIR}/$$f 1>/dev/null ) || \
		( echo "modified: $$f" ; \
		  diff -u $$f ${BUILD_JAR_DIR}/$$f | grep '^[-+][^-+]' ) ; \
	    done
	${Q}( cd ${BUILD_JAR_DIR} && ${ZIP} -r ${TOP}/${JAR} ${JAR_FILES} )
	@echo "SUCCESS: $@"
