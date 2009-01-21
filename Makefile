
DIRS = vimperator muttator
TARGETS = clean distclean doc help info jar release xpi
.SILENT:

$(TARGETS:%=\%.%):
	echo MAKE $@
	$(MAKE) -C $* $(@:$*.%=%)

$(TARGETS): %: $(DIRS:%=%.%)

