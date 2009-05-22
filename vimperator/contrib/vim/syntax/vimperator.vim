" Vim syntax file
" Language:         VIMperator configuration file
" Maintainer:       Doug Kearns <dougkearns@gmail.com>
" Last Change:      2009 May 22

if exists("b:current_syntax")
  finish
endif

let s:cpo_save = &cpo
set cpo&vim

syn include @javascriptTop syntax/javascript.vim
unlet b:current_syntax

syn include @cssTop syntax/css.vim
unlet b:current_syntax

syn match vimperatorCommandStart "\%(^\s*:\=\)\@<=" nextgroup=vimperatorCommand,vimperatorAutoCmd

syn keyword vimperatorCommand ab[breviate] ab[clear] addo[ns] bN[ext] b[uffer] ba[ck] bd[elete] beep bf[irst] bl[ast] bma[rk]
    \ bmarks bn[ext] bp[revious] br[ewind] bufd[o] buffers bun[load] bw[ipeout] ca[bbrev] cabc[lear] cd chd[ir] cm[ap] cmapc[lear]
    \ cno[remap] colo[rscheme] com[mand] comc[lear] cu[nmap] cuna[bbrev] delbm[arks] delc[ommand] delm[arks] delmac[ros]
    \ delqm[arks] dels[tyle] dia[log] dl do[autocmd] doautoa[ll] downl[oads] e[dit] ec[ho] echoe[rr] echom[sg] em[enu] exe[cute]
    \ exu[sage] files fini[sh] fo[rward] frameo[nly] fw h[elp] ha[rdcopy] hi[ghlight] hist[ory] hs ia[bbrev] iabc[lear] im[ap]
    \ imapc[lear] ino[remap] iu[nmap] iuna[bbrev] javas[cript] js ju[mps] let loadplugins lpl ls ma[rk] macros map mapc[lear]
    \ marks mes[sages] mkv[imperatorrc] nm[ap] nmapc[lear] nno[remap] no[remap] noh[lsearch] norm[al] nu[nmap] o[pen]
    \ optionu[sage] messc[lear] pa[geinfo] pagest[yle] pas pc[lose] pl[ay] pref[erences] prefs pw[d] q[uit] qa[ll] qma[rk] qmarks
    \ quita[ll] re[draw] re[load] reloada[ll] res[tart] run runt[ime] sav[eas] sb[ar] sb[open] sbcl[ose] scrip[tnames] se[t]
    \ setg[lobal] setl[ocal] sideb[ar] sil[ent] so[urce] st[op] stopa[ll] sty[le] tN[ext] t[open] tab tabN[ext] tabc[lose] tabd[o]
    \ tabd[uplicate] tabde[tach] tabe[dit] tabfir[st] tabl[ast] tabm[ove] tabn[ext] tabnew tabo[nly] tabopen tabp[revious]
    \ tabr[ewind] tabs time tn[ext] tp[revious] u[ndo] una[bbreviate] undoa[ll] unl[et] unm[ap] ve[rsion] vie[wsource] viu[sage]
    \ vm[ap] vmap[clear] vno[remap] vu[nmap] w[rite] wc[lose] win[open] winc[lose] wine[dit] wo[pen] wq wqa[ll] xa[ll] zo[om]
    \ contained

syn match vimperatorCommand "!" contained

syn keyword vimperatorAutoCmd au[tocmd] contained nextgroup=vimperatorAutoEventList skipwhite

syn keyword vimperatorAutoEvent BookmarkAdd DOMLoad LocationChange PageLoadPre PageLoad ShellCmdPost VimperatorEnter
    \ VimperatorLeavePre VimperatorLeave
    \ contained

syn match vimperatorAutoEventList "\(\a\+,\)*\a\+" contained contains=vimperatorAutoEvent

syn region vimperatorSet matchgroup=vimperatorCommand start="\%(^\s*:\=\)\@<=\<\%(setl\%[ocal]\|setg\%[lobal]\|set\=\)\=\>"
    \ end="$" keepend oneline contains=vimperatorOption,vimperatorString

syn keyword vimperatorOption act activate cd cdpath complete cpt defsearch ds editor eht ei enc encoding eventignore
    \ extendedhinttags fenc fileencoding fh followhints go guioptions helpfile hf hi hintinputs hintmatching hinttags hinttimeout
    \ history hm ht hto laststatus ls maxitems messages msgs newtab nextpattern pa pageinfo popups pps previouspattern rtp
    \ runtimepath scr scroll sh shcf shell shellcmdflag showstatuslinks showtabline ssli stal suggestengines titlestring
    \ urlseparator vbs verbose wic wig wildcase wildignore wildmode wildoptions wim wop wordseparators wsp
    \ contained nextgroup=vimperatorSetMod

" toggle options
syn match vimperatorOption "\<\%(no\|inv\)\=\%(errorbells\|eb\|exrc\|ex\|focuscontent\|fc\|fullscreen\|fs\|ignorecase\|ic\)\>!\="
    \ contained nextgroup=vimperatorSetMod
syn match vimperatorOption "\<\%(no\|inv\)\=\%(incsearch\|is\|insertmode\|im\|hlsearch\|hls\|linksearch\|lks\)\>!\="
    \ contained nextgroup=vimperatorSetMod
syn match vimperatorOption "\<\%(no\|inv\)\=\%(loadplugins\|lpl\|more\|online\|showmode\|smd\|smartcase\|scs\)\>!\="
    \ contained nextgroup=vimperatorSetMod
syn match vimperatorOption "\<\%(no\|inv\)\=\%(online\|visualbell\|vb\|usermode\|um\)\>!\="
    \ contained nextgroup=vimperatorSetMod

syn match vimperatorSetMod "\%(\<[a-z_]\+\)\@<=&" contained

syn region vimperatorJavaScript start="\%(^\s*\%(javascript\|js\)\s\+\)\@<=" end="$" contains=@javascriptTop keepend oneline
syn region vimperatorJavaScript matchgroup=vimperatorJavascriptDelimiter
    \ start="\%(^\s*\%(javascript\|js\)\s\+\)\@<=<<\s*\z(\h\w*\)"hs=s+2 end="^\z1$" contains=@javascriptTop fold

let s:cssRegionStart = '\%(^\s*sty\%[le]!\=\s\+\%(-\%(n\|name\)\%(\s\+\|=\)\S\+\s\+\)\=[^-]\S\+\s\+\)\@<='
execute 'syn region vimperatorCss start="' . s:cssRegionStart . '" end="$" contains=@cssTop keepend oneline'
execute 'syn region vimperatorCss matchgroup=vimperatorCssDelimiter'
    \ 'start="' . s:cssRegionStart . '<<\s*\z(\h\w*\)"hs=s+2 end="^\z1$" contains=@cssTop fold'

syn match vimperatorNotation "<[0-9A-Za-z-]\+>"

syn match   vimperatorComment +".*$+ contains=vimperatorTodo,@Spell
syn keyword vimperatorTodo FIXME NOTE TODO XXX contained

syn region vimperatorString start="\z(["']\)" end="\z1" skip="\\\\\|\\\z1" oneline

syn match   vimperatorLineComment +^\s*".*$+ contains=vimperatorTodo,@Spell

" NOTE: match vim.vim highlighting group names
hi def link vimperatorAutoCmd               vimperatorCommand
hi def link vimperatorAutoEvent             Type
hi def link vimperatorCommand               Statement
hi def link vimperatorComment               Comment
hi def link vimperatorJavascriptDelimiter   Delimiter
hi def link vimperatorCssDelimiter          Delimiter
hi def link vimperatorNotation              Special
hi def link vimperatorLineComment           Comment
hi def link vimperatorOption                PreProc
hi def link vimperatorSetMod                vimperatorOption
hi def link vimperatorString                String
hi def link vimperatorTodo                  Todo

let b:current_syntax = "vimperator"

let &cpo = s:cpo_save
unlet s:cpo_save

" vim: tw=130 et ts=4 sw=4:
