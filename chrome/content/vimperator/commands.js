/***** BEGIN LICENSE BLOCK ***** {{{
Version: MPL 1.1/GPL 2.0/LGPL 2.1

The contents of this file are subject to the Mozilla Public License Version
1.1 (the "License"); you may not use this file except in compliance with
the License. You may obtain a copy of the License at
http://www.mozilla.org/MPL/

Software distributed under the License is distributed on an "AS IS" basis,
WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
for the specific language governing rights and limitations under the
License.

(c) 2006-2007: Martin Stubenschrott <stubenschrott@gmx.net>

Alternatively, the contents of this file may be used under the terms of
either the GNU General Public License Version 2 or later (the "GPL"), or
the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
in which case the provisions of the GPL or the LGPL are applicable instead
of those above. If you wish to allow use of your version of this file only
under the terms of either the GPL or the LGPL, and not to allow others to
use your version of this file under the terms of the MPL, indicate your
decision by deleting the provisions above and replace them with the notice
and other provisions required by the GPL or the LGPL. If you do not delete
the provisions above, a recipient may use your version of this file under
the terms of any one of the MPL, the GPL or the LGPL.
}}} ***** END LICENSE BLOCK *****/

const COMMANDS = 0;
const USAGE = 1;
const SHORTHELP = 2;
const HELP = 3;
const FUNCTION = 4;
const COMPLETEFUNC = 5;


/* all built-in :ex-commands of Vimperator
 * format:
 * [
 *     0: [all names of this command],
 *     1: usage,
 *     2: short help
 *     3: helptext
 *     4: function (arguments in this order: args, special, count, modifiers)
 *     5: completefunc
 * ]
 */
var g_commands = [/*{{{*/
    [
        ["addons"],
        ["addons"],
        "Show available Browser Extensions and Themes",
        "You can add/remove/disable browser extensions from this dialog.<br/>Be aware that not all Firefox extensions work, because Vimperator overrides some keybindings and changes Firefox's GUI.",
        function() { openURLsInNewTab("chrome://mozapps/content/extensions/extensions.xul", true); },
        null
    ],
    [
        ["back", "ba"],
        ["{count}ba[ck][!]"],
        "Go back in the browser history",
        "Count is supported, <code>:3back</code> goes back 3 pages in the browser history.<br/>"+
        "The special version <code>:back!</code> goes to the beginning of the browser history.",
        function(args, special, count) { if(special) historyGoToBeginning(); else stepInHistory(count > 0 ? -1 * count : -1); },
        null
    ],
    [
        ["bdelete", "bd", "bwipeout", "bw", "bunload", "bun", "tabclose", "tabc"],
        ["{count}bd[elete][!]"],
        "Delete current buffer (=tab)",
        "Count WILL be supported in future releases, then <code class=command>:2bd</code> removes two tabs and the one the right is selected.<br/>Do <code>:bdelete!</code> to select the tab to the left after removing the current tab.",
        function (args, special, count) { tab_remove (count, special, 0); },
        null
    ],
    [
        ["beep"],
        ["beep"],
        "Play a system beep",
        null,
        beep,
        null
    ],
    [
        ["bmadd"],
        ["bmadd [-tT] [url]"],
        "Add a bookmark",
        "If you don't add a custom title, either the title of the webpage or the URL will be taken as the title.<br/>" +
        "Tags WILL be some mechanism to classify bookmarks. Assume, you tag a url with the tags \"linux\" and \"computer\" you'll be able to search for bookmarks containing these tags.<br/>" +
        "You can omit the optional [url] field, so just do <code>:bmadd</code> to bookmark the currently loaded web page with a default title and without any tags.<br/>" +
        "The following options WILL be interpretted in the future:<br/>" +
        " -t 'custom title'<br/>" +
        " -T comma,separated,tag,list <br/>",
        bmadd,
        null
    ],
    [
        ["bmdel"],
        ["bmdel [-T] {url}"],
        "Delete a bookmark",
        "Deletes <b>all</b> bookmarks which matches the url AND the specified tags. Use <code>&lt;Tab&gt;</code> key on a regular expression to complete the url which you want to delete.<br/>" +
        "The following options WILL be interpretted in the future:<br/>" +
        " -T comma,separated,tag,list <br/>",
        bmdel,
        function(filter) { return get_bookmark_completions(filter); }
    ],
    [
        ["bookmarks", "bm"],
        ["bm[!] [-T] {regexp}"],
        "Show bookmarks",
        "Open the preview window at the bottom of the screen for all bookmarks which match the regexp either in the title or URL.<br/>" +
        "Close this window with <code>:pclose</code> or open entries with double click in the current tab or middle click in a new tab.<br/>" +
        "The following options WILL be interpretted in the future:<br/>" +
        " -T comma,separated,tag,list <br/>",
        bmshow,
        function(filter) { return get_bookmark_completions(filter); }
    ],
    [
        ["buffer", "b"],
        ["b[uffer] {url|index}"],
        "Go to buffer from buffer list",
        "Argument can be either the buffer index or the full URL.",
        buffer_switch,
        function (filter) {return get_buffer_completions(filter);}
    ],
    [
        ["buffers", "files", "ls"],
        ["buffers"],
        "Show a list of all buffers",
        "If the list is already shown, close the preview window.",
        buffer_preview_toggle,
        null
    ],
    [
        ["downloads", "dl"],
        ["downloads"],
        "Show progress of current downloads",
        "Open the original Firefox download dialog in a new tab.",
        "Here, downloads can be paused, canceled and resumed.",
        function() { openURLsInNewTab("chrome://mozapps/content/downloads/downloads.xul", true); },
        null
    ],
    [
        ["echo", "ec"],
        ["ec[ho]"],
        "Display a string at the bottom of the window",
        "Echo all arguments of this command. Useful for showing informational messages.<br/>Multiple lines WILL be seperated by \\n.",
        echo,
        null
    ],
    [
        ["echoerr", "echoe"],
        ["echoe[rr]"],
        "Display an error string at the bottom of the window",
        "Echo all arguments of this command highlighted in red. Useful for showing important messages.<br/>Multiple lines WILL be seperated by \\n.",
        echoerr,
        null
    ],
    [
        ["execute", "exe"],
        ["exe[cute] {expr1} [ ... ]"],
        "Execute the string that results from the evaluation of {expr1} as an Ex command.",
        "<code>:execute &#34;echo test&#34;</code> would show a message with the text &#34;test&#34;.<br/>",
        execute,
        null
    ],
    [
        ["forward", "fw"],
        ["{count}forward[!]"],
        "Go forward in the browser history",
        "Count is supported, <code>:3forward</code> goes forward 3 pages in the browser history.<br/>"+
        "The special version <code>:forward!</code> goes to the end of the browser history.",
        function(args, special, count) { if(special) historyGoToEnd(); else stepInHistory(count > 0 ? count : 1); },
        null
    ],
    [
        ["hardcopy", "ha"],
        ["ha[rdcopy]"],
        "Print current document",
        "NOT FUNCTIONAL YET. Open a GUI dialog where you can select the printer, number of copies, orientation, etc.",
        function() { goDoCommand('cmd_print'); },
        null
    ],
    [
        ["help", "h"],
        ["h[elp] {subject}"],
        "Open the help window",
        "You can jump to the specified {subject} with <code class=command>:help {subject}</code>.",
        help,
        function(filter) { return get_help_completions(filter); }
    ],
    [
        ["history", "hs"],
        ["history {filter}"],
        "Show recently visited URLs",
        "Open the preview window at the bottom of the screen for all history items which match the filter string either in the title or URL.",
        "Close this window with <code>:pclose</code> or open entries with double click in the current tab or middle click in a new tab.",
        hsshow,
        function(filter) { return get_history_completions(filter); }
    ],
    [
        ["javascript", "js"],
        ["javascript {cmd}", "javascript &lt;&lt; {endpattern}<br/>{script}<br/>{endpattern}"],
        "Run any javascript command through eval()",
        "Acts as a javascript interpreter by passing the argument to <code>eval()</code>.<br/>" +
        "<code>:javascript alert('Hello world')</code> would show a dialog box with the text \"Hello world\".<br/>" +
        "<code>:javascript &lt;&lt;EOF</code> would read all the lines until a line starting with 'EOF' is found, and will <code>eval()</code> them.<br/>" +
        "The special version <code>:javascript!</code> will open the javascript console of Firefox.",
        function(args, special) {
            if (special) // open javascript console
                openURLsInNewTab("chrome://global/content/console.xul", true);
            else
                try {
                    eval(args);
                } catch(e) {
                    echoerr(e.name + ": " + e.message);
                }
        },
        null
    ],
    [
        ["mark", "ma"],
        ["ma[rk] {arg}"],
        "Mark current location within the webpage",
        "Not implemented yet",
        set_location_mark,
        null
    ],
    [
        ["marks"],
        ["marks {arg}"],
        "Show all location marks of current webpage",
        "Not implemented yet",
        set_location_mark,
        null
    ],
    [
        ["open", "op", "o", "edit", "e"],
        ["open [url] [| url]"],
        "Open one ore more URLs in the current tab",
        "Multiple URLs can be separated with the | character.<br/>" +
        "Each |-separated token is analayzed and in this order:<br/>"+
        "<ol><li>Opened with the specified search engine if the token looks like a search string and the first word of the token is the name of a search engine (<code class=command>:open wiki linus torvalds</code> will open the wikipedia entry for linux torvalds).</li>"+
        "    <li>Transformed to a relative URL of the current location if it starts with . or .. or ...;<br/>... is special and goes to the moves up the directory hierarchy as far as possible.<br/>"+
        "        <code class=command>:open ...</code> with current location <code>http://www.example.com/dir1/dir2/file.html</code> will open <code>http://www.example.com</code><br/>"+
        "        <code class=command>:open ./foo.html</code> with current location <code>http://www.example.com/dir1/dir2/file.html</code> will open <code>http://www.example.com/dir1/dir2/foo.html</code></li>"+
        "    <li>Opened with the default search engine if the first word is no search engine (<code>:open linus torvalds</code> will open a google search for linux torvalds).</li>"+
        "    <li>Passed directly to Firefox in all other cases (<code class=command>:open www.osnews.com | www.slashdot.org</code> will open OSNews in the current, and Slashdot in a new background tab).</li></ol>"+
        "You WILL be able to use <code class=command>:open [-T \"linux\"] torvalds&lt;Tab&gt;</code> to complete bookmarks with tag \"linux\" and which contain \"torvalds\". Note that -T support is only available for tab completion, not for the actual command.<br/>"+
        "The items which are completed on <code>&lt;Tab&gt;</code> are specified in the <code>'complete'</code> option.<br/>"+
        "Without argument, reloads the current page.<br/>"+
        "Without argument but with !, reloads the current page skipping the cache.",
        function(args, special)
        {
            if(args.length > 0)
                openURLs(args);
            else
            {
                if (special)
                    BrowserReloadSkipCache();
                else
                    BrowserReload();
            }
        },

        function(filter) { return get_url_completions(filter); }
    ],
    [
        ["pclose", "pc"],
        ["pc[lose]"],
        "Close preview window on bottom of screen",
        null,
        function() { preview_window.hidden = true; },
        null
    ],
    [
        ["preferences", "prefs"],
        ["preferences"],
        "Show Browser Preferences",
        "You can change the browser preferences from this dialog.<br/>Be aware that not all Firefox preferences work, because Vimperator overrides some keybindings and changes Firefox's GUI.<br/>"+
        "Works like <code class=command>:set!</code>, but opens the dialog in a new window instead of a new tab. Use this, if you experience problems/crashes when using <code class=command>:set!</code>",
        openPreferences,
        null
    ],
    [
        ["quit", "q"],
        ["q[uit]"],
        "Quit current tab or quit Vimperator if this was the last tab",
        "When quitting Vimperator, the session is not stored.",
        function (args) { tab_remove(1, false, 1); },
        null
    ],
    [
        ["quitall", "quita", "qall", "qa"],
        ["quita[ll]"],
        "Quit Vimperator",
        "Quit Vimperator, no matter how many tabs/windows are open. The session is not stored.",
        function (args) { quit(false); },
        null
    ],
    [
        ["reload", "re"],
        ["re[load]"],
        "Reload current page",
        "Forces reloading of the current page, or of all open pages, if ! is given.",
        function(args, special) { reload(special); },
        null
    ],
    [
        ["restart"],
        ["restart"],
        "Force the browser to restart",
        "Useful when installing extenstions.",
        restart,
        null
    ],
    [
        ["saveas", "sav"],
        ["sav[eas]"],
        "Save current web page to disk",
        "Open the original Firefox \"Save page as...\" dialog in a new tab.<br/>" +
        "There, you can save the current web page to disk with various options.",
        function() { goDoCommand('Browser:SavePage'); },
        null
    ],
    [
        ["set", "se"],
        ["se[t][!]", "se[t] {option}[?]", "se[t] {option}[+-]={value}"],
        "Set an option",
        "Permanently change an option. In contrast to Vim options are stored throughout sessions.<br/>"+
        "Boolean options must be set with <code>:set option</code> and <code>:set nooption</code>.<br/>"+
        "<code>:set</code> without an argument opens <code>about:config</code> in a new tab to change advanced Firefox options.<br/>"+
        "<code>:set!</code> opens the GUI preference panel from Firefox in a new tab.<br/>"+
        "<code>:set option?</code> or <code>:set option</code> shows the current value of the option.<br/>"+
        "<code>:set option+=foo</code> and <code>:set option-=foo</code> WILL add/remove foo from list options.<br/>",
        set,
        function(filter) { return get_settings_completions(filter); }
    ],
    [
        ["source", "so"],
        [":so[urce][!] {file}"],
        "Read Ex commands from {file}",
        "The .vimperatorrc file in your home directory is always sourced at start up.<br/>"+
        "~ is supported as a shortcut for the $HOME directory.<br/>" +
        "If ! is specified, errors are not printed.",
        source,
        function (filter) { return get_file_completions(filter); }
    ],
    [
        ["stop", "st"],
        ["st[op]"],
        "Stop loading",
        "Stop loading current web page.",
        BrowserStop,
        null
    ],
    [
        ["tab"],
        ["tab {cmd}"],
        "Execute {cmd} and tell it to output in a new tab",
        "Works for only commands that support it.<br/>" +
        "Example: <code class=command>:tab help tab</code> opens the help in a new tab.",
        tab,
        null
    ],
    [
        ["tabnext", "tabn", "tn", "tnext"],
        ["tabn[ext]"],
        "Switch to the next tab",
        "Cycles to the first tab, when the last is selected.",
        function(args, special, count) { tab_go(0); },
        null
    ],
    [
        ["tabopen", "t", "to", "topen", "tabnew", "tabedit", "tabe"],
        ["tabopen [url] [| [url]]"],
        "Open one or more URLs in a new tab",
        "Like <code class=command>:open</code> but open URLs in a new tab.<br/>"+
        "If used with !, the 'tabopen' value of the 'activate' setting is negated.",
        function (args, special) { if (args.length > 0) openURLsInNewTab(args, !special); else openURLsInNewTab("about:blank", true); },
        function (filter) { return get_url_completions(filter); }
    ],
    [
        ["tabprevious", "tp", "tprev", "tprevious"],
        ["tabp[revious]"],
        "Switch to the previous tab",
        "Cycles to the last tab, when the first is selected.",
        function(args, count) { tab_go(-1); },
        null
    ],
    [
        ["undo", "u"],
        ["{count}undo"],
        "Undo closing of a tab",
        "If a count is given, don't close the last but the n'th last tab",
        function(args, special, count) { if(count < 1) count = 1; undoCloseTab(count-1); },
        null
    ],
    [
        ["qmarkadd", "qmadd"],
        ["qmarkadd {a-zA-Z0-9} [url]"],
        "Mark a URL with a letter for quick access",
        "Not implemented yet",
        function(args) { set_url_mark("mark", "url"); }, // FIXME
        function(filter) { return [["a", ""], ["b", ""]]; }
    ],
    [
        ["qmarkdel", "qmdel"],
        ["qmarkdel {a-zA-Z0-9}"],
        "Remove a marked URL" +
        "Not implemented yet",
        function(args) { set_url_mark("mark", "url"); }, // FIXME
        function(filter) { return [["a", ""], ["b", ""]]; }
    ],
    [
        ["qmarks", "qms"],
        ["qmarks"],
        "Shows marked URLs",
        "Not implemented yet",
        function(args) { show_url_marks(args); }, // FIXME
        null
    ],
    [
        ["version", "ve"],
        ["ve[rsion]"],
        "Show version information",
        null,
        function () { echo("Vimperator version: " + g_vimperator_version); },
        null
    ],
    [
        ["winopen", "w", "wo", "wopen", "winedit", "wine"],
        ["win[open] [url] [| [url]]"],
        "Open an URL in a new window",
        "Not implemented yet",
        function () { echo("winopen not yet implemented"); },
        null
    ],
    [
        ["xall", "xa", "wqall", "wqa", "wq"],
        ["wqa[ll]", "xa[ll]"],
        "Save the session and quit",
        "Quit Vimperator, no matter how many tabs/windows are open. The session is stored.",
        function (args) { quit(true); },
        null
    ],
    [
        ["zoom", "zo"],
        ["zo[om] {value}"],
        "Set zoom value of the webpage",
        "{value} can be between 25 and 500%. If it is omitted, zoom is reset to 100%.",
        zoom_to,
        null
    ]
];/*}}}*/

/* all built-in normal mode commands of Vimperator
 * format:
 * [
 *     0: [all shortcuts of this command],
 *     1: usage,
 *     2: shorthelp
 *     3: helptext
 *     4: function (arguments in this order: args, special, count)
 * ]
 */
var g_mappings = [/*{{{*/
    [ 
        ["]f"],
        ["]f"],
        "Focus next frame",
        "Flashes the next frame in order with a red color, to quickly show where keyboard focus is.<br/>"+
        "This may not work correctly for frames with lots of CSS code.",
        focusNextFrame
    ],
    [
        ["b"],
        ["b {number}"],
        "Open a prompt to switch buffers",
        "Typing the corresponding number opens switches to this buffer",
        function (args) { bufshow("", true); openVimperatorBar('buffer '); }  
    ],
    [ 
        ["B"],
        ["B"],
        "Toggle the buffer list with all currently opened tabs.",
        null,
        buffer_preview_toggle
    ],
    [ 
        ["d"],
        ["{count}d"],
        "Delete current buffer (=tab)",
        "Count WILL be supported in future releases, then <code class=mapping>2d</code> removes two tabs and the one the right is selected.",
        function(count) { tab_remove(count, false, 0); }
    ],
    [ 
        ["D"],
        ["{count}D"],
        "Delete current buffer (=tab)",
        "Count WILL be supported in future releases, then <code class=mapping>2D</code> removes two tabs and the one the left is selected.",
        function(count) { tab_remove(count, true, 0); }
    ],
    [ 
        ["ge"],
        ["ge {cmd}"],
        "Execute an Ex command",
        "<code>Go Execute</code> works like <code class=command>:execute</code>.<br/>"+
        "This mapping is for debugging purposes, and may be removed in future.",
        function(count) { openVimperatorBar('execute '); }
    ],
    [ 
        ["gh"],
        ["gh"],
        "Go home",
        "Opens the homepage in the current tab.",
        BrowserHome
    ],
    [ 
        ["gH"],
        ["gH"],
        "Go home in a new tab",
        "Opens the homepage in a new tab.",
        function(count) { openURLsInNewTab("", true); BrowserHome(); }
    ],
    [ 
        ["gP"],
        ["gP"],
        "Open (put) an URL based on the current clipboard contents in a new buffer",
        "Works like <code class=mapping>P</code>, but inverts the <code class=setting>'activate'</code> setting.",
        function(count) { openURLsInNewTab(readFromClipboard(), false); }
    ],
    [ 
        ["gt", "<C-n>", "<C-Tab>"],
        ["{count}gt"],
        "Go to next tab",
        "Cycles to the first tab, when the last is selected.<br/>"+
        "Count is supported, <code class=mapping>3gt</code> goes to the third tab.",
        function(count) { tab_go(count > 0 ? count : 0); }
    ],
    [ 
        ["gT", "<C-p>", "<C-S-Tab>"],
        ["{count}gT"],
        "Go to previous tab",
        "Cycles to the last tab, when the first is selected.<br/>"+
        "Count is supported, <code class=mapping>3gt</code> goes to the third tab.",
        function(count) { tab_go(count > 0 ? count :-1); }
    ],
    [ 
        ["o"],
        ["o"],
        "Open one or more URLs in the current tab",
        "See <code class=command>:open</code> for more details",
        function(count) { openVimperatorBar('open '); }
    ],
    [ 
        ["O"],
        ["O"],
        "Open one ore more URLs in the current tab, based on current location",
        "Works like <code class=mapping>o</code>, but preselects current URL in the <code class=command>:open</code> query.",
        function(count) { openVimperatorBar('open ' + getCurrentLocation()); }
    ],
    [ 
        ["p", "<MiddleMouse>"],
        ["p", "<MiddleMouse>"],
        "Open (put) an URL based on the current Clipboard contents in the current buffer",
        "You can also just select some non-URL text, and search for it with the default search engine with <code class=mapping>p</code>",
        function(count) { openURLs(readFromClipboard()); }
    ],
    [ 
        ["P"],
        ["P"],
        "Open (put) an URL based on the current Clipboard contents in a new buffer",
        "Works like <code class=mapping>p</code>, but opens a new tab.<br/>"+
        "Whether the new buffer is activated, depends on the <code class=setting>'activate'</code> setting.",
        function(count) { openURLsInNewTab(readFromClipboard(), true); }
    ],
    [ 
        ["r"],
        ["r"],
        "Forces reloading of the current page.",
        null,
        function(count) { reload(false); }
    ],
    [ 
        ["R"],
        ["R"],
        "Forces reloading of all open pages.",
        null,
        function(count) { reload(true); }
    ],
    [ 
        ["t"],
        ["t"],
        "Open one or more URLs in a new tab",
        "Like <code class=mapping>o</code> but open URLs in a new tab."+
        "See <code class=command>:tabopen</code> for more details",
        function(count) { openVimperatorBar('tabopen '); }
    ],
    [ 
        ["T"],
        ["T"],
        "Open one ore more URLs in a new tab, based on current location",
        "Works like <code class=mapping>t</code>, but preselects current URL in the <code class=command>:tabopen</code> query.",
        function(count) { openVimperatorBar('tabopen ' + getCurrentLocation()); }
    ],
    [ 
        ["u"],
        ["{count}u"],
        "Undo closing of a tab",
        "If a count is given, don't close the last but the n'th last tab",
        function(count) { execute_command(count, 'undo', false, ''); }
    ],
    [ 
        ["y"],
        ["y"],
        "Yank current location to the Clipboard",
        "Under UNIX the location is also put into the selection, which can be pasted with the middle mouse button.",
        yankCurrentLocation
    ],
    [ 
        ["zi", "+"],
        ["zi", "+"],
        "Zoom in current web page by 25%.",
        "Currently no count supported.",
        function(count) { zoom_in(1); }
    ],
    [ 
        ["zI"],
        ["zI"],
        "Zoom in current web page by 100%.",
        "Currently no count supported.",
        function(count) { zoom_in(4); }
    ],
    [ 
        ["zo", "-"],
        ["zo", "-"],
        "Zoom out current web page by 25%.",
        "Currently no count supported.",
        function(count) { zoom_in(-1); }
    ],
    [ 
        ["zO"],
        ["zO"],
        "Zoom out current web page by 100%.",
        "Currently no count supported.",
        function(count) { zoom_in(-4); }
    ],
    [ 
        ["zz"],
        ["{count}zz"],
        "Set zoom value of the webpage",
        "Zoom value can be between 25 and 500%. If it is omitted, zoom is reset to 100%.",
        zoom_to
    ],
    [ 
        ["ZQ"],
        ["ZQ"],
        "Quit Vimperator, no matter how many tabs/windows are open. The session is not stored.",
        "Works like <code class=command>:qall</code>.",
        function(count) { quit(false); }
    ],
    [ 
        ["ZZ"],
        ["ZZ"],
        "Save the session and quit",
        "Quit Vimperator, no matter how many tabs/windows are open. The session is stored.<br/>" +
        "Works like <code class=command>:xall</code>.",
        function(count) { quit(true); }
    ],

    /* scrolling commands */
    [ 
        ["0", "^"],
        ["0", "^"],
        "Scroll to the absolute left of the document",
        "Unlike in vim, <code class=mapping>0</code> and <code class=mapping>^</code> work exactly the same way.",
        function(count) { scrollBufferAbsolute(0, -1); }
    ],
    [ 
        ["$"],
        ["$"],
        "Scroll to the absolute right of the document",
        null,
        function(count) { scrollBufferAbsolute(100, -1); }
    ],
    [ 
        ["gg", "<Home>"],
        ["{count}gg", "{count}<Home>"],
        "Goto the top of the document",
        "Count is supported, <code class=mapping>35gg</code> vertically goes to 35% of the document",
        function(count) { scrollBufferAbsolute(-1, count >  0 ? count : 0); }
    ],
    [ 
        ["G", "<End>"],
        ["{count}G", "{count}<End>"],
        "Goto the end of the document",
        "Count is supported, <code class=mapping>35G</code> vertically goes to 35% of the document",
        function(count) { scrollBufferAbsolute(-1, count >= 0 ? count : 100); }
    ],
    [ 
        ["h", "<Left>"],
        ["{count}h", "{count}<Left>"],
        "Scroll document to the left" +
        "Count is supported: <code class=mapping>10h</code> will move 10 times as much to the left.",
        "If the document cannot scroll more, a beep is emmited (unless <code class=setting>'beep'</code> is turned off).",
        function(count) { scrollBufferRelative(-1, 0); }
    ],
    [ 
        ["j", "<Down>", "<C-e>"],
        ["{count}j", "{count}<Down>", "{count}<C-e>"],
        "Scroll document down",
        "Count is supported: <code class=mapping>10j</code> will move 10 times as much down.<br/>"+
        "If the document cannot scroll more, a beep is emmited (unless <code class=setting>'beep'</code> is turned off).",
        function(count) { scrollBufferRelative(0, 1); }
    ],
    [ 
        ["k", "<Up>", "<C-y>"],
        ["{count}k", "{count}<Up>", "{count}<C-y>"],
        "Scroll document up",
        "Count is supported: <code class=mapping>10k</code> will move 10 times as much up.<br/>"+
        "If the document cannot scroll more, a beep is emmited (unless <code class=setting>'beep'</code> is turned off).",
        function(count) { scrollBufferRelative(0, -1); }
    ],
    [ 
        ["l", "<Right>"],
        ["{count}l", "{count}<Right>"],
        "Scroll document to the right",
        "Count is supported: <code class=mapping>10l</code> will move 10 times as much to the right.<br/>"+
        "If the document cannot scroll more, a beep is emmited (unless <code class=setting>'beep'</code> is turned off).",
        function(count) { scrollBufferRelative(1, 0); }
    ],
    [ 
        ["<C-b>", "<C-u>", "<PageUp>", "<S-Space>"],
        ["<C-b>", "<C-u>", "<PageUp>", "<S-Space>"],
        "Scroll up a full page of the current document. No count support for now.",
        null,
        function(count) { goDoCommand('cmd_scrollPageUp'); }
    ],
    [ 
        ["<C-f>", "<C-d>", "<PageDown>", "<Space>"],
        ["<C-f>", "<C-d>", "<PageDown>", "<Space>"],
        "Scroll down a full page of the current document. No count support for now.",
        null,
        function(count) { goDoCommand('cmd_scrollPageDown'); }
    ],

    /* history manipulation and jumplist */
    [ 
        ["<C-o>"],
        ["{count}<C-o>"],
        "Go to an older position in the jump list",
        "The jump list is just the browser history for now",
        function(count) { stepInHistory(count > 0 ? -1 * count : -1); }
    ],
    [ 
        ["<C-i>"],
        ["{count}<C-i>"],
        "Go to a newer position in the jump list",
        "The jump list is just the browser history for now",
        function(count) { stepInHistory(count > 0 ? count : 1); }
    ],
    [ 
        ["H", "<A-Left>", "<M-Left>"],
        ["{count}H", "{count}<A-Left>", "{count}<M-Left>"],
        "Go back in the browser history",
        "Count is supported, <code class=mapping>3H</code> goes back 3 steps.",
        function(count) { stepInHistory(count > 0 ? -1 * count : -1); }
    ],
    [ 
        ["L", "<A-Right>", "<M-Right>"],
        ["{count}L", "{count}<A-Right>", "{count}<M-Right>"],
        "Go forward in the browser history",
        "Count is supported, <code class=mapping>3L</code> goes forward 3 steps.",
        function(count) { stepInHistory(count > 0 ? count : 1); }
    ],
    [ 
        ["gu", "<BackSpace>"],
        ["{count}gu", "{count}<BackSpace>"],
        "Go up one directory component",
        "Count is supported, <code class=mapping>2gu</code> on <code>http://www.example.com/dir1/dir2/file.htm</code> would open <code>http://www.example.com/dir1/</code>",
        goUp
    ],
    [ 
        ["gU", "<C-BackSpace>"],
        ["gU", "<C-BackSpace>"],
        "Go up one directory component",
        "<code class=mapping>gU</code> on <code>http://www.example.com/dir1/dir2/file.htm</code> opens <code>http://www.example.com/</code>",
        function(count) { openURLs("..."); }
    ],

    /* hint managment */
    [ 
        ["f"],
        ["f"],
        "Start QuickHint mode",
        "In QuickHint mode, every hintable item (according to the <code class=setting>'hinttags'</code> XPath query) is assigned a label.<br/>"+
        "If you then press the keys for a label, it is followed as soon as it can be uniquely identified and this mode is stopped. Or press <code class=mapping>&lt;Esc&gt;</code> to stop this mode.<br/>"+
        "If you write the hint in ALLCAPS, the hint is followed in a background tab.",
        function(count) { hah.enableHahMode(HINT_MODE_QUICK); }
    ],
    [ 
        ["F"],
        ["F"],
        "Start AlwaysHint mode",
        "In AlwaysHint mode, every hintable item (according to the <code class=setting>'hinttags'</code> XPath query) is assigned a label.<br/>"+
        "If you then press the keys for a label, it is followed as soon as it can be uniquely identified. Labels stay active after following a hint in this mode, press <code class=mapping>&lt;Esc&gt;</code> to stop this mode.<br/>"+
        "This hint mode is especially useful for browsing large sites like Forums as hints are automatically regenerated when switching to a new document.<br/>"+
        "Also, most <code style=mapping>Ctrl</code>-prefixed shortcut keys are available in this mode for navigation.",
        function(count) { hah.enableHahMode(HINT_MODE_ALWAYS); }
    ],
    [ 
        [";"],
        [";"],
        "Start ExtendedHint mode",
        "ExtendedHint mode is useful, since in this mode you can yank link locations, or open them in a new window.<br/>"+
        "E.g., if you want to yank the location of hint <code>AB</code>, press <code class=mapping>;</code> to start this hint mode.<br/>"+
        "Then press <code>AB</code> to select the hint. Now press <code class=mapping>y</code> to yank its location.<br/>"+
        "Actions for selected hints in ExtendedHint mode are:<br/>"+
        "<ul><li><code class=mapping>y</code> to yank its location</li>"+
        "    <li><code class=mapping>Y</code> to yank its text description</li>"+
        "    <li><code class=mapping>o</code> to open its location in the current tab</li>"+
        "    <li><code class=mapping>t</code> to open its location in a new tab</li>"+
        "    <li><code class=mapping>O</code> to open its location in an <code class=command>:open</code> query (not implemented yet)</li>"+
        "    <li><code class=mapping>T</code> to open its location in an <code class=command>:tabopen</code> query (not implemented yet)</li>"+
        "    <li><code class=mapping>s</code> to save its destination (not implemented yet)</li>"+
        "    <li><code class=mapping>&lt;C-w&gt;</code> to open its destination in a new window</li>"+
        "</ul>"+
        "Multiple hints can be seperated by commas where it makes sense. <code class=mapping>;ab,ac,adt</code> opens <code>AB</code>, <code>AC</code> and <code>AD</code> in a new tab.<br/>"+
        "Hintable elements for this mode can be set in the <code class=setting>'extendedhinttags'</code> XPath string.",
        function(count) { hah.enableHahMode(HINT_MODE_EXTENDED); }
    ],

    /* search managment */
    [ 
        ["n"],
        ["n"],
        "Find next",
        "Repeat the last \"/\" 1 time (until count is supported).",
        // don't use a closure for this, is just DoesNotWork (TM)
        function(count) { gFindBar.onFindAgainCmd(); } // this does not work, why?: goDoCommand('cmd_findAgain'); }
    ],
    [ 
        ["N"],
        ["N"],
        "Find previous",
        "Repeat the last \"/\" 1 time (until count is supported) in the opposite direction.",
        // don't use a closure for this, is just DoesNotWork (TM)
        function(count) { gFindBar.onFindPreviousCmd(); } // this does not work, why?: goDoCommand('cmd_findPrevious'); }
    ],

    /* vimperator managment */
    [ 
        ["<F1>"],
        ["<F1>"],
        "Open help window",
        "The default section is shown, if you need help for a specific topic, try <code class=command>:help &lt;F1&gt;</code> (jumping to a specific section not implemented yet).",
        function(count) { help(null); }
    ],
    [ 
        [":"],
        [":"],
        "Start command line mode",
        "In command line mode, you can perform extended commands, which may require arguments.",
        function(count) { openVimperatorBar(null); }
    ],
    [ 
        ["I"],
        ["I"],
        "Disable vimperator keys",
        "Starts an 'ignorekeys' mode, where all keys except <code class=mapping>&lt;Esc&gt;</code> are passed to the next event handler.<br/>"+
        "This is especially useful, if JavaScript controlled forms like the RichEdit form fields of GMail don't work anymore.<br/>" +
        "To exit this mode, press <code class=mapping>&lt;Esc&gt;</code>. If you also need to pass <code class=mapping>&lt;Esc&gt;</code>"+
        "in this mode to the webpage, prepend it with <code class=mapping>&lt;C-v&gt;</code>.",
        function(count) { addMode(MODE_ESCAPE_ALL_KEYS);}
    ],
    [ 
        ["<C-v>"], // if you ever add/remove keys here, also check them in the onVimperatorKeypress() function
        ["<C-v>"],
        "Escape next key",
        "If you need to pass a certain key to a javascript form field or another extension prefix the key with <code class=mapping>&lt;C-v&gt;</code>.<br/>"+
        "Also works to unshadow Firefox shortcuts like <code class=mapping>&lt;C-o&gt;</code> which are otherwise hidden in Vimperator.<br/>"+
        "When in 'ignorekeys' mode (activated by <code class=mapping>&lt;I&gt;</code>), <code class=mapping>&lt;C-v&gt;</code> will pass the next key to Vimperator instead of the webpage.",
        function(count) { addMode(MODE_ESCAPE_ONE_KEY); }
    ],
    [ 
        ["<C-c>"],
        ["<C-c>"],
        "Stop loading",
        "Stops loading the current webpage.",
        BrowserStop,
    ],
    [ 
        ["<Esc>", "<C-[>"], // if you ever add/remove keys here, also check them in the onVimperatorKeypress() function
        ["<Esc>", "<C-[>"],
        "Cancel any operation",
        "Exits any command line or hint mode and returns to browser mode.<br/>"+
        "Also focuses the web page, in case a form field has focus and eats our key presses.",
        onEscape
    ],

    /* quick bookmark access - will be customizable in future*/
    [ 
        ["'b"],
        ["'b"],
        "These quick bookmarks will be customizable in future releases, ignore for now",
        null,
        function(count) { openURLs('www.bwin.com'); }
    ],
    [ 
        ["'o"],
        ["'o"],
        "These quick bookmarks will be customizable in future releases, ignore for now",
        null,
        function(count) { openURLs('www.osnews.com'); }
    ],
    [ 
        ["'s"],
        ["'s"],
        "These quick bookmarks will be customizable in future releases, ignore for now<br/>",
        null,
        function(count) { openURLs('www.derstandard.at'); }
    ],
    [ 
        ["'w"],
        ["'w"],
        "These quick bookmarks will be customizable in future releases, ignore for now<br/>",
        null,
        function(count) { openURLs('wetter.orf.at'); }
    ],
    [ 
        ["'t"],
        ["'t"],
        "These quick bookmarks will be customizable in future releases, ignore for now<br/>",
        null,
        function(count) { openURLs('www.tvinfo.de'); }
    ],
    [ 
        ["\"b"],
        ["\"b"],
        "These quick bookmarks will be customizable in future releases, ignore for now<br/>",
        null,
        function(count) { openURLsInNewTab('www.bwin.com'); }
    ],
    [ 
        ["\"o"],
        ["\"o"],
        "These quick bookmarks will be customizable in future releases, ignore for now<br/>",
        null,
        function(count) { openURLsInNewTab('www.osnews.com'); }
    ],
    [ 
        ["\"s"],
        ["\"s"],
        "These quick bookmarks will be customizable in future releases, ignore for now<br/>",
        null,
        function(count) { openURLsInNewTab('www.derstandard.at'); }
    ],
    [ 
        ["\"w"],
        ["\"w"],
        "These quick bookmarks will be customizable in future releases, ignore for now<br/>",
        null,
        function(count) { openURLsInNewTab('wetter.orf.at'); }
    ],
    [ 
        ["\"t"],
        ["\"t"],
        "These quick bookmarks will be customizable in future releases, ignore for now<br/>",
        null,
        function(count) { openURLsInNewTab('www.tvinfo.de'); }
    ]
];/*}}}*/

var g_insert_mappings = [ /*{{{*/
    ["xxx", "todo"],
    ["<C-w>", "delete word"],
    ["<C-u>", "delete beginning"],
    ["<C-a>", "go beginning"],
    ["<C-e>", "go end"],
    ["<C-c>", "cancel"]
]; /*}}}*/

/* [command, action, cancel_hint_mode, always_active] */
var g_hint_mappings = [ /*{{{*/
    /* hint action keys */
    ["o",          "hah.openHints(false, false);", true, false],
    ["t",          "hah.openHints(true,  false);", true, false],
    ["<C-w>",      "hah.openHints(false, true );", true, false],
    ["s",          "echoerr('Saving of links not yet implemented');", true, false],
    ["y",          "hah.yankUrlHints();", true, false],
    ["Y",          "hah.yankTextHints();", true, false],
    [",",          "g_inputbuffer+=','; hah.setCurrentState(0);", false, true],
    [":",          "openVimperatorBar(null);", false, true],
    /* movement keys */
    ["<C-e>",      "scrollBufferRelative(0, 1);",        false, true],
    ["<C-y>",      "scrollBufferRelative(0, -1);",       false, true],
    ["<Home>",     "scrollBufferAbsolute(-1, 0);",       false, true],
    ["<End>",      "scrollBufferAbsolute(-1, 100);",     false, true],
    ["<C-b>",      "goDoCommand('cmd_scrollPageUp');",   false, true],
    ["<PageUp>",   "goDoCommand('cmd_scrollPageUp');",   false, true],
    ["<C-f>",      "goDoCommand('cmd_scrollPageDown');", false, true],
    ["<PageDown>", "goDoCommand('cmd_scrollPageDown');", false, true],
    ["<Left>",     "scrollBufferRelative(-1, 0);",       false, true],
    ["<Down>",     "scrollBufferRelative(0, 1);",        false, true],
    ["<Up>",       "scrollBufferRelative(0, -1);",       false, true],
    ["<Right>",    "scrollBufferRelative(1, 0);",        false, true],
    /* tab managment */
    ["<C-n>",      "tab_go(0)",                          true,  true], // same as gt, but no count supported
    ["<C-p>",      "tab_go(-1)",                         true,  true],
    /* navigation */
    ["<C-o>",      "stepInHistory(g_count > 0 ? -1 * g_count : -1);", false, true],
    ["<C-i>",      "stepInHistory(g_count > 0 ? g_count : 1);",       false, true],
    ["<C-h>",      "stepInHistory(g_count > 0 ? -1 * g_count : -1);", false, true],
    ["<C-l>",      "stepInHistory(g_count > 0 ? g_count : 1);",       false, true],
    ["<C-d>",      "tab_remove(g_count, false, 0);",                  true,  true],
    /* cancel hint mode keys */
    ["<C-c>",      "", true, true],
    ["<C-g>",      "", true, true],
    ["<C-[>",      "", true, true],
    ["<Esc>",      "", true, true]
]; /*}}}*/

var g_searchengines = [ /*{{{*/
    ["google",    "http://www.google.com/search?num=100&q=%s"],
    ["lucky",     "http://www.google.com/search?num=100&q=%s&btnI=I'm%20Feeling%20Lucky"],
    ["chefkoch",  "http://www.chefkoch.de/rezept-suche.php?Suchbegriff=%s"],
    ["dewiki",    "http://de.wikipedia.org/wiki/%s"],
    ["discogs",   "http://www.discogs.com/search?type=all&q=%s&btn=Search"],
    ["geizhals",  "http://geizhals.at/?fs=%s"],
    ["imdb",      "http://www.imdb.com/find?s=all&q=%s"],
    ["leo",       "http://dict.leo.org/ende?search=%s"],
    ["wien",      "http://members.aon.at/flole/vienna.html?UserQuery=%s&amp;ResUser=1024&amp;WidthUser=2000"],
    ["wiki",      "http://en.wikipedia.org/wiki/Special:Search?search=%s&go=Go"],
    ["vim",       "http://www.google.com/custom?q=%s&sa=Google+Search&cof=LW%3A125%3BL%3Ahttp%3A%2F%2Fvim.sf.net%2Fimages%2Fvim.gif%3BLH%3A60%3BAH%3Acenter%3BGL%3A0%3BS%3Ahttp%3A%2F%2Fwww.vim.org%3BAWFID%3A057fa53529d52655%3B&domains=vim.sourceforge.net%3Bwww.vim.org%3Bvimdoc.sourceforge.net&sitesearch=vim.sourceforge.net"]
];/*}}}*/

var g_modemessages = {};
g_modemessages[MODE_NORMAL | MODE_ESCAPE_ALL_KEYS] = "ESCAPE ALL KEYS";
g_modemessages[MODE_NORMAL | MODE_ESCAPE_ONE_KEY] = "ESCAPE ONE KEY";
g_modemessages[MODE_NORMAL | MODE_ESCAPE_ALL_KEYS | MODE_ESCAPE_ONE_KEY] = "PASS ONE KEY";
g_modemessages[HINT_MODE_QUICK] = "QUICK HINT";
g_modemessages[HINT_MODE_ALWAYS] = "ALWAYS HINT";
g_modemessages[HINT_MODE_EXTENDED] = "EXTENDED HINT";
g_modemessages[MODE_NORMAL] = false;
g_modemessages[MODE_INSERT] = "INSERT";
g_modemessages[MODE_VISUAL] = "VISUAL";

// returns null, if the cmd cannot be found in our g_commands array, or
// otherwise a refernce to our command
function get_command(cmd) // {{{
{
    commands = [];
    var added;
    for (var i = 0; i < g_commands.length; i++, added = false)
    {
        for (var j = 0; j < g_commands[i][COMMANDS].length; j++)
        {
            if (g_commands[i][COMMANDS][j] == cmd)
            {
                return g_commands[i]; //exact command, returning it
            }
            if (g_commands[i][COMMANDS][j].indexOf(cmd) == 0)
            {
                if (!added)
                {
                    commands.push(g_commands[i]);
                    added = true;
                }
            }
        }
    }
    if (commands.length == 1)
        return commands[0];
    return null;
} // }}}

function execute_command(count, cmd, special, args, modifiers) // {{{
{
    if (!cmd) return;
    if (!modifiers) modifiers = {};
    var command = get_command(cmd);
    if (command === null)
    {
        echoerr("E492: Not an editor command: " + cmd);
        focusContent(false, false);
        return;
    }
        
    if (command[FUNCTION] === null)
    {
        echoerr("E666: Internal error: command[FUNCTION] === null");
        return;
    }

    // valid command, call it:
    command[FUNCTION].call(this, args, special, count, modifiers);

} // }}}

function tokenize_ex(string, tag)
{
    // removing comments
    string.replace(/\s*".*$/, '');
    if (tag)
    {
        if (string == tag)
            return [null, null, null, null, false];
        else
            return [null, null, null, string, tag];
    }

    // 0 - count, 1 - cmd, 2 - special, 3 - args, 4 - heredoc tag
    var matches = string.match(/^:*(\d+)?([a-zA-Z]+)(!)?(?:\s+(.*?))?$/);
    if (!matches) return [null, null, null, null, null];
    matches.shift();

    if (matches[0])
    {
        matches[0] = parseInt(matches[0]);
        if (isNaN(matches[0])) matches[0] = 0;
    }
    else matches[0] = 0;
    matches[2] = !!matches[2];
    matches.push(null);
    if (matches[3])
    {
        tag = matches[3].match(/<<\s*(\w+)/);
        if (tag && tag[1])
            matches[4] = tag[1];
    }
    else matches[3] = '';

    return matches;
}

function multiliner(line, prev_match, heredoc)
{
    var end = true;
    var match = tokenize_ex(line, prev_match[4]);
    if (prev_match[3] === undefined) prev_match[3] = '';
    if (match[4] === null)
    {
        focusContent(false, true); // also sets comp_tab_index to -1
        execute_command.apply(this, match);
    }
    else
    {
        if (match[4] === false)
        {
            prev_match[3] = prev_match[3].replace(new RegExp('<<\s*' + prev_match[4]), heredoc.replace(/\n$/, ''));
            focusContent(false, true); // also sets comp_tab_index to -1
            execute_command.apply(this, prev_match);
            prev_match = new Array(5);
            prev_match[3] = '';
            heredoc = '';
        }
        else
        {
            end = false;
            if (!prev_match[3])
            {
                prev_match[0] = match[0];
                prev_match[1] = match[1];
                prev_match[2] = match[2];
                prev_match[3] = match[3];
                prev_match[4] = match[4];
            }
            else
            {
                heredoc += match[3] + '\n';
            }
        }
    }
    return [prev_match, heredoc, end];
}

function execute(string)
{
    if (!string)
        return;

    var tokens = tokenize_ex(string.replace(/^'(.*)'$/, '$1'));
    tokens[4] = arguments[3];

    return execute_command.apply(this, tokens);
}
////////////////////////////////////////////////////////////////////////
// statusbar/commandbar handling ////////////////////////////////// {{{1
////////////////////////////////////////////////////////////////////////
function echo(msg)
{
    /* In Mozilla, the XUL textbox is implemented as a wrapper around an HTML
     * input element. The read only property '.inputField' holds a reference to this inner
     * input element. */
    var bar = command_line.inputField;
    var focused = document.commandDispatcher.focusedElement;
    if (focused && focused == bar)
        return;

    bar.setAttribute("style","font-family: monospace;");
    bar.value = msg;
}

function echoerr(msg)
{
    /* In Mozilla, the XUL textbox is implemented as a wrapper around an HTML
     * input element. The read only property '.inputField' holds a reference to this inner
     * input element. */
    var bar = command_line.inputField;
    var focused = document.commandDispatcher.focusedElement;
    if (focused && focused == bar)
        return;

    bar.setAttribute("style", "font-family: monospace; color:white; background-color:red; font-weight: bold");
    bar.value = msg;
}

////////////////////////////////////////////////////////////////////////
// navigation functions /////////////////////////////////////////// {{{1
////////////////////////////////////////////////////////////////////////
function stepInHistory(steps)
{
    var index = getWebNavigation().sessionHistory.index + steps;
    if (index >= 0 && index < getWebNavigation().sessionHistory.count)
    {
        getWebNavigation().gotoIndex(index);
    }
    else
    {
        beep();
        if(index<0)
            echo("Cannot go past beginning of history");
        else
            echo("Cannot go past end of history");
    }
}
function historyGoToBeginning()
{
    var index = getWebNavigation().sessionHistory.index;
    if (index == 0)
    {
            echo("Already at beginning of history");
            return;
    }
    getWebNavigation().gotoIndex(0);
}
function historyGoToEnd()
{
    var index = getWebNavigation().sessionHistory.index;
    var max = getWebNavigation().sessionHistory.count -1;
    if (index == max)
    {
            echo("Already at end of history");
            return;
    }
    getWebNavigation().gotoIndex(max);
}



////////////////////////////////////////////////////////////////////////
// url functions ////////////////////////////////////////////////// {{{1
////////////////////////////////////////////////////////////////////////
function openURLs(str)
{
    urls = stringToURLs(str);
    if (urls.length == 0)
        return false;

    getWebNavigation().loadURI(urls[0], nsIWebNavigation.LOAD_FLAGS_NONE, null, null, null);
    for (var url=1; url < urls.length; url++)
        gBrowser.addTab(urls[url]);

    return true;
}

function openURLsInNewTab(str, activate)
{
    urls = stringToURLs(str);
    if (urls.length == 0)
        return null;

    var firsttab = getBrowser().addTab(urls[0]);
    if (activate)
        getBrowser().selectedTab = firsttab;
    for (url=1; url < urls.length; url++)
        gBrowser.addTab(urls[url]);

    return firsttab;
}

/* takes a string like 'google bla| www.osnews.com'
 * and returns an array ['www.google.com/search?q=bla', 'www.osnews.com']
 */
function stringToURLs(str)
{
    var urls = str.split(/\s*\|\s*/);
    begin: for(var url=0; url < urls.length; url++)
    {
        for(var i=0; i < g_searchengines.length; i++)
        {
            var regex = new RegExp("^" + g_searchengines[i][0] + "\\s+" + "(.+)");
            matches = urls[url].match(regex);
            if(matches != null)
            {
                urls[url] = g_searchengines[i][1].replace(/%s/, encodeURIComponent(matches[1]));
                break begin;
            }
        }

        // check for ./ and ../ (or even .../) to go to a file in the upper directory
        if (urls[url].match(/^(\.$|\.\/\S*)/))
        {
            var newLocation = getCurrentLocation();
            newLocation = newLocation.replace(/([\s\S]+\/)[^\/]*/, "$1");
            if(urls[url].match(/^\.(\/\S+)/))
                newLocation += urls[url].replace(/^\.(\/\S+)/, "$1");

            urls[url] = newLocation;
        }
        else if (urls[url].match(/^(\.\.$|\.\.\/[\S]*)/))
        {
            var newLocation = getCurrentLocation();
            newLocation = newLocation.replace(/([\s\S]+\/)[^\/]*/, "$1/../");
            if(urls[url].match(/^\.\.(\/\S+)/))
                newLocation += urls[url].replace(/^\.\.\/(\S+)/, "$1");

            urls[url] = newLocation;
        }
        else if (urls[url].match(/^(\.\.\.$|\.\.\.\/[\S]*)/))
        {
            var newLocation = getCurrentLocation();
            newLocation = newLocation.replace(/([\s\S]+):\/\/\/?(\S+?)\/\S*/, "$1://$2/");
            if(urls[url].match(/^\.\.\.(\/\S+)/))
                newLocation += urls[url].replace(/^\.\.\.\/(\S+)/, "$1");

            urls[url] = newLocation;
        }

        /* if the string contains a space or does not contain any of: .:/
         * open it with default searchengine */
        if (urls[url].match(/\s+/) || urls[url].match(/\.|:|\//) == null)
            urls[url] = g_searchengines[0][1].replace(/%s/, encodeURIComponent(urls[url]));
    }
    return urls;
}

/* returns true if the currently loaded URI is 
 * a directory or false if it is a file
 * if passed 'url' is null, use current directory
 */
function isDirectory(url)
{
    if (url.match(/^file:\/\//) || url.match(/^\//))
    {
        var stripedFilename = url.replace(/^(file:\/\/)?(.*)/, "$2");
        var file = fopen(stripedFilename, '<');
        if (!file)
            return false;

        if (file.localFile.isDirectory())
            return true;
        else
            return false;
    }
    // for all other locations just check if the URL ends with /
    if (url.match(/\/$/))
        return true;
    else
        return false;
}
////////////////////////////////////////////////////////////////////////
// frame related functions //////////////////////////////////////// {{{1
////////////////////////////////////////////////////////////////////////

// function stolen from Conkeror
function focusNextFrame()
{
    try {
        var frames = window.content.frames;
        if (frames.length == 0)
        {
            echo("No frames found");
            beep();
            return;
        }
    
        var w = document.commandDispatcher.focusedWindow;
        var next = 0;
    
        // Find the next frame to focus
        for (var i=0; i<frames.length; i++) {
            if (w == frames[i]) {
                next = i+1;
                break;
            }
        }
        // Focus the next one, 0 if we're at the last one
        if (next >= frames.length)
            next = 0;
        frames[next].focus();
        var oldbg = frames[next].document.bgColor;
        var oldstyle = frames[next].document.body.getAttribute("style");
        frames[next].document.bgColor = "red";
        frames[next].document.body.setAttribute("style", "background-color: #FF0000;");
    
        setTimeout(function(doc, bgcolor, style) {
            doc.bgColor = bgcolor;
            if (oldstyle == null)
                doc.body.removeAttribute("style");
            else
                doc.body.setAttribute("style", style);
        }, 150, frames[next].document, oldbg, oldstyle);

    } catch(e) {alert(e);}
}



////////////////////////////////////////////////////////////////////////
// location handling ////////////////////////////////////////////// {{{1
////////////////////////////////////////////////////////////////////////
function getCurrentLocation()
{
    return content.document.location.href;
}

function goUp(count)
{
    var gocmd = "";
    if (isDirectory(getCurrentLocation()))
        gocmd = "../";
    else
        gocmd = "./";

    if (count < 1)
        count = 1;

    for(var i=0; i<count-1; i--)
        gocmd += "../";

    openURLs(gocmd);
}

function yankCurrentLocation()
{
    var loc = getCurrentLocation();
    copyToClipboard(loc);
    echo("Yanked " + loc);
}

// return null, if no link with a href focused
function getCurrentLinkLocation()
{
    var ww = Components.classes["@mozilla.org/embedcomp/window-watcher;1"]
        .getService(Components.interfaces.nsIWindowWatcher);
    if (window == ww.activeWindow && document.commandDispatcher.focusedElement)
    {
        var url = document.commandDispatcher.focusedElement.href;
        if (url)
            return url;
    }
    return null;
}

////////////////////////////////////////////////////////////////////////
// high level bookmark/history related functions ////////////////// {{{1
////////////////////////////////////////////////////////////////////////
// takes: -t "foo" -T "tag1,tag2", myurl
// converts that string to a useful url and title, and calls addBookmark
function bmadd(str)
{
    var res = new Object();
    if (parseBookmarkString(str, res))
    {
        if(res.url == null)
            res.url = getCurrentLocation();
        if(res.title == null) // XXX: maybe use current title of webpage
            res.title = res.url;

        addBookmark(res.title, res.url);
        echo("Bookmark `" + res.url + "' added");
    }
    else
        echo("Usage: :bmadd [-t \"My Title\"] [-T tag1,tag2] <url>");
}

function bmdel(str)
{
    var res = new Object();
    if (parseBookmarkString(str, res))
    {
        if(res.url == null)
            res.url = getCurrentLocation();

        var del = deleteBookmark(res.url);
        echo(del + " bookmark(s) with url `" + res.url + "' deleted");
    }
    else
        echo("Usage: :bmdel <url>");
}

function bmshow(filter, fullmode)
{
    if (fullmode)
        openURLsInNewTab("chrome://browser/content/bookmarks/bookmarksPanel.xul", true);
    else
    {
        var items = get_bookmark_completions(filter);
        preview_window_fill(items);
        preview_window_show();
    }
}
function hsshow(filter, fullmode)
{
    if (fullmode)
        openURLsInNewTab("chrome://browser/content/history/history-panel.xul", true);
    else
    {
        var items = get_history_completions(filter);
        preview_window_fill(items);
        preview_window_show();
    }
}


////////////////////////////////////////////////////////////////////////
// url marks functions //////////////////////////////////////////// {{{1
////////////////////////////////////////////////////////////////////////
/* vimperator has a concept of URL marks
 * these provide quick access to URLs with a single character
 *
 * mark urls with e.g. Ma and you can go there with 'a or open a 
 * new tab with the url with "a
 * valid characters for url marks are [a-zA-Z0-9]
 */
function set_url_mark(mark, url)
{

}

function get_url_mark(mark)
{

}

function del_url_mark(mark)
{

}

function show_url_marks(mark)
{

}

////////////////////////////////////////////////////////////////////////
// location marks functions /////////////////////////////////////// {{{1
////////////////////////////////////////////////////////////////////////
/* vimperator has a concept of location marks
 * these provide quick access to a location within a webpage
 */
function set_location_mark(mark)
{

}

function show_location_marks(mark)
{

}

////////////////////////////////////////////////////////////////////////
// tab/buffer related functions /////////////////////////////////// {{{1
////////////////////////////////////////////////////////////////////////
function tab()
{
    execute(arguments[0], null, null, {inTab: true});
}

/* if index = 0, advance on tab
 * if index < 0, go one tab to the left
 * otherwise, jump directly to tab <index>
 */
function tab_go(index)
{
    if (index < 0)
        getBrowser().mTabContainer.advanceSelectedTab(-1, true);
    else if (index == 0)
        getBrowser().mTabContainer.advanceSelectedTab(1, true);
    else
    {
        if (getBrowser().mTabContainer.childNodes.length < index)
            beep();
        else
            getBrowser().mTabContainer.selectedIndex = index-1;
    }

    updateStatusbar();
}

/* quit_on_last_tab = 1: quit without saving session
   quit_on_last_tab = 2: quit and save session
 */
function tab_remove(count, focus_left_tab, quit_on_last_tab)
{
    if (count < 1) count = 1;

    if (quit_on_last_tab >= 1 && getBrowser().mTabContainer.childNodes.length <= count)
        quit(quit_on_last_tab == 2);

    var tab = getBrowser().mCurrentTab;
    if(focus_left_tab && tab.previousSibling)
        gBrowser.mTabContainer.selectedIndex--;
    getBrowser().removeTab(tab);
}

function bufshow(filter, in_comp_window)
{
    if (in_comp_window) // fill the completion list
    {
        g_completions = get_buffer_completions(filter);
        completion_fill_list(0);
        completion_show_list();
    }
    else // in the preview window
    {
        if(g_bufshow == true)
        {
            setTimeout(function ()
                {
                    var items = get_buffer_completions(filter);
                    preview_window_fill(items);
                    preview_window_show();
                    g_bufshow = true;
                    preview_window.selectItem(preview_window.getItemAtIndex(gBrowser.mTabContainer.selectedIndex));
                }, 100);
        }
        else
        {
            var items = get_buffer_completions(filter);
            preview_window_fill(items);
            preview_window_show();
            g_bufshow = true;
            preview_window.selectItem(preview_window.getItemAtIndex(gBrowser.mTabContainer.selectedIndex));
        }
    }
}

function buffer_switch(string)
{
    var match;
    if (match = string.match(/^(\d+):?/))
        return tab_go(match[1]);
    for (var i = 0; i < getBrowser().browsers.length; i++)
    {
        var url = getBrowser().getBrowserAtIndex(i).contentDocument.location.href;
        if (url == string)
            return tab_go(i);
    }
}

//toggles the buffer preview window
function buffer_preview_toggle()
{
    if(g_bufshow == true)
    {
        preview_window.hidden = true;
        g_bufshow = false;
    }
    else
    {
        bufshow("", false);
        g_bufshow = true;
    }
}

//updates the buffer preview in place
function buffer_preview_update(event)
{
    if(g_bufshow == true)
        bufshow("", false);
}


////////////////////////////////////////////////////////////////////////
// scrolling ////////////////////////////////////////////////////// {{{1
////////////////////////////////////////////////////////////////////////
function scrollBufferRelative(right, down)
{
    var win = document.commandDispatcher.focusedWindow;
    if (g_count < 1)
        g_count = 1;

    // beep if we can't go there
    if (down > 0)
    {
        if (win.scrollY == win.scrollMaxY) beep();
    }
    else if (down < 0)
    {
        if (win.scrollY == 0) beep();
    }

    if (right > 0)
    {
        if (win.scrollX == win.scrollMaxX) beep();
    }
    else if (right < 0)
    {
        if (win.scrollX == 0) beep();
    }

    win.scrollBy(g_count * right * 20, g_count * down * 20);
}

/* both values are given in percent, -1 means no change */
function scrollBufferAbsolute(horizontal, vertical)
{
    var win = document.commandDispatcher.focusedWindow;
    var horiz, vert;

    if (horizontal < 0)
        horiz = win.scrollX;
    else
        horiz = win.scrollMaxX/100 * horizontal;

    if (vertical < 0)
        vert = win.scrollY;
    else
        vert = win.scrollMaxY/100 * vertical;

    win.scrollTo(horiz, vert);
}

////////////////////////////////////////////////////////////////////////
// zooming //////////////////////////////////////////////////////// {{{1
////////////////////////////////////////////////////////////////////////

/* also used to zoom out, when factor is negative */
function zoom_in(factor)
{
    if (g_count < 1)
        g_count = 1;

    //ZoomManager.prototype.getInstance().enlarge();
    var zoomMgr = ZoomManager.prototype.getInstance();
    if (zoomMgr.textZoom == 25 && factor < 0)
    {
        echoerr("Minimum zoom level of 25% reached");
        beep();
    }
    else if (zoomMgr.textZoom == 500 && factor > 0)
    {
        echoerr("Maximum zoom level of 500% reached");
        beep();
    }
    else
    {
        var value = zoomMgr.textZoom + factor*g_count*25;
        if (value < 25) value = 25;
        if (value > 500) value = 500;

        zoomMgr.textZoom = value;

        hah.reshowHints();

        echo("Zoom value: " + value + "%");
    }
}

function zoom_to(value)
{
    var zoomMgr = ZoomManager.prototype.getInstance();
    value = parseInt(value);
    if (!value || isNaN(value) || value <= 0)
        value = 100;

    // convert to int, if string was given
    if (typeof(value) != "number")
    {
        oldval = value;
        value = parseInt(oldval, 10);
        if (isNaN(value))
        {
            echoerr("Cannot convert " + oldval + " to a number");
            return;
        }
    }

    if (value < 25 || value > 500)
    {
        echoerr("Zoom value must be between 25% and 500%");
        beep();
        return;
    }

    zoomMgr.textZoom = value;

    hah.reshowHints();

    echo("Zoom value: " + value + "%");
}


////////////////////////////////////////////////////////////////////////
// misc helper functions ////////////////////////////////////////// {{{1
////////////////////////////////////////////////////////////////////////

function copyToClipboard(str)
{
    var clipboardHelper = Components.classes["@mozilla.org/widget/clipboardhelper;1"]
        .getService(Components.interfaces.nsIClipboardHelper);
    clipboardHelper.copyString(str);
}

function beep()
{
    if (get_pref("beep") == false)
        return;

    var gBeepService = Components.classes['@mozilla.org/sound;1']
        .getService(Components.interfaces.nsISound);

    if (gBeepService)
        gBeepService.beep();
    else
        echoerr('no beep service found');
}

// quit vimperator, no matter how many tabs/windows are open
function quit(save_session)
{
    if (save_session)
        set_firefox_pref("browser.startup.page", 3); // start with saved session
    else
        set_firefox_pref("browser.startup.page", 1); // start with default homepage session

    goQuitApplication();
}

function reload(all_tabs)
{
    if (all_tabs)
        getBrowser().reloadAllTabs();
    else
        BrowserReload();
}

function restart()
{
    // if (!arguments[1]) return;
    const nsIAppStartup = Components.interfaces.nsIAppStartup;

    // Notify all windows that an application quit has been requested.
    var os = Components.classes["@mozilla.org/observer-service;1"]
        .getService(Components.interfaces.nsIObserverService);
    var cancelQuit = Components.classes["@mozilla.org/supports-PRBool;1"]
        .createInstance(Components.interfaces.nsISupportsPRBool);
    os.notifyObservers(cancelQuit, "quit-application-requested", null);

    // Something aborted the quit process. 
    if (cancelQuit.data)
        return;

    // Notify all windows that an application quit has been granted.
    os.notifyObservers(null, "quit-application-granted", null);

    // Enumerate all windows and call shutdown handlers
    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
        .getService(Components.interfaces.nsIWindowMediator);
    var windows = wm.getEnumerator(null);
    while (windows.hasMoreElements())
    {
        var win = windows.getNext();
        if (("tryToClose" in win) && !win.tryToClose())
            return;
    }
    Components.classes["@mozilla.org/toolkit/app-startup;1"].getService(nsIAppStartup)
        .quit(nsIAppStartup.eRestart | nsIAppStartup.eAttemptQuit);
}

// sets an vimperator option
function set(args, special)
{
    if (args == "")
    {
        if (special) // open firefox settings gui dialog
            openURLsInNewTab("chrome://browser/content/preferences/preferences.xul", true);
        else
            openURLsInNewTab("about:config", true);
    }
    else
    {
        var matches = args.match(/^\s*(no)?([a-z]+)(\?)?(([+-])?=(.*))?/);
        if (!matches)
        {
            echoerr("E518: Unknown option: " + args);
            return;
        }

        var no = true; if (matches[1] == undefined) no = false;
        var opt = matches[2];
        var setting = get_setting(opt);
        if (!setting)
        {
            echoerr("E518: Unknown option: " + opt);
            return;
        }

        var get = false; if (matches[3] != undefined ||
            (setting[TYPE] != 'boolean' && matches[4] == undefined)) get = true;
        var oper = matches[5];
        var val = matches[6]; if (val == undefined) val = "";

        // read access
        if (get)
        {
            var cur_val = setting[GETFUNC].call(this);
            echo("  " + setting[COMMANDS][0] + "=" + cur_val);
        }
        // write access
        else
        {
            var type = setting[TYPE];      
            if (type == "boolean")
            {
                setting[SETFUNC].call(this, !no);
            }
            else if (type == "number")
            {
                var num = parseInt(val, 10);
                if (isNaN(num))
                    echoerr("Invalid argument type to option " + setting[COMMANDS][0] + ": Expects number");
                else
                {
                    var cur_val = setting[GETFUNC].call(this);
                    if (oper == '+') num = cur_val + num;
                    if (oper == '-') num = cur_val - num;
                    if (setting[CHECKFUNC] != null && setting[CHECKFUNC].call(this, num) == false)
                        echoerr("Invalid argument to option " + setting[COMMANDS][0] + ": Check help for more details");
                    else // all checks passed, execute option handler
                        setting[SETFUNC].call(this, num);
                }
            }
            else if (type == "charlist" || type == "stringlist" || type == "string")
            {
                var cur_val = setting[GETFUNC].call(this);
                if (type == "charlist" || type == "string")
                {
                    if (oper == '+' && !cur_val.match(val))
                        val = cur_val + val;
                    if (oper == '-') val = cur_val.replace(val, '');
                }
                else
                {
                    if (oper == '+' && !cur_val.match(val))
                        val = cur_val + ',' + val;
                    if (oper == '-')
                    {
                        val = cur_val.replace(new RegExp(',?' + val), '');
                        val = val.replace(/^,?/, '');
                    }
                }
                if (setting[CHECKFUNC] != null && setting[CHECKFUNC].call(this, val) == false)
                    echoerr("Invalid argument to option " + setting[COMMANDS][0] + ": Check help for more details");
                else // all checks passed, execute option handler
                    setting[SETFUNC].call(this, val);
            }
            else
                echoerr("Internal error, option format `" + type + "' not supported");
        }
    }
}

function source(filename, silent)
{
    if (!filename)
        return;

    try
    {
        var fd = fopen(filename, "<");
        if (!fd)
            return;

        var s = fd.read();
        fd.close();

        var prev_match = new Array(5);
        var heredoc = '';
        var end = false;
        s.split('\n').forEach(function (line) {
            [prev_match, heredoc, end] = multiliner(line, prev_match, heredoc);
        });
    }
    catch(e)
    {
        if(!silent)
            echoerr(e);
    }
}































// list all installed themes and extensions
function outputAddonsList(aTarget)
{
    var RDFService = Components.classes["@mozilla.org/rdf/rdf-service;1"]
        .getService(Components.interfaces.nsIRDFService);
    var Container = Components.classes["@mozilla.org/rdf/container;1"]
        .getService(Components.interfaces.nsIRDFContainer);
    var stream = Components.classes['@mozilla.org/network/file-output-stream;1']
        .createInstance(Components.interfaces.nsIFileOutputStream);
    var fp = Components.classes["@mozilla.org/filepicker;1"]
        .createInstance(Components.interfaces.nsIFilePicker);

    fp.init(window, aTarget+'s List', fp.modeSave);
    fp.defaultString=aTarget+"sList.txt";
    fp.appendFilters(fp.filterText);
    fp.appendFilters(fp.filterAll);
    if (fp.show() == fp.returnCancel)
        return;

    var extensionDS= Components.classes["@mozilla.org/extensions/manager;1"]
        .getService(Components.interfaces.nsIExtensionManager).datasource;
    var root = RDFService
        .GetResource("urn:mozilla:"+aTarget.toLowerCase()+":root");
    var nameArc = RDFService
        .GetResource("http://www.mozilla.org/2004/em-rdf#name");
    var versionArc = RDFService
        .GetResource("http://www.mozilla.org/2004/em-rdf#version");
    var disabledArc = RDFService
        .GetResource("http://www.mozilla.org/2004/em-rdf#disabled");

    var list="";
    var disabledlist="";

    Container.Init(extensionDS,root);
    var elements=Container.GetElements();

    while(elements.hasMoreElements())
    {
        var element=elements.getNext();
        var name="";
        var version="";
        var disabled="";
        element.QueryInterface(Components.interfaces.nsIRDFResource);
        var target=extensionDS.GetTarget(element, nameArc ,true);
        if(target)
            name=target
                .QueryInterface(Components.interfaces.nsIRDFLiteral).Value;
        target=extensionDS.GetTarget(element, versionArc ,true);
        if(target)
            version=target
                .QueryInterface(Components.interfaces.nsIRDFLiteral).Value;
        target=extensionDS.GetTarget(element, disabledArc ,true);
        if(target)
            disabled=target
                .QueryInterface(Components.interfaces.nsIRDFLiteral).Value;
        if( disabled && disabled=="true")
            disabledlist += name + " " + version +"\n";
        else if(name)
            list += name + " " + version +"\n"
    }

    if(disabledlist)
        list += "\n#Disabled Extensions\n" + disabledlist;

    stream.init(fp.file, 0x20|0x02|0x08, 0666, 0);
    stream.write(list, list.length);
    stream.close();
}

/* selects the first input box */
function selectInput()
{
//  if (! (ev.charCode == 47 /* ord('/') */ && ev.ctrlKey))
//      return;

    var texts = document.evaluate("//input[@type='text']", document, 
        null, XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE, null);
    
    texts.snapshotItem(0).focus();
}


function toggle_images() {
    if (!gPrefService) {
    message("EEP: no gPrefService");
    return 0;
    }


    var pref;
    if (!gPrefService.prefHasUserValue("network.image.imageBehavior")) {
    pref = 0;
    } else {
    pref = gPrefService.getIntPref("network.image.imageBehavior");
    }


    set_pref("network.image.imageBehavior", pref ? 0 : 2);
    pref = gPrefService.getIntPref("network.image.imageBehavior");
//    redraw();
    message ("imageBehavior set to " + pref);
}

////////////////////////////////////////////////////////////////////////
// mode related functions ///////////////////////////////////////// {{{1
////////////////////////////////////////////////////////////////////////

// set current mode
function setCurrentMode(mode)
{
    g_current_mode = mode;
    showMode();
}
// get current mode
function hasMode(mode)
{
    return g_current_mode & mode;
}
// add to current mode
function addMode(mode)
{
    g_current_mode |= mode;
    showMode();
    return g_current_mode;
}
// get current mode
function removeMode(mode)
{
    g_current_mode = (g_current_mode | mode) ^ mode;
    showMode();
    return g_current_mode;
}

function showMode()
{
    if (!get_pref("showmode") || !g_modemessages[g_current_mode])
        return;

    echo("-- " + g_modemessages[g_current_mode] + " --");
}

// vim: set fdm=marker sw=4 ts=4 et:
