" Vim syntax file
" Language:	    VIMperator configuration file
" Maintainer:	    Doug Kearns <dougkearns@gmail.com>
" Latest Revision:  2007 September 09

if exists("b:current_syntax")
  finish
endif

let s:cpo_save = &cpo
set cpo&vim

syn include @javascriptTop syntax/javascript.vim
unlet b:current_syntax

syn keyword vimperatorTodo    FIXME NOTE TODO XXX contained
syn match   vimperatorComment +".*$+ contains=vimperatorTodo,@Spell

syn keyword vimperatorCommand addo[ns] ba[ck] bd[elete] bw[ipeout] bun[load] tabc[lose] beep bma[dd] bmd[el] bookm[arks] bm
	\ b[uffer] buffers files ls delm[arks] downl[oads] dl ec[ho] echoe[rr] exe[cute] exu[sage] fo[rward] fw ha[rdcopy] h[elp]
	\ hist[ory] hs javas[cript] js mapc[lear] ma[rk] map marks noh[lsearch] no[remap] o[pen] e[dit] pc[lose] pref[erences]
	\ prefs q[uit] quita[ll] qa[ll] re[load] reloada[ll] res[tart] sav[eas] se[t] so[urce] st[op] tab tabl[ast] tabm[ove]
	\ tabn[ext] tn[ext] tabo[nly] tabopen t[open] tabnew tabe[dit] tabp[revious] tp[revious] tabN[ext] tN[ext] tabr[ewind]
	\ tabfir[st] u[ndo] qmarka[dd] qma[dd] qmarkd[el] qmd[el] qmarks qms unm[ap] ve[rsion] viu[sage] win[open] wo[pen]
	\ wine[dit] w[rite] wqa[ll] wq xa[ll] zo[om]
	\ contained

" FIXME
syn match vimperatorCommandWrapper "\<\h\w*\>" contains=vimperatorCommand

syn region vimperatorSet matchgroup=vimperatorCommand start="\<set\=\>" end="$" keepend oneline contains=vimperatorOption
syn keyword vimperatorOption activate act complete cpt defsearch ds extendedhinttags eht focusedhintstyle fhs fullscreen fs
	\ nofullscreen nofs guioptions go hintchars hc hintstyle hs hinttags incsearch is noincsearch nois ignorecase ic
	\ noignorecase noic maxhints mh popups pps preload nopreload previewheight pvh showmode smd noshowmode nosmd showstatuslinks ssli
	\ showtabline stal smartcase scs nosmartcase noscs titlestring usermode um nousermode noum verbose vbs visualbell vb
	\ wildmode wim wildoptions wop
	\ contained

syn region vimperatorJavascript start="\%(^\s*\%(javascript\|js\)\s\+\)\@<=" end="$" contains=@javascriptTop keepend oneline
syn region vimperatorJavascript matchgroup=vimperatorJavascriptDelimiter
	\ start="\%(^\s*\%(javascript\|js\)\s\+\)\@<=<<\z(\h\w*\)"hs=s+2 end="^\z1$" contains=@javascriptTop fold

" Note: match vim.vim highlighting groups
hi def link vimperatorCommand			Statement
hi def link vimperatorTodo			Todo
hi def link vimperatorComment			Comment
hi def link vimperatorJavascriptDelimiter	Delimiter
hi def link vimperatorOption			PreProc

let b:current_syntax = "vimperator"

let &cpo = s:cpo_save
unlet s:cpo_save

" vim: tw=130:
