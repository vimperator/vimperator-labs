" Vim syntax file
" Language:	    VIMperator configuration file
" Maintainer:	    Doug Kearns <dougkearns@gmail.com>
" Latest Revision:  2007 November 16

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

syn keyword vimperatorCommand ab[breviate] ab[clear] addo[ns] b[uffer] ba[ck] bd[elete] beep bma[rk] bmarks buffers bun[load]
	\ bw[ipeout] ca[bbrev] cabc[lear] cuna[bbrev] delbm[arks] delm[arks] delqm[arks] dl downl[oads] e[dit] ec[ho] echoe[rr]
	\ exe[cute] exu[sage] files fo[rward] fw h[elp] ha[rdcopy] hist[ory] hs ia[bbrev] iabc[lear] iuna[bbrev] javas[cript] js
	\ let ls ma[rk] map mapc[lear] marks mkv[imperatorrc] no[remap] noh[lsearch] norm[al] o[pen] pa[geinfo] pc[lose]
	\ pref[erences] prefs q[uit] qa[ll] qma[rk] qmarks quita[ll] re[draw] re[load] reloada[ll] res[tart] run sav[eas] sb[ar]
	\ sb[open] sbcl[ose] se[t] sideb[ar] so[urce] st[op] tN[ext] t[open] tab tabN[ext] tabc[lose] tabe[dit] tabfir[st]
	\ tabl[ast] tabm[ove] tabn[ext] tabnew tabo[nly] tabopen tabp[revious] tabr[ewind] tabs time tn[ext] tp[revious] u[ndo]
	\ una[bbreviate] undoa[ll] unl[et] unm[ap] ve[rsion] viu[sage] w[rite] wc[lose] win[open] winc[lose] wine[dit] wo[pen] wq
	\ wqa[ll] xa[ll] zo[om]
	\ contained

syn match vimperatorCommand "!" contained

" FIXME
syn match vimperatorCommandWrapper "\%(^\s*:\=\)\@<=\%(!\|\h\w*\>\)" contains=vimperatorCommand

syn region vimperatorSet matchgroup=vimperatorCommand start="\%(^\s*:\=\)\@<=\<set\=\>" end="$" keepend oneline contains=vimperatorOption
syn keyword vimperatorOption activate act complete cpt defsearch ds editor extendedhinttags eht focusedhintstyle fhs fullscreen fs
	\ nofullscreen nofs guioptions go hintstyle hs hinttags ht hinttimeout hto hlsearch hls nohlsearch nohls hlsearchstyle
	\ hlss nohlsearchstyle nohlss incsearch is noincsearch nois ignorecase ic noignorecase noic insertmode im noinsertmode
	\ noim laststatus ls linksearch lks nolinksearch nolks more nextpattern nomore pageinfo pa popups pps preload nopreload
	\ previewheight pvh previouspattern scroll scr showmode smd noshowmode nosmd showstatuslinks ssli showtabline stal
	\ smartcase scs nosmartcase noscs titlestring usermode um nousermode noum verbose vbs visualbell vb novisualbell novb
	\ wildmode wim wildoptions wop
	\ contained

syn region vimperatorJavascript start="\%(^\s*\%(javascript\|js\)\s\+\)\@<=" end="$" contains=@javascriptTop keepend oneline
syn region vimperatorJavascript matchgroup=vimperatorJavascriptDelimiter
	\ start="\%(^\s*\%(javascript\|js\)\s\+\)\@<=<<\z(\h\w*\)"hs=s+2 end="^\z1$" contains=@javascriptTop fold

syn region vimperatorMap matchgroup=vimperatorCommand start="\%(^\s*:\=\)\@<=\<map\>" end="$" keepend oneline contains=vimperatorKeySym

syn match vimperatorKeySym "<[0-9A-Za-z-]\+>"

" Note: match vim.vim highlighting groups
hi def link vimperatorCommand			Statement
hi def link vimperatorComment			Comment
hi def link vimperatorJavascriptDelimiter	Delimiter
hi def link vimperatorKeySym			Special
hi def link vimperatorLineComment		Comment
hi def link vimperatorOption			PreProc
hi def link vimperatorString			String 
hi def link vimperatorTodo			Todo

let b:current_syntax = "vimperator"

let &cpo = s:cpo_save
unlet s:cpo_save

" vim: tw=130:
