DIRS = muttator vimperator
TARGETS = clean doc help info xpi
.SILENT:

all: xpi ;

$(TARGETS:%=\%.%):
	echo MAKE $@
	$(MAKE) -C $* $(@:$*.%=%)

$(TARGETS):
	$(MAKE) $(DIRS:%=%.$@)

