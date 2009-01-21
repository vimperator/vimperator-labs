
DIRS = vimperator muttator
TARGETS = clean distclean doc help info jar release xpi
.SILENT:

all: xpi ;

$(TARGETS:%=\%.%):
	echo MAKE $@
	$(MAKE) -C $* $(@:$*.%=%)

$(TARGETS): %: $(DIRS:%=%.%)

