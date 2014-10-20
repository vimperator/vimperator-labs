DIRS = muttator vimperator
TARGETS = clean help info xpi
.SILENT:

all: xpi ;

$(TARGETS:%=\%.%):
	echo MAKE $@
	$(MAKE) -C $* $(@:$*.%=%) TOPLEVEL=yes

$(TARGETS):
	$(MAKE) $(DIRS:%=%.$@)

