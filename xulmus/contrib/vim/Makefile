VIMBALL = xulmus.vba

vimball: mkvimball.txt syntax/xulmus.vim ftdetect/xulmus.vim
	-echo '%MkVimball! ${VIMBALL} .' | vim -u NORC -N -e -s mkvimball.txt

all: vimball

clean:
	rm -f ${VIMBALL}
