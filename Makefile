
DIRS = vimperator muttator
TARGETS = clean distclean doc help info jar release xpi
.PHONY = tildetidy
.SILENT:

$(TARGETS:%=\%.%):
	echo MAKE $@
	$(MAKE) -C $* $(@:$*.%=%)

$(TARGETS): %: $(DIRS:%=%.%)

tildetidy:
		@echo "Removing vim backup files..."
		find . -name '*~' -exec rm -fv {} \;
