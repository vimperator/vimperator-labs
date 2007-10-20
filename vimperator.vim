" Vim syntax file
" Language:	    VIMperator configuration file
" Maintainer:	    Doug Kearns <dougkearns@gmail.com>
" Latest Revision:  2007 October 20

if exists("b:current_syntax")
  finish
endif

let s:cpo_save = &cpo
set cpo&vim

syn include @javascriptTop syntax/javascript.vim
unlet b:current_syntax

syn region  vimperatorString  start="\z(["']\)" end="\z1" skip="\\\\\|\\\z1" oneline

" FIXME: or just tell everyone to use single quotes for strings
syn keyword vimperatorTodo FIXME NOTE TODO XXX contained
syn match   vimperatorComment     +".*$+     contains=vimperatorTodo,@Spell
syn match   vimperatorLineComment +^\s*".*$+ contains=vimperatorTodo,@Spell

syn keyword vimperatorCommand addo[ns] b[uffer] ba[ck] bd[elete] beep bma[rk] bmarks buffers bun[load] bw[ipeout] delbm[arks]
	\ delm[arks] delqm[arks] dl downl[oads] e[dit] ec[ho] echoe[rr] exe[cute] exu[sage] files fo[rward] fw h[elp] ha[rdcopy]
	\ hist[ory] hs javas[cript] js ls ma[rk] map mapc[lear] marks no[remap] noh[lsearch] norm[al] o[pen] pc[lose]
	\ let pref[erences] prefs q[uit] qa[ll] qma[rk] qmarks quita[ll] re[load] reloada[ll] res[tart] sav[eas] sideb[ar] sb[ar]
	\ sbcl[ose] sb[open] se[t] so[urce] st[op] time tN[ext] t[open] tab tabN[ext] tabc[lose] tabe[dit] tabfir[st] tabl[ast]
	\ tabm[ove] tabn[ext] tabnew tabo[nly] tabopen tabp[revious] tabr[ewind] tabs tn[ext] tp[revious] u[ndo] unl[et] unm[ap]
	\ ve[rsion] viu[sage] w[rite] win[open] wine[dit] wo[pen] wq wqa[ll] xa[ll] zo[om] run
	\ contained

syn match vimperatorCommand "!" contained

" FIXME
syn match vimperatorCommandWrapper "\%(^\|:\|\s\)\@<=\%(!\|\h\w*\>\)" contains=vimperatorCommand

syn region vimperatorSet matchgroup=vimperatorCommand start="\<set\=\>" end="$" keepend oneline contains=vimperatorOption
syn keyword vimperatorOption activate act autohints ah noautohints noah complete cpt defsearch ds extendedhinttags eht
	\ focusedhintstyle fhs fullscreen fs nofullscreen nofs guioptions go hintchars hc hintstyle hs hinttags hlsearch hls
	\ nohlsearch nohls hlsearchstyle hlss nohlsearchstyle nohlss incsearch is noincsearch nois ignorecase ic noignorecase noic
	\ insertmode im noinsertmode noim laststatus ls linksearch lks nolinksearch nolks maxhints mh more nomore popups pps
	\ preload nopreload previewheight pvh scroll scr showmode smd noshowmode nosmd showstatuslinks ssli showtabline stal
	\ smartcase scs nosmartcase noscs titlestring usermode um nousermode noum verbose vbs visualbell vb novisualbell novb
	\ wildmode wim wildoptions wop
	\ contained

syn region vimperatorJavascript start="\%(^\s*\%(javascript\|js\)\s\+\)\@<=" end="$" contains=@javascriptTop keepend oneline
syn region vimperatorJavascript matchgroup=vimperatorJavascriptDelimiter
	\ start="\%(^\s*\%(javascript\|js\)\s\+\)\@<=<<\z(\h\w*\)"hs=s+2 end="^\z1$" contains=@javascriptTop fold

" Note: match vim.vim highlighting groups
hi def link vimperatorCommand			Statement
hi def link vimperatorTodo			Todo
hi def link vimperatorComment			Comment
hi def link vimperatorLineComment		Comment
hi def link vimperatorJavascriptDelimiter	Delimiter
hi def link vimperatorOption			PreProc
hi def link vimperatorString			String 

let b:current_syntax = "vimperator"

let &cpo = s:cpo_save
unlet s:cpo_save

" vim: tw=130:
