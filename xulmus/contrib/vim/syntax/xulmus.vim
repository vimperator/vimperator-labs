" Vim syntax file
" Language:         Xulmus configuration file
" Maintainer:       Doug Kearns <dougkearns@gmail.com>
" Last Change:      2009 Nov 14

" TODO: make this xulmus specific - shared liberator config?

if exists("b:current_syntax")
  finish
endif

let s:cpo_save = &cpo
set cpo&vim

syn include @javascriptTop syntax/javascript.vim
unlet b:current_syntax

syn include @cssTop syntax/css.vim
unlet b:current_syntax

syn match xulmusCommandStart "\%(^\s*:\=\)\@<=" nextgroup=xulmusCommand,xulmusAutoCmd

syn keyword xulmusCommand ab[breviate] ab[clear] addo[ns] bN[ext] b[uffer] ba[ck] bd[elete] beep bf[irst] bl[ast] bma[rk] bmarks
    \ bn[ext] bp[revious] br[ewind] bufd[o] buffers bun[load] bw[ipeout] ca[bbrev] cabc[lear] cd chd[ir] cm[ap] cmapc[lear]
    \ cno[remap] colo[rscheme] com[mand] comc[lear] cu[nmap] cuna[bbrev] delbm[arks] delc[ommand] delm[arks] delmac[ros]
    \ delqm[arks] dels[tyle] dia[log] displayp[ane] dl do[autocmd] doautoa[ll] downl[oads] dp[ane] dpcl[ose] dpope[n] ec[ho]
    \ echoe[rr] echom[sg] em[enu] exe[cute] exta[dd] extd[isable] extde[lete] exte[nable] extens[ions] exto[ptions]
    \ extp[references] exu[sage] f[ilter] files fini[sh] fo[rward] frameo[nly] fw h[elp] helpa[ll] ha[rdcopy] hi[ghlight]
    \ hist[ory] hs ia[bbrev] iabc[lear] im[ap] imapc[lear] ino[remap] iu[nmap] iuna[bbrev] javas[cript] js ju[mps] let load
    \ loadplugins lpl ls ma[rk] macros map mapc[lear] marks mediav[iew] mes[sages] messc[lear] mkv[imperatorrc] mkx[ulmusrc]
    \ nm[ap] nmap[clear] nno[remap] no[remap] noh[lsearch] norm[al] nu[nmap] o[pen] optionu[sage] pa[geinfo] pagest[yle] pas
    \ pl[ay] playern[ext] playerp[lay] playerpa[use] playerpr[ev] players[top] pm[ap] pmap[clear] pno[remap] pref[erences] prefs
    \ pu[nmap] pw[d] q[uit] qa[ll] qma[rk] qmarks queue quita[ll] re[draw] re[load] reloada[ll] res[tart] run runt[ime] sav[eas]
    \ sb[ar] sb[open] sbcl[ose] scrip[tnames] se[t] see[k] setg[lobal] setl[ocal] sideb[ar] sil[ent] sort[view] so[urce] st[op]
    \ stopa[ll] sty[le] tN[ext] t[open] tab tabN[ext] tabc[lose] tabd[o] tabde[tach] tabdu[plicate] tabfir[st] tabl[ast] tabm[ove]
    \ tabn[ext] tabnew tabo[nly] tabopen tabp[revious] tabr[ewind] tabs time tn[ext]
    \ tp[revious] u[ndo] una[bbreviate] undoa[ll] unl[et] unm[ap] verb[ose] ve[rsion] vie[wsource]
    \ viu[sage] vm[ap] vmap[clear] vno[remap] vol[ume] vu[nmap] w[rite] wc[lose] winc[lose] wq wqa[ll] xa[ll] zo[om]
    \ contained

syn match xulmusCommand "!" contained

syn keyword xulmusAutoCmd au[tocmd] contained nextgroup=xulmusAutoEventList skipwhite

syn keyword xulmusAutoEvent BookmarkAdd ColorScheme DOMLoad DownloadPost Fullscreen LocationChange PageLoad PageLoadPre
    \ ShellCmdPost StreamEnd StreamPause StreamStart StreamStop TrackChange TrackChangePre ViewChange ViewChangePre XulmusEnter
    \ XulmusLeave XulmusLeavePre
    \ contained

syn match xulmusAutoEventList "\(\a\+,\)*\a\+" contained contains=xulmusAutoEvent

syn region xulmusSet matchgroup=xulmusCommand start="\%(^\s*:\=\)\@<=\<\%(setl\%[ocal]\|setg\%[lobal]\|set\=\)\=\>"
    \ end="$" keepend oneline contains=xulmusOption,xulmusString

syn keyword xulmusOption activate act autocomplete ac cdpath cd complete cpt defsearch ds editor encoding enc eventignore ei extendedhinttags eht
    \ fileencoding fenc followhints fh guioptions go helpfile hf hintinputs hin hintmatching hm hinttags ht hinttimeout hto
    \ history hi maxitems messages msgs newtab nextpattern pageinfo pa popups pps previouspattern repeat runtimepath
    \ rtp scroll scr shell sh shellcmdflag shcf showstatuslinks ssli status suggestengines titlestring urlseparator
    \ verbose vbs wildmode wim wordseparators wsp
    \ contained nextgroup=xulmusSetMod

" toggle options
syn match xulmusOption "\<\%(no\|inv\)\=\%(errorbells\|eb\|exrc\|ex\|focuscontent\|fc\|fullscreen\|fs\|ignorecase\|ic\)\>!\="
    \ contained nextgroup=xulmusSetMod
syn match xulmusOption "\<\%(no\|inv\)\=\%(incsearch\|is\|insertmode\|im\|hlsearch\|hls\|linksearch\|lks\)\>!\="
    \ contained nextgroup=xulmusSetMod
syn match xulmusOption "\<\%(no\|inv\)\=\%(loadplugins\|lpl\|more\|online\|shuffle\|showmode\|smd\|smartcase\|scs\)\>!\="
    \ contained nextgroup=xulmusSetMod
syn match xulmusOption "\<\%(no\|inv\)\=\%(online\|visualbell\|vb\|usermode\|um\)\>!\="
    \ contained nextgroup=xulmusSetMod

syn match xulmusSetMod "\%(\<[a-z_]\+\)\@<=&" contained

syn region xulmusJavaScript start="\%(^\s*\%(javascript\|js\)\s\+\)\@<=" end="$" contains=@javascriptTop keepend oneline
syn region xulmusJavaScript matchgroup=xulmusJavascriptDelimiter
    \ start="\%(^\s*\%(javascript\|js\)\s\+\)\@<=<<\s*\z(\h\w*\)"hs=s+2 end="^\z1$" contains=@javascriptTop fold

let s:cssRegionStart = '\%(^\s*sty\%[le]!\=\s\+\%(-\%(n\|name\)\%(\s\+\|=\)\S\+\s\+\)\=[^-]\S\+\s\+\)\@<='
execute 'syn region xulmusCss start="' . s:cssRegionStart . '" end="$" contains=@cssTop keepend oneline'
execute 'syn region xulmusCss matchgroup=xulmusCssDelimiter'
    \ 'start="' . s:cssRegionStart . '<<\s*\z(\h\w*\)"hs=s+2 end="^\z1$" contains=@cssTop fold'

syn match xulmusNotation "<[0-9A-Za-z-]\+>"

syn match   xulmusComment +".*$+ contains=xulmusTodo,@Spell
syn keyword xulmusTodo FIXME NOTE TODO XXX contained

syn region xulmusString start="\z(["']\)" end="\z1" skip="\\\\\|\\\z1" oneline

syn match   xulmusLineComment +^\s*".*$+ contains=xulmusTodo,@Spell

" NOTE: match vim.vim highlighting group names
hi def link xulmusAutoCmd               xulmusCommand
hi def link xulmusAutoEvent             Type
hi def link xulmusCommand               Statement
hi def link xulmusComment               Comment
hi def link xulmusJavascriptDelimiter   Delimiter
hi def link xulmusCssDelimiter          Delimiter
hi def link xulmusNotation              Special
hi def link xulmusLineComment           Comment
hi def link xulmusOption                PreProc
hi def link xulmusSetMod                xulmusOption
hi def link xulmusString                String
hi def link xulmusTodo                  Todo

let b:current_syntax = "xulmus"

let &cpo = s:cpo_save
unlet s:cpo_save

" vim: tw=130 et ts=4 sw=4:
