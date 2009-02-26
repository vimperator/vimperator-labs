VIMBALL = vimperator.vba

vimball: mkvimball.txt syntax/vimperator.vim ftdetect/vimperator.vim
	-echo '%MkVimball! ${VIMBALL} .' | vim -u NORC -N -e -s mkvimball.txt

all: vimball

clean:
	rm -f ${VIMBALL}
