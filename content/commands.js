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
//}}}

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


    // FIXME: doesn't really belong here...
    // return [null, null, null, null, heredoc_tag || false];
    //        [count, cmd, special, args] = match;
    this.parseCommand = function(string, tag)
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

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// DEFAULT COMMANDS ////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    addDefaultCommand(new Command(["addo[ns]"],
        function() { vimperator.open("chrome://mozapps/content/extensions/extensions.xul", vimperator.NEW_TAB); },
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
            usage: ["[count]ba[ck][!]"],
            short_help: "Go back in the browser history",
            help: "Count is supported, <code class=\"command\">:3back</code> goes back 3 pages in the browser history.<br/>" +
                  "The special version <code class=\"command\">:back!</code> goes to the beginning of the browser history."
        }
    ));
    addDefaultCommand(new Command(["bd[elete]", "bw[ipeout]", "bun[load]", "tabc[lose]"],
        function(args, special, count) { vimperator.tabs.remove(getBrowser().mCurrentTab, count, special, 0); },
        {
            usage: ["[count]bd[elete][!]"],
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
    addDefaultCommand(new Command(["bma[rk]"],
        // takes: -t "foo" myurl
        // converts that string to a useful url and title, and calls addBookmark
        function(args)
        {
            var result = Bookmarks.parseBookmarkString(args);

            if (result)
            {
                if (result.url == null)
                {
                    result.url = vimperator.buffer.URL;
                    // also guess title if the current url is :bmarked
                    if (result.title == null)
                        result.title = vimperator.buffer.title;
                }

                if (result.title == null) // title could still be null
                    result.title = result.url;

                vimperator.bookmarks.add(result.title, result.url);
                vimperator.echo("Bookmark `" + result.title + "' added with url `" + result.url + "'");
            }
            else
            {
                //vimperator.echo("Usage: :bmark [-t \"My Title\"] [-T tag1,tag2] <url>");
                vimperator.echoerr("E474: Invalid argument");
            }
        },
        {
            usage: ["bma[rk] [-t {title}] [url]"],
            short_help: "Add a bookmark",
            help: "If you don't add a custom title, either the title of the web page or the URL will be taken as the title.<br/>" +
                  "You can omit the optional <code class=\"argument\">[url]</code> argument, so just do <code class=\"command\">:bmark</code> to bookmark the currently loaded web page with a default title and without any tags.<br/>" +
                  " -t \"custom title\"<br/>" +
                  "The following options will be interpreted in the future:<br/>" +
                  " -T comma,separated,tag,list<br/>" +
                  " -k keyword<br/>" +
                  "Tags WILL be some mechanism to classify bookmarks. Assume, you tag a URL with the tags \"linux\" and \"computer\" you'll be able to search for bookmarks containing these tags."
        }
    ));
    addDefaultCommand(new Command(["bmarks"],
        function(args, special) { vimperator.bookmarks.list(args, special); },
        {
            usage: ["bmarks [filter]", "bmarks!"],
            short_help: "Show bookmarks",
            help: "Open the message window at the bottom of the screen with all bookmarks which match <code class=\"argument\">[filter]</code> either in the title or URL.<br/>" +
                  "The special version <code class=\"command\">:bmarks!</code> will open the default Firefox bookmarks window.<br/>" +
                  "The following options WILL be interpreted in the future:<br/>" +
                  " -T comma,separated,tag,list<br/>",
            completer: function(filter) { return vimperator.completion.get_bookmark_completions(filter); }
        }
    ));
    addDefaultCommand(new Command(["b[uffer]"],
        // TODO: move to v.tabs/buffers
        function(args, special)
        {
            var match;
            if (match = args.match(/^(\d+):?/))
                return vimperator.tabs.select(parseInt(match[1]) - 1, false); // make it zero-based

            var matches = [];
            var lower_args = args.toLowerCase();
            var first = vimperator.tabs.index() + 1;
            for (var i = 0; i < getBrowser().browsers.length; i++)
            {
                var index = (i + first) % getBrowser().browsers.length;
                var url = getBrowser().getBrowserAtIndex(index).contentDocument.location.href;
                var title = getBrowser().getBrowserAtIndex(index).contentDocument.title.toLowerCase();
                if (url == args)
                    return vimperator.tabs.select(index, false);

                if (url.indexOf(args) >= 0 || title.indexOf(lower_args) >= 0)
                    matches.push(index);
            }
            if (matches.length == 0)
                vimperator.echoerr("E94: No matching buffer for " + args);
            else if (matches.length > 1 && !special)
                vimperator.echoerr("E93: More than one match for " + args);
            else
                vimperator.tabs.select(matches[0], false);
        },
        {
            usage: ["b[uffer][!] {url|index}"],
            short_help: "Go to buffer from buffer list",
            help: "Argument can be either the buffer index or the full URL.<br/>" +
                  "If argument is neither a full URL nor an index but uniquely identifies a buffer, " +
                  "it is selected. With <code class=\"argument\">[!]</code> the next buffer matching the argument " +
                  "is selected, even if it cannot be identified uniquely.<br/>" +
                  "Use <code class=\"mapping\">b</code> as a shortcut to open this prompt.",
            completer: function(filter) { return vimperator.completion.get_buffer_completions(filter); }
        }
    ));
    addDefaultCommand(new Command(["buffers", "files", "ls", "tabs"],
        function(args, special) { vimperator.buffer.list(special); },
        {
            usage: ["buffers[!]"],
            short_help: "Show a list of all buffers (=tabs)",
            help: "The special version <code class=\"command\">:buffers!</code> opens the buffer list in a persistent preview window. " +
                  "Call the special version of this command again to close the window."
        }
    ));
    addDefaultCommand(new Command(["delbm[arks]"],
        function(args, special)
        {
            var result = Bookmarks.parseBookmarkString(args);

            if (result)
            {
                if (result.url == null)
                    result.url = vimperator.buffer.URL;

                var deleted_count = vimperator.bookmarks.remove(result.url);
                vimperator.echo(deleted_count + " bookmark(s) with url `" + result.url + "' deleted");
            }
            else
            {
                vimperator.echoerr("E488: Trailing characters");
            }
        },
        {
            usage: ["delbm[arks] {url}"],
            short_help: "Delete a bookmark",
            help: "Deletes <b>all</b> bookmarks which match the <code class=\"argument\">{url}</code>. Use <code>&lt;Tab&gt;</code> key on a string to complete the URL which you want to delete.<br/>" +
                  "The following options WILL be interpreted in the future:<br/>" +
                  " [!] a special version to delete ALL bookmarks <br/>" +
                  " -T comma,separated,tag,list <br/>",
            completer: function(filter) { return vimperator.completion.get_bookmark_completions(filter); }
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
            if (matches = args.match(/[a-zA-Z0-9]-[a-zA-Z0-9]/g))
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
            usage: ["delm[arks] {marks}", "delm[arks]!"],
            short_help: "Delete the specified marks",
            help: "Marks are presented as a list. Example:<br/>" +
                "<code class=\"command\">:delmarks Aa b p</code> will delete marks A, a, b and p<br/>" +
                "<code class=\"command\">:delmarks b-p</code> will delete all marks in the range b to p<br/>" +
                "<code class=\"command\">:delmarks!</code> will delete all marks for the current buffer"
        }

    ));
    addDefaultCommand(new Command(["delqm[arks]"],
        function(args, special)
        {
            // TODO: finish arg parsing - we really need a proper way to do this. :)
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

            if (special)
                vimperator.quickmarks.removeAll();
            else
                vimperator.quickmarks.remove(args);
        },
        {
            usage: ["delqm[arks] {marks}", "delqm[arks]!"],
            short_help: "Delete the specified QuickMarks",
            help: "QuickMarks are presented as a list. Example:<br/>" +
                "<code class=\"command\">:delqmarks Aa b p</code> will delete QuickMarks A, a, b and p<br/>" +
                "<code class=\"command\">:delqmarks b-p</code> will delete all QuickMarks in the range b to p<br/>" +
                "<code class=\"command\">:delqmarks!</code> will delete all QuickMarks"
        }
    ));
    addDefaultCommand(new Command(["downl[oads]", "dl"],
        function() { vimperator.open("chrome://mozapps/content/downloads/downloads.xul", vimperator.NEW_TAB); },
        {
            short_help: "Show progress of current downloads",
            help: "Open the original Firefox download dialog in a new tab.<br/>" +
                  "Here, downloads can be paused, canceled and resumed."
        }
    ));

    function argToString(arg, color)
    {
        if (!arg)
            return "";

        try
        {
            // TODO: move to vimperator.eval()?
            arg = eval(arg);
        }
        catch (e)
        {
            vimperator.echoerr(e.toString());
            return null;
        }

        if (typeof arg === "object")
            arg = vimperator.objectToString(arg, color);
        else if (typeof arg === "function")
            arg = vimperator.util.escapeHTML(arg.toString());
        else if (typeof arg === "number" || typeof arg === "boolean")
            arg = "" + arg;
        else if (typeof arg === "undefined")
            arg = "undefined";

        return arg;
    }
    addDefaultCommand(new Command(["ec[ho]"],
        function(args)
        {
            var res = argToString(args, true);
            if (res != null)
                vimperator.echo(res);
        },
        {
            usage: ["ec[ho] {expr}"],
            short_help: "Display a string at the bottom of the window",
            help: "Useful for showing informational messages. Multiple lines can be separated by \\n.<br/>" +
                  "<code class=\"argument\">{expr}</code> can either be a quoted string, or any expression which can be fed to eval() like 4+5. " +
                  "You can also view the source code of objects and functions if the return value of <code class=\"argument\">{expr}</code> is an object or function.",
            completer: function(filter) { return vimperator.completion.javascript(filter); }
        }
    ));
    addDefaultCommand(new Command(["echoe[rr]"],
        function(args)
        {
            var res = argToString(args, false);
            if (res != null)
                vimperator.echoerr(res);
        },
        {
            usage: ["echoe[rr] {expr}"],
            short_help: "Display an error string at the bottom of the window",
            help: "Just like <code class=\"command\">:ec[ho]</code>, but echoes the result highlighted in red. Useful for showing important messages.",
            completer: function(filter) { return vimperator.completion.javascript(filter); }
        }
    ));
    addDefaultCommand(new Command(["exe[cute]"],
        function(args) { vimperator.execute(args) },
        {
            usage: ["exe[cute] {expr1} [ ... ]"],
            short_help: "Execute the string that results from the evaluation of {expr1} as an Ex command.",
            help: "<code class=\"command\">:execute echo test</code> would show a message with the text &#34;test&#34;.<br/>"
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
            usage: ["[count]fo[rward][!]"],
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
            help: "You can jump to the specified <code class=\"argument\">{subject}</code> with <code class=\"command\">:help {subject}</code>.<br/>" +
                  "Make sure you use the full vim notation when jumping to <code class=\"argument\">{subject}</code>. This means:<br/>" +
                  "<ul>" +
                  "<li><code class=\"command\">:help :help</code> for commands (: prefix)</li>" +
                  "<li><code class=\"command\">:help 'complete'</code> for options (surrounded by ' and ')</li>" +
                  "<li><code class=\"command\">:help o</code> for mappings (no pre- or postfix)</li>" +
                  "</ul>" +
                  "You can however use partial stings in the tab completion, so <code class=\"command\">:help he&lt;Tab&gt;</code> will complete <code class=\"command\">:help :help</code>.",
            completer: function(filter) { return vimperator.completion.get_help_completions(filter); }
        }
    ));
    addDefaultCommand(new Command(["hist[ory]", "hs"],
        function(args, special) { vimperator.history.list(args, special); },
        {
            usage: ["hist[ory] [filter]", "history!"],
            short_help: "Show recently visited URLs",
            help: "Open the message window at the bottom of the screen with all history items which match <code class=\"argument\">[filter]</code> either in the title or URL.<br/>" +
                  "The special version <code class=\"command\">:history!</code> will open the default Firefox history window.",
            completer: function(filter) { return vimperator.completion.get_history_completions(filter); }
        }
    ));
    addDefaultCommand(new Command(["javas[cript]", "js"],
        function(args, special)
        {
            if (special) // open javascript console
                vimperator.open("chrome://global/content/console.xul", vimperator.NEW_TAB);
            else
            {
                // check for a heredoc
                var matches = args.match(/(.*)<<\s*([^\s]+)$/);
                if (matches && matches[2])
                {
                    vimperator.commandline.inputMultiline(new RegExp("^" + matches[2] + "$", "m"),
                        function(code) {
                            try
                            {
                                eval(matches[1] + "\n" + code);
                            }
                            catch (e)
                            {
                                vimperator.echoerr(e.name + ": " + e.message);
                            }
                        });
                }
                else // single line javascript code
                {
                    try
                    {
                        eval(args);
                    }
                    catch (e)
                    {
                        vimperator.echoerr(e.name + ": " + e.message);
                    }
                }
            }
        },
        {
            usage: ["javas[cript] {cmd}", "javascript <<{endpattern}\\n{script}\\n{endpattern}", "javascript[!]"], // \\n is changed to <br/> in the help.js code
            short_help: "Run any JavaScript command through eval()",
            help: "Acts as a JavaScript interpreter by passing the argument to <code>eval()</code>.<br/>" +
                  "<code class=\"command\">:javascript alert('Hello world')</code> would show a dialog box with the text \"Hello world\".<br/>" +
                  "<code class=\"command\">:javascript &lt;&lt;EOF</code> would read all the lines until a line starting with 'EOF' is found, and will <code>eval()</code> them.<br/>" +
                  "The special version <code class=\"command\">:javascript!</code> will open the JavaScript console of Firefox.<br/>" +
                  "Rudimentary <code class=\"mapping\">&lt;Tab&gt;</code> completion is available for <code class=\"command\">:javascript {cmd}&lt;Tab&gt;</code> (but not yet for the " +
                  "<code class=\"command\">:js &lt;&lt;EOF</code> multiline widget). Be aware that Vimperator needs to run {cmd} through eval() " +
                  "to get the completions, which could have unwanted side effects.",
            completer: function(filter) { return vimperator.completion.javascript(filter); }
        }
    ));
    addDefaultCommand(new Command(["let"],
        function(args)
        {
            if (!args)
            {
                var str = "";
                for (var i in vimperator.globalVariables)
                {
                    var value = vimperator.globalVariables[i];
                    if (typeof value == "number")
                        var prefix = "#";
                    else if (typeof value == "function")
                        var prefix = "*";
                    else
                        var prefix = "";

                    str += "<tr><td style=\"width: 200px;\">" + i + "</td><td>" + prefix + value + "</td>\n";
                }
                if (str)
                    vimperator.echo("<table>" + str + "</table>", true);
                else
                    vimperator.echo("No variables found");
                return;
            }

            var match;
            // 1 - type, 2 - name, 3 - +-., 4 - expr
            if (match = args.match(/([$@&])?([\w:]+)\s*([+-.])?=\s*(.+)/))
            {
                if (!match[1])
                {
                    var reference = vimperator.variableReference(match[2]);
                    if (!reference[0] && match[3])
                        return vimperator.echoerr("E121: Undefined variable: " + match[2]);

                    var expr = vimperator.eval(match[4]);
                    if (typeof expr === undefined)
                        return vimperator.echoerr("E15: Invalid expression: " + match[4]);
                    else
                    {
                        if (!reference[0]) {
                            if (reference[2] == 'g')
                                reference[0] = vimperator.globalVariables;
                            else
                                return; // for now
                        }

                        if (match[3])
                        {
                            if (match[3] == '+')
                                reference[0][reference[1]] += expr;
                            else if (match[3] == '-')
                                reference[0][reference[1]] -= expr;
                            else if (match[3] == '.')
                                reference[0][reference[1]] += expr.toString();
                        }
                        else
                            reference[0][reference[1]] = expr;
                    }
                }
            }
            // 1 - name
            else if (match = args.match(/^\s*([\w:]+)\s*$/))
            {
                var reference = vimperator.variableReference(match[1]);
                if (!reference[0])
                    return vimperator.echoerr("E121: Undefined variable: " + match[1]);

                var value = reference[0][reference[1]];
                if (typeof value == 'number')
                    var prefix = '#';
                else if (typeof value == 'function')
                    var prefix = '*';
                else
                    var prefix = '';
                vimperator.echo(reference[1] + '\t\t' + prefix + value);
            }
        },
        {
            usage: ["let {var-name} [+-.]= {expr1}", "let {var-name}", "let"],
            short_help: "Sets or lists a variable",
            help: "Sets the variable <code class=\"argument\">{var-name}</code> " +
                  "to the value of the expression <code class=\"argument\">{expr1}</code>." +
                  "If no expression is given, the value of the variable is displayed." +
                  "Without arguments, displays a list of all variables."
        }
    ));
    addDefaultCommand(new Command(["map"],
        // 0 args -> list all maps
        // 1 arg  -> list the maps starting with args
        // 2 args -> map arg1 to arg*
        function(args)
        {
            if (!args)
            {
                vimperator.mappings.list(vimperator.modes.NORMAL);
                return;
            }

            var matches = args.match(/^([^\s]+)(?:\s+(.+))?$/)
            var [lhs, rhs] = [matches[1], matches[2]];
            var leader_reg = new RegExp('<Leader>', 'i');

            if (leader_reg.test(lhs))
            {
                var leader_ref = vimperator.variableReference('mapleader');
                var leader = leader_ref[0] ? leader_ref[0][leader_ref[1]] : '\\';

                lhs = lhs.replace(leader_reg, leader);
            }

            if (rhs)
            {
                vimperator.mappings.add(new Map(vimperator.modes.NORMAL, [lhs],
                    function() { vimperator.events.feedkeys(rhs); }, { rhs: rhs }
                ));
            }
            else
            {
                // FIXME: no filtering for now
                vimperator.mappings.list(vimperator.modes.NORMAL, lhs);
            }
        },
        {
            usage: ["map {lhs} {rhs}", "map {lhs}", "map"],
            short_help: "Map the key sequence {lhs} to {rhs}",
            help: "The <code class=\"argument\">{rhs}</code> is remapped, allowing for nested and recursive mappings.<br/>" +
                  "Mappings are NOT saved during sessions, make sure you put them in your vimperatorrc file!"
        }
    ));
    addDefaultCommand(new Command(["mapc[lear]"],
        function(args)
        {
            if (args)
            {
                vimperator.echoerr("E474: Invalid argument");
                return;
            }

            vimperator.mappings.removeAll(vimperator.modes.NORMAL);
        },
        {
            short_help: "Remove all mappings",
            help: "All user-defined mappings which were set by " +
                  "<code class=\"command\">:map</code> or <code class=\"command\">:noremap</code> are cleared."
        }
    ));
    addDefaultCommand(new Command(["ma[rk]"],
        function(args)
        {
            if (!args)
            {
                vimperator.echoerr("E471: Argument required");
                return;
            }
            if (args.length > 1)
            {
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
            usage: ["ma[rk] {a-zA-Z}"],
            short_help: "Mark current location within the web page"
        }
    ));
    addDefaultCommand(new Command(["marks"],
        function(args)
        {
            // ignore invalid mark characters unless there are no valid mark chars
            if (args && !/[a-zA-Z]/.test(args))
            {
                vimperator.echoerr("E283: No marks matching \"" + args + "\"");
                return;
            }

            var filter = args.replace(/[^a-zA-Z]/g, '');
            vimperator.marks.list(filter)
        },
        {
            usage: ["marks [arg]"],
            short_help: "Show all location marks of current web page",
            help: "If <code class=\"argument\">[arg]</code> is specified then limit the list to those marks mentioned."
        }
    ));
    addDefaultCommand(new Command(["noh[lsearch]"],
        function(args)
        {
            vimperator.search.clear();
        },
        {
            short_help: "Remove the search highlighting",
            help: "The document highlighting is turned back on when another search command is used or the " +
                  "<code class=\"option\">'hlsearch'</code> option is set."
        }
    ));
    addDefaultCommand(new Command(["norm[al]"],
        function(args)
        {
            if (!args)
            {
                vimperator.echoerr("E471: Argument required");
                return;
            }

            vimperator.events.feedkeys(args);
        },
        {
            usage: ["norm[al][!] {commands}"],
            short_help: "Execute Normal mode commands",
            help: "<code class=\"command\">:normal 20j</code> would scroll 20 lines down."
        }
    ));
    // TODO: remove duplication in :map
    addDefaultCommand(new Command(["no[remap]"],
        // 0 args -> list all maps
        // 1 arg  -> list the maps starting with args
        // 2 args -> map arg1 to arg*
        function(args)
        {
            if (!args)
            {
                vimperator.mappings.list(vimperator.modes.NORMAL);
                return;
            }

            var matches = args.match(/^([^ ]+)(?:\s+(.+))?$/);
            var [lhs, rhs] = [matches[1], matches[2]];

            if (rhs)
            {
                if (/^:/.test(rhs))
                {
                    vimperator.mappings.add(
                        new Map(vimperator.modes.NORMAL, [lhs], function() { vimperator.execute(rhs); }, { rhs: rhs })
                    );
                }
                else
                {
                    // NOTE: we currently only allow one normal mode command in {rhs}
                    var map = vimperator.mappings.getDefaultMap(vimperator.modes.NORMAL, rhs);

                    // create a new Map for {lhs} with the same action as
                    // {rhs}...until we have feedkeys().
                    // NOTE: Currently only really intended for static use (e.g.
                    // from the RC file) since {rhs} is evaluated when the map
                    // is created not at runtime
                    if (map)
                        vimperator.mappings.add(
                            new Map(vimperator.modes.NORMAL, [lhs], map.action, { flags: map.flags, rhs: rhs })
                        );
                    else
                        vimperator.echoerr("E475: Invalid argument: " + "{rhs} must be a existing singular mapping");
                }
            }
            else
            {
                // FIXME: no filtering for now
                vimperator.mappings.list(vimperator.modes.NORMAL, lhs);
            }
        },
        {
            usage: ["no[remap] {lhs} {rhs}", "no[remap] {lhs}", "no[remap]"],
            short_help: "Map the key sequence {lhs} to {rhs}",
            help: "No remapping of the <code class=\"argument\">{rhs}</code> is performed.<br/>NOTE: :noremap does not yet work as reliably as :map."
        }
    ));
    addDefaultCommand(new Command(["o[pen]", "e[dit]"],
        function(args, special)
        {
            if (args)
            {
                vimperator.open(args);
            }
            else
            {
                if (special)
                    BrowserReloadSkipCache();
                else
                    BrowserReload();
            }
        },
        {
            usage: ["o[pen] [url] [, url]"],
            short_help: "Open one or more URLs in the current tab",
            help: "Multiple URLs can be separated with \", \". Note that the space after the comma is required.<br/>" +
                  "Each token is analyzed and in this order:<br/>" +
                  "<ol>" +
                  "<li>Transformed to a relative URL of the current location if it starts with . or .. or ...;<br/>" +
                  "... is special and moves up the directory hierarchy as far as possible." +
                  "<ul><li><code class=\"command\">:open ...</code> with current location <code>\"http://www.example.com/dir1/dir2/file.html\"</code> will open <code>\"http://www.example.com\"</code></li>" +
                  "<li><code class=\"command\">:open ./foo.html</code> with current location <code>\"http://www.example.com/dir1/dir2/file.html\"</code> will open <code>\"http://www.example.com/dir1/dir2/foo.html\"</code></li></ul></li>" +
                  "<li>Opened with the specified search engine if the token looks like a search string " +
                  "and the first word is the name of a search engine (<code class=\"command\">:open wikipedia linus torvalds</code> " +
                  "will open the wikipedia entry for linus torvalds). The short name of a search engine is automatically guessed from its name. " +
                  "If you want to set a custom name, open the $FIREFOX_PROFILE/searchplugins/*.xml file of the search engine, and add/change " +
                  "&lt;Alias&gt;myalias&lt;/Alias&gt;</li>" +
                  "<li>Opened with the default search engine or keyword (specified with the <code class=\"option\">'defsearch'</code> option) " +
                  "if the first word is no search engine (<code class=\"command\">:open linus torvalds</code> will open a Google search for linux torvalds).</li>" +
                  "<li>Passed directly to Firefox in all other cases (<code class=\"command\">:open www.osnews.com, www.slashdot.org</code> will " +
                  "open OSNews in the current, and Slashdot in a new background tab).</li>" +
                  "</ol>" +
                  "You WILL be able to use <code class=\"command\">:open [-T \"linux\"] torvalds&lt;Tab&gt;</code> to complete bookmarks " +
                  "with tag \"linux\" and which contain \"torvalds\". Note that -T support is only available for tab completion, not for the actual command.<br/>" +
                  "The items which are completed on <code class=\"mapping\">&lt;Tab&gt;</code> are specified in the <code class=\"option\">'complete'</code> option.<br/>" +
                  "Without argument, reloads the current page.<br/>" +
                  "Without argument but with <code class=\"command\">!</code>, reloads the current page skipping the cache.",
            completer: function(filter) { return vimperator.completion.get_url_completions(filter); }
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
    addDefaultCommand(new Command(["qma[rk]"],
        function(args)
        {
            if (!args)
            {
                vimperator.echoerr("E471: Argument required");
                return;
            }

            var matches1 = args.match(/([a-zA-Z0-9])\s+(.+)/);
            var matches2 = args.match(/([a-zA-Z0-9])\s*$/);

            if (matches1 && matches1[1])
                vimperator.quickmarks.add(matches1[1], matches1[2]);
            else if (matches2 && matches2)
                vimperator.quickmarks.add(matches2[1], vimperator.buffer.URL);
            else
                vimperator.echoerr("E488: Trailing characters");
        },
        {
            usage: ["qma[rk] {a-zA-Z0-9} [url]"],
            short_help: "Mark a URL with a letter for quick access",
            help: "You can also mark whole groups like this: <br/>"+
                  "<code class=\"command\">:qmark f http://forum1.com, http://forum2.com, imdb some artist</code>"
        }
    ));
    addDefaultCommand(new Command(["qmarks"],
        function(args)
        {
            // ignore invalid mark characters unless there are no valid mark chars
            if (args && !/[a-zA-Z0-9]/.test(args))
            {
                vimperator.echoerr("E283: No QuickMarks matching \"" + args + "\"");
                return;
            }

            var filter = args.replace(/[^a-zA-Z0-9]/g, '');
            vimperator.quickmarks.list(filter);
        },
        {
            usage: ["qmarks [arg]"],
            short_help: "Show all QuickMarks",
            help: "If <code class=\"argument\">[arg]</code> is specified then limit the list to those QuickMarks mentioned."
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
    addDefaultCommand(new Command(["sav[eas]", "w[rite]"],
        function() { saveDocument(window.content.document); },
        {
            short_help: "Save current web page to disk",
            help: "Opens the original Firefox \"Save page as...\" dialog.<br/>" +
                  "There, you can save the current web page to disk with various options."
        }
    ));
    addDefaultCommand(new Command(["se[t]"],
        function(args, special, count, modifiers)
        {
            if (!args)
            {
                // TODO: copy these snippets to more function which should work with :tab xxx
                var where = vimperator.CURRENT_TAB;
                if (arguments[3] && arguments[3].inTab)
                    where = vimperator.NEW_TAB;

                if (special) // open firefox settings gui dialog
                    vimperator.open("chrome://browser/content/preferences/preferences.xul", where);
                else
                    vimperator.open("about:config", where);
            }
            else
            {
                //                               1        2       3    4  5      6
                var matches = args.match(/^\s*(no|inv)?([a-z_]+)([?&!])?(([+-])?=(.*))?/);
                if (!matches)
                {
                    vimperator.echoerr("E518: Unknown option: " + args);
                    return;
                }

                var no = false;
                if (matches[1] == "no")
                    no = true;

                var opt = matches[2];

                var all = false;
                if (opt == "all")
                    all = true;

                var option = vimperator.options.get(opt);
                if (!option && !all)
                {
                    vimperator.echoerr("E518: Unknown option: " + opt);
                    return;
                }

                var get = false;
                if (all || matches[3] == "?" || (option.type != "boolean" && matches[4] === undefined))
                    get = true;

                var reset = false;
                if (matches[3] == "&")
                    reset = true;

                var invert = false;
                if (matches[1] == "inv" || matches[3] == "!")
                    invert = true;

                var oper = matches[5];

                var val = matches[6];
                if (val === undefined)
                    val = "";

                // reset a variable to its default value
                // TODO: remove the value from about:config instead of setting it to the current default value
                if (reset)
                {
                    if (all)
                    {
                        for (let opt in vimperator.options)
                            opt.value = opt.default_value;
                    }
                    else
                    {
                        option.value = option.default_value;
                    }
                }
                // read access
                else if (get)
                {
                    if (all)
                    {
                        vimperator.options.list();
                    }
                    else
                    {
                        if (option.type == "boolean")
                            vimperator.echo((option.value ? "  " : "no") + option.name);
                        else
                            vimperator.echo("  " + option.name + "=" + option.value);
                    }
                }
                // write access
                else
                {
                    var type = option.type;
                    if (type == "boolean")
                    {
                        if (matches[4])
                            vimperator.echoerr("E474: Invalid argument: " + option.name + "=" + val);
                        else if (invert)
                            option.value = !option.value;
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
                                vimperator.echoerr("E474: Invalid argument: " + option.name + "=" + val); // FIXME: need to be able to specify unique parse error messages
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
            usage: ["se[t][!]", "se[t] {option}?", "se[t] [no]{option}", "se[t] {option}[+-]={value}", "se[t] {option}! | inv{option}", "se[t] {option}&"],
            short_help: "Set an option",
            help: "Permanently change an option. In contrast to Vim options are stored throughout sessions.<br/>" +
                  "<code class=\"command\">:set</code> without an argument opens <code>about:config</code> in a new tab to change advanced Firefox options.<br/>" +
                  "<code class=\"command\">:set!</code> opens the GUI preference panel from Firefox in a new tab.<br/>" +
                  "There are three types of options: boolean, number and string. " +
                  "Boolean options must be set with <code class=\"command\">:set option</code> and <code class=\"command\">:set nooption</code>. " +
                  "Number and string option types must be set with <code class=\"command\">:set option={value}</code>.<br/>" +
                  "<code class=\"command\">:set option!</code> and <code class=\"command\">:set invoption</code> invert the value of a boolean option.<br/>" +
                  "<code class=\"command\">:set option?</code> or <code class=\"command\">:set option</code>(for string and list options) shows the current value of an option.<br/>" +
                  "<code class=\"command\">:set option&amp;</code> resets an option to its default value.<br/>" +
                  "<code class=\"command\">:set option+={value}</code> and <code class=\"command\">:set option-={value}</code> will add/subtract {value} to a number option and append/remove {value} to a string option.<br/>" +
                  "<code class=\"command\">:set all</code> will show the current value of all options and <code class=\"command\">:set all&amp;</code> will reset all options to their default values.<br/>",
            completer: function(filter) { return vimperator.completion.get_options_completions(filter); }
        }
    ));
    // TODO: sclose instead?
    addDefaultCommand(new Command(["sbcl[ose]"],
        function(args)
        {
            if (args)
            {
                vimperator.echoerr("E488: Trailing characters");
                return;
            }

            if (document.getElementById("sidebar-box").hidden == false)
                toggleSidebar();
        },
        {
            short_help: "Close the sidebar"
        }
    ));
    // TODO: sopen instead? Separate :sidebar from :sbopen and make them behave
    // more like :cw, :cope etc
    addDefaultCommand(new Command(["sideb[ar]", "sb[ar]", "sbope[n]"],
        function(args)
        {
            if (!args)
            {
                vimperator.echoerr("E471: Argument required");
                return;
            }

            // do nothing if the requested sidebar is already open
            if (document.getElementById("sidebar-title").value == args)
                return;
            
            var menu = document.getElementById("viewSidebarMenu")

            for (var i = 0; i < menu.childNodes.length; i++)
            {
                if (menu.childNodes[i].label == args)
                {
                    eval(menu.childNodes[i].getAttribute('oncommand'))
                    break;
                }
            }
        },
        {
            usage: ["sidebar {name}"],
            short_help: "Open the sidebar window",
            help: "<code class=\"argument\">{name}</code> is any of the menu items listed under the standard Firefox View->Sidebar " +
                  "menu. Add-ons, Preferences and Downloads are also available in the sidebar.",
            completer: function(filter) { return vimperator.completion.get_sidebar_completions(filter); }
        }
    ));
    addDefaultCommand(new Command(["so[urce]"],
        function(args)
        {
            // FIXME: implement proper filename quoting
            //if (/[^\\]\s/.test(args))
            //{
            //    vimperator.echoerr("E172: Only one file name allowed");
            //    return;
            //}

            vimperator.source(args);
        },
        {
            usage: ["so[urce][!] {file}"],
            short_help: "Read Ex commands from {file}",
            help: "You can either source files which mostly contain Ex commands like <code class=\"command\">map &lt; gt</code> " +
                  "and put JavaScript code within a:<br/><code class=\"code\">" +
                  "js &lt;&lt;EOF<br/>hello = function() {<br/>&nbsp;&nbsp;alert(\"Hello world\");<br/>}<br/>EOF<br/></code> section.<br/>" +
                  "Or you can alternatively source a file which ends in .js, these files are automatically sourced as pure JavaScript files.<br/>" +
                  "NOTE: In both cases you must add functions to the global window object like shown above, functions written as:<br/>" +
                  "<code class=\"code\">function hello2() {<br/>&nbsp;&nbsp;alert(\"Hello world\");<br/>}<br/></code>are only available within the scope of the script. <br/><br/>" +
                  "The .vimperatorrc file in your home directory and any files in ~/.vimperator/plugin/ are always sourced at startup.<br/>" +
                  "~ is supported as a shortcut for the $HOME directory.<br/>" +
                  "If <code class=\"command\">!</code> is specified, errors are not printed.",
            completer: function(filter) { return vimperator.completion.get_file_completions(filter); }
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
        function(args) { vimperator.execute(args, { inTab: true }); },
        {
            usage: ["tab {cmd}"],
            short_help: "Execute {cmd} and tell it to output in a new tab",
            help: "Works only for commands that support it.<br/>" +
                  "Example: <code class=\"command\">:tab help tab</code> opens the help in a new tab.",
            completer: function(filter) { return vimperator.completion.get_command_completions(filter); }
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
            usage: ["tabm[ove] [N]", "tabm[ove][!] +N | -N"],
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
            var where = special ? vimperator.NEW_TAB : vimperator.NEW_BACKGROUND_TAB;
            if (/\btabopen\b/.test(vimperator.options["activate"]))
                where = special ? vimperator.NEW_BACKGROUND_TAB : vimperator.NEW_TAB;

            if (args)
                vimperator.open(args, where);
            else
                vimperator.open("about:blank", where);
        },
        {
            usage: ["tabopen [url] [, url]"],
            short_help: "Open one or more URLs in a new tab",
            help: "Like <code class=\"command\">:open</code> but open URLs in a new tab.<br/>" +
                  "If used with <code class=\"command\">!</code>, the 'tabopen' value of the <code class=\"option\">'activate'</code> option is negated.",
            completer: function(filter) { return vimperator.completion.get_url_completions(filter); }
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
    addDefaultCommand(new Command(["time"],
        function(args, special, count)
        {
            if (!count || count < 1)
                count = 1;

            try
            {
                if (count > 1)
                {
                    var i = count;
                    var before_time = Date.now();

                    if (args && args[0] == ":")
                        while (i--)
                            vimperator.execute(args);
                    else
                        while (i--)
                            eval(args);

                    if (special)
                        return;

                    var after_time = Date.now();
                
                    if ((after_time - before_time) / count >= 100)
                        var each = "<td>  Each time:</td><td align=\"right\"><span style=\"color: green\">" +
                            ((after_time - before_time) / 1000.0 / count) +
                            "</span></td><td>sec</td>";
                    else
                        var each = "<td>  Each time:</td><td align=\"right\"><span style=\"color: green\">" +
                            ((after_time - before_time) / count) +
                            "</span></td><td>msec</td>";

                    if (after_time - before_time >= 100)
                        var total = "<td>  Total time:</td><td align=\"right\"><span style=\"color: red\">" +
                            ((after_time - before_time) / 1000.0) +
                            "</span></td><td>sec</td>";
                    else
                        var total = "<td>  Total time:</td><td align=\"right\"><span style=\"color: red\">" +
                            (after_time - before_time) + "</span></td><td>msec</td>";

                    var str = ":" + vimperator.util.escapeHTML(vimperator.commandline.getCommand()) + "<br/>" +
                              "<table>" +
                              "<tr align=\"left\" class=\"hl-Title\"><th colspan=\"3\">Code execution summary</th></tr>" +
                              "<tr><td>  Executed:</td><td align=\"right\"><span style=\"color: green\">" + count + "</span></td><td>times</td></tr>" +
                              "<tr>" + each + "</tr>" +
                              "<tr>" + total + "</tr>"
                              "</table>";

                    vimperator.commandline.echo(str, vimperator.commandline.HL_NORMAL, true);
                }
                else
                {
                    var before_time = Date.now();
                    if (args && args[0] == ":")
                        vimperator.execute(args);
                    else
                        eval(args);

                    if (special)
                        return;

                    var after_time = Date.now();
                    
                    if (after_time - before_time >= 100)
                        vimperator.echo("Total time: " + ((after_time - before_time) / 1000.0) + " sec");
                    else
                        vimperator.echo("Total time: " + (after_time - before_time) + " msec");
                }
            }
            catch (e)
            {
                vimperator.echoerr(e);
            }
        },
        {
            usage: ["{count}time[!] {code|:command}"],
            short_help: "Profile a piece of code or a command",
            help: "Runs <code class=\"argument\">{code} {count}</code> times (default 1) and returns the elapsed time. " +
                  "<code class=\"argument\">{code}</code> is always passed to JavaScript's eval(), which might be slow, so take the results with a grain of salt.<br/>" +
                  "If <code class=\"argument\">{code}</code> starts with a :, it is executed as a vimperator command.<br/>" +
                  "Use the special version with [!] if you just want to run any command multiple times without showing profiling statistics."
        }
    ));
    addDefaultCommand(new Command(["u[ndo]"],
        function(args, special, count) { if (count < 1) count = 1; undoCloseTab(count-1); },
        {
            usage: ["[count]u[ndo]"],
            short_help: "Undo closing of a tab",
            help: "If a count is given, don't close the last but the <code class=\"argument\">[count]</code>th last tab."
        }
    ));
    addDefaultCommand(new Command(["unl[et]"],
        function(args, special)
        {
            if (!args)
                return vimperator.echoerr("E471: Argument required");

            var names = args.split(/ /);
            if (typeof names == 'string') names = [names];
            var length = names.length;
            for (var i = 0, name = names[i]; i < length; name = names[++i])
            {
                var reference = vimperator.variableReference(name);
                if (!reference[0])
                {
                    if (!special)
                        vimperator.echoerr("E108: No such variable: " + name);
                    return;
                }

                delete reference[0][reference[1]];
            }
        },
        {
            usage: ["unl[et][!] {name} ..."],
            short_help: "Deletes a variable.",
            help: "Deletes the variable <code class=\"argument\">{name}</code>." +
                  "Several variable names can be given."
        }
    ));
    addDefaultCommand(new Command(["unm[ap]"],
        function(args)
        {
            if (!args)
            {
                vimperator.echoerr("E474: Invalid argument");
                return;
            }

            var lhs = args;

            if (vimperator.mappings.hasMap(vimperator.modes.NORMAL, lhs))
                vimperator.mappings.remove(vimperator.modes.NORMAL, lhs);
            else
                vimperator.echoerr("E31: No such mapping");
        },
        {
            usage: ["unm[ap] {lhs}"],
            short_help: "Remove the mapping of {lhs}",
            help: ""
        }
    ));
    addDefaultCommand(new Command(["ve[rsion]"],
        function(args, special)
        {
            if (special)
                vimperator.open("about:");
            else
                vimperator.echo("Vimperator " + vimperator.version);
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
    addDefaultCommand(new Command(["wino[pen]", "wo[pen]", "wine[dit]"],
        function(args)
        {
            if (args)
                vimperator.open(args, vimperator.NEW_WINDOW);
            else
                vimperator.open("about:blank", vimperator.NEW_WINDOW);
        },
        {
            usage: ["wino[pen] [url] [, url]"],
            short_help: "Open one or more URLs in a new window",
            help: "NOTE: Multiple windows are not really supported by Vimperator, use at your own risk!"
        }
    ));
    addDefaultCommand(new Command(["wqa[ll]", "wq", "xa[ll]"],
        function() { vimperator.quit(true); },
        {
            usage: ["wqa[ll]", "xa[ll]"],
            short_help: "Save the session and quit",
            help: "Quit Vimperator, no matter how many tabs/windows are open. The session is stored.<br/>" +
                  "<code class=\"command\">:wq</code> is different as in Vim, as it closes the window instead of just one tab by popular demand. Complain on the mailing list, if you want to change that."
        }
    ));
    addDefaultCommand(new Command(["zo[om]"],
        function(args)
        {
            var level;

            if (!args)
            {
                level = 100;
            }
            else if (/^\d+$/.test(args))
            {
                level = parseInt(args);
            }
            else if (/^[+-]\d+$/.test(args))
            {
                level = vimperator.buffer.textZoom + parseInt(args);

                // relative args shouldn't take us out of range
                if (level < 1)
                    level = 1;
                if (level > 2000)
                    level = 2000;
            }
            else
            {
                vimperator.echoerr("E488: Trailing characters");
                return;
            }

            vimperator.buffer.textZoom = level;
        },
        {
            usage: ["zo[om] [value]", "zo[om] +{value} | -{value}"],
            short_help: "Set zoom value of the web page",
            help: "If <code class=\"argument\">{value}</code> can be an absolute value between 1 and 2000% or a relative value if prefixed with - or +. " +
                  "If <code class=\"argument\">{value}</code> is omitted, zoom is reset to 100%."
        }
    ));
    //}}}
} //}}}

// takes a string like 'google bla, www.osnews.com'
// and returns an array ['www.google.com/search?q=bla', 'www.osnews.com']
String.prototype.toURLArray = function() // {{{
{
    var urls = this.split(/\s*\,\s+/);

    begin: for (var url = 0; url < urls.length; url++)
    {
        var new_url = vimperator.buffer.URL;
        var matches;

        // strip each 'URL' - makes things simpler later on
        urls[url] = urls[url].replace(/^\s+/, '').replace(/\s+$/, '');

        // FIXME: not really that good (doesn't handle .. in the middle)
        // check for ./ and ../ (or even .../) to go to a file in the upper directory
        if (matches = urls[url].match(/^(?:\.$|\.\/(\S*))/))
        {
            var tail = matches[1] ? matches[1] : "";
            urls[url] = new_url.replace(/(.+\/)[^\/]*/, "$1" + tail);  // NOTE: escape / in character sets so as not to break Vim syntax highlighting
            continue;
        }
        else if (matches = urls[url].match(/^(?:\.\.$|\.\.\/(\S*))/))
        {
            var tail = matches[1] ? matches[1] : "";
            urls[url] = new_url.replace(/(.+\/)[^\/]*/, "$1../" + tail);
            continue;
        }
        else if (matches = urls[url].match(/^(?:\.\.\.$|\.\.\.\/(\S*))/))
        {
            var location = window.content.document.location;
            var tail = matches[1] ? matches[1] : "";
            urls[url] = location.protocol + "//" + location.host + "/" + tail
            continue;
        }

        // if the string doesn't look like a valid URL (i.e. contains a space
        // or does not contain any of: .:/) try opening it with a search engine
        // or keyword bookmark
        if (/\s/.test(urls[url]) || !/[.:\/]/.test(urls[url]))
        {
            matches = urls[url].match(/^(\S+)(?:\s+(.+))?$/)

            var alias = matches[1];
            var text = matches[2] ? matches[2] : null;

            // TODO: it would be clearer if the appropriate call to
            // getSearchURL was made based on whether or not the first word was
            // indeed an SE alias rather than seeing if getSearchURL can
            // process the call usefully and trying again if it fails - much
            // like the comments below ;-)

            // check if the first word is a search engine
            var search_url = vimperator.bookmarks.getSearchURL(text, alias);
            if (search_url/* && search_url.length >= 1*/)
            {
                urls[url] = search_url;
                continue;
            }
            else // the first word was not a search engine, search for the whole string in the default engine
            {
                search_url = vimperator.bookmarks.getSearchURL(urls[url], null);
                if (search_url/* && search_url.length >= 1*/)
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
} // }}}

// vim: set fdm=marker sw=4 ts=4 et:
