" Vim syntax file
" Language:	    VIMperator configuration file
" Maintainer:	    Doug Kearns <dougkearns@gmail.com>
" Latest Revision:  2007 November 9

if exists("b:current_syntax")
  finish
endif

let s:cpo_save = &cpo
set cpo&vim

syn include @javascriptTop syntax/javascript.vim
unlet b:current_syntax

syn keyword vimperatorTodo FIXME NOTE TODO XXX contained
syn match   vimperatorComment     +".*$+     contains=vimperatorTodo,@Spell

syn region  vimperatorString  start="\z(["']\)" end="\z1" skip="\\\\\|\\\z1" oneline

syn match   vimperatorLineComment +^\s*".*$+ contains=vimperatorTodo,@Spell

syn keyword vimperatorCommand addo[ns] b[uffer] ba[ck] bd[elete] beep bma[rk] bmarks buffers bun[load] bw[ipeout] delbm[arks]
	\ delm[arks] delqm[arks] dl downl[oads] e[dit] ec[ho] echoe[rr] exe[cute] exu[sage] files fo[rward] fw h[elp] ha[rdcopy]
	\ hist[ory] hs javas[cript] js let ls ma[rk] map mapc[lear] marks mkv[imperatorrc] no[remap] noh[lsearch] norm[al] o[pen]
	\ pa[geinfo] pc[lose] pref[erences] prefs q[uit] qa[ll] qma[rk] qmarks quita[ll] re[load] reloada[ll] res[tart] run
	\ sav[eas] sb[ar] sb[open] sbcl[ose] se[t] sideb[ar] so[urce] st[op] tN[ext] t[open] tab tabN[ext] tabc[lose] tabe[dit]
	\ tabfir[st] tabl[ast] tabm[ove] tabn[ext] tabnew tabo[nly] tabopen tabp[revious] tabr[ewind] tabs time tn[ext]
	\ tp[revious] u[ndo] undoa[ll] unl[et] unm[ap] ve[rsion] viu[sage] w[rite] wc[lose] win[open] winc[lose] wine[dit] wo[pen]
	\ wq wqa[ll] xa[ll] zo[om]
	\ contained

syn match vimperatorCommand "!" contained

" FIXME
syn match vimperatorCommandWrapper "\%(^\|:\|\s\)\@<=\%(!\|\h\w*\>\)" contains=vimperatorCommand

syn region vimperatorSet matchgroup=vimperatorCommand start="\<set\=\>" end="$" keepend oneline contains=vimperatorOption
syn keyword vimperatorOption activate act complete cpt defsearch ds extendedhinttags eht focusedhintstyle fhs fullscreen fs
	\ nofullscreen nofs guioptions go hintchars hc hintstyle hs hinttags ht hlsearch nohlsearch hls nohls hlsearchstyle hlss
	\ incsearch is noincsearch nois ignorecase ic noignorecase noic laststatus ls linksearch nolinksearch lks nolks maxhints
	\ mh more nomore pa pageinfo preload nopreload popups pps previewheight pvh scroll scr showmode smd noshowmode nosmd
	\ showstatuslinks ssli showtabline stal smartcase scs nosmartcase noscs titlestring usermode um nousermode noum verbose
	\ vbs visualbell vb novisualbell novb visualbellstyle visualbellstyle t_vb wildmode wim wildoptions wop
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
