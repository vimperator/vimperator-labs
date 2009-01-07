THIS_LOCALE  = $(notdir $(shell pwd))
DOC_FILES    = $(addsuffix .html,$(basename $(wildcard *.txt)))

.PHONY: all doc clean distclean

doc: $(DOC_FILES)

clean:
	find . -name '*~' -exec rm -f {} \;

distclean: clean
	rm -f $(DOC_FILES)

%: %.html %.txt
	@

%.html: %.txt ../../../common/Makefile.common asciidoc.conf
	@make -C ../../ locale/$(THIS_LOCALE)/$@
