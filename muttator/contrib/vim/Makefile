VIMBALL = muttator.vba

vimball: mkvimball.txt syntax/muttator.vim ftdetect/muttator.vim
	-echo '%MkVimball! ${VIMBALL} .' | vim -u NORC -N -e -s mkvimball.txt

all: vimball

clean:
	rm -f ${VIMBALL}
