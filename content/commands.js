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

vimperator.Command = function (specs, action, extraInfo) //{{{
{
    if (!specs || !action)
        return null;

    // convert command name abbreviation specs of the form
    // 'shortname[optional-tail]' to short and long versions Eg. 'abc[def]' ->
    // 'abc', 'abcdef'
    var parseSpecs = function (specs)
    {
        var shortNames = [];
        var longNames  = [];
        var names = [];
        for (var i = 0; i < specs.length; i++)
        {
            var match;
            if (match = specs[i].match(/(\w+|!)\[(\w+)\]/))
            {
                shortNames.push(match[1]);
                longNames.push(match[1] + match[2]);
                // order as long1, short1, long2, short2
                names.push(match[1] + match[2]);
                names.push(match[1]);
            }
            else
            {
                longNames.push(specs[i]);
                names.push(specs[i]);
            }
        }
        return { names: names, longNames: longNames, shortNames: shortNames };
    };

    this.specs = specs;
    var expandedSpecs = parseSpecs(specs);
    this.shortNames = expandedSpecs.shortNames;
    this.longNames = expandedSpecs.longNames;

    // return the primary command name (the long name of the first spec listed)
    this.name = this.longNames[0];

    // return all command name aliases
    this.names = expandedSpecs.names;

    this.action = action;

    // TODO: build a better default usage string
    this.usage = [this.specs[0]];

    if (extraInfo)
    {
        //var flags = extraInfo.flags || 0;

        if (extraInfo.usage)
            this.usage = extraInfo.usage;

        this.help      = extraInfo.help || null;
        this.shortHelp = extraInfo.shortHelp || null;
        this.completer = extraInfo.completer || null;
        this.args       = extraInfo.args || [];
    }

};

vimperator.Command.prototype = {

    execute: function (args, special, count, modifiers)
    {
        return this.action.call(this, args, special, count, modifiers);
    },

    // return true if the candidate name matches one of the command's aliases
    // (including all acceptable abbreviations)
    hasName: function (name)
    {
        // match a candidate name against a command name abbreviation spec - returning
        // true if the candidate matches unambiguously
        function matchAbbreviation(name, format)
        {
            var minimum = format.indexOf("[");                    // minumum number of characters for a command name match
            var fullname = format.replace(/\[(\w+)\]$/, "$1");    // full command name
            if (fullname.indexOf(name) == 0 && name.length >= minimum)
                return true;
            else
                return false;
        }

        for (var i = 0; i < this.specs.length; i++)
        {
            if (this.specs[i] == name)                       // literal command name
            {
                return true;
            }
            else if (/^(\w+|!)\[\w+\]$/.test(this.specs[i])) // abbreviation spec
            {
                if (matchAbbreviation(name, this.specs[i]))
                    return true;
            }
        }
        return false;
    }

};
//}}}

vimperator.Commands = function () //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const OPTION_ANY    = 0; // can be given no argument or an argument of any type, user is responsible
                             // for parsing the return value
    const OPTION_NOARG  = 1;
    const OPTION_BOOL   = 2;
    const OPTION_STRING = 3;
    const OPTION_INT    = 4;
    const OPTION_FLOAT  = 5;
    const OPTION_LIST   = 6;

    var exCommands = [];
    var lastRunCommand = ""; // updated whenever the users runs a command with :!

    // in '-quoted strings, only ' and \ itself are escaped
    // in "-quoted strings, also ", \n and \t are translated
    // in non-quoted strings everything is taken literally apart from "\ " and "\\"
    //
    // "options" is an array [name, type, validator, completions] and could look like:
    //  options = [[["-force"], OPTION_NOARG],
    //             [["-fullscreen"], OPTION_BOOL],
    //             [["-language"], OPTION_STRING, validateFunc, ["perl", "ruby"]],
    //             [["-speed"], OPTION_INT],
    //             [["-acceleration"], OPTION_FLOAT],
    //             [["-accessories"], OPTION_LIST, null, ["foo", "bar"]],
    //             [["-other"], OPTION_ANY]];
    // TODO: should it handle comments?
    // TODO: should it return an error, if it contains arguments which look like options (beginning with -)?
    function parseArgs(str, options)
    {
        // returns [count, parsed_argument]
        function getNextArg(str)
        {
            var inSingleString = false;
            var inDoubleString = false;
            var inEscapeKey = false;

            var arg = "";

            outer:
            for (var i = 0; i < str.length; i++)
            {
                switch (str[i])
                {
                    case "\"":
                        if (inEscapeKey)
                        {
                            inEscapeKey = false;
                            break;
                        }
                        if (!inSingleString)
                        {
                            inDoubleString = !inDoubleString;
                            continue outer;
                        }
                        break;

                    case "'":
                        if (inEscapeKey)
                        {
                            inEscapeKey = false;
                            break;
                        }
                        if (!inDoubleString)
                        {
                            inSingleString = !inSingleString;
                            continue outer;
                        }
                        break;

                    // \ is an escape key for non quoted or "-quoted strings
                    // for '-quoted strings it is taken literally, apart from \' and \\
                    case "\\":
                        if (inEscapeKey)
                        {
                            inEscapeKey = false;
                            break;
                        }
                        else
                        {
                            // only escape "\\" and "\ " in non quoted strings
                            if (!inSingleString && !inDoubleString && str[i + 1] != "\\" && str[i + 1] != " ")
                                continue outer;
                            // only escape "\\" and "\'" in single quoted strings
                            else if (inSingleString && str[i + 1] != "\\" && str[i + 1] != "'")
                                break;
                            else
                            {
                                inEscapeKey = true;
                                continue outer;
                            }
                        }
                        break;

                    default:
                        if (inSingleString)
                        {
                            inEscapeKey = false;
                            break;
                        }
                        else if (inEscapeKey)
                        {
                            inEscapeKey = false;
                            switch (str[i])
                            {
                                case "n": arg += "\n"; continue outer;
                                case "t": arg += "\t"; continue outer;
                                default:
                                    break; // this makes "a\fb" -> afb; wanted or should we return ab? --mst
                            }
                        }
                        else if (!inDoubleString && /\s/.test(str[i]))
                        {
                            return [i, arg];
                        }
                        else // a normal charcter
                            break;
                }
                arg += str[i];
            }

            // TODO: add parsing of a " comment here:
            if (inDoubleString || inSingleString)
                return [-1, "E114: Missing quote"];
            if (inEscapeKey)
                return [-1, "trailing \\"];
            else
                return [str.length, arg];
        }

        var args = []; // parsed arguments
        var opts = []; // parsed options
        if (!options)
            options = [];

        var invalid = false;
        var arg = null;
        var count = 0; // the length of the argument
        var i = 0;
        outer:
        while (i < str.length)
        {
            // skip whitespace
            if (/\s/.test(str[i]))
            {
                i++;
                continue;
            }

            var sub = str.substr(i);
            var optname = "";
            for (var opt = 0; opt < options.length; opt++)
            {
                for (var name = 0; name < options[opt][0].length; name++)
                {
                    optname = options[opt][0][name];
                    if (sub.indexOf(optname) == 0)
                    {
                        invalid = false;
                        arg = null;
                        // no value to the option
                        if (optname.length >= sub.length)
                        {
                            count = 0;
                        }
                        else if (sub[optname.length] == "=")
                        {
                            [count, arg] = getNextArg(sub.substr(optname.length + 1));
                            if (count == -1)
                            {
                                vimperator.echoerr("Invalid argument for option " + optname);
                                return null;
                            }

                            count++; // to compensate the "=" character
                        }
                        else if (options[opt][1] != OPTION_NOARG && /\s/.test(sub[optname.length]))
                        {
                            [count, arg] = getNextArg(sub.substr(optname.length + 1));
                            if (count == -1)
                            {
                                vimperator.echoerr("Invalid argument for option " + optname);
                                return null;
                            }

                            // if we add the argument to an option after a space, it MUST not be empty
                            if (arg.length == 0)
                                arg = null;

                            count++; // to compensate the " " character
                        }
                        else
                        {
                            // this isn't really an option as it has trailing characters, parse it as an argument
                            invalid = true;
                        }

                        if (!invalid)
                        {
                            switch (options[opt][1]) // type
                            {
                            case OPTION_NOARG:
                                if (arg != null)
                                {
                                    vimperator.echoerr("No argument allowed for option: " + optname);
                                    return null;
                                }
                                break;
                            case OPTION_BOOL:
                                if (arg == "true" || arg == "1" || arg == "on")
                                    arg = true;
                                else if (arg == "false" || arg == "0" || arg == "off")
                                    arg = false;
                                else
                                {
                                    vimperator.echoerr("Invalid argument for boolean option: " + optname);
                                    return null;
                                }
                                break;
                            case OPTION_STRING:
                                if (arg == null)
                                {
                                    vimperator.echoerr("Argument required for string option: " + optname);
                                    return null;
                                }
                                break;
                            case OPTION_INT:
                                arg = parseInt(arg, 10);
                                if (isNaN(arg))
                                {
                                    vimperator.echoerr("Numeric argument required for integer option: " + optname);
                                    return null;
                                }
                                break;
                            case OPTION_FLOAT:
                                arg = parseFloat(arg);
                                if (isNaN(arg))
                                {
                                    vimperator.echoerr("Numeric argument required for float option: " + optname);
                                    return null;
                                }
                                break;
                            case OPTION_LIST:
                                if (arg == null)
                                {
                                    vimperator.echoerr("Argument required for list option: " + optname);
                                    return null;
                                }
                                arg = arg.split(/\s*,\s*/);
                                break;
                            }

                            // we have a validator function
                            if (typeof options[opt][2] == "function")
                            {
                                if (options[opt][2].call(this, arg) == false)
                                {
                                    vimperator.echoerr("Invalid argument for option: " + optname);
                                    return null;
                                }
                            }

                            opts.push([options[opt][0][0], arg]); // always use the first name of the option
                            i += optname.length + count;
                            continue outer;
                        }
                        // if it is invalid, just fall through and try the next argument
                    }
                }
            }

            // if not an option, treat this token as an argument
            var [count, arg] = getNextArg(sub);
            if (count == -1)
            {
                vimperator.echoerr("Error parsing arguments: " + arg);
                return null;
            }

            if (arg != null)
                args.push(arg);

            i += count; // hopefully count is always >0, otherwise we get an endless loop
        }

        return { opts: opts, args: args };
    }

    function getOption(opts, option, def)
    {
        for (var i = 0; i < opts.length; i++)
        {
            if (opts[i][0] == option)
                return opts[i][1];
        }

        // no match found, return default
        return def;
    }

    function commandsIterator()
    {
        for (var i = 0; i < exCommands.length; i++)
            yield exCommands[i];

        throw StopIteration;
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var commandManager = {

        __iterator__: function ()
        {
            return commandsIterator();
        },

        add: function (command)
        {
            this[command.name] = function (args, special, count, modifiers)
            {
                command.execute(args, special, count, modifiers);
            };
            exCommands.push(command);
        },

        get: function (name)
        {
            for (var i = 0; i < exCommands.length; i++)
            {
                if (exCommands[i].hasName(name))
                    return exCommands[i];
            }

            return null;
        },

        // TODO: generalized 0 count handling -> "Zero count"
        // FIXME: doesn't really belong here...
        // return [null, null, null, null, heredoc_tag || false];
        //        [count, cmd, special, args] = match;
        parseCommand: function (str, tag)
        {
            // remove comments
            str.replace(/\s*".*$/, "");

            if (tag) // we already have a multiline heredoc construct
            {
                if (str == tag)
                    return [null, null, null, null, false];
                else
                    return [null, null, null, str, tag];
            }

            // 0 - count, 1 - cmd, 2 - special, 3 - args, 4 - heredoc tag
            var matches = str.match(/^:*(\d+)?([a-zA-Z]+|!)(!)?(?:\s*(.*?)\s*)?$/);
            if (!matches)
                return [null, null, null, null, null];
            matches.shift();

            // parse count
            if (matches[0])
                matches[0] = parseInt(matches[0], 10);
            else
                matches[0] = -1;

            matches[2] = !!matches[2];
            matches.push(null);
            if (matches[3])
            {
                tag = matches[3].match(/<<\s*(\w+)\s*$/);
                if (tag && tag[1])
                    matches[4] = tag[1];
            }
            else
                matches[3] = "";

            return matches;
        }

    };

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// DEFAULT COMMANDS ////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    commandManager.add(new vimperator.Command(["addo[ns]"],
        function () { vimperator.open("chrome://mozapps/content/extensions/extensions.xul", vimperator.NEW_TAB); },
        {
            shortHelp: "Show available Browser Extensions and Themes",
            help: "You can add/remove/disable browser extensions from this dialog.<br/>Be aware that not all Firefox extensions work, because Vimperator overrides some key bindings and changes Firefox's GUI."
        }
    ));
    commandManager.add(new vimperator.Command(["ba[ck]"],
        function (args, special, count)
        {
            if (special)
                vimperator.history.goToStart();
            else
            {
                if (args)
                {
                    var sh = getWebNavigation().sessionHistory;
                    for (var i = sh.index - 1; i >= 0; i--)
                    {
                        if (sh.getEntryAtIndex(i, false).URI.spec == args)
                        {
                            getWebNavigation().gotoIndex(i);
                            return;
                        }
                    }
                }
                vimperator.history.stepTo(count > 0 ? -1 * count : -1);
            }
        },
        {
            usage: ["[count]ba[ck][!] [url]"],
            shortHelp: "Go back in the browser history",
            help: "Count is supported, <code class=\"command\">:3back</code> goes back 3 pages in the browser history.<br/>" +
                  "The special version <code class=\"command\">:back!</code> goes to the beginning of the browser history.",
            completer: function (filter)
            {
                var sh = getWebNavigation().sessionHistory;
                var completions = [];
                for (var i = sh.index - 1; i >= 0; i--)
                {
                    var entry = sh.getEntryAtIndex(i, false);
                    var url = entry.URI.spec;
                    var title = entry.title;
                    if (vimperator.completion.match([url, title], filter, false))
                        completions.push([url, title]);
                }
                return [0, completions];
            }
        }
    ));
    commandManager.add(new vimperator.Command(["bd[elete]", "bw[ipeout]", "bun[load]", "tabc[lose]"],
        function (args, special, count) { vimperator.tabs.remove(getBrowser().mCurrentTab, count > 0 ? count : 1, special, 0); },
        {
            usage: ["[count]bd[elete][!]"],
            shortHelp: "Delete current buffer (=tab)",
            help: "Count is supported, <code class=\"command\">:2bd</code> removes two tabs and the one to the right is selected. " +
                  "Do <code class=\"command\">:bdelete!</code> to select the tab to the left after removing the current tab."
        }
    ));
    commandManager.add(new vimperator.Command(["beep"],
        function () { vimperator.beep(); },
        {
            shortHelp: "Play a system beep"
        }
    ));
    commandManager.add(new vimperator.Command(["bma[rk]"],
        function (args)
        {
            var res = parseArgs(args, this.args);
            if (!res)
                return;

            var url = res.args.length == 0 ? vimperator.buffer.URL : res.args[0];
            var title = getOption(res.opts, "-title", res.args.length == 0 ? vimperator.buffer.title : null);
            if (!title)
                title = url;
            var keyword = getOption(res.opts, "-keyword", null);
            var tags = getOption(res.opts, "-tags", []);

            if (vimperator.bookmarks.add(false, title, url, keyword, tags))
            {
                var extra = "";
                if (title != url)
                    extra = " (" + title + ")";
                vimperator.echo("Added bookmark: " + url + extra, vimperator.commandline.FORCE_SINGLELINE);
            }
            else
                vimperator.echoerr("Exxx: Could not add bookmark `" + title + "'", vimperator.commandline.FORCE_SINGLELINE);
        },
        {
            usage: ["bma[rk] [-title=title] [-keyword=kw] [-tags=tag1,tag2] [url]"],
            shortHelp: "Add a bookmark",
            help: "If you don't add a custom title, either the title of the web page or the URL is taken as the title.<br/>" +
                  "You can omit the optional <code class=\"argument\">[url]</code> argument, so just do <code class=\"command\">:bmark</code> to bookmark the currently loaded web page with a default title and without any tags.<br/>" +
                  "The following options are interpreted:<br/>" +
                  " -title=\"custom title\"<br/>" +
                  " -tags=comma,separated,tag,list<br/>" +
                  " -keyword=keyword<br/>",
            args: [[["-title", "-t"],    OPTION_STRING],
                   [["-tags", "-T"],     OPTION_LIST],
                   [["-keyword", "-k"],  OPTION_STRING, function (arg) { return /\w/.test(arg); }]]
        }
    ));
    commandManager.add(new vimperator.Command(["bmarks"],
        function (args, special)
        {
            var res = parseArgs(args, this.args);
            if (!res)
                return;

            var tags = getOption(res.opts, "-tags", []);
            vimperator.bookmarks.list(res.args.join(" "), tags, special);
        },
        {
            usage: ["bmarks [filter]", "bmarks!"],
            shortHelp: "Show bookmarks",
            help: "Open the message window at the bottom of the screen with all bookmarks which match <code class=\"argument\">[filter]</code> either in the title or URL.<br/>" +
                  "The special version <code class=\"command\">:bmarks!</code> opens the default Firefox bookmarks window.<br/>" +
                  "Filter can also contain the following options:<br/>" +
                  "-tags=comma,separated,tag,list<br/>",
            completer: function (filter) { return [0, vimperator.bookmarks.get(filter)]; },
            args: [[["-tags", "-T"],     OPTION_LIST]]
        }
    ));
    commandManager.add(new vimperator.Command(["b[uffer]"],
        function (args, special) { vimperator.buffer.switchTo(args, special); },
        {
            usage: ["b[uffer][!] {url|index}"],
            shortHelp: "Go to buffer from buffer list",
            help: "Argument can be either the buffer index or the full URL.<br/>" +
                  "If argument is neither a full URL nor an index but uniquely identifies a buffer, " +
                  "it is selected. With <code class=\"argument\">[!]</code> the next buffer matching the argument " +
                  "is selected, even if it cannot be identified uniquely.<br/>" +
                  "Use <code class=\"mapping\">b</code> as a shortcut to open this prompt.",
            completer: function (filter) { return vimperator.completion.buffer(filter); }
        }
    ));
    commandManager.add(new vimperator.Command(["dia[log]"],
        function (args, special)
        {
            try
            {
                switch (args)
                {
                case "about": openDialog("chrome://browser/content/aboutDialog.xul", "_blank", "chrome,dialog,modal,centerscreen"); break;
                case "addbookmark": PlacesCommandHook.bookmarkCurrentPage(true, PlacesUtils.bookmarksRootId); break;
                case "addons": BrowserOpenAddonsMgr(); break;
                case "bookmarks": openDialog("chrome://browser/content/bookmarks/bookmarksPanel.xul", "Bookmarks", "dialog,centerscreen,width=600,height=600"); break;
                case "checkupdates": checkForUpdates(); break;
                case "cleardata": Cc[GLUE_CID].getService(Ci.nsIBrowserGlue).sanitize(window || null); break;
                case "console": toJavaScriptConsole(); break;
                case "customizetoolbar": BrowserCustomizeToolbar(); break;
                case "dominspector": inspectDOMDocument(content.document); break; // XXX: orig: _content.document
                case "downloads": toOpenWindowByType('Download:Manager', 'chrome://mozapps/content/downloads/downloads.xul', 'chrome,dialog=no,resizable'); break;
                case "history": openDialog("chrome://browser/content/history/history-panel.xul", "History", "dialog,centerscreen,width=600,height=600"); break;
                case "import": BrowserImport(); break;
                case "openfile": BrowserOpenFileWindow(); break;
                case "pageinfo": BrowserPageInfo(); break;
                case "pagesource": BrowserViewSourceOfDocument(content.document); break;
                case "places": PlacesCommandHook.showPlacesOrganizer(ORGANIZER_ROOT_BOOKMARKS); break;
                case "preferences": openPreferences(); break;
                    // XXX what are onEnter.. and onExit...?
                case "printpreview": PrintUtils.printPreview(onEnterPrintPreview, onExitPrintPreview); break;
                case "print": PrintUtils.print(); break;
                case "printsetup": PrintUtils.showPageSetup(); break;
                case "saveframe": saveFrameDocument(); break;
                case "savepage": saveDocument(window.content.document); break;
                case "searchengines": openDialog("chrome://browser/content/search/engineManager.xul", "_blank", "chrome,dialog,modal,centerscreen"); break;
                    // TODO add viewPartialSource('selection'); ...
                case "": vimperator.echoerr("E474: Invalid argument"); break;
                default: vimperator.echoerr("Dialog '" + args + "' not available");
                }
            }
            catch (e)
            {
                vimperator.echoerr("Error opening '" + args + "': " + e);
            }
        },
        {
            usage: ["dia[log] [firefox-dialog]"],
            shortHelp: "Open a firefox-dialog",
            help: "Available dialogs: use completion on <code class=\"command\">:dialog</code> &lt;tab&gt;",
            completer: function (filter) { return vimperator.completion.dialog(filter); }
        }
    ));
    commandManager.add(new vimperator.Command(["buffers", "files", "ls", "tabs"],
        function (args, special)
        {
            if (args)
            {
                vimperator.echoerr("E488: Trailing characters");
                return;
            }

            vimperator.buffer.list(special);
        },
        {
            usage: ["buffers[!]"],
            shortHelp: "Show a list of all buffers (=tabs)",
            help: "The special version <code class=\"command\">:buffers!</code> opens the buffer list in a persistent preview window. " +
                  "Call the special version of this command again to close the window."
        }
    ));
    commandManager.add(new vimperator.Command(["delbm[arks]"],
        function (args, special)
        {
            var url = args;
            if (!url)
                url = vimperator.buffer.URL;

            var deletedCount = vimperator.bookmarks.remove(url);
            vimperator.echo(deletedCount + " bookmark(s) with url `" + url + "' deleted", vimperator.commandline.FORCE_SINGLELINE);
        },
        {
            usage: ["delbm[arks] [url]"],
            shortHelp: "Delete a bookmark",
            help: "Deletes <b>all</b> bookmarks which match the <code class=\"argument\">[url]</code>. " +
                  "If omitted, <code class=\"argument\">[url]</code> defaults to the URL of the current buffer. " +
                  "Use <code>&lt;Tab&gt;</code> key on a string to complete the URL which you want to delete.<br/>" +
                  "The following options WILL be interpreted in the future:<br/>" +
                  " [!] a special version to delete ALL bookmarks <br/>",
            completer: function (filter) { return [0, vimperator.bookmarks.get(filter)]; }
        }
    ));
    commandManager.add(new vimperator.Command(["cd", "chd[ir]"],
        function (args)
        {
            if (!args)
                args = "~";

            if (vimperator.io.setCurrentDirectory(args))
                vimperator.echo(vimperator.io.getCurrentDirectory());
        },
        {
            usage: ["cd [-|path]"],
            shortHelp: "Change the current directory",
            help: "<code class='command'>:cd -</code> changes to the last directory.",
            completer: function (filter) { return vimperator.completion.file(filter, true); }
        }
    ));
    commandManager.add(new vimperator.Command(["pw[d]"],
        function (args)
        {
            if (args)
                vimperator.echoerr("E488: Trailing characters");
            else
                vimperator.echo(vimperator.io.getCurrentDirectory());
        },
        {
            shortHelp: "Print the current directory name"
        }
    ));
    commandManager.add(new vimperator.Command(["com[mand]"],
        function (args)
        {
            var res = parseArgs(args, this.args);
            if (!res)
                return;

            vimperator.echo(vimperator.util.colorize(res.args));
        },
        {
            usage: ["com[mand][!] [{attr}...] {cmd} {rep}"],
            shortHelp: "Temporarily used for testing args parser",
            help: "",
            args: [[["-nargs"],    OPTION_STRING, function (arg) { return /^(0|1|\*|\?|\+)$/.test(arg); }],
                   [["-bang"],     OPTION_NOARG],
                   [["-bar"],      OPTION_NOARG]]
        }
    ));
    commandManager.add(new vimperator.Command(["delm[arks]"],
        function (args, special)
        {
            if (!special && !args)
            {
                vimperator.echoerr("E471: Argument required");
                return;
            }
            if (special && args)
            {
                vimperator.echoerr("E474: Invalid argument");
                return;
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
            shortHelp: "Delete the specified marks",
            help: "Marks are presented as a list. Example:<br/>" +
                "<code class=\"command\">:delmarks Aa b p</code> deletes marks A, a, b and p<br/>" +
                "<code class=\"command\">:delmarks b-p</code> deletes all marks in the range b to p<br/>" +
                "<code class=\"command\">:delmarks!</code> deletes all marks for the current buffer"
        }

    ));
    commandManager.add(new vimperator.Command(["delqm[arks]"],
        function (args, special)
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
                return;
            }

            if (special)
                vimperator.quickmarks.removeAll();
            else
                vimperator.quickmarks.remove(args);
        },
        {
            usage: ["delqm[arks] {marks}", "delqm[arks]!"],
            shortHelp: "Delete the specified QuickMarks",
            help: "QuickMarks are presented as a list. Example:<br/>" +
                "<code class=\"command\">:delqmarks Aa b p</code> deletes QuickMarks A, a, b and p<br/>" +
                "<code class=\"command\">:delqmarks b-p</code> deletes all QuickMarks in the range b to p<br/>" +
                "<code class=\"command\">:delqmarks!</code> deletes all QuickMarks"
        }
    ));
    commandManager.add(new vimperator.Command(["downl[oads]", "dl"],
        function () { vimperator.open("chrome://mozapps/content/downloads/downloads.xul", vimperator.NEW_TAB); },
        {
            shortHelp: "Show progress of current downloads",
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
            // with (vimperator) means, vimperator is the default namespace "inside" eval
            arg = eval("with(vimperator){" + arg + "}");
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
    commandManager.add(new vimperator.Command(["ec[ho]"],
        function (args)
        {
            var res = argToString(args, true);
            if (res != null)
                vimperator.echo(res);
        },
        {
            usage: ["ec[ho] {expr}"],
            shortHelp: "Display a string at the bottom of the window",
            help: "Useful for showing informational messages. Multiple lines can be separated by \\n.<br/>" +
                  "<code class=\"argument\">{expr}</code> can either be a quoted string, or any expression which can be fed to eval() like 4+5. " +
                  "You can also view the source code of objects and functions if the return value of <code class=\"argument\">{expr}</code> is an object or function.",
            completer: function (filter) { return vimperator.completion.javascript(filter); }
        }
    ));
    commandManager.add(new vimperator.Command(["echoe[rr]"],
        function (args)
        {
            var res = argToString(args, false);
            if (res != null)
                vimperator.echoerr(res);
        },
        {
            usage: ["echoe[rr] {expr}"],
            shortHelp: "Display an error string at the bottom of the window",
            help: "Just like <code class=\"command\">:ec[ho]</code>, but echoes the result highlighted in red. Useful for showing important messages.",
            completer: function (filter) { return vimperator.completion.javascript(filter); }
        }
    ));
    commandManager.add(new vimperator.Command(["exe[cute]"],
        function (args)
        {
            // TODO: :exec has some difficult semantics -> later
            // var res = parseArgs(args, this.args);
            // if (!res)
            //     return;
            //
            // vimperator.execute(res.args);

            vimperator.execute(args);
        },
        {
            usage: ["exe[cute] {expr1} [ ... ]"],
            shortHelp: "Execute the string that results from the evaluation of {expr1} as an Ex command.",
            help: "Example: <code class=\"command\">:execute echo \"test\"</code> shows a message with the text &#34;test&#34;.<br/>"
        }
    ));
    commandManager.add(new vimperator.Command(["exu[sage]"],
        function (args, special, count, modifiers) { vimperator.help("commands", special, null, modifiers); },
        {
            shortHelp: "Show help for Ex commands"
        }
    ));
    commandManager.add(new vimperator.Command(["fo[rward]", "fw"],
        function (args, special, count)
        {
            if (special)
                vimperator.history.goToEnd();
            else
            {
                if (args)
                {
                    var sh = getWebNavigation().sessionHistory;
                    for (var i = sh.index + 1; i < sh.count; i++)
                    {
                        if (sh.getEntryAtIndex(i, false).URI.spec == args)
                        {
                            getWebNavigation().gotoIndex(i);
                            return;
                        }
                    }
                }
                vimperator.history.stepTo(count > 0 ? count : 1);
            }
        },
        {
            usage: ["[count]fo[rward][!] [url]"],
            shortHelp: "Go forward in the browser history",
            help: "Count is supported, <code class=\"command\">:3forward</code> goes forward 3 pages in the browser history.<br/>" +
                  "The special version <code class=\"command\">:forward!</code> goes to the end of the browser history.",
            completer: function (filter)
            {
                var sh = getWebNavigation().sessionHistory;
                var completions = [];
                for (var i = sh.index + 1; i < sh.count; i++)
                {
                    var entry = sh.getEntryAtIndex(i, false);
                    var url = entry.URI.spec;
                    var title = entry.title;
                    if (vimperator.completion.match([url, title], filter, false))
                        completions.push([url, title]);
                }
                return [0, completions];
            }
        }
    ));
    commandManager.add(new vimperator.Command(["ha[rdcopy]"],
        function () { getBrowser().contentWindow.print(); },
        {
            shortHelp: "Print current document",
            help: "Open a GUI dialog where you can select the printer, number of copies, orientation, etc."
        }
    ));
    commandManager.add(new vimperator.Command(["h[elp]"],
        function (args, special, count, modifiers) { vimperator.help(args, special, null, modifiers); },
        {
            usage: ["h[elp] {subject}"],
            shortHelp: "Open the help window",
            help: "You can jump to the specified <code class=\"argument\">{subject}</code> with <code class=\"command\">:help {subject}</code>.<br/>" +
                  "Make sure you use the full Vim notation when jumping to <code class=\"argument\">{subject}</code>. This means:<br/>" +
                  "<ul>" +
                  "<li><code class=\"command\">:help :help</code> for commands (: prefix)</li>" +
                  "<li><code class=\"command\">:help 'complete'</code> for options (surrounded by ' and ')</li>" +
                  "<li><code class=\"command\">:help o</code> for mappings (no pre- or postfix)</li>" +
                  "</ul>" +
                  "You can however use partial strings in the tab completion, so <code class=\"command\">:help he&lt;Tab&gt;</code> completes <code class=\"command\">:help :help</code>.",
            completer: function (filter) { return vimperator.completion.help(filter); }
        }
    ));
    commandManager.add(new vimperator.Command(["hist[ory]", "hs"],
        function (args, special) { vimperator.history.list(args, special); },
        {
            usage: ["hist[ory] [filter]", "history!"],
            shortHelp: "Show recently visited URLs",
            help: "Open the message window at the bottom of the screen with all history items which match <code class=\"argument\">[filter]</code> either in the title or URL.<br/>" +
                  "The special version <code class=\"command\">:history!</code> opens the default Firefox history window.",
            completer: function (filter) { return [0, vimperator.history.get(filter)]; }
        }
    ));
    commandManager.add(new vimperator.Command(["javas[cript]", "js"],
        function (args, special)
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
                        function (code)
                        {
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
                        eval("with(vimperator){" + args + "}");
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
            shortHelp: "Run any JavaScript command through eval()",
            help: "Acts as a JavaScript interpreter by passing the argument to <code>eval()</code>.<br/>" +
                  "<code class=\"command\">:javascript alert('Hello world')</code> shows a dialog box with the text \"Hello world\".<br/>" +
                  "<code class=\"command\">:javascript &lt;&lt;EOF</code> reads all the lines until a line starting with 'EOF' is found, and interpret them with the JavaScript <code>eval()</code> function.<br/>" +
                  "The special version <code class=\"command\">:javascript!</code> opens the JavaScript console of Firefox.<br/>" +
                  "Rudimentary <code class=\"mapping\">&lt;Tab&gt;</code> completion is available for <code class=\"command\">:javascript {cmd}&lt;Tab&gt;</code> (but not yet for the " +
                  "<code class=\"command\">:js &lt;&lt;EOF</code> multiline widget). Be aware that Vimperator needs to run {cmd} through eval() " +
                  "to get the completions, which could have unwanted side effects.",
            completer: function (filter) { return vimperator.completion.javascript(filter); }
        }
    ));
    commandManager.add(new vimperator.Command(["let"],
        function (args)
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
                    vimperator.echo("<table>" + str + "</table>", vimperator.commandline.FORCE_MULTILINE);
                else
                    vimperator.echo("No variables found");
                return;
            }

            var matches;
            // 1 - type, 2 - name, 3 - +-., 4 - expr
            if (matches = args.match(/([$@&])?([\w:]+)\s*([+-.])?=\s*(.+)/))
            {
                if (!matches[1])
                {
                    var reference = vimperator.variableReference(matches[2]);
                    if (!reference[0] && matches[3])
                    {
                        vimperator.echoerr("E121: Undefined variable: " + matches[2]);
                        return;
                    }

                    var expr = vimperator.eval(matches[4]);
                    if (typeof expr === undefined)
                    {
                        vimperator.echoerr("E15: Invalid expression: " + matches[4]);
                        return;
                    }
                    else
                    {
                        if (!reference[0])
                        {
                            if (reference[2] == "g")
                                reference[0] = vimperator.globalVariables;
                            else
                                return; // for now
                        }

                        if (matches[3])
                        {
                            if (matches[3] == "+")
                                reference[0][reference[1]] += expr;
                            else if (matches[3] == "-")
                                reference[0][reference[1]] -= expr;
                            else if (matches[3] == ".")
                                reference[0][reference[1]] += expr.toString();
                        }
                        else
                            reference[0][reference[1]] = expr;
                    }
                }
            }
            // 1 - name
            else if (matches = args.match(/^\s*([\w:]+)\s*$/))
            {
                var reference = vimperator.variableReference(matches[1]);
                if (!reference[0])
                {
                    vimperator.echoerr("E121: Undefined variable: " + matches[1]);
                    return;
                }

                var value = reference[0][reference[1]];
                if (typeof value == "number")
                    var prefix = "#";
                else if (typeof value == "function")
                    var prefix = "*";
                else
                    var prefix = "";
                vimperator.echo(reference[1] + "\t\t" + prefix + value);
            }
        },
        {
            usage: ["let {var-name} [+-.]= {expr1}", "let {var-name}", "let"],
            shortHelp: "Sets or lists a variable",
            help: "Sets the variable <code class=\"argument\">{var-name}</code> " +
                  "to the value of the expression <code class=\"argument\">{expr1}</code>." +
                  "If no expression is given, the value of the variable is displayed." +
                  "Without arguments, displays a list of all variables."
        }
    ));
    // code for abbreviations
    commandManager.add(new vimperator.Command(["ab[breviate]"],
        function (args)
        {
            if (!args)
            {
                vimperator.editor.listAbbreviations("!", "");
                return;
            }

            var matches = args.match(/^([^\s]+)(?:\s+(.+))?$/);
            var [lhs, rhs] = [matches[1], matches[2]];
            if (rhs)
                vimperator.editor.addAbbreviation("!", lhs, rhs);
            else
                vimperator.editor.listAbbreviations("!", lhs);
        },
        {
            usage: ["ab[breviate] {lhs} {rhs}", "ab[breviate] {lhs}", "ab[breviate]"],
            shortHelp: "Abbreviate a key sequence",
            help: "Abbreviate <code class=\"argument\">{lhs}</code> to <code class=\"argument\">{rhs}</code>.<br/>" +
                  "If only <code class=\"argument\">{lhs}</code> given, list that particual abbreviation.<br/>" +
                  "List all abbreviations, if no arguments to are given.<br/>"
        }
    ));
    commandManager.add(new vimperator.Command(["ca[bbrev]"],
        function (args)
        {
            if (!args)
            {
                vimperator.editor.listAbbreviations("c", "");
                return;
            }

            var matches = args.match(/^([^\s]+)(?:\s+(.+))?$/);
            var [lhs, rhs] = [matches[1], matches[2]];
            if (rhs)
                vimperator.editor.addAbbreviation("c", lhs, rhs);
            else
                vimperator.editor.listAbbreviations("c", lhs);
        },
        {
            usage: ["ca[bbrev] {lhs} {rhs}", "ca[bbrev] {lhs}", "ca[bbrev]"],
            shortHelp: "Abbreviate a key sequence for Command-line mode",
            help: "Same as <code class='command'>:ab[reviate]</code>, but for Command-line mode only."
        }
    ));
    commandManager.add(new vimperator.Command(["ia[bbrev]"],
        function (args)
        {
            if (!args)
            {
                vimperator.editor.listAbbreviations("i", "");
                return;
            }

            var matches = args.match(/^([^\s]+)(?:\s+(.+))?$/);
            var [lhs, rhs] = [matches[1], matches[2]];
            if (rhs)
                vimperator.editor.addAbbreviation("i", lhs, rhs);
            else
                vimperator.editor.listAbbreviations("i", lhs);
        },
        {
            usage: ["ia[bbrev] {lhs} {rhs}", "ia[bbrev] {lhs}", "ia[bbrev]"],
            shortHelp: "Abbreviate a key sequence for Insert mode",
            help: "Same as <code class='command'>:ab[breviate]</code>, but for Insert mode only."
        }
    ));
    commandManager.add(new vimperator.Command(["una[bbreviate]"],
        function (args) { vimperator.editor.removeAbbreviation("!", args); },
        {
            usage: ["una[bbreviate] {lhs}"],
            shortHelp: "Remove an abbreviation"
        }
    ));
    commandManager.add(new vimperator.Command(["cuna[bbrev]"],
        function (args) { vimperator.editor.removeAbbreviation("c", args); },
        {
            usage: ["cuna[bbrev] {lhs}"],
            shortHelp: "Remove an abbreviation for Command-line mode",
            help: "Same as <code class='command'>:una[bbreviate]</code>, but for Command-line mode only."
        }
    ));
    commandManager.add(new vimperator.Command(["iuna[bbrev]"],
        function (args) { vimperator.editor.removeAbbreviation("i", args); },
        {
            usage: ["iuna[bbrev] {lhs}"],
            shortHelp: "Remove an abbreviation for Insert mode",
            help: "Same as <code class='command'>:una[bbreviate]</code>, but for Insert mode only."
        }
    ));
    commandManager.add(new vimperator.Command(["abc[lear]"],
        function (args) { vimperator.editor.removeAllAbbreviations("!"); },
        { shortHelp: "Remove all abbreviations" }
    ));
    commandManager.add(new vimperator.Command(["cabc[lear]"],
        function (args) { vimperator.editor.removeAllAbbreviations("c"); },
        { shortHelp: "Remove all abbreviations for Command-line mode" }
    ));
    commandManager.add(new vimperator.Command(["iabc[lear]"],
        function (args) { vimperator.editor.removeAllAbbreviations("i"); },
        { shortHelp: "Remove all abbreviations for Insert mode" }
    ));
    commandManager.add(new vimperator.Command(["au[tocmd]"],
        function (args, special) 
        {  
            if (!args)
            {
                if (special) // :au!
                    vimperator.autocommands.remove(null, null);
                else // :au
                    vimperator.autocommands.list(null, null);
            } 
            else
            {
                // (?:  ) means don't store; (....)? <-> exclamation marks makes the group optional
                var [all, asterix, auEvent, regex, cmds] =  args.match(/^(\*)?(?:\s+)?(\S+)(?:\s+)?(\S+)?(?:\s+)?(.+)?$/);

                if (cmds)
                {
                    vimperator.autocommands.add(auEvent, regex, cmds);
                }
                else if (regex) // e.g. no cmds provided
                {
                    if (special)
                        vimperator.autocommands.remove(auEvent, regex);
                    else
                        vimperator.autocommands.list(auEvent, regex);
                }
                else if (auEvent)
                {
                    if (asterix)
                        if (special)
                            vimperator.autocommands.remove(null, auEvent); // ':au! * auEvent'
                        else
                            vimperator.autocommands.list(null, auEvent);
                    else
                        if (special)
                            vimperator.autocommands.remove(auEvent, null);
                        else
                            vimperator.autocommands.list(auEvent, null);
                }
            }
        },
        {
            shortHelp: "Execute commands automatically on events",
            help: "<code class='command'>:au[tocmd]</code> <code class='argument'>{event} {pat} {cmd}</code><br/>" +
                  "Add {cmd} to the list of commands Vimperator will execute on {event}<br/><br/>" +
                  "<code class='command'>:autocmd[!]</code> <code class='argument'>{events} {pat}</code><br />" + 
                  "list/remove autocommands filtered be {events} and {pat}<br/>" +
                  "<code class='command'>:autocmd[!]</code> <code class='argument'>{events}</code><br />" + 
                  "list/remove autocommands matching {events}<br/>" +  
                  "<code class='command'>:autocmd[!]</code> * <code class='argument'>{pat}</code><br />" + 
                  "list/remove autocommands matching {pat}<br/>" +  
                  "<code class='command'>:autocmd[!]</code><br />" +
                  "list/remove all autocommands",
            completer: function (filter) { return vimperator.completion.autocommands(filter); } //TODO: improve
        }
    ));
    // 0 args -> list all maps
    // 1 arg  -> list the maps starting with args
    // 2 args -> map arg1 to arg*
    function map(args, mode, noremap)
    {
        if (!args)
        {
            vimperator.mappings.list(mode);
            return;
        }

        // ?:\s+ <- don't remember; (...)? optional = rhs
        var [, lhs, rhs] = args.match(/(\S+)(?:\s+(.+))?/);
        var leaderRegexp = /<Leader>/i;

        if (leaderRegexp.test(lhs))
            lhs = lhs.replace(leaderRegexp, vimperator.events.getMapLeader());

        if (!rhs) // list the mapping
        {
            vimperator.mappings.list(mode, lhs);
        }
        else
        {
            for (var index = 0; index < mode.length; index++)
            {
                vimperator.mappings.add(new vimperator.Map([mode[index]], [lhs],
                        function (count) { vimperator.events.feedkeys((count > 1 ? count : "") + rhs, noremap); },
                        { flags: vimperator.Mappings.flags.COUNT, rhs: rhs, noremap: noremap}
                    ));
            }
        }
    }
    commandManager.add(new vimperator.Command(["map"],
        function (args) { map(args, [vimperator.modes.NORMAL], false); },
        {
            usage: ["map {lhs} {rhs}", "map {lhs}", "map"],
            shortHelp: "Map the key sequence {lhs} to {rhs}",
            help: "The <code class=\"argument\">{rhs}</code> is remapped, allowing for nested and recursive mappings.<br/>" +
                  "Mappings are NOT saved during sessions, make sure you put them in your vimperatorrc file!"
        }
    ));
    commandManager.add(new vimperator.Command(["cm[ap]"],
        function (args) { map(args, [vimperator.modes.COMMAND_LINE], false); },
        {
            usage: ["cmap {lhs} {rhs}", "cmap {lhs}", "cmap"],
            shortHelp: "Map the key sequence {lhs} to {rhs} (in command-line mode)",
            help: "The <code class=\"argument\">{rhs}</code> is remapped, allowing for nested and recursive mappings.<br/>" +
                  "Mappings are NOT saved during sessions, make sure you put them in your vimperatorrc file!"
        }
    ));
    commandManager.add(new vimperator.Command(["im[ap]"],
        function (args) { map(args, [vimperator.modes.INSERT, vimperator.modes.TEXTAREA], false); },
        {
            usage: ["imap {lhs} {rhs}", "imap {lhs}", "imap"],
            shortHelp: "Map the key sequence {lhs} to {rhs} (in insert mode)",
            help: "The <code class=\"argument\">{rhs}</code> is remapped, allowing for nested and recursive mappings.<br/>" +
                  "Mappings are NOT saved during sessions, make sure you put them in your vimperatorrc file!"
        }
    ));
    commandManager.add(new vimperator.Command(["mapc[lear]"],
        function (args)
        {
            if (args)
            {
                vimperator.echoerr("E474: Invalid argument");
                return;
            }

            vimperator.mappings.removeAll(vimperator.modes.NORMAL);
        },
        {
            shortHelp: "Remove all mappings",
            help: "All user-defined mappings which were set by " +
                  "<code class=\"command\">:map</code> or <code class=\"command\">:noremap</code> are cleared."
        }
    ));
    commandManager.add(new vimperator.Command(["cmapc[lear]"],
        function (args)
        {
            if (args)
            {
                vimperator.echoerr("E474: Invalid argument");
                return;
            }

            vimperator.mappings.removeAll(vimperator.modes.COMMAND_LINE);
        },
        {
            shortHelp: "Remove all mappings (in command-line mode)",
            help: "All user-defined mappings which were set by " +
                  "<code class=\"command\">:cmap</code> or <code class=\"command\">:cnoremap</code> are cleared."
        }
    ));
    commandManager.add(new vimperator.Command(["imapc[lear]"],
        function (args)
        {
            if (args)
            {
                vimperator.echoerr("E474: Invalid argument");
                return;
            }

            vimperator.mappings.removeAll(vimperator.modes.INSERT);
            vimperator.mappings.removeAll(vimperator.modes.TEXTAREA);
        },
        {
            shortHelp: "Remove all mappings (in insert mode)",
            help: "All user-defined mappings which were set by " +
                  "<code class=\"command\">:imap</code> or <code class=\"command\">:inoremap</code> are cleared."
        }
    ));
    commandManager.add(new vimperator.Command(["ma[rk]"],
        function (args)
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
            shortHelp: "Mark current location within the web page"
        }
    ));
    commandManager.add(new vimperator.Command(["marks"],
        function (args)
        {
            // ignore invalid mark characters unless there are no valid mark chars
            if (args && !/[a-zA-Z]/.test(args))
            {
                vimperator.echoerr("E283: No marks matching \"" + args + "\"");
                return;
            }

            var filter = args.replace(/[^a-zA-Z]/g, "");
            vimperator.marks.list(filter);
        },
        {
            usage: ["marks [arg]"],
            shortHelp: "Show all location marks of current web page",
            help: "If <code class=\"argument\">[arg]</code> is specified then limit the list to those marks mentioned."
        }
    ));
    commandManager.add(new vimperator.Command(["mkv[imperatorrc]"],
        function (args, special)
        {
            // TODO: "E172: Only one file name allowed"
            var filename;
            if (args)
                filename = args;
            else
                filename = (navigator.platform == "Win32") ? "~/_vimperatorrc" : "~/.vimperatorrc";

            var file = vimperator.io.getFile(filename);
            if (file.exists() && !special)
            {
                vimperator.echoerr("E189: \".vimperatorrc\" exists (add ! to override)");
                return;
            }

            var line = "\" " + vimperator.version + "\n";
            line += "\" Mappings\n";

            // TODO: write user maps for all modes when we have mode dependant map support
            var mode = [[[vimperator.modes.NORMAL], ""], [[vimperator.modes.COMMAND_LINE], "c"],
                         [[vimperator.modes.INSERT, vimperator.modes.TEXTAREA], "i"]];
            for (var y = 0; y < mode.length; y++)
            {
                // names.length is about always 1 on user maps. if not, iterate here and 'fix' getUserIterator...
                for (var map in vimperator.mappings.getUserIterator(mode[y][0]))
                        line += mode[y][1] + (map.noremap ? "nore" : "") + "map " + map.names[0] + " " + map.rhs + "\n";
            }

            line += "\n\" Options\n";
            for (var option in vimperator.options)
            {
                // TODO: options should be queried for this info
                // TODO: string/list options might need escaping in future
                if (!/fullscreen|usermode/.test(option.name) && option.value != option.defaultValue)
                {
                    if (option.type == "boolean")
                        line += "set " + (option.value ? option.name : "no" + option.name) + "\n";
                    else
                        line += "set " + option.name + "=" + option.value + "\n";
                }
            }

            line += "\n\" Auto-Commands\n";
            for (var item in vimperator.autocommands)
                line += "autocmd " + item + "\n";

            line += "\n\" Abbreviations\n";
            for (var abbrCmd in vimperator.editor.abbreviations)
                line += abbrCmd;

            // if (vimperator.events.getMapLeader() != "\\")
            //    line += "\nlet mapleader = \"" + vimperator.events.getMapLeader() + "\"\n";

            // source a user .vimperatorrc file
            line += "\nsource! " + filename + ".local\n";
            line += "\n\" vim: set ft=vimperator:";

            vimperator.io.writeFile(file, line);
        },
        {
            usage: ["mkv[imperatorrc] [file]"],
            shortHelp: "Write current key mappings and changed options to [file]",
            help: "If no <code class=\"argument\">[file]</code> is specified then ~/.vimperatorrc is written unless this file already exists. " +
                  "The special version will overwrite <code class=\"argument\">[file]</code> if it exists.<br/>" +
                  "WARNING: this differs from Vim's behavior which defaults to writing the file in the current directory."
        }
    ));
    commandManager.add(new vimperator.Command(["noh[lsearch]"],
        function (args)
        {
            vimperator.search.clear();
        },
        {
            shortHelp: "Remove the search highlighting",
            help: "The document highlighting is turned back on when another search command is used or the " +
                  "<code class=\"option\">'hlsearch'</code> option is set."
        }
    ));
    commandManager.add(new vimperator.Command(["norm[al]"],
        function (args, special)
        {
            if (!args)
            {
                vimperator.echoerr("E471: Argument required");
                return;
            }

            vimperator.events.feedkeys(args, special);
        },
        {
            usage: ["norm[al][!] {commands}"],
            shortHelp: "Execute Normal mode commands",
            help: "Example: <code class=\"command\">:normal 20j</code> scrolls 20 lines down. " +
                  "If the <code class=\"argument\">[!]</code> is specified mappings will not be used."
        }
    ));
    // TODO: remove duplication in :map
    commandManager.add(new vimperator.Command(["no[remap]"],
        function (args) { map(args, [vimperator.modes.NORMAL], true); },
        {
            usage: ["no[remap] {lhs} {rhs}", "no[remap] {lhs}", "no[remap]"],
            shortHelp: "Map the key sequence {lhs} to {rhs}",
            help: "No remapping of the <code class=\"argument\">{rhs}</code> is performed."
        }
    ));
    // XXX: TODO: remove duplication in :cmap
    commandManager.add(new vimperator.Command(["cno[remap]"],
        function (args) { map(args, [vimperator.modes.COMMAND_LINE], true); },
        {
            usage: ["cno[remap] {lhs} {rhs}", "cno[remap] {lhs}", "cno[remap]"],
            shortHelp: "Map the key sequence {lhs} to {rhs} (in command-line mode)",
            help: "No remapping of the <code class=\"argument\">{rhs}</code> is performed."
        }
    ));
    commandManager.add(new vimperator.Command(["ino[remap]"],
        function (args) { map(args, [vimperator.modes.INSERT, vimperator.modes.TEXTAREA], true); },
        {
            usage: ["ino[remap] {lhs} {rhs}", "ino[remap] {lhs}", "ino[remap]"],
            shortHelp: "Map the key sequence {lhs} to {rhs} (in insert mode)",
            help: "No remapping of the <code class=\"argument\">{rhs}</code> is performed."
        }
    ));
    commandManager.add(new vimperator.Command(["o[pen]", "e[dit]"],
        function (args, special)
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
            shortHelp: "Open one or more URLs in the current tab",
            help: "Multiple URLs can be separated with \", \". Note that the space after the comma is required.<br/>" +
                  "Each token is analyzed and in this order:<br/>" +
                  "<ol>" +
                  "<li>Opened as a local file if it is an existing relative or absolute filename. " +
                  "<ul><li><code class=\"command\">:open /etc/fstab</code> shows the file system table.</li>" +
                  "<li><code class=\"command\">:open ../other/foo.html</code> in your home directory opens <code>\"/home/other/foo.html\"</code></li></ul></li>" +
                  "<li>Opened with the specified search engine if the token looks like a search string " +
                  "and the first word is the name of a search engine (<code class=\"command\">:open wikipedia linus torvalds</code> " +
                  "opens the wikipedia entry for linus torvalds). The short name of a search engine is automatically guessed from its name. " +
                  "If you want to set a custom name, open the <var>$FIREFOX_PROFILE</var>/searchplugins/*.xml file of the search engine, and add/change " +
                  "&lt;Alias&gt;myalias&lt;/Alias&gt;</li>" +
                  "<li>Opened with the default search engine or keyword (specified with the <code class=\"option\">'defsearch'</code> option) " +
                  "if the first word is no search engine (<code class=\"command\">:open linus torvalds</code> opens a Google search for linux torvalds).</li>" +
                  "<li>Passed directly to Firefox in all other cases (<code class=\"command\">:open www.osnews.com, www.slashdot.org</code> " +
                  "opens OSNews in the current, and Slashdot in a new background tab).</li>" +
                  "</ol>" +
                  "You can use <code class=\"command\">:open -tags linux torvalds&lt;Tab&gt;</code> to complete bookmarks " +
                  "with tag \"linux\" and which contain \"torvalds\". Note that -tags support is only available for tab completion, not for the actual command.<br/>" +
                  "The items which are completed on <code class=\"mapping\">&lt;Tab&gt;</code> are specified in the <code class=\"option\">'complete'</code> option.<br/>" +
                  "Without argument, reloads the current page.<br/>" +
                  "Without argument but with <code class=\"command\">!</code>, reloads the current page skipping the cache.",
            completer: function (filter) { return vimperator.completion.url(filter); }
        }
    ));
    commandManager.add(new vimperator.Command(["pa[geinfo]"],
        function () { vimperator.buffer.pageInfo(true); },
        {
            shortHelp: "Show various page information",
            help: "See :help 'pageinfo' for available options"
        }
    ));
    commandManager.add(new vimperator.Command(["pc[lose]"],
        function () { vimperator.previewwindow.hide(); },
        {
            shortHelp: "Close preview window on bottom of screen"
        }
    ));
    commandManager.add(new vimperator.Command(["pref[erences]", "prefs"],
        function (args, special, count, modifiers)
        {
            if (!args)
            {
                // TODO: copy these snippets to more function which should work with :tab xxx
                if (modifiers && modifiers.inTab)
                {
                    vimperator.open(special ? "about:config" :
                        "chrome://browser/content/preferences/preferences.xul", vimperator.NEW_TAB);
                }
                else
                {
                    if (special) // open firefox settings gui dialog
                        vimperator.open("about:config", vimperator.CURRENT_TAB);
                    else
                        openPreferences();
                }
            }
            else
            {
                vimperator.echoerr("E488: Trailing characters");
            }
        },
        {
            usage: ["pref[erences][!]"],
            shortHelp: "Show Browser Preferences",
            help: "You can change the browser preferences from this dialog. " +
                  "Be aware that not all Firefox preferences work, because Vimperator overrides some key bindings and changes Firefox's GUI.<br/>" +
                  "<code class=\"command\">:prefs!</code> opens about:config in the current tab where you can change advanced Firefox preferences."
        }
    ));
    commandManager.add(new vimperator.Command(["qma[rk]"],
        function (args)
        {
            if (!args)
            {
                vimperator.echoerr("E471: Argument required");
                return;
            }

            var matches = args.match(/^([a-zA-Z0-9])(?:\s+(.+))?$/);
            if (!matches)
                vimperator.echoerr("E488: Trailing characters");
            else if (!matches[2])
                vimperator.quickmarks.add(matches[1], vimperator.buffer.URL);
            else
                vimperator.quickmarks.add(matches[1], matches[2]);
        },
        {
            usage: ["qma[rk] {a-zA-Z0-9} [url]"],
            shortHelp: "Mark a URL with a letter for quick access",
            help: "You can also mark whole groups like this: <br/>" +
                  "<code class=\"command\">:qmark f http://forum1.com, http://forum2.com, imdb some artist</code>"
        }
    ));
    commandManager.add(new vimperator.Command(["qmarks"],
        function (args)
        {
            // ignore invalid mark characters unless there are no valid mark chars
            if (args && !/[a-zA-Z0-9]/.test(args))
            {
                vimperator.echoerr("E283: No QuickMarks matching \"" + args + "\"");
                return;
            }

            var filter = args.replace(/[^a-zA-Z0-9]/g, "");
            vimperator.quickmarks.list(filter);
        },
        {
            usage: ["qmarks [arg]"],
            shortHelp: "Show all QuickMarks",
            help: "If <code class=\"argument\">[arg]</code> is specified then limit the list to those QuickMarks mentioned."
        }
    ));
    commandManager.add(new vimperator.Command(["q[uit]"],
        function () { vimperator.tabs.remove(getBrowser().mCurrentTab, 1, false, 1); },
        {
            shortHelp: "Quit current tab",
            help: "If this is the last tab in the window, close the window. If this was the " +
                  "last window, close Vimperator. When quitting Vimperator, the session is not stored."
        }
    ));
    commandManager.add(new vimperator.Command(["quita[ll]", "qa[ll]"],
        function () { vimperator.quit(false); },
        {
            shortHelp: "Quit Vimperator",
            help: "Quit Vimperator, no matter how many tabs/windows are open. The session is not stored."
        }
    ));
    commandManager.add(new vimperator.Command(["redr[aw]"],
        function ()
        {
            var wu = window.QueryInterface(Components.interfaces.nsIInterfaceRequestor).
                            getInterface(Components.interfaces.nsIDOMWindowUtils);
            wu.redraw();
        },
        {
            shortHelp: "Redraw the screen",
            help: "Useful to update the screen halfway executing a script or function."
        }
    ));
    commandManager.add(new vimperator.Command(["re[load]"],
        function (args, special) { vimperator.tabs.reload(getBrowser().mCurrentTab, special); },
        {
            usage: ["re[load][!]"],
            shortHelp: "Reload current page",
            help: "Forces reloading of the current page. If <code class=\"command\">!</code> is given, skip the cache."
        }
    ));
    commandManager.add(new vimperator.Command(["reloada[ll]"],
        function (args, special) { vimperator.tabs.reloadAll(special); },
        {
            usage: ["reloada[ll][!]"],
            shortHelp: "Reload all pages",
            help: "Forces reloading of all pages. If <code class=\"command\">!</code> is given, skip the cache."
        }
    ));
    commandManager.add(new vimperator.Command(["res[tart]"],
        function () { vimperator.restart(); },
        {
            shortHelp: "Force the browser to restart",
            help: "Useful when installing extensions."
        }
    ));
    commandManager.add(new vimperator.Command(["sav[eas]", "w[rite]"],
        function () { saveDocument(window.content.document); },
        {
            shortHelp: "Save current web page to disk",
            help: "Opens the original Firefox \"Save page as...\" dialog.<br/>" +
                  "There, you can save the current web page to disk with various options."
        }
    ));
    commandManager.add(new vimperator.Command(["se[t]"],
        // TODO: support setting multiple options at once
        function (args, special, count, modifiers)
        {
            if (special)
            {
                vimperator.echo("This WILL show all non-default about:config options");
                return;
            }

            var onlyNondefault = false; // used for :set to print non-default options
            if (!args)
            {
                args = "all";
                onlyNondefault = true;
            }

            //                               1        2       3       4  5       6
            var matches = args.match(/^\s*(no|inv)?([a-z]+)([?&!])?\s*(([+-^]?)=(.*))?\s*$/);
            if (!matches)
            {
                vimperator.echoerr("E518: Unknown option: " + args);
                return;
            }

            var unsetBoolean = false;
            if (matches[1] == "no")
                unsetBoolean = true;

            var name = matches[2];
            var all = false;
            if (name == "all")
                all = true;

            var option = vimperator.options.get(name);
            if (!option && !all)
            {
                vimperator.echoerr("E518: Unknown option: " + args);
                return;
            }

            var valueGiven = !!matches[4];

            var get = false;
            if (all || matches[3] == "?" || (option.type != "boolean" && !valueGiven))
                get = true;

            var reset = false;
            if (matches[3] == "&")
                reset = true;

            var invertBoolean = false;
            if (matches[1] == "inv" || matches[3] == "!")
                invertBoolean = true;

            var operator = matches[5];

            var value = matches[6];
            if (value === undefined)
                value = "";

            // reset a variable to its default value
            if (reset)
            {
                if (all)
                {
                    for (let option in vimperator.options)
                        option.reset();
                }
                else
                {
                    option.reset();
                }
            }
            // read access
            else if (get)
            {
                if (all)
                {
                    vimperator.options.list(onlyNondefault);
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
            // NOTE: the behaviour is generally Vim compatible but could be
            // improved. i.e. Vim's behaviour is pretty sloppy to no real
            // benefit
            else
            {
                var currentValue = option.value;
                var newValue;

                switch (option.type)
                {
                    case "boolean":
                        if (valueGiven)
                        {
                            vimperator.echoerr("E474: Invalid argument: " + args);
                            return;
                        }

                        if (invertBoolean)
                            newValue = !option.value;
                        else
                            newValue = !unsetBoolean;

                        break;

                    case "number":
                        value = parseInt(value);

                        if (isNaN(value))
                        {
                            vimperator.echoerr("E521: Number required after =: " + args);
                            return;
                        }

                        if (operator == "+")
                            newValue = currentValue + value;
                        else if (operator == "-")
                            newValue = currentValue - value;
                        else if (operator == "^")
                            newValue = currentValue * value;
                        else
                            newValue = value;

                        break;

                    case "charlist":
                        if (operator == "+")
                            newValue = currentValue.replace(new RegExp("[" + value + "]", "g"), "") + value;
                        else if (operator == "-")
                            newValue = currentValue.replace(value, "");
                        else if (operator == "^")
                            // NOTE: Vim doesn't prepend if there's a match in the current value
                            newValue = value + currentValue.replace(new RegExp("[" + value + "]", "g"), "");
                        else
                            newValue = value;

                        break;

                    case "stringlist":
                        if (operator == "+")
                        {
                            if (!currentValue.match(value))
                                newValue = (currentValue ? currentValue + "," : "") + value;
                            else
                                newValue = currentValue;
                        }
                        else if (operator == "-")
                        {
                            newValue = currentValue.replace(new RegExp("^" + value + ",?|," + value), "");
                        }
                        else if (operator == "^")
                        {
                            if (!currentValue.match(value))
                                newValue = value + (currentValue ? "," : "") + currentValue;
                            else
                                newValue = currentValue;
                        }
                        else
                        {
                            newValue = value;
                        }

                        break;

                    case "string":
                        if (operator == "+")
                            newValue = currentValue + value;
                        else if (operator == "-")
                            newValue = currentValue.replace(value, "");
                        else if (operator == "^")
                            newValue = value + currentValue;
                        else
                            newValue = value;

                        break;

                    default:
                        vimperator.echoerr("E685: Internal error: option type `" + option.type + "' not supported");
                }

                if (option.isValidValue(newValue))
                    option.value = newValue;
                else
                    // FIXME: need to be able to specify more specific errors
                    vimperator.echoerr("E474: Invalid argument: " + args);
            }
        },
        {
            usage: ["se[t][!]", "se[t] {option}?", "se[t] [no]{option}", "se[t] {option}[+-]={value}", "se[t] {option}! | inv{option}", "se[t] {option}&"],
            shortHelp: "Set an option",
            help: "Permanently change an option.<br/>" +
                  "<code class=\"command\">:set</code> without an argument shows all Vimperator options which differ from their default values.<br/>" +
                  "<code class=\"command\">:set!</code> without an argument shows all about:config preferences which differ from their default values.<br/>" +
                  "There are three types of options: boolean, number and string. " +
                  "Boolean options must be set with <code class=\"command\">:set option</code> and <code class=\"command\">:set nooption</code>. " +
                  "Number and string option types must be set with <code class=\"command\">:set option={value}</code>.<br/>" +
                  "<code class=\"command\">:set option!</code> and <code class=\"command\">:set invoption</code> invert the value of a boolean option.<br/>" +
                  "<code class=\"command\">:set option?</code> or <code class=\"command\">:set option</code>(for string and list options) shows the current value of an option.<br/>" +
                  "<code class=\"command\">:set option&amp;</code> resets an option to its default value.<br/>" +
                  "<code class=\"command\">:set option+={value}</code>, <code class=\"command\">:set option^={value}</code> and <code class=\"command\">:set option-={value}</code> " +
                  "adds/multiplies/subtracts <code class=\"argument\">{value}</code> from a number option and appends/prepends/removes <code class=\"argument\">{value}</code> from a string option.<br/>" +
                  "<code class=\"command\">:set all</code> shows the current value of all options and <code class=\"command\">:set all&amp;</code> resets all options to their default values.<br/>",
            completer: function (filter) { return vimperator.completion.option(filter); }
        }
    ));
    // TODO: sclose instead?
    commandManager.add(new vimperator.Command(["sbcl[ose]"],
        function (args)
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
            shortHelp: "Close the sidebar window"
        }
    ));
    // TODO: sopen instead? Separate :sidebar from :sbopen and make them behave
    // more like :cw, :cope etc
    commandManager.add(new vimperator.Command(["sideb[ar]", "sb[ar]", "sbope[n]"],
        function (args)
        {
            if (!args)
            {
                vimperator.echoerr("E471: Argument required");
                return;
            }

            // do nothing if the requested sidebar is already open
            if (document.getElementById("sidebar-title").value == args)
            {
                document.getElementById("sidebar-box").contentWindow.focus();
                return;
            }

            var menu = document.getElementById("viewSidebarMenu");

            for (var i = 0; i < menu.childNodes.length; i++)
            {
                if (menu.childNodes[i].label == args)
                {
                    eval(menu.childNodes[i].getAttribute("oncommand"));
                    break;
                }
            }
        },
        {
            usage: ["sidebar {name}"],
            shortHelp: "Open the sidebar window",
            help: "<code class=\"argument\">{name}</code> is any of the menu items listed under the standard Firefox View->Sidebar " +
                  "menu. Add-ons, Preferences and Downloads are also available in the sidebar.",
            completer: function (filter) { return vimperator.completion.sidebar(filter); }
        }
    ));
    commandManager.add(new vimperator.Command(["so[urce]"],
        function (args, special)
        {
            // FIXME: implement proper filename quoting
            //if (/[^\\]\s/.test(args))
            //{
            //    vimperator.echoerr("E172: Only one file name allowed");
            //    return;
            //}

            vimperator.source(args, special);
        },
        {
            usage: ["so[urce][!] {file}"],
            shortHelp: "Read Ex commands from {file}",
            help: "You can either source files which mostly contain Ex commands like <code class=\"command\">map &lt; gt</code> " +
                  "and put JavaScript code within a:<br/><code class=\"code\">" +
                  "js &lt;&lt;EOF<br/>hello = function () {<br/>&nbsp;&nbsp;alert(\"Hello world\");<br/>}<br/>EOF<br/></code> section.<br/>" +
                  "Or you can alternatively source a file which ends in .js, these files are automatically sourced as pure JavaScript files.<br/>" +
                  "NOTE: In both cases you must add functions to the global window object like shown above, functions written as:<br/>" +
                  "<code class=\"code\">function hello2() {<br/>&nbsp;&nbsp;alert(\"Hello world\");<br/>}<br/></code>are only available within the scope of the script. <br/><br/>" +
                  "The .vimperatorrc file in your home directory and any files in ~/.vimperator/plugin/ are always sourced at startup.<br/>" +
                  "~ is supported as a shortcut for the <var>$HOME</var> directory.<br/>" +
                  "If <code class=\"command\">!</code> is specified, errors are not printed.",
            completer: function (filter) { return vimperator.completion.file(filter, true); }
        }
    ));
    commandManager.add(new vimperator.Command(["st[op]"],
        BrowserStop,
        {
            shortHelp: "Stop loading",
            help: "Stop loading current web page."
        }
    ));
    commandManager.add(new vimperator.Command(["tab"],
        function (args) { vimperator.execute(args, { inTab: true }); },
        {
            usage: ["tab {cmd}"],
            shortHelp: "Execute {cmd} and tell it to output in a new tab",
            help: "Works only for commands that support it, currently:" +
                  "<ul><li>:tab help</li>" +
                  "<li>:tab prefs[!]</li></ul>",
            completer: function (filter) { return vimperator.completion.command(filter); }
        }
    ));
    commandManager.add(new vimperator.Command(["tabl[ast]"],
        function () { vimperator.tabs.select("$", false); },
        {
            shortHelp: "Switch to the last tab"
        }
    ));
    commandManager.add(new vimperator.Command(["tabm[ove]"],
        function (args, special)
        {
            // FIXME: tabmove! N should probably produce an error
            if (!/^([+-]?\d+|)$/.test(args))
            {
                vimperator.echoerr("E488: Trailing characters");
                return;
            }

            if (!args)
                args = "$"; // if not specified, move to the last tab

            vimperator.tabs.move(getBrowser().mCurrentTab, args, special);
        },
        {
            usage: ["tabm[ove] [N]", "tabm[ove][!] +N | -N"],
            shortHelp: "Move the current tab after tab N",
            help: "When N is 0 the current tab is made the first one. Without N the current tab is made the last one. " +
                  "N can also be prefixed with '+' or '-' to indicate a relative movement. If <code class=\"command\">!</code> is specified the movement wraps around the start or end of the tab list."
        }
    ));
    commandManager.add(new vimperator.Command(["tabn[ext]", "tn[ext]"],
        // TODO: count support
        function (args)
        {
            if (!args)
            {
                vimperator.tabs.select("+1", true);
            }
            else if (/^\d+$/.test(args))
            {
                var index = parseInt(args, 10) - 1;
                if (index < vimperator.tabs.count)
                    vimperator.tabs.select(index, true);
                else
                    vimperator.beep();
            }
            else
            {
                vimperator.echoerr("E488: Trailing characters");
            }
        },
        {
            usage: ["tabn[ext] [count]"],
            shortHelp: "Switch to the next or [count]th tab",
            help: "Cycles to the first tab when the last is selected and <code class=\"argument\">{count}</code> is not specified."
        }
    ));
    commandManager.add(new vimperator.Command(["tabo[nly]"],
        function () { vimperator.tabs.keepOnly(getBrowser().mCurrentTab); },
        {
            shortHelp: "Close all other tabs"
        }
    ));
    commandManager.add(new vimperator.Command(["tabopen", "t[open]", "tabnew", "tabe[dit]"],
        function (args, special)
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
            shortHelp: "Open one or more URLs in a new tab",
            help: "Like <code class=\"command\">:open</code> but open URLs in a new tab.<br/>" +
                  "If used with <code class=\"command\">!</code>, the 'tabopen' value of the <code class=\"option\">'activate'</code> option is negated.",
            completer: function (filter) { return vimperator.completion.url(filter); }
        }
    ));
    commandManager.add(new vimperator.Command(["tabp[revious]", "tp[revious]", "tabN[ext]", "tN[ext]"],
        // TODO: count support
        function (args)
        {
            if (!args)
                vimperator.tabs.select("-1", true);
            else if (/^\d+$/.test(args))
                vimperator.tabs.select("-" + args, true); // FIXME: urgh!
            else
                vimperator.echoerr("E488: Trailing characters");
        },
        {
            usage: ["tabp[revious] [count]"],
            shortHelp: "Switch to the previous tab or go [count] tabs back",
            help: "Wraps around from the first tab to the last tab."
        }
    ));
    commandManager.add(new vimperator.Command(["tabr[ewind]", "tabfir[st]"],
        function () { vimperator.tabs.select(0, false); },
        {
            usage: ["tabr[ewind]", "tabfir[st]"],
            shortHelp: "Switch to the first tab"
        }
    ));
    commandManager.add(new vimperator.Command(["time"],
        function (args, special, count)
        {
            try
            {
                if (count > 1)
                {
                    var i = count;
                    var beforeTime = Date.now();

                    if (args && args[0] == ":")
                    {
                        while (i--)
                            vimperator.execute(args);
                    }
                    else
                    {
                        while (i--)
                            eval("with(vimperator){" + args + "}");
                    }

                    if (special)
                        return;

                    var afterTime = Date.now();

                    if ((afterTime - beforeTime) / count >= 100)
                    {
                        var each = ((afterTime - beforeTime) / 1000.0 / count);
                        var eachUnits = "sec";
                    }
                    else
                    {
                        var each = ((afterTime - beforeTime) / count);
                        var eachUnits = "msec";
                    }

                    if (afterTime - beforeTime >= 100)
                    {
                        var total = ((afterTime - beforeTime) / 1000.0);
                        var totalUnits = "sec";
                    }
                    else
                    {
                        var total = (afterTime - beforeTime);
                        var totalUnits = "msec";
                    }

                    var str = ":" + vimperator.util.escapeHTML(vimperator.commandline.getCommand()) + "<br/>" +
                              "<table>" +
                              "<tr align=\"left\" class=\"hl-Title\"><th colspan=\"3\">Code execution summary</th></tr>" +
                              "<tr><td>  Executed:</td><td align=\"right\"><span style=\"color: green\">" + count + "</span></td><td>times</td></tr>" +
                              "<tr><td>  Average time:</td><td align=\"right\"><span style=\"color: green\">" + each.toFixed(2) + "</span></td><td>" + eachUnits + "</td></tr>" +
                              "<tr><td>  Total time:</td><td align=\"right\"><span style=\"color: red\">" + total.toFixed(2) + "</span></td><td>" + totalUnits + "</td></tr>" +
                              "</table>";

                    vimperator.commandline.echo(str, vimperator.commandline.HL_NORMAL, vimperator.commandline.FORCE_MULTILINE);
                }
                else
                {
                    var beforeTime = Date.now();
                    if (args && args[0] == ":")
                        vimperator.execute(args);
                    else
                        eval("with(vimperator){" + args + "}");

                    if (special)
                        return;

                    var afterTime = Date.now();

                    if (afterTime - beforeTime >= 100)
                        vimperator.echo("Total time: " + ((afterTime - beforeTime) / 1000.0).toFixed(2) + " sec");
                    else
                        vimperator.echo("Total time: " + (afterTime - beforeTime) + " msec");
                }
            }
            catch (e)
            {
                vimperator.echoerr(e);
            }
        },
        {
            usage: ["{count}time[!] {code|:command}"],
            shortHelp: "Profile a piece of code or a command",
            help: "Runs <code class=\"argument\">{code} {count}</code> times (default 1) and returns the elapsed time. " +
                  "<code class=\"argument\">{code}</code> is always passed to JavaScript's eval(), which might be slow, so take the results with a grain of salt.<br/>" +
                  "If <code class=\"argument\">{code}</code> starts with a :, it is executed as a Vimperator command.<br/>" +
                  "Use the special version with [!] if you just want to run any command multiple times without showing profiling statistics."
        }
    ));
    commandManager.add(new vimperator.Command(["u[ndo]"],
        function (args, special, count)
        {
            if (count < 1)
                count = 1;

            if (args)
            {
                var ss = Cc["@mozilla.org/browser/sessionstore;1"].getService(Ci.nsISessionStore);
                var undoItems = eval("(" + ss.getClosedTabData(window) + ")");
                for (var i = 0; i < undoItems.length; i++)
                {
                    if (undoItems[i].state.entries[0].url == args)
                    {
                        count = i + 1;
                        break;
                    }
                }
            }
            undoCloseTab(count - 1);
        },
        {
            usage: ["[count]u[ndo][!] [url]"],
            shortHelp: "Undo closing of a tab",
            help: "If a count is given, don't close the last but the <code class=\"argument\">[count]</code>th last tab. " +
                  "With <code class=\"argument\">[url]</code> restores the tab matching the url.",
            completer: function (filter)
            {
                // get closed-tabs from nsSessionStore
                var ss = Cc["@mozilla.org/browser/sessionstore;1"].getService(Ci.nsISessionStore);
                var undoItems = eval("(" + ss.getClosedTabData(window) + ")");
                var completions = [];
                for (var i = 0; i < undoItems.length; i++)
                {
                    // undoItems[i].image is also available if need for favicons
                    var url = undoItems[i].state.entries[0].url;
                    var title = undoItems[i].title;
                    if (vimperator.completion.match([url, title], filter, false))
                        completions.push([url, title]);
                }
                return [0, completions];
            }
        }
    ));
    commandManager.add(new vimperator.Command(["undoa[ll]"],
        function (args, special, count)
        {
            if (count > -1)
            {
                vimperator.echoerr("E481: No range allowed");
                return;
            }
            if (special)
            {
                vimperator.echoerr("E477: No ! allowed");
                return;
            }

            var ss = Cc["@mozilla.org/browser/sessionstore;1"].getService(Ci.nsISessionStore);
            var undoItems = eval("(" + ss.getClosedTabData(window) + ")");
            for (var i = 0; i < undoItems.length; i++)
                undoCloseTab(); // doesn't work with i as the index to undoCloseTab
        },
        {
            shortHelp: "Undo closing of all closed tabs",
            help: "Firefox stores up to 10 closed tabs, even after a browser restart."
        }
    ));
    commandManager.add(new vimperator.Command(["unl[et]"],
        function (args, special)
        {
            if (!args)
            {
                vimperator.echoerr("E471: Argument required");
                return;
            }

            var names = args.split(/ /);
            if (typeof names == "string") names = [names];
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
            shortHelp: "Deletes a variable.",
            help: "Deletes the variable <code class=\"argument\">{name}</code>." +
                  "Several variable names can be given."
        }
    ));
    commandManager.add(new vimperator.Command(["unm[ap]"],
        function (args)
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
            shortHelp: "Remove the mapping of {lhs}",
            help: ""
        }
    ));
    commandManager.add(new vimperator.Command(["cunm[ap]"],
        function (args)
        {
            if (!args)
            {
                vimperator.echoerr("E474: Invalid argument");
                return;
            }

            var lhs = args;

            if (vimperator.mappings.hasMap(vimperator.modes.COMMAND_LINE, lhs))
                vimperator.mappings.remove(vimperator.modes.COMMAND_LINE, lhs);
            else
                vimperator.echoerr("E31: No such mapping");
        },
        {
            usage: ["cunm[ap] {lhs}"],
            shortHelp: "Remove the mapping of {lhs} (in command-line mode)",
            help: ""
        }
    ));
    commandManager.add(new vimperator.Command(["iunm[ap]"],
        function (args)
        {
            if (!args)
            {
                vimperator.echoerr("E474: Invalid argument");
                return;
            }

            var lhs = args;
            var flag = false;

            if (vimperator.mappings.hasMap(vimperator.modes.INSERT, lhs))
            {
                vimperator.mappings.remove(vimperator.modes.INSERT, lhs);
                flag = true;
            }
            if (vimperator.mappings.hasMap(vimperator.modes.TEXTAREA, lhs))
            {
                vimperator.mappings.remove(vimperator.modes.TEXTAREA, lhs);
                flag = true;
            }
            if (!flag)
                vimperator.echoerr("E31: No such mapping");
        },
        {
            usage: ["iunm[ap] {lhs}"],
            shortHelp: "Remove the mapping of {lhs} (in insert mode)",
            help: ""
        }
    ));
    commandManager.add(new vimperator.Command(["ve[rsion]"],
        function (args, special)
        {
            if (special)
                vimperator.open("about:");
            else
                vimperator.echo(":" + vimperator.util.escapeHTML(vimperator.commandline.getCommand()) +
                                "\nVimperator " + vimperator.version + " running on:\n" + navigator.userAgent);
        },
        {
            usage: ["ve[rsion][!]"],
            shortHelp: "Show version information",
            help: "You can show the Firefox version page with <code class=\"command\">:version!</code>."
        }
    ));
    commandManager.add(new vimperator.Command(["viu[sage]"],
        function (args, special, count, modifiers) { vimperator.help("mappings", special, null, modifiers); },
        {
            shortHelp: "Show help for normal mode commands"
        }
    ));
    commandManager.add(new vimperator.Command(["winc[lose]", "wc[lose]"],
        function (args)
        {
            window.close();
        },
        {
            usage: ["winc[ose] [url] [, url]"],
            shortHelp: "Close window"
        }
    ));
    commandManager.add(new vimperator.Command(["wino[pen]", "wo[pen]", "wine[dit]"],
        function (args)
        {
            if (args)
                vimperator.open(args, vimperator.NEW_WINDOW);
            else
                vimperator.open("about:blank", vimperator.NEW_WINDOW);
        },
        {
            usage: ["wino[pen] [url] [, url]"],
            shortHelp: "Open one or more URLs in a new window",
            help: "Like <code class=\"command\">:open</code> but open URLs in a new window.<br/>"
        }
    ));
    commandManager.add(new vimperator.Command(["wqa[ll]", "wq", "xa[ll]"],
        function () { vimperator.quit(true); },
        {
            usage: ["wqa[ll]", "xa[ll]"],
            shortHelp: "Save the session and quit",
            help: "Quit Vimperator, no matter how many tabs/windows are open. The session is stored.<br/>" +
                  "<code class=\"command\">:wq</code> is different as in Vim, as it closes the window instead of just one tab by popular demand. Complain on the mailing list, if you want to change that."
        }
    ));
    commandManager.add(new vimperator.Command(["zo[om]"],
        function (args, special)
        {
            var level;

            if (!args)
            {
                level = 100;
            }
            else if (/^\d+$/.test(args))
            {
                level = parseInt(args, 10);
            }
            else if (/^[+-]\d+$/.test(args))
            {
                if (special)
                    level = vimperator.buffer.fullZoom + parseInt(args, 10);
                else
                    level = vimperator.buffer.textZoom + parseInt(args, 10);

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

            if (special)
                vimperator.buffer.fullZoom = level;
            else
                vimperator.buffer.textZoom = level;
        },
        {
            usage: ["zo[om][!] [value]", "zo[om][!] +{value} | -{value}"],
            shortHelp: "Set zoom value of current web page",
            help: "If <code class=\"argument\">{value}</code> can be an absolute value between 1 and 2000% or a relative value if prefixed with - or +. " +
                  "If <code class=\"argument\">{value}</code> is omitted, zoom is reset to 100%.<br/>" +
                  "Normally this command operates on the text zoom, if used with <code class=\"argument\">[!]</code> it operates on full zoom."
        }
    ));
    commandManager.add(new vimperator.Command(["!", "run"],
        function (args, special)
        {
            // :!! needs to be treated specially as the command parser sets the special flag but removes the ! from args
            if (special)
                args = "!" + (args || "");

            // TODO: better escaping of ! to also substitute \\! correctly
            args = args.replace(/(^|[^\\])!/g, "$1" + lastRunCommand);
            lastRunCommand = args;

            var output = vimperator.system(args);
            if (output)
                vimperator.echo(vimperator.util.escapeHTML(output));
        },
        {
            usage: ["!{cmd}"],
            shortHelp: "Run a command",
            help: "Runs <code class=\"argument\">{cmd}</code> through system() and displays its output. " +
                  "Any '!' in <code class=\"argument\">{cmd}</code> is replaced with the previous external command. " +
                  "But not when there is a backslash before the '!', then that backslash is removed.<br/>" +
                  "Input redirection (< foo) not done, also do not run commands which require stdin or it will hang Firefox!"
        }
    ));
    //}}}

    return commandManager;
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
