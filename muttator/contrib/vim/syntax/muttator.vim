" Vim syntax file
" Language:         Muttator configuration file
" Maintainer:       Doug Kearns <dougkearns@gmail.com>
" Last Change:      2009 Aug 27

" TODO: make this muttator specific - shared liberator config?

if exists("b:current_syntax")
  finish
endif

let s:cpo_save = &cpo
set cpo&vim

syn include @javascriptTop syntax/javascript.vim
unlet b:current_syntax

syn include @cssTop syntax/css.vim
unlet b:current_syntax

syn match muttatorCommandStart "\%(^\s*:\=\)\@<=" nextgroup=muttatorCommand,muttatorAutoCmd

syn keyword muttatorCommand ab[breviate] ab[clear] addo[ns] addr[essbook] bN[ext] bd[elete] beep bf[irst] bl[ast] bn[ext]
    \ bp[revious] br[ewind] bufd[o] bun[load] bw[ipeout] ca[bbrev] cabc[lear] cd chd[ir] cm[ap] cmapc[lear] cno[remap]
    \ colo[rscheme] com[mand] comc[lear] con[tact] contacts copy[to] cu[nmap] cuna[bbrev] delc[ommand] delm[arks] delmac[ros]
    \ dels[tyle] dia[log] do[autocmd] doautoa[ll] ec[ho] echoe[rr] echom[sg] em[enu] empty[trash] exe[cute] exta[dd] extd[isable]
    \ extde[lete] exte[nable] extens[ions] exto[ptions] extp[references] exu[sage] fini[sh] frameo[nly] get[messages] go[to]
    \ h[elp] helpa[ll] ha[rdcopy] hi[ghlight] ia[bbrev] iabc[lear] im[ap] imapc[lear] ino[remap] iu[nmap] iuna[bbrev] javas[cript]
    \ js let loadplugins lpl m[ail] ma[rk] macros map mapc[lear] marks mes[sages] messc[lear] mkm[uttatorrc] mm[ap] mmapc[lear]
    \ mno[remap] move[to] mu[nmap] nm[ap] nmapc[lear] nno[remap] no[remap] norm[al] nu[nmap] optionu[sage] pa[geinfo] pagest[yle]
    \ pas pl[ay] pref[erences] prefs pw[d] q[uit] re[load] res[tart] run runt[ime] sav[eas] scrip[tnames] se[t] setg[lobal]
    \ setl[ocal] sil[ent] so[urce] st[op] sty[le] tN[ext] t[open] tab tabN[ext] tabc[lose] tabd[o] tabfir[st] tabl[ast] tabn[ext]
    \ tabp[revious] tabr[ewind] time tn[ext] tp[revious]
    \ una[bbreviate] unl[et] unm[ap] verb[ose] ve[rsion] vie[wsource] viu[sage] vm[ap] vmapc[lear] vno[remap] vu[nmap] w[rite] zo[om]
    \ contained

syn match muttatorCommand "!" contained

syn keyword muttatorAutoCmd au[tocmd] contained nextgroup=muttatorAutoEventList skipwhite

syn keyword muttatorAutoEvent FolderLoad PageLoadPre PageLoad ShellCmdPost muttatorEnter muttatorLeavePre muttatorLeave
    \ contained

syn match muttatorAutoEventList "\(\a\+,\)*\a\+" contained contains=muttatorAutoEvent

syn region muttatorSet matchgroup=muttatorCommand start="\%(^\s*:\=\)\@<=\<\%(setl\%[ocal]\|setg\%[lobal]\|set\=\)\=\>"
    \ end="$" keepend oneline contains=muttatorOption,muttatorString

syn keyword muttatorOption archivefolder autocomplete ac cdpath cd complete cpt editor eventignore ei extendedhinttags eht fileencoding fenc
    \ followhints fh guioptions go helpfile hf hintinputs hin hintmatching hm hinttags ht hinttimeout hto history hi
    \ layout maxitems messages msgs nextpattern pageinfo pa previouspattern runtimepath rtp scroll scr shell sh shellcmdflag shcf
    \ showstatuslinks ssli status smtpserver smtp suggestengines titlestring urlseparator verbose vbs
    \ wildmode wim wop wordseparators wsp
    \ contained nextgroup=muttatorSetMod

" toggle options
syn match muttatorOption "\<\%(no\|inv\)\=\%(autoexternal\|errorbells\|eb\|exrc\|ex\|focuscontent\|fc\|fullscreen\|fs\)\>!\="
    \ contained nextgroup=muttatorSetMod
syn match muttatorOption "\<\%(no\|inv\)\=\%(insertmode\|im\|loadplugins\|lpl\|more\|online\|showmode\|smd\|visualbell\|vb\)\>!\="
    \ contained nextgroup=muttatorSetMod
syn match muttatorOption "\<\%(no\|inv\)\=\%(usermode\|um\)\>!\="
    \ contained nextgroup=muttatorSetMod

syn match muttatorSetMod "\%(\<[a-z_]\+\)\@<=&" contained

syn region muttatorJavaScript start="\%(^\s*\%(javascript\|js\)\s\+\)\@<=" end="$" contains=@javascriptTop keepend oneline
syn region muttatorJavaScript matchgroup=muttatorJavascriptDelimiter
    \ start="\%(^\s*\%(javascript\|js\)\s\+\)\@<=<<\s*\z(\h\w*\)"hs=s+2 end="^\z1$" contains=@javascriptTop fold

let s:cssRegionStart = '\%(^\s*sty\%[le]!\=\s\+\%(-\%(n\|name\)\%(\s\+\|=\)\S\+\s\+\)\=[^-]\S\+\s\+\)\@<='
execute 'syn region muttatorCss start="' . s:cssRegionStart . '" end="$" contains=@cssTop keepend oneline'
execute 'syn region muttatorCss matchgroup=muttatorCssDelimiter'
    \ 'start="' . s:cssRegionStart . '<<\s*\z(\h\w*\)"hs=s+2 end="^\z1$" contains=@cssTop fold'

syn match muttatorNotation "<[0-9A-Za-z-]\+>"

syn match   muttatorComment +".*$+ contains=muttatorTodo,@Spell
syn keyword muttatorTodo FIXME NOTE TODO XXX contained

syn region muttatorString start="\z(["']\)" end="\z1" skip="\\\\\|\\\z1" oneline

syn match   muttatorLineComment +^\s*".*$+ contains=muttatorTodo,@Spell

" NOTE: match vim.vim highlighting group names
hi def link muttatorAutoCmd             muttatorCommand
hi def link muttatorAutoEvent           Type
hi def link muttatorCommand             Statement
hi def link muttatorComment             Comment
hi def link muttatorJavascriptDelimiter Delimiter
hi def link muttatorCssDelimiter        Delimiter
hi def link muttatorNotation            Special
hi def link muttatorLineComment         Comment
hi def link muttatorOption              PreProc
hi def link muttatorSetMod              muttatorOption
hi def link muttatorString              String
hi def link muttatorTodo                Todo

let b:current_syntax = "muttator"

let &cpo = s:cpo_save
unlet s:cpo_save

" vim: tw=130 et ts=4 sw=4:
