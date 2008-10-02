" Vim syntax file
" Language:         VIMperator configuration file
" Maintainer:       Doug Kearns <dougkearns@gmail.com>
" Last Change:      2008 Sep 27

if exists("b:current_syntax")
  finish
endif

let s:cpo_save = &cpo
set cpo&vim

syn include @javascriptTop syntax/javascript.vim
unlet b:current_syntax

syn match vimperatorCommandStart "\%(^\s*:\=\)\@<=" nextgroup=vimperatorCommand,vimperatorAutoCmd

syn keyword vimperatorCommand ab[breviate] ab[clear] addo[ns] b[uffer] ba[ck] bd[elete] beep bf[irst] bl[ast] bma[rk] bmarks
    \ bn[ext] bN[ext] bp[revious] br[ewind] buffers bun[load] bw[ipeout] ca[bbrev] cabc[lear] cd chd[ir] cuna[bbrev] cm[ap]
    \ cmapc[lear] cno[remap] comc[lear] com[mand] cu[nmap] delbm[arks] delc[ommand] delmac[ros] delm[arks] delqm[arks] dia[log] dl
    \ downl[oads] e[dit] ec[ho] echoe[rr] echom[sg] em[enu] exe[cute] exu[sage] fini[sh] files fo[rward] fw h[elp] ha[rdcopy]
    \ hist[ory] hs ia[bbrev] iabc[lear] im[ap] imapc[lear] ino[remap] iuna[bbrev] iu[nmap] javas[cript] ju[mps] js let ls macros
    \ ma[rk] map mapc[lear] marks mes[sages] mkv[imperatorrc] no[remap] noh[lsearch] norm[al] o[pen] pa[geinfo] pagest[yle]
    \ pc[lose] pl[ay] pref[erences] prefs pw[d] q[uit] qa[ll] qma[rk] qmarks quita[ll] re[draw] re[load] reloada[ll] res[tart] run
    \ ru[ntime] sav[eas] sb[ar] sb[open] sbcl[ose] scrip[tnames] se[t] setg[lobal] setl[ocal] sideb[ar] so[urce] st[op] tN[ext]
    \ t[open] tab tabde[tach] tabd[uplicate] tabN[ext] tabc[lose] tabe[dit] tabfir[st] tabl[ast] tabm[ove] tabn[ext] tabnew
    \ tabo[nly] tabopen tabp[revious] tabr[ewind] tabs time tn[ext] tp[revious] u[ndo] una[bbreviate] undoa[ll] unl[et] unm[ap]
    \ ve[rsion] vie[wsource] viu[sage] w[rite] wc[lose] win[open] winc[lose] wine[dit] wo[pen] wqa[ll] wq xa[ll] zo[om]
	\ contained

syn match vimperatorCommand "!" contained

syn keyword vimperatorAutoCmd au[tocmd] contained nextgroup=vimperatorAutoEventList skipwhite

syn keyword vimperatorAutoEvent BookmarkAdd DOMLoad LocationChange PageLoadPre PageLoad ShellCmdPost VimperatorEnter
    \ VimperatorLeavePre VimperatorLeave
    \ contained

syn match vimperatorAutoEventList "\(\a\+,\)*\a\+" contained contains=vimperatorAutoEvent

syn region vimperatorSet matchgroup=vimperatorCommand start="\%(^\s*:\=\)\@<=\<\%(setl\%[ocal]\|setg\%[lobal]\|set\=\)\=\>"
    \ end="$" keepend oneline contains=vimperatorOption

syn keyword vimperatorOption activate act activelinkfgcolor alfc activelinkbgcolor albc cdpath cd complete cpt defsearch ds editor
    \ extendedhinttags eht eventignore ei guioptions go helpfile hf hintmatching hm hintstyle hs hinttags ht hinttimeout hto
    \ history hi hlsearchstyle hlss laststatus ls linkbgcolor lbc linkfgcolor lfc messages msgs newtab nextpattern pageinfo pa
    \ popups pps previewheight pvh previouspattern runtimepath rtp scroll scr shell sh shellcmdflag shcf showstatuslinks ssli
    \ showtabline stal suggestengines titlestring urlseparator verbose vbs visualbellstyle t_vb wildignore wig wildmode wim
    \ wildoptions wop wordseparators wsp
    \ contained nextgroup=vimperatorSetMod

" toggle options
syn match vimperatorOption "\<\%(no\|inv\)\=\%(focuscontent\|fc\|fullscreen\|fs\|ignorecase\|ic\|incsearch\|is\)\>!\="
    \ contained nextgroup=vimperatorSetMod
syn match vimperatorOption "\<\%(no\|inv\)\=\%(insertmode\|im\|hlsearch\|hls\|linksearch\|lks\|loadplugins\|lpl\|more\)\>!\="
    \ contained nextgroup=vimperatorSetMod
syn match vimperatorOption "\<\%(no\|inv\)\=\%(online\|preload\|showmode\|smd\|smartcase\|scs\|online \|visualbell\|vb\)\>!\="
    \ contained nextgroup=vimperatorSetMod
syn match vimperatorOption "\<\%(no\|inv\)\=\%(usermode\|um\)\>!\="
    \ contained nextgroup=vimperatorSetMod

syn match vimperatorSetMod "\%(\<[a-z_]\+\)\@<=&" contained

syn region vimperatorJavascript start="\%(^\s*\%(javascript\|js\)\s\+\)\@<=" end="$" contains=@javascriptTop keepend oneline
syn region vimperatorJavascript matchgroup=vimperatorJavascriptDelimiter
	\ start="\%(^\s*\%(javascript\|js\)\s\+\)\@<=<<\s*\z(\h\w*\)"hs=s+2 end="^\z1$" contains=@javascriptTop fold

syn match vimperatorNotation "<[0-9A-Za-z-]\+>"

syn match   vimperatorComment +".*$+ contains=vimperatorTodo,@Spell
syn keyword vimperatorTodo FIXME NOTE TODO XXX contained

syn region vimperatorString start="\z(["']\)" end="\z1" skip="\\\\\|\\\z1" oneline

syn match   vimperatorLineComment +^\s*".*$+ contains=vimperatorTodo,@Spell

" NOTE: match vim.vim highlighting group names
hi def link vimperatorAutoCmd               vimperatorCommand
hi def link vimperatorAutoEvent             Type
hi def link vimperatorCommand			    Statement
hi def link vimperatorComment			    Comment
hi def link vimperatorJavascriptDelimiter	Delimiter
hi def link vimperatorNotation			    Special
hi def link vimperatorLineComment		    Comment
hi def link vimperatorOption			    PreProc
hi def link vimperatorSetMod                vimperatorOption
hi def link vimperatorString			    String
hi def link vimperatorTodo                  Todo

let b:current_syntax = "vimperator"

let &cpo = s:cpo_save
unlet s:cpo_save

" vim: tw=130 et ts=4 sw=4:
