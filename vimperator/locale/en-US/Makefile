THISLOCALE=$(notdir $(shell pwd))

all: *.html

%: %.html %.txt
	@make $@.html

%.html: %.txt asciidoc.conf
	@make -C ../../ locale/$(THISLOCALE)/$@
