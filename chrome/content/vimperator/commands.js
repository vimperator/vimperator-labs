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

function Command(specs, action, extra_info) //{{{
{
    if (!specs || !action)
        return null;

    // convert command name abbreviation specs of the form
    // 'shortname[optional-tail]' to short and long versions Eg. 'abc[def]' ->
    // 'abc', 'abcdef'
    var parseSpecs = function(specs)
    {
        var short_names = [];
        var long_names  = [];
        var names = [];
        for (var i = 0; i < specs.length; i++)
        {
            var match;
            if (match = specs[i].match(/(\w+)\[(\w+)\]/))
            {
                short_names.push(match[1]);
                long_names.push(match[1] + match[2]);
                // order as long1, short1, long2, short2
                names.push(match[1] + match[2]);
                names.push(match[1]);
            }
            else
            {
                long_names.push(specs[i]);
                names.push(specs[i]);
            }
        }
        return { names: names, long_names: long_names, short_names: short_names };
    }

    this.specs = specs;
    var expanded_specs = parseSpecs(specs);
    this.short_names = expanded_specs.short_names;
    this.long_names = expanded_specs.long_names;

    // return the primary command name (the long name of the first spec listed)
    this.name = this.long_names[0];

    // return all command name aliases
    this.names = expanded_specs.names;

    this.action = action;

    // TODO: build a better default usage string
    this.usage = [this.specs[0]];

    if (extra_info)
    {
        //var flags = extra_info.flags || 0;

        if (extra_info.usage)
            this.usage = extra_info.usage;

        this.help = extra_info.help || null;
        this.short_help = extra_info.short_help || null;
        this.completer = extra_info.completer || null;
    }

}

Command.prototype.execute = function(args, special, count, modifiers)
{
    this.action.call(this, args, special, count, modifiers);
}

// return true if the candidate name matches one of the command's aliases
// (including all acceptable abbreviations)
Command.prototype.hasName = function(name)
{
    // match a candidate name against a command name abbreviation spec - returning
    // true if the candidate matches unambiguously
    function matchAbbreviation(name, format)
    {
        var minimum = format.indexOf('[');                    // minumum number of characters for a command name match
        var fullname = format.replace(/\[(\w+)\]$/, '$1');    // full command name
        if (fullname.indexOf(name) == 0 && name.length >= minimum)
            return true;
        else
            return false;
    }

    for (var i = 0; i < this.specs.length; i++)
    {
        if (this.specs[i] == name)                    // literal command name
            return true;
        else if (this.specs[i].match(/^\w+\[\w+\]$/)) // abbreviation spec
            if (matchAbbreviation(name, this.specs[i]))
                return true;
    }
    return false;
}

Command.prototype.toString = function()
{
    return "Command {" +
         "\n\tname: " + this.name +
         "\n\tnames: " + this.names +
         "\n\tshort_names: " + this.short_names  +
         "\n\tlong_names: " + this.long_names +
         "\n\tusage: " + this.usage +
         "\n\tshort_help: " + this.short_help +
         "\n\thelp: " + this.help +
         "\n\taction: " + this.action +
         "\n\tcompleter: " + this.completer +
         "\n}"
} //}}}

function Commands() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var ex_commands = [];

    function addDefaultCommand(command)
    {
        ex_commands.push(command);
        Commands.prototype[command.name] = function(args, special, count, modifiers)
        {
            command.execute(args, special, count, modifiers);
        }
    }

    function commandsIterator()
    {
        for (var i = 0; i < ex_commands.length; i++)
            yield ex_commands[i];

        throw StopIteration;
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    this.__iterator__ = function()
    {
        return commandsIterator();
    }

    this.add = function(command)
    {
        if (!command)
            return false;

        ex_commands.push(command);

        return true;
    }

    this.get = function(name)
    {
        for (var i = 0; i < ex_commands.length; i++)
        {
            if (ex_commands[i].hasName(name))
                return ex_commands[i];
        }
        return null;
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// DEFAULT COMMANDS ////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    addDefaultCommand(new Command(["addo[ns]"],
        function() { openURLsInNewTab("chrome://mozapps/content/extensions/extensions.xul", true); },
        {
            short_help: "Show available Browser Extensions and Themes",
            help: "You can add/remove/disable browser extensions from this dialog.<br/>Be aware that not all Firefox extensions work, because Vimperator overrides some keybindings and changes Firefox's GUI."
        }
    ));
    addDefaultCommand(new Command(["ba[ck]"],
        function(args, special, count)
        {
            if (special)
                vimperator.history.goToStart();
            else
                vimperator.history.stepTo(count > 0 ? -1 * count : -1);
        },
        {
            usage: ["{count}ba[ck][!]"],
            short_help: "Go back in the browser history",
            help: "Count is supported, <code class=\"command\">:3back</code> goes back 3 pages in the browser history.<br/>" +
                  "The special version <code class=\"command\">:back!</code> goes to the beginning of the browser history."
        }
    ));
    addDefaultCommand(new Command(["bd[elete]", "bw[ipeout]", "bun[load]", "tabc[lose]"],
        function(args, special, count) { vimperator.tabs.remove(getBrowser().mCurrentTab, count, special, 0); },
        {
            usage: ["{count}bd[elete][!]"],
            short_help: "Delete current buffer (=tab)",
            help: "Count WILL be supported in future releases, then <code class=\"command\">:2bd</code> removes two tabs and the one to the right is selected.<br/>Do <code class=\"command\">:bdelete!</code> to select the tab to the left after removing the current tab."
        }
    ));
    addDefaultCommand(new Command(["beep"],
        function() { vimperator.beep(); },
        {
            short_help: "Play a system beep"
        }
    ));
    addDefaultCommand(new Command(["bma[dd]"],
        // takes: -t "foo" -T "tag1,tag2", myurl
        // converts that string to a useful url and title, and calls addBookmark
        // TODO: proper ex-style arg parsing
        function(args)
        {
            var res = Bookmarks.parseBookmarkString(args);
            if (res)
            {
                if (res.url == null)
                {
                    res.url = getCurrentLocation();
                    // also guess title if the current url is :bmadded
                    if (res.title == null)
                        res.title = getCurrentTitle();
                }

                if (res.title == null) // title could still be null
                    res.title = res.url;

                vimperator.bookmarks.add(res.title, res.url);
                vimperator.echo("Bookmark `" + res.title + "' added with url `" + res.url + "'");
            }
            else
                vimperator.echo("Usage: :bmadd [-t \"My Title\"] [-T tag1,tag2] <url>");
        },
        {
            usage: ["bma[dd] [-tTk] [url]"],
            short_help: "Add a bookmark",
            help: "If you don't add a custom title, either the title of the web page or the URL will be taken as the title.<br/>" +
                  "Tags WILL be some mechanism to classify bookmarks. Assume, you tag a url with the tags \"linux\" and \"computer\" you'll be able to search for bookmarks containing these tags.<br/>" +
                  "You can omit the optional [url] field, so just do <code class=\"command\">:bmadd</code> to bookmark the currently loaded web page with a default title and without any tags.<br/>" +
                  " -t \"custom title\"<br/>" +
                  "The following options will be interpreted in the future:<br/>" +
                  " -T comma,separated,tag,list <br/>" +
                  " -k keyword <br/>"
        }
    ));
    addDefaultCommand(new Command(["bmd[el]"],
        // TODO: proper ex-style arg parsing
        function(args)
        {
            var res = Bookmarks.parseBookmarkString(args);
            if (res)
            {
                if (res.url == null)
                    res.url = getCurrentLocation();

                var del = vimperator.bookmarks.remove(res.url);
                vimperator.echo(del + " bookmark(s) with url `" + res.url + "' deleted");
            }
            else
                vimperator.echo("Usage: :bmdel <url>");
        },
        {
            usage: ["bmd[el] [-T] {url}"],
            short_help: "Delete a bookmark",
            help: "Deletes <b>all</b> bookmarks which matches the url AND the specified tags. Use <code>&lt;Tab&gt;</code> key on a regular expression to complete the url which you want to delete.<br/>" +
                  "The following options WILL be interpreted in the future:<br/>" +
                  " -T comma,separated,tag,list <br/>",
            completer: function(filter) { return get_bookmark_completions(filter); }
        }
    ));
    addDefaultCommand(new Command(["bookm[arks]", "bm"],
        function(args, special) { vimperator.bookmarks.list(args, special); },
        {
            usage: ["bm[!] [-T] {regexp}"],
            short_help: "Show bookmarks",
            help: "Open the preview window at the bottom of the screen for all bookmarks which match the regexp either in the title or URL.<br/>" +
                  "Close this window with <code class=\"command\">:pclose</code> or open entries with double click in the current tab or middle click in a new tab.<br/>" +
                  "The following options WILL be interpreted in the future:<br/>" +
                  " -T comma,separated,tag,list <br/>",
            completer: function(filter) { return get_bookmark_completions(filter); }
        }
    ));
    addDefaultCommand(new Command(["b[uffer]"],
        // TODO: move to v.tabs/buffers
        function(args)
        {
            var match;
            if (match = args.match(/^(\d+):?/))
                return vimperator.tabs.select(parseInt(match[1]) - 1, false); // make it zero-based
            for (var i = 0; i < getBrowser().browsers.length; i++)
            {
                var url = getBrowser().getBrowserAtIndex(i).contentDocument.location.href;
                if (url == args)
                    return vimperator.tabs.select(i, false);
            }
        },
        {
            usage: ["b[uffer] {url|index}"],
            short_help: "Go to buffer from buffer list",
            help: "Argument can be either the buffer index or the full URL.",
            completer: function(filter) { return get_buffer_completions(filter); }
        }
    ));
    addDefaultCommand(new Command(["buffers", "files", "ls", "tabs"],
        // TODO: move to v.tabs/buffers
        function()
        {
            if (vimperator.bufferwindow.visible())
                vimperator.bufferwindow.hide();
            else
            {
                var items = get_buffer_completions("");
                vimperator.bufferwindow.show(items);
                vimperator.bufferwindow.selectItem(getBrowser().mTabContainer.selectedIndex);
            }
        },
        {
            short_help: "Show a list of all buffers (=tabs)",
            help: "If the list is already shown, close the preview window."
        }
    ));
    addDefaultCommand(new Command(["delm[arks]"],
        function(args, special)
        {
            if (!special && !args)
            {
                vimperator.echoerr("E471: Argument required");
                return;
            }
            if (special && args)
            {
                vimperator.echoerr("E474: Invalid argument");
                return
            }
            var matches;
            if (matches = args.match(/(?:(?:^|[^a-zA-Z0-9])-|-(?:$|[^a-zA-Z0-9])|[^a-zA-Z0-9 -]).*/))
            {
                // TODO: this currently differs from Vim's behaviour which
                // deletes any valid marks in the arg list, up to the first
                // invalid arg, as well as giving the error message. Do we want
                // to match this behaviour?
                vimperator.echoerr("E475: Invalid argument: " + matches[0]);
                return;
            }
            // check for illegal ranges - only allow a-z A-Z 0-9
            if (matches = args.match(/[a-zA-Z0-9]-[a-zA-Z0-9]/))
            {
                for (var i = 0; i < matches.length; i++)
                {
                    var start = matches[i][0];
                    var end   = matches[i][2];
                    if (/[a-z]/.test(start) != /[a-z]/.test(end) ||
                        /[A-Z]/.test(start) != /[A-Z]/.test(end) ||
                        /[0-9]/.test(start) != /[0-9]/.test(end) ||
                        start > end)
                    {
                        vimperator.echoerr("E475: Invalid argument: " + args.match(new RegExp(matches[i] + ".*"))[0]);
                        return;
                    }
                }
            }

            vimperator.marks.remove(args, special);
        },
        {
            usage: ["delm[arks]! {marks}"],
            short_help: "Delete the specified marks {a-zA-Z}",
            help: "Marks are presented as a list. Example:<br/>" +
                "<code class=\"command\">:delmarks Aa b p</code> will delete marks A, a, b and p<br/>" +
                "<code class=\"command\">:delmarks b-p</code> will delete all marks in the range b to p<br/>" +
                "<code class=\"command\">:delmarks!</code> will delete all marks for the current buffer"
        }

    ));
    addDefaultCommand(new Command(["downl[oads]", "dl"],
        function() { openURLsInNewTab("chrome://mozapps/content/downloads/downloads.xul", true); },
        {
            short_help: "Show progress of current downloads",
            help: "Open the original Firefox download dialog in a new tab.<br/>" +
                  "Here, downloads can be paused, canceled and resumed."
        }
    ));
    addDefaultCommand(new Command(["ec[ho]"],
        function(args) { vimperator.echo(args); } ,
        {
            short_help: "Display a string at the bottom of the window",
            help: "Echo all arguments of this command. Useful for showing informational messages.<br/>Multiple lines WILL be separated by \\n."
        }
    ));
    addDefaultCommand(new Command(["echoe[rr]"],
        function(args) { vimperator.echoerr(args); } ,
        {
            short_help: "Display an error string at the bottom of the window",
            help: "Echo all arguments of this command highlighted in red. Useful for showing important messages.<br/>Multiple lines WILL be separated by \\n."
        }
    ));
    addDefaultCommand(new Command(["exe[cute]"],
        execute,
        {
            usage: ["exe[cute] {expr1} [ ... ]"],
            short_help: "Execute the string that results from the evaluation of {expr1} as an Ex command.",
            help: "<code class=\"command\">:execute &#34;echo test&#34;</code> would show a message with the text &#34;test&#34;.<br/>"
        }
    ));
    addDefaultCommand(new Command(["exu[sage]"],
        function(args, special, count, modifiers) { vimperator.help("commands", special, null, modifiers); },
        {
            short_help: "Show help for Ex commands"
        }
    ));
    addDefaultCommand(new Command(["fo[rward]", "fw"],
        function(args, special, count)
        {
            if (special)
                vimperator.history.goToEnd();
            else
                vimperator.history.stepTo(count > 0 ? count : 1);
        },
        {
            usage: ["{count}fo[rward][!]"],
            short_help: "Go forward in the browser history",
            help: "Count is supported, <code class=\"command\">:3forward</code> goes forward 3 pages in the browser history.<br/>" +
                  "The special version <code class=\"command\">:forward!</code> goes to the end of the browser history."
        }
    ));
    addDefaultCommand(new Command(["ha[rdcopy]"],
        function() { getBrowser().contentWindow.print(); },
        {
            short_help: "Print current document",
            help: "Open a GUI dialog where you can select the printer, number of copies, orientation, etc."
        }
    ));
    addDefaultCommand(new Command(["h[elp]"],
        function(args, special, count, modifiers) { vimperator.help(args, special, null, modifiers); },
        {
            usage: ["h[elp] {subject}"],
            short_help: "Open the help window",
            help: "You can jump to the specified {subject} with <code class=\"command\">:help {subject}</code>.<br/>" +
                  "Make sure you use the full vim notation when jumping to {subject}. This means:<br/>" +
                  "<ul>" +
                  "<li><code class=\"command\">:help :help</code> for commands (: prefix)</li>" +
                  "<li><code class=\"command\">:help 'complete'</code> for options (surrounded by ' and ')</li>" +
                  "<li><code class=\"command\">:help o</code> for mappings (no pre- or postfix)</li>" +
                  "</ul>" +
                  "You can however use partial stings in the tab completion, so <code class=\"command\">:help he&lt;Tab&gt;</code> will complete <code class=\"command\">:help :help</code>.",
            completer: function(filter) { return get_help_completions(filter); }
        }
    ));
    addDefaultCommand(new Command(["hist[ory]", "hs"],
        function() { vimperator.history.list(); },
        {
            usage: ["hist[ory] {filter}"],
            short_help: "Show recently visited URLs",
            help: "Open the preview window at the bottom of the screen for all history items which match the filter string either in the title or URL. " +
                  "Close this window with <code class=\"command\">:pclose</code> or open entries with double click in the current tab or middle click in a new tab.",
            completer: function(filter) { return get_history_completions(filter); }
        }
    ));
    addDefaultCommand(new Command(["javas[cript]", "js"],
        function(args, special)
        {
            if (special) // open javascript console
                openURLsInNewTab("chrome://global/content/console.xul", true);
            else
                try
                {
                    eval(args);
                }
                catch (e)
                {
                    vimperator.echoerr(e.name + ": " + e.message);
                }
        },
        {
            usage: ["javas[cript] {cmd}", "javascript <<{endpattern}\\n{script}\\n{endpattern}"], // \\n is changed to <br/> in the help.js code
            short_help: "Run any javascript command through eval()",
            help: "Acts as a javascript interpreter by passing the argument to <code>eval()</code>.<br/>" +
                  "<code class=\"command\">:javascript alert('Hello world')</code> would show a dialog box with the text \"Hello world\".<br/>" +
                  "<code class=\"command\">:javascript &lt;&lt;EOF</code> would read all the lines until a line starting with 'EOF' is found, and will <code>eval()</code> them.<br/>" +
                  "The special version <code class=\"command\">:javascript!</code> will open the javascript console of Firefox."
        }
    ));
    addDefaultCommand(new Command(["ma[rk]"],
        function(args)
        {
            if (!args) {
                vimperator.echoerr("E471: Argument required");
                return;
            }
            if (args.length > 1) {
                vimperator.echoerr("E488: Trailing characters");
                return;
            }
            if (!/[a-zA-Z]/.test(args))
            {
                vimperator.echoerr("E191: Argument must be a letter or forward/backward quote");
                return;
            }

            vimperator.marks.add(args);
        },
        {
            usage: ["ma[rk] {arg}"],
            short_help: "Mark current location within the web page"
        }
    ));
    addDefaultCommand(new Command(["marks"],
        function(args)
        {
            if (args.length > 1 && !/[a-zA-Z]/.test(args))
            {
                vimperator.echoerr("E283: No marks matching \"" + args + "\"");
                return;
            }
            var filter = args.replace(/[^a-zA-Z]/g, '');
            vimperator.marks.list(filter)
        },
        {
            usage: ["marks {arg}"],
            short_help: "Show all location marks of current web page",
            help: "Not implemented yet."
        }
    ));
    addDefaultCommand(new Command(["o[pen]", "e[dit]"],
        function(args, special)
        {
            if (args.length > 0)
                openURLs(args);
            else
            {
                if (special)
                    BrowserReloadSkipCache();
                else
                    BrowserReload();
            }
        },
        {
            usage: ["o[pen] [url] [| url]"],
            short_help: "Open one or more URLs in the current tab",
            help: "Multiple URLs can be separated with \", \". Note that the space after the comma is required.<br/>" +
                  "Each token is analyzed and in this order:<br/>" +
                  "<ol>" +
                  "<li>Transformed to a relative URL of the current location if it starts with . or .. or ...;<br/>" +
                  "... is special and moves up the directory hierarchy as far as possible." +
                  "<ul><li><code class=\"command\">:open ...</code> with current location <code>\"http://www.example.com/dir1/dir2/file.html\"</code> will open <code>\"http://www.example.com\"</code></li>" +
                  "<li><code class=\"command\">:open ./foo.html</code> with current location <code>\"http://www.example.com/dir1/dir2/file.html\"</code> will open <code>\"http://www.example.com/dir1/dir2/foo.html\"</code></li></ul></li>" +
                  "<li>Opened with the specified search engine if the token looks like a search string " +
                  "and the first word of the token is the name of a search engine (<code class=\"command\">:open wikipedia linus torvalds</code> " +
                  "will open the wikipedia entry for linux torvalds).</li>" +
                  "    <li>Opened with the default search engine or keyword (specified with the <code class=\"option\">'defsearch'</code> option) " +
                  "if the first word is no search engine (<code class=\"command\">:open linus torvalds</code> will open a google search for linux torvalds).</li>" +
                  "    <li>Passed directly to Firefox in all other cases (<code class=\"command\">:open www.osnews.com, www.slashdot.org</code> will " +
                  "open OSNews in the current, and Slashdot in a new background tab).</li>" +
                  "</ol>" +
                  "You WILL be able to use <code class=\"command\">:open [-T \"linux\"] torvalds&lt;Tab&gt;</code> to complete bookmarks " +
                  "with tag \"linux\" and which contain \"torvalds\". Note that -T support is only available for tab completion, not for the actual command.<br/>" +
                  "The items which are completed on <code>&lt;Tab&gt;</code> are specified in the <code class=\"option\">'complete'</code> option.<br/>" +
                  "Without argument, reloads the current page.<br/>" +
                  "Without argument but with <code class=\"command\">!</code>, reloads the current page skipping the cache.",
            completer: function(filter) { return get_url_completions(filter); }
        }
    ));
    addDefaultCommand(new Command(["pc[lose]"],
        function() { vimperator.previewwindow.hide(); },
        {
            short_help: "Close preview window on bottom of screen"
        }
    ));
    addDefaultCommand(new Command(["pref[erences]", "prefs"],
        openPreferences,
        {
            short_help: "Show Browser Preferences",
            help: "You can change the browser preferences from this dialog.<br/>Be aware that not all Firefox preferences work, because Vimperator overrides some keybindings and changes Firefox's GUI.<br/>" +
                  "Works like <code class=\"command\">:set!</code>, but opens the dialog in a new window instead of a new tab. Use this, if you experience problems/crashes when using <code class=\"command\">:set!</code>"
        }
    ));
    addDefaultCommand(new Command(["q[uit]"],
        function() { vimperator.tabs.remove(getBrowser().mCurrentTab, 1, false, 1); },
        {
            short_help: "Quit current tab or quit Vimperator if this was the last tab",
            help: "When quitting Vimperator, the session is not stored."
        }
    ));
    addDefaultCommand(new Command(["quita[ll]", "qa[ll]"],
        function() { vimperator.quit(false); },
        {
            short_help: "Quit Vimperator",
            help: "Quit Vimperator, no matter how many tabs/windows are open. The session is not stored."
        }
    ));
    addDefaultCommand(new Command(["re[load]"],
        function(args, special) { vimperator.tabs.reload(getBrowser().mCurrentTab, special); },
        {
            usage: ["re[load][!]"],
            short_help: "Reload current page",
            help: "Forces reloading of the current page. If <code class=\"command\">!</code> is given, skip the cache."
        }
    ));
    addDefaultCommand(new Command(["reloada[ll]"],
        function(args, special) { vimperator.tabs.reloadAll(special); },
        {
            usage: ["reloada[ll][!]"],
            short_help: "Reload all pages",
            help: "Forces reloading of all pages. If <code class=\"command\">!</code> is given, skip the cache."
        }
    ));
    addDefaultCommand(new Command(["res[tart]"],
        function() { vimperator.restart(); },
        {
            short_help: "Force the browser to restart",
            help: "Useful when installing extensions."
        }
    ));
    addDefaultCommand(new Command(["sav[eas]"],
        function() { saveDocument(window.content.document); },
        {
            short_help: "Save current web page to disk",
            help: "Open the original Firefox \"Save page as...\" dialog in a new tab.<br/>" +
                  "There, you can save the current web page to disk with various options."
        }
    ));
    addDefaultCommand(new Command(["se[t]"],
        function(args, special, count, modifiers)
        {
            if (args == "")
            {
                var func = openURLs;
                if (arguments[3] && arguments[3].inTab)
                    func = openURLsInNewTab;

                if (special) // open firefox settings gui dialog
                    func.call(this, "chrome://browser/content/preferences/preferences.xul", true);
                else
                    func.call(this, "about:config", true);
            }
            else
            {
                var matches = args.match(/^\s*(no)?([a-z]+)(\?|&)?(([+-])?=(.*))?/);
                if (!matches)
                {
                    vimperator.echoerr("E518: Unknown option: " + args);
                    return;
                }

                var no = true; if (matches[1] === undefined) no = false;
                var opt = matches[2];
                var option = vimperator.options.get(opt);
                if (!option)
                {
                    vimperator.echoerr("E518: Unknown option: " + opt);
                    return;
                }

                var get = false; if (matches[3] == "?" ||
                    (option.type != 'boolean' && matches[4] === undefined)) get = true;
                var reset = false; if (matches[3] == "&") reset = true;
                var oper = matches[5];
                var val = matches[6]; if (val === undefined) val = "";

                // reset a variable to its default value.
                if (reset)
                {
                    option.value = option.default_value;
                }
                // read access
                else if (get)
                {
                    if (option.type == 'boolean')
                        vimperator.echo((option.value ? "  " : "no") + option.name);
                    else
                        vimperator.echo("  " + option.name + "=" + option.value);
                        //vimperator.echo("  " + option.name + "=" + vimperator.options[option.name]);
                }
                // write access
                else
                {
                    var type = option.type;
                    if (type == "boolean")
                    {
                        if (matches[4])
                            vimperator.echoerr("E474: Invalid argument: " + option.name + "=" + val);
                        else
                            option.value = !no;
                    }
                    else if (type == "number")
                    {
                        var num = parseInt(val, 10);
                        if (isNaN(num))
                            vimperator.echoerr("E521: Number required after =: " + option.name + "=" + val);
                        else
                        {
                            var cur_val = option.value;
                            if (oper == '+') num = cur_val + num;
                            if (oper == '-') num = cur_val - num;
                            // FIXME
                            if (option.validator != null && option.validator.call(this, num) == false)
                                vimperator.echoerr("E521: Number required after =: " + option.name + "=" + val);
                            else // all checks passed, execute option handler
                                option.value = num;
                        }
                    }
                    else if (type == "charlist" || type == "stringlist" || type == "string")
                    {
                        var cur_val = option.value;
                        if (type == "charlist" || type == "string")
                        {
                            if (oper == '+' && !cur_val.match(val))
                                val = cur_val + val;
                            if (oper == '-') val = cur_val.replace(val, '');
                        }
                        else
                        {
                            if (oper == '+' && !cur_val.match(val) && cur_val.length > 0)
                                    val = cur_val + ',' + val;
                            if (oper == '-')
                            {
                                val = cur_val.replace(new RegExp(',?' + val), '');
                                val = val.replace(/^,?/, '');
                            }
                        }
                        // FIXME
                        if (option.validator != null && option.validator.call(this, val) == false)
                            vimperator.echoerr("E474: Invalid argument: " + option.name + "=" + val);
                        else // all checks passed, execute option handler
                            option.value = val;
                    }
                    else
                        vimperator.echoerr("E685: Internal error: option format `" + type + "' not supported");
                }
            }
        },
        {
            usage: ["se[t][!]", "se[t] {option}[?]", "se[t] {option}[+-]={value}"],
            short_help: "Set an option",
            help: "Permanently change an option. In contrast to Vim options are stored throughout sessions.<br/>" +
                  "Boolean options must be set with <code class=\"command\">:set option</code> and <code class=\"command\">:set nooption</code>.<br/>" +
                  "<code class=\"command\">:set</code> without an argument opens <code>about:config</code> in a new tab to change advanced Firefox options.<br/>" +
                  "<code class=\"command\">:set!</code> opens the GUI preference panel from Firefox in a new tab.<br/>" +
                  "<code class=\"command\">:set option?</code> or <code class=\"command\">:set option</code> shows the current value of the option.<br/>" +
                  "<code class=\"command\">:set option&amp;</code> resets 'option' to the default value.<br/>" +
                  "<code class=\"command\">:set option+=foo</code> and <code class=\"command\">:set option-=foo</code> WILL add/remove foo from list options.<br/>",
            completer: function(filter) { return get_options_completions(filter); }
        }
    ));
    addDefaultCommand(new Command(["so[urce]"],
        function(args) { vimperator.source(args); },
        {
            usage: ["so[urce][!] {file}"],
            short_help: "Read Ex commands from {file}",
            help: "The .vimperatorrc file in your home directory is always sourced at start up.<br/>" +
                  "~ is supported as a shortcut for the $HOME directory.<br/>" +
                  "If <code class=\"command\">!</code> is specified, errors are not printed.",
            completer: function(filter) { return get_file_completions(filter); }
        }
    ));
    addDefaultCommand(new Command(["st[op]"],
        BrowserStop,
        {
            short_help: "Stop loading",
            help: "Stop loading current web page."
        }
    ));
    addDefaultCommand(new Command(["tab"],
        function() { execute(arguments[0], null, null, {inTab: true}); },
        {
            usage: ["tab {cmd}"],
            short_help: "Execute {cmd} and tell it to output in a new tab",
            help: "Works for only commands that support it.<br/>" +
                  "Example: <code class=\"command\">:tab help tab</code> opens the help in a new tab.",
            completer: function(filter) { return get_command_completions(filter); }
        }
    ));
    addDefaultCommand(new Command(["tabl[ast]"],
        function() { vimperator.tabs.select("$", false); },
        {
            short_help: "Switch to the last tab"
        }
    ));
    addDefaultCommand(new Command(["tabm[ove]"],
        function(args, special) { vimperator.tabs.move(getBrowser().mCurrentTab, args, special); },
        {
            usage: ["tabm[ove] [N]", "tabm[ove][!] [+|-N]"],
            short_help: "Move the current tab after tab N",
            help: "When N is 0 the current tab is made the first one.  Without N the current tab is made the last one. " +
                  "N can also be prefixed with '+' or '-' to indicate a relative movement. If <code class=\"command\">!</code> is specified the movement wraps around the start or end of the tab list."
        }
    ));
    addDefaultCommand(new Command(["tabn[ext]", "tn[ext]"],
        function() { vimperator.tabs.select("+1", true); },
        {
            short_help: "Switch to the next tab",
            help: "Cycles to the first tab, when the last is selected."
        }
    ));
    addDefaultCommand(new Command(["tabo[nly]"],
        function() { vimperator.tabs.keepOnly(getBrowser().mCurrentTab); },
        {
            short_help: "Close all other tabs"
        }
    ));
    addDefaultCommand(new Command(["tabopen", "t[open]", "tabnew", "tabe[dit]"],
        function(args, special)
        {
            if (args.length > 0)
                openURLsInNewTab(args, !special);
            else
                openURLsInNewTab("about:blank", true);
        },
        {
            usage: ["tabopen [url] [| url]"],
            short_help: "Open one or more URLs in a new tab",
            help: "Like <code class=\"command\">:open</code> but open URLs in a new tab.<br/>" +
                  "If used with <code class=\"command\">!</code>, the 'tabopen' value of the <code class=\"option\">'activate'</code> option is negated.",
            completer: function(filter) { return get_url_completions(filter); }
        }
    ));
    addDefaultCommand(new Command(["tabp[revious]", "tp[revious]", "tabN[ext]", "tN[ext]"],
        function() { vimperator.tabs.select("-1", true); },
        {
            usage: ["tabp[revious]", "tabN[ext]"],
            short_help: "Switch to the previous tab",
            help: "Cycles to the last tab, when the first is selected."
        }
    ));
    addDefaultCommand(new Command(["tabr[ewind]", "tabfir[st]"],
        function() { vimperator.tabs.select(0, false); },
        {
            usage: ["tabr[ewind]", "tabfir[st]"],
            short_help: "Switch to the first tab"
        }
    ));
    addDefaultCommand(new Command(["u[ndo]"],
        function(args, special, count) { if (count < 1) count = 1; undoCloseTab(count-1); },
        {
            usage: ["{count}u[ndo]"],
            short_help: "Undo closing of a tab",
            help: "If a count is given, don't close the last but the n'th last tab."
        }
    ));
    addDefaultCommand(new Command(["qmarka[dd]", "qma[dd]"],
        function(args)
        {
            var split = args.split(/\s+/);
            vimperator.quickmarks.add(split[0], split[1] ? split[1] : getCurrentLocation());
        },
        {
            usage: ["qmarka[dd] {a-zA-Z0-9} [url]"],
            short_help: "Mark a URL with a letter for quick access",
            help: "TODO.",
            completer: function(filter) { return [["a", ""], ["b", ""]]; }
        }
    ));
    addDefaultCommand(new Command(["qmarkd[el]", "qmd[el]"],
        function(args) { vimperator.quickmarks.remove(args); },
        {
            usage: ["qmarkd[el] {a-zA-Z0-9}"],
            short_help: "Remove a marked URL",
            help: "TODO.",
            completer: function(filter) { return [["a", ""], ["b", ""]]; }
        }
    ));
    addDefaultCommand(new Command(["qmarks", "qms"],
        function(args) { vimperator.quickmarks.list(args); },
        {
            short_help: "Show marked URLs",
            help: "TODO."
        }
    ));
    addDefaultCommand(new Command(["ve[rsion]"],
        function(args, special)
        {
            if (special)
                openURLs("about:");
            else
                vimperator.echo("Vimperator version: " + vimperator.version);
        },
        {
            usage: ["ve[rsion][!]"],
            short_help: "Show version information",
            help: "You can show the Firefox version page with <code class=\"command\">:version!</code>."
        }
    ));
    addDefaultCommand(new Command(["viu[sage]"],
        function(args, special, count, modifiers) { vimperator.help("mappings", special, null, modifiers); },
        {
            short_help: "Show help for normal mode commands"
        }
    ));
    addDefaultCommand(new Command(["wino[pen]", "w[open]", "wine[dit]"],
        function() { vimperator.echo("winopen not implemented yet"); },
        {
            usage: ["wino[pen] [url] [| url]"],
            short_help: "Open a URL in a new window",
            help: "Not implemented yet."
        }
    ));
    addDefaultCommand(new Command(["wqa[ll]", "wq", "xa[ll]"],
        function() { vimperator.quit(true); },
        {
            usage: ["wqa[ll]", "xa[ll]"],
            short_help: "Save the session and quit",
            help: "Quit Vimperator, no matter how many tabs/windows are open. The session is stored.<br/>" +
                  "<code class=\"command\">:wq</code> is different as in vim, as it closes the window instead of just one tab by popular demand. Complain on the mailing list, if you want to change that."
        }
    ));
    addDefaultCommand(new Command(["zo[om]"],
        zoom_to,
        {
            usage: ["zo[om] {value}"],
            short_help: "Set zoom value of the web page",
            help: "{value} can be between 25 and 500%. If it is omitted, zoom is reset to 100%."
        }
    ));
    //}}}
} //}}}

function execute_command(count, cmd, special, args, modifiers) //{{{
{
    if (!cmd)
        return;
    if (!modifiers)
        modifiers = {};

    var command = vimperator.commands.get(cmd);
    if (command === null)
    {
        vimperator.echoerr("E492: Not an editor command: " + cmd);
        vimperator.focusContent();
        return;
    }

    // TODO: need to perform this test? -- djk
    if (command.action === null)
    {
        vimperator.echoerr("E666: Internal error: command.action === null");
        return;
    }

    // valid command, call it:
    command.execute(args, special, count, modifiers);

} //}}}

/////////////////////////////////////////////////////////////////////}}}
// Ex command parsing and execution ////////////////////////////////////
/////////////////////////////////////////////////////////////////////{{{

// return [null, null, null, null, heredoc_tag || false];
//        [count, cmd, special, args] = match;
function tokenize_ex(string, tag)
{
    // removing comments
    string.replace(/\s*".*$/, '');
    if (tag) // we already have a multiline heredoc construct
    {
        if (string == tag)
            return [null, null, null, null, false];
        else
            return [null, null, null, string, tag];
    }

    // 0 - count, 1 - cmd, 2 - special, 3 - args, 4 - heredoc tag
    var matches = string.match(/^:*(\d+)?([a-zA-Z]+)(!)?(?:\s+(.*?)\s*)?$/);
    if (!matches)
        return [null, null, null, null, null];
    matches.shift();

    // parse count
    if (matches[0])
    {
        matches[0] = parseInt(matches[0]);
        if (isNaN(matches[0]))
            matches[0] = 0; // 0 is the default if no count given
    }
    else
        matches[0] = 0;

    matches[2] = !!matches[2];
    matches.push(null);
    if (matches[3])
    {
        tag = matches[3].match(/<<\s*(\w+)\s*$/);
        if (tag && tag[1])
            matches[4] = tag[1];
    }
    else
        matches[3] = '';

    return matches;
}


function execute(string)
{
    if (!string)
        return;

    var tokens = tokenize_ex(string.replace(/^'(.*)'$/, '$1'));
    tokens[4] = arguments[3];

    return execute_command.apply(this, tokens);
}

/////////////////////////////////////////////////////////////////////}}}
// url functions ///////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////{{{

function openURLs(str)
{
    var urls = stringToURLs(str);
    if (urls.length == 0)
        return false;

    getBrowser().loadURI(urls[0]);

    for (var url=1; url < urls.length; url++)
        getBrowser().addTab(urls[url]);

    return true;
}

function openURLsInNewTab(str, activate)
{
    var urls = stringToURLs(str);
    if (urls.length == 0)
        return null;

    var firsttab = getBrowser().addTab(urls[0]);
    if (activate)
        getBrowser().selectedTab = firsttab;
    for (var url = 1; url < urls.length; url++)
        gBrowser.addTab(urls[url]);

    return firsttab;
}

/* takes a string like 'google bla| www.osnews.com'
 * and returns an array ['www.google.com/search?q=bla', 'www.osnews.com']
 */
function stringToURLs(str)
{
    var urls = str.split(/\s*\,\s+/);
    begin: for (var url = 0; url < urls.length; url++)
    {
        // check for ./ and ../ (or even .../) to go to a file in the upper directory
        if (urls[url].match(/^(\.$|\.\/\S*)/))
        {
            var newLocation = getCurrentLocation();
            newLocation = newLocation.replace(/([\s\S]+\/)[^\/]*/, "$1");
            if (urls[url].match(/^\.(\/\S+)/))
                newLocation += urls[url].replace(/^\.(\/\S+)/, "$1");

            urls[url] = newLocation;
            continue;
        }
        else if (urls[url].match(/^(\.\.$|\.\.\/[\S]*)/))
        {
            var newLocation = getCurrentLocation();
            newLocation = newLocation.replace(/([\s\S]+\/)[^\/]*/, "$1/../");
            if (urls[url].match(/^\.\.(\/\S+)/))
                newLocation += urls[url].replace(/^\.\.\/(\S+)/, "$1");

            urls[url] = newLocation;
            continue;
        }
        else if (urls[url].match(/^(\.\.\.$|\.\.\.\/[\S]*)/))
        {
            var newLocation = getCurrentLocation();
            newLocation = newLocation.replace(/([\s\S]+):\/\/\/?(\S+?)\/\S*/, "$1://$2/");
            if (urls[url].match(/^\.\.\.(\/\S+)/))
                newLocation += urls[url].replace(/^\.\.\.\/(\S+)/, "$1");

            urls[url] = newLocation;
            continue;
        }

        /* if the string contains a space or does not contain any of: .:/
         * open it with default search engine */
        if (urls[url].match(/\s+/) || urls[url].match(/\.|:|\//) == null)
        {
            // check if the first word is a search engine
            var matches = urls[url].match(/^\s*(.*?)(\s+|$)(.*)/);
            var alias = null;
            var text = null;
            if (matches && matches[1])
                alias = matches[1];
            if (matches && matches[3] && matches[3].length >= 1)
                text = matches[3];

            var search_url = vimperator.bookmarks.getSearchURL(text, alias);
            if (search_url && search_url.length >= 1)
            {
                urls[url] = search_url;
                continue;
            }
            else // the first word was not a search engine, search for the whole string in the default engine
            {
                search_url = vimperator.bookmarks.getSearchURL(urls[url], null);
                if (search_url && search_url.length >= 1)
                {
                    urls[url] = search_url;
                    continue;
                }
            }
        }

        // if we are here let Firefox handle the url and hope it does
        // something useful with it :)
    }
    return urls;
}

/* returns true if the currently loaded URI is
 * a directory or false if it is a file
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

/////////////////////////////////////////////////////////////////////}}}
// frame related functions /////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////{{{

// TODO: allow callback for filtering out unwanted frames? User defined?
Vimperator.prototype.shiftFrameFocus = function(count, forward)
{
    try
    {
        var frames = [];

        // find all frames - depth-first search
        (function(frame)
        {
            if (frame.document.body.localName.toLowerCase() == "body")
                frames.push(frame);
            for (var i = 0; i < frame.frames.length; i++)
                arguments.callee(frame.frames[i])
        })(window.content);

        if (frames.length == 0) // currently top is always included
            return;

        // remove all unfocusable frames
        // TODO: find a better way to do this
        var start = document.commandDispatcher.focusedWindow;
        frames = frames.filter(function(frame) {
                frame.focus();
                if (document.commandDispatcher.focusedWindow == frame)
                    return frame;
        });
        start.focus();

        // find the currently focused frame index
        // TODO: If the window is a frameset then the first _frame_ should be
        //       focused.  Since this is not the current FF behaviour,
        //       we initalise current to -1 so the first call takes us to the
        //       first frame.
        var current = -1;
        for (var i = 0; i < frames.length; i++)
        {
            if (frames[i] == document.commandDispatcher.focusedWindow)
            {
                var current = i;
                break;
            }
        }

        // calculate the next frame to focus
        var next = current;
        if (forward)
        {
            if (count > 1)
                next = current + count;
            else
                next++;

            if (next > frames.length - 1)
                next = frames.length - 1;
        }
        else
        {
            if (count > 1)
                next = current - count;
            else
                next--;

            if (next < 0)
                next = 0;
        }

        // focus next frame and scroll into view
        frames[next].focus();
        if (frames[next] != window.content)
            frames[next].frameElement.scrollIntoView(false);

        // add the frame indicator
        var doc = frames[next].document;
        var indicator = doc.createElement("div");
        indicator.id = "vimperator-frame-indicator";
        // NOTE: need to set a high z-index - it's a crapshoot!
        var style = "background-color: red; opacity: 0.5; z-index: 999;" +
                    "position: fixed; top: 0; bottom: 0; left: 0; right: 0;";
        indicator.setAttribute("style", style);
        doc.body.appendChild(indicator);

        // remove the frame indicator
        setTimeout(function() { doc.body.removeChild(indicator); }, 500);
    }
    catch (e)
    {
        //vimperator.echoerr(e);
        // FIXME: fail silently here for now
    }
}

/////////////////////////////////////////////////////////////////////}}}
// location handling ///////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////{{{

function getCurrentLocation()
{
    return window.content.document.location.href;
}

/* returns the current title or null */
function getCurrentTitle()
{
    return window.content.document.title;
}


/////////////////////////////////////////////////////////////////////}}}
// scrolling ///////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////{{{

function scrollBufferRelative(right, down)
{
    var win = window.document.commandDispatcher.focusedWindow;
    //var win = window.content; // XXX: This would fix scrolling when the tab has focus, but breaks when it has frames --MST
    if (vimperator.input.count < 1)
        vimperator.input.count = 1;

    // beep if we can't go there
    if (down > 0)
    {
        if (win.scrollY == win.scrollMaxY) vimperator.beep();
    }
    else if (down < 0)
    {
        if (win.scrollY == 0) vimperator.beep();
    }

    if (right > 0)
    {
        if (win.scrollX == win.scrollMaxX) vimperator.beep();
    }
    else if (right < 0)
    {
        if (win.scrollX == 0) vimperator.beep();
    }

    win.scrollBy(vimperator.input.count * right * 20, vimperator.input.count * down * 20);
}

/* both values are given in percent, -1 means no change */
function scrollBufferAbsolute(horizontal, vertical)
{
    var win = document.commandDispatcher.focusedWindow;
    //var win = window.content;
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

/////////////////////////////////////////////////////////////////////}}}
// zooming /////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////{{{

/* also used to zoom out, when factor is negative */
function zoom_in(factor)
{
    if (vimperator.input.count < 1)
        vimperator.input.count = 1;

    //ZoomManager.prototype.getInstance().enlarge();
    var zoomMgr = ZoomManager.prototype.getInstance();
    if (zoomMgr.textZoom == 25 && factor < 0)
    {
        vimperator.echoerr("Minimum zoom level of 25% reached");
        vimperator.beep();
    }
    else if (zoomMgr.textZoom == 500 && factor > 0)
    {
        vimperator.echoerr("Maximum zoom level of 500% reached");
        vimperator.beep();
    }
    else
    {
        var value = zoomMgr.textZoom + factor*vimperator.input.count*25;
        if (value < 25) value = 25;
        if (value > 500) value = 500;

        zoomMgr.textZoom = value;

        vimperator.hints.reshowHints();

        vimperator.echo("Zoom value: " + value + "%");
    }
}

//Vimperator.prototype.zoom_to = function(value)
function zoom_to(value)
{
    var zoomMgr = ZoomManager.prototype.getInstance();
    value = parseInt(value);
    if (!value || isNaN(value) || value <= 0)
        value = 100;

    // convert to int, if string was given
    if (typeof value != "number")
    {
        oldval = value;
        value = parseInt(oldval, 10);
        if (isNaN(value))
        {
            vimperator.echoerr("Cannot convert " + oldval + " to a number");
            return;
        }
    }

    if (value < 25 || value > 500)
    {
        vimperator.echoerr("Zoom value must be between 25% and 500%");
        vimperator.beep();
        return;
    }

    zoomMgr.textZoom = value;

    vimperator.hints.reshowHints();

    vimperator.echo("Zoom value: " + value + "%");
}
//}}}

////////////////////////////////////////////////////////////////////////
// misc helper functions ////////////////////////////////////////////{{{
////////////////////////////////////////////////////////////////////////

function copyToClipboard(str)
{
    var clipboardHelper = Components.classes["@mozilla.org/widget/clipboardhelper;1"]
        .getService(Components.interfaces.nsIClipboardHelper);
    clipboardHelper.copyString(str);
}

// returns an XPathResult object
function evaluateXPath(expression, doc, ordered)
{
    if (!doc)
        doc = window.content.document;

    var res = doc.evaluate(expression, doc,
        function lookupNamespaceURI(prefix) {
          switch (prefix) {
            case 'xhtml':
              return 'http://www.w3.org/1999/xhtml';
            default:
              return null;
          }
        },
        ordered ? XPathResult.ORDERED_NODE_SNAPSHOT_TYPE : XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE,
        null
    );
    return res;
}

Vimperator.prototype.beep = function()
{
    if (!vimperator.options["beep"])
        return;

    var gBeepService = Components.classes['@mozilla.org/sound;1']
        .getService(Components.interfaces.nsISound);

    if (gBeepService)
        gBeepService.beep();
    else
        vimperator.echoerr('no beep service found');
}

// quit vimperator, no matter how many tabs/windows are open
Vimperator.prototype.quit = function(save_session)
{
    if (save_session)
        Options.setFirefoxPref("browser.startup.page", 3); // start with saved session
    else
        Options.setFirefoxPref("browser.startup.page", 1); // start with default homepage session

    goQuitApplication();
}

Vimperator.prototype.restart = function()
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

Vimperator.prototype.source = function(filename, silent)
{
    if (!filename)
        return;

    function getEnv(variable)
    {
            var environment = Components.classes["@mozilla.org/process/environment;1"]
                .getService(Components.interfaces.nsIEnvironment);
            return environment.get(variable);
    }

    // convert "~" to HOME on Windows
    if (navigator.platform == "Win32")
    {
        // TODO: proper pathname separator translation like Vim
        filename = filename.replace('/', '\\', 'g');
        var matches = filename.match(/^~(.*)/)
        if (matches)
        {
            var home_dir = getEnv("HOME");
            if (!home_dir)
                home_dir = getEnv("USERPROFILE");
            if (!home_dir)
            {
                // TODO: are these guaranteed to be set?
                home_dir = getEnv("HOMEDRIVE") + getEnv("HOMEPATH");
            }
            filename = home_dir + "\\" + matches[1];
        }
    }

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
        s.split('\n').forEach(function(line) {
            [prev_match, heredoc, end] = multiliner(line, prev_match, heredoc);
        });
    }
    catch (e)
    {
        if (!silent)
            vimperator.echoerr(e);
    }
}
//}}}

// vim: set fdm=marker sw=4 ts=4 et:
