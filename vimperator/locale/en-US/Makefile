THISLOCALE=$(notdir $(shell pwd))

all: *.html

%: %.html %.txt
	@

%.html: %.txt asciidoc.conf
	@make -C ../../ locale/$(THISLOCALE)/$@
