" Vim syntax file
" Language:         VIMperator configuration file
" Maintainer:       Doug Kearns <dougkearns@gmail.com>
" Latest Revision:  2008 August 19

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

syn keyword vimperatorCommand ab[breviate] ab[clear] addo[ns] au[tocmd] b[uffer] ba[ck] bd[elete] beep bma[rk] bmarks buffers
    \ bun[load] bw[ipeout] ca[bbrev] cabc[lear] cd cuna[bbrev] cm[ap] cmapc[lear] cno[remap] comc[lear] com[mand] cu[nmap]
    \ delbm[arks] delc[ommand] delmac[ros] delm[arks] delqm[arks] dia[log] dl downl[oads] e[dit] ec[ho] echoe[rr] em[enu]
    \ exe[cute] exu[sage] files fo[rward] fw h[elp] ha[rdcopy] hist[ory] hs ia[bbrev] iabc[lear] im[ap] imapc[lear] ino[remap]
    \ iuna[bbrev] iu[nmap] javas[cript] ju[mps] js let ls macros ma[rk] map mapc[lear] marks mkv[imperatorrc] no[remap]
    \ noh[lsearch] norm[al] o[pen] pa[geinfo] pagest[yle] pc[lose] pl[ay] pref[erences] prefs pwd q[uit] qa[ll] qma[rk] qmarks
    \ quita[ll] re[draw] re[load] reloada[ll] res[tart] run sav[eas] sb[ar] sb[open] sbcl[ose] se[t] setg[lobal] setl[ocal]
    \ sideb[ar] so[urce] st[op] tN[ext] t[open] tab tabd[uplicate] tabN[ext] tabc[lose] tabe[dit] tabfir[st] tabl[ast] tabm[ove]
    \ tabn[ext] tabnew tabo[nly] tabopen tabp[revious] tabr[ewind] tabs time tn[ext] tp[revious] u[ndo] una[bbreviate] undoa[ll]
    \ unl[et] unm[ap] ve[rsion] vie[wsource] viu[sage] w[rite] wc[lose] win[open] winc[lose] wine[dit] wo[pen] wqa[ll] wq xa[ll]
    \ zo[om]
	\ contained

syn match vimperatorCommand "!" contained

" FIXME
syn match vimperatorCommandWrapper "\%(^\s*:\=\)\@<=\%(!\|\h\w*\>\)" contains=vimperatorCommand

syn region vimperatorSet matchgroup=vimperatorCommand start="\%(^\s*:\=\)\@<=\<set\=\>" end="$" keepend oneline contains=vimperatorOption
syn keyword vimperatorOption activate act activelinkfgcolor alfc activelinkbgcolor albc complete cpt defsearch ds editor
    \ extendedhinttags eht focuscontent fc nofocuscontent nofc fullscreen fs nofullscreen nofs guioptions go hintmatching hm
    \ hintstyle hs hinttags ht hinttimeout hto history hi hlsearch hls nohlsearch nohls hlsearchstyle hlss incsearch is
    \ noincsearch nois ignorecase ic noignorecase noic insertmode im noinsertmode noim laststatus ls linkbgcolor lbc linkfgcolor
    \ lfc linksearch lks nolinksearch nolks more newtab nextpattern nomore pageinfo pa popups pps preload nopreload previewheight
    \ pvh previouspattern online noonline scroll scr shell sh shellcmdflag shcf showmode smd noshowmode nosmd showstatuslinks ssli
    \ showtabline stal smartcase scs nosmartcase noscs suggestengines titlestring usermode um nousermode noum urlseparator verbose
    \ vbs visualbell vb novisualbell novb visualbellstyle wildmode wim wildoptions wop wordseparators wsp
    \ contained

syn region vimperatorJavascript start="\%(^\s*\%(javascript\|js\)\s\+\)\@<=" end="$" contains=@javascriptTop keepend oneline
syn region vimperatorJavascript matchgroup=vimperatorJavascriptDelimiter
	\ start="\%(^\s*\%(javascript\|js\)\s\+\)\@<=<<\z(\h\w*\)"hs=s+2 end="^\z1$" contains=@javascriptTop fold

syn region vimperatorMap matchgroup=vimperatorCommand start="\%(^\s*:\=\)\@<=\<map\>" end="$" keepend oneline contains=vimperatorKeySym

syn match vimperatorKeySym "<[0-9A-Za-z-]\+>"

" Note: match vim.vim highlighting groups
hi def link vimperatorCommand			    Statement
hi def link vimperatorComment			    Comment
hi def link vimperatorJavascriptDelimiter	Delimiter
hi def link vimperatorKeySym			    Special
hi def link vimperatorLineComment		    Comment
hi def link vimperatorOption			    PreProc
hi def link vimperatorString			    String 
hi def link vimperatorTodo                  Todo

let b:current_syntax = "vimperator"

let &cpo = s:cpo_save
unlet s:cpo_save

" vim: tw=130 et ts=4 sw=4:
