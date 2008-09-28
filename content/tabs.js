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

(c) 2006-2008: Martin Stubenschrott <stubenschrott@gmx.net>

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

// TODO: many methods do not work with Thunderbird correctly yet

liberator.Tabs = function () //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var tabmail;
    var getBrowser = (function () {
        if (liberator.config.hostApplication == "Thunderbird")
        {
            return function ()
            {
                if (!tabmail)
                {
                    tabmail = document.getElementById('tabmail');
                    tabmail.__defineGetter__('mTabContainer', function () { return this.tabContainer; });
                    tabmail.__defineGetter__('mTabs', function () { return this.tabContainer.childNodes; });
                    tabmail.__defineGetter__('mCurrentTab', function () { return this.tabContainer.selectedItem; });
                    tabmail.__defineGetter__('mStrip', function () { return this.tabStrip; });
                }
                return tabmail;
            };
        }
        else
            return window.getBrowser;
    })();
    var alternates = [getBrowser().mCurrentTab, null];

    // used for the "gb" and "gB" mappings to remember the last :buffer[!] command
    var lastBufferSwitchArgs = "";
    var lastBufferSwitchSpecial = true;

    // @param spec can either be:
    // - an absolute integer
    // - "" for the current tab
    // - "+1" for the next tab
    // - "-3" for the tab, which is 3 positions left of the current
    // - "$" for the last tab
    function indexFromSpec(spec, wrap)
    {
        var position = getBrowser().mTabContainer.selectedIndex;
        var length   = getBrowser().mTabs.length;
        var last     = length - 1;

        if (spec === undefined || spec === "")
            return position;

        if (typeof spec === "number")
            position = spec;
        else if (spec === "$")
            position = last;
        else if (/^[+-]\d+$/.test(spec))
            position += parseInt(spec, 10);
        else if (/^\d+$/.test(spec))
            position = parseInt(spec, 10);
        else
            return -1;

        if (position > last)
            position = wrap ? position % length : last;
        else if (position < 0)
            position = wrap ? (position % length) + length : 0;

        return position;
    }

    function copyTab(to, from)
    {
        var ss = Components.classes["@mozilla.org/browser/sessionstore;1"]
                           .getService(Components.interfaces.nsISessionStore);

        if (!from)
            from = getBrowser().mTabContainer.selectedItem;

        var tabState = ss.getTabState(from);
        ss.setTabState(to, tabState);
    }

    // hide tabs initially
    if (liberator.config.name == "Vimperator")
        getBrowser().mStrip.getElementsByClassName("tabbrowser-tabs")[0].collapsed = true;

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// OPTIONS /////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    liberator.options.add(["showtabline", "stal"],
        "Control when to show the tab bar of opened web pages",
        "number", liberator.config.name == "Vimperator" ? 2 : 0,
        {
            setter: function (value)
            {
                var tabs = liberator.tabs.tabStrip;

                if (!tabs)
                    return;

                if (value == 0)
                {
                    tabs.collapsed = true;
                }
                else if (value == 1)
                {
                    liberator.options.setPref("browser.tabs.autoHide", true);
                    tabs.collapsed = false;
                }
                else
                {
                    liberator.options.setPref("browser.tabs.autoHide", false);
                    tabs.collapsed = false;
                }

                return value;
            },
            completer: function (filter)
            {
                return [
                  ["0", "Never show tab bar"],
                  ["1", "Show tab bar only if more than one tab is open"],
                  ["2", "Always show tab bar"]
                ];
            },
            validator: function (value) value >= 0 && value <= 2
        });

    if (liberator.config.name == "Vimperator")
    {
        liberator.options.add(["activate", "act"],
            "Define when tabs are automatically activated",
            "stringlist", "homepage,quickmark,tabopen,paste",
            {
                completer: function (filter)
                {
                    return [
                        ["homepage", "gH mapping"],
                        ["quickmark", "go and gn mappings"],
                        ["tabopen", ":tabopen[!] command"],
                        ["paste", "P and gP mappings"]
                    ];
                },
                validator: function (value)
                {
                    return value.split(",").every(
                        function (item) /^(homepage|quickmark|tabopen|paste|)$/.test(item)
                    );
                }
            });

        liberator.options.add(["newtab"],
            "Define which commands should output in a new tab by default",
            "stringlist", "",
            {
                completer: function (filter)
                {
                    return [
                        ["all", "All commands"],
                        ["addons", ":addo[ns] command"],
                        ["downloads", ":downl[oads] command"],
                        ["help", ":h[elp] command"],
                        ["javascript", ":javascript! or :js! command"],
                        ["prefs", ":pref[erences]! or :prefs! command"]
                    ];
                },
                validator: function (value)
                {
                    return value == "all" || value.split(",").every(
                        function (item) /^(addons|downloads|help|javascript|prefs|)$/.test(item)
                    );
                }
            });

        liberator.options.add(["popups", "pps"],
            "Where to show requested popup windows",
            "number", 1,
            {
                setter: function (value)
                {
                    var values = [[0, 1], // always in current tab
                                  [0, 3], // in a new tab
                                  [2, 3], // in a new window if it has specified sizes
                                  [1, 2], // always in new window
                                  [2, 1]];// current tab unless it has specified sizes

                    liberator.options.setPref("browser.link.open_newwindow.restriction", values[value][0]);
                    liberator.options.setPref("browser.link.open_newwindow", values[value][1]);

                    return value;
                },
                completer: function (filter)
                {
                    return [
                        ["0", "Force to open in the current tab"],
                        ["1", "Always open in a new tab"],
                        ["2", "Open in a new window if it has a specific requested size (default in Firefox)"],
                        ["3", "Always open in a new window"],
                        ["4", "Open in the same tab unless it has a specific requested size"]
                    ];
                },
                validator: function (value) value >= 0 && value <= 4
            });
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// MAPPINGS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    liberator.mappings.add([liberator.modes.NORMAL], ["g0", "g^"],
        "Go to the first tab",
        function (count) { liberator.tabs.select(0); });

    liberator.mappings.add([liberator.modes.NORMAL], ["g$"],
        "Go to the last tab",
        function (count) { liberator.tabs.select("$"); });

    liberator.mappings.add([liberator.modes.NORMAL], ["gt", "<C-n>", "<C-Tab>", "<C-PageDown>"],
        "Go to the next tab",
        function (count) { liberator.tabs.select(count > 0 ? count - 1: "+1", count > 0 ? false : true); },
        { flags: liberator.Mappings.flags.COUNT });

    liberator.mappings.add([liberator.modes.NORMAL], ["gT", "<C-p>", "<C-S-Tab>", "<C-PageUp>"],
       "Go to previous tab",
        function (count) { liberator.tabs.select("-" + (count < 1 ? 1 : count), true); },
        { flags: liberator.Mappings.flags.COUNT });

    if (liberator.config.name == "Vimperator")
    {
        liberator.mappings.add([liberator.modes.NORMAL], ["b"],
            "Open a prompt to switch buffers",
            function () { liberator.commandline.open(":", "buffer! ", liberator.modes.EX); });

        liberator.mappings.add([liberator.modes.NORMAL], ["B"],
            "Show buffer list",
            function () { liberator.tabs.list(false); });

        liberator.mappings.add([liberator.modes.NORMAL], ["d"],
            "Delete current buffer",
            function (count) { liberator.tabs.remove(getBrowser().mCurrentTab, count, false, 0); },
            { flags: liberator.Mappings.flags.COUNT });

        liberator.mappings.add([liberator.modes.NORMAL], ["D"],
            "Delete current buffer, focus tab to the left",
            function (count) { liberator.tabs.remove(getBrowser().mCurrentTab, count, true, 0); },
            { flags: liberator.Mappings.flags.COUNT });

        liberator.mappings.add([liberator.modes.NORMAL], ["gb"],
            "Repeat last :buffer[!] command",
            function (count) { liberator.tabs.switchTo(null, null, count, false); },
            { flags: liberator.Mappings.flags.COUNT });

        liberator.mappings.add([liberator.modes.NORMAL], ["gB"],
            "Repeat last :buffer[!] command in reverse direction",
            function (count) { liberator.tabs.switchTo(null, null, count, true); },
            { flags: liberator.Mappings.flags.COUNT });

        liberator.mappings.add([liberator.modes.NORMAL], ["u"],
            "Undo closing of a tab",
            function (count) { liberator.commands.get("undo").execute("", false, count); },
            { flags: liberator.Mappings.flags.COUNT });

        liberator.mappings.add([liberator.modes.NORMAL], ["<C-^>", "<C-6>"],
            "Select the alternate tab or the [count]th tab",
            function (count)
            {
                if (count < 1)
                    liberator.tabs.selectAlternateTab();
                else
                    liberator.tabs.switchTo(count.toString(), false);
            },
            { flags: liberator.Mappings.flags.COUNT });
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    liberator.commands.add(["bd[elete]", "bw[ipeout]", "bun[load]", "tabc[lose]"],
        "Delete current buffer",
        function (args, special, count)
        {
            if (args)
            {
                args = args.toLowerCase();
                var removed = 0;
                var match;
                if (match = args.match(/^(\d+):?/))
                {
                    liberator.tabs.remove(liberator.tabs.getTab(parseInt(match[1], 10) - 1));
                    removed = 1;
                }
                else
                {
                    var browsers = getBrowser().browsers;
                    for (let i = browsers.length - 1; i >= 0; i--)
                    {
                        var title = browsers[i].contentTitle.toLowerCase() || "";
                        var uri = browsers[i].currentURI.spec.toLowerCase();
                        var host = browsers[i].currentURI.host.toLowerCase();

                        if (host.indexOf(args) >= 0 || uri == args ||
                            (special && (title.indexOf(args) >= 0 || uri.indexOf(args) >= 0)))
                        {
                            liberator.tabs.remove(liberator.tabs.getTab(i));
                            removed++;
                        }
                    }
                }

                if (removed > 0)
                    liberator.echo(removed + " fewer tab(s)");
                else
                    liberator.echoerr("E94: No matching tab for " + args);
            }
            else // just remove the current tab
                liberator.tabs.remove(getBrowser().mCurrentTab, count > 0 ? count : 1, special, 0);
        },
        {
            completer: function (filter) liberator.completion.buffer(filter)
        });

    // TODO: this should open in a new tab positioned directly after the current one, not at the end
    liberator.commands.add(["tab"],
        "Execute a command and tell it to output in a new tab",
        function (args)
        {
            liberator.forceNewTab = true;
            liberator.execute(args);
            liberator.forceNewTab = false;
        },
        {
            completer: function (filter) liberator.completion.ex(filter)
        });

    liberator.commands.add(["tabl[ast]", "bl[ast]"],
        "Switch to the last tab",
        function ()
        {
            liberator.tabs.select("$", false);
        },
        { argCount: "0" });

    // TODO: "Zero count" if 0 specified as arg
    liberator.commands.add(["tabp[revious]", "tp[revious]", "tabN[ext]", "tN[ext]", "bp[revious]", "bN[ext]"],
        "Switch to the previous tab or go [count] tabs back",
        function (args, special, count)
        {
            // count is ignored if an arg is specified, as per Vim
            if (args)
            {
                if (/^\d+$/.test(args))
                    liberator.tabs.select("-" + args, true); // FIXME: urgh!
                else
                    liberator.echoerr("E488: Trailing characters");
            }
            else if (count > 0)
            {
                liberator.tabs.select("-" + count, true);
            }
            else
            {
                liberator.tabs.select("-1", true);
            }
        });

    // TODO: "Zero count" if 0 specified as arg
    liberator.commands.add(["tabn[ext]", "tn[ext]", "bn[ext]"],
        "Switch to the next or [count]th tab",
        function (args, special, count)
        {
            if (args || count > 0)
            {
                var index;

                // count is ignored if an arg is specified, as per Vim
                if (args)
                {
                    if (/^\d+$/.test(args))
                    {
                        index = args - 1;
                    }
                    else
                    {
                        liberator.echoerr("E488: Trailing characters");
                        return;
                    }
                }
                else
                {
                    index = count - 1;
                }

                if (index < liberator.tabs.count)
                    liberator.tabs.select(index, true);
                else
                    liberator.beep();
            }
            else
            {
                liberator.tabs.select("+1", true);
            }
        });

    liberator.commands.add(["tabr[ewind]", "tabfir[st]", "br[ewind]", "bf[irst]"],
        "Switch to the first tab",
        function ()
        {
            liberator.tabs.select(0, false);
        },
        { argCount: "0" });

    if (liberator.config.name == "Vimperator")
    {
        // TODO: "Zero count" if 0 specified as arg, multiple args and count ranges?
        liberator.commands.add(["b[uffer]"],
            "Switch to a buffer",
            function (args, special, count)
            {
                // if a numeric arg is specified any count is ignored; if a
                // count and non-numeric arg are both specified then E488
                if (args && count > 0)
                {
                    if (/^\d+$/.test(args))
                        liberator.tabs.switchTo(args, special);
                    else
                        liberator.echoerr("E488: Trailing characters");
                }
                else if (count > 0)
                {
                    liberator.tabs.switchTo(count.toString(), special);
                }
                else
                {
                    liberator.tabs.switchTo(args, special);
                }
            },
            {
                completer: function (filter) liberator.completion.buffer(filter)
            });

        liberator.commands.add(["buffers", "files", "ls", "tabs"],
            "Show a list of all buffers",
            function (args, special)
            {
                liberator.tabs.list(special);
            },
            { argCount: "0" });

        liberator.commands.add(["quita[ll]", "qa[ll]"],
            "Quit " + liberator.config.name,
            function (args, special)
            {
                liberator.quit(false, special);
            },
            { argCount: "0" });

        liberator.commands.add(["reloada[ll]"],
            "Reload all tab pages",
            function (args, special)
            {
                liberator.tabs.reloadAll(special);
            },
            { argCount: "0" });

        // TODO: add count support
        liberator.commands.add(["tabm[ove]"],
            "Move the current tab after tab N",
            function (args, special)
            {
                // FIXME: tabmove! N should probably produce an error
                if (!/^([+-]?\d+|)$/.test(args))
                {
                    liberator.echoerr("E488: Trailing characters");
                    return;
                }

                if (!args)
                    args = "$"; // if not specified, move to the last tab

                liberator.tabs.move(getBrowser().mCurrentTab, args, special);
            });

        liberator.commands.add(["tabo[nly]"],
            "Close all other tabs",
            function ()
            {
                liberator.tabs.keepOnly(getBrowser().mCurrentTab);
            },
            { argCount: "0" });

        liberator.commands.add(["tabopen", "t[open]", "tabnew", "tabe[dit]"],
            "Open one or more URLs in a new tab",
            function (args, special)
            {
                var where = special ? liberator.NEW_TAB : liberator.NEW_BACKGROUND_TAB;
                if (/\btabopen\b/.test(liberator.options["activate"]))
                    where = special ? liberator.NEW_BACKGROUND_TAB : liberator.NEW_TAB;

                if (args)
                    liberator.open(args, where);
                else
                    liberator.open("about:blank", where);
            },
            {
                completer: function (filter) liberator.completion.url(filter)
            });

        liberator.commands.add(["tabde[tach]"],
            "Detach current tab to its own window",
            function (args, special, count)
            {
                liberator.tabs.detachTab(null);
            },
            { argCount: "0" });

        liberator.commands.add(["tabd[uplicate]"],
            "Duplicate current tab",
            function (args, special, count)
            {
                var tab = liberator.tabs.getTab();

                var activate = special ? true : false;
                if (/\btabopen\b/.test(liberator.options["activate"]))
                    activate = !activate;

                if (count < 1)
                    count = 1;

                for (let i = 0; i < count; i++)
                    liberator.tabs.cloneTab(tab, activate);
            },
            { argCount: "0" });
    }

    if (liberator.has("session"))
    {
        // TODO: extract common functionality of "undoall"
        liberator.commands.add(["u[ndo]"],
            "Undo closing of a tab",
            function (args, special, count)
            {
                if (count < 1)
                    count = 1;

                if (args)
                {
                    var ss = Components.classes["@mozilla.org/browser/sessionstore;1"]
                                       .getService(Components.interfaces.nsISessionStore);
                    var undoItems = eval("(" + ss.getClosedTabData(window) + ")");
                    for (let i = 0; i < undoItems.length; i++)
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
                completer: function (filter)
                {
                    // get closed-tabs from nsSessionStore
                    var ss = Components.classes["@mozilla.org/browser/sessionstore;1"]
                                       .getService(Components.interfaces.nsISessionStore);
                    var undoItems = eval("(" + ss.getClosedTabData(window) + ")");
                    var completions = [];
                    for (let i = 0; i < undoItems.length; i++)
                    {
                        var url = undoItems[i].state.entries[0].url;
                        var title = undoItems[i].title;
                        if (liberator.completion.match([url, title], filter, false))
                            completions.push([url, title]);
                    }
                    return [0, completions];
                }
            });

        liberator.commands.add(["undoa[ll]"],
            "Undo closing of all closed tabs",
            function (args, special, count)
            {
                if (count > -1)
                {
                    liberator.echoerr("E481: No range allowed");
                    return;
                }
                if (special)
                {
                    liberator.echoerr("E477: No ! allowed");
                    return;
                }

                var ss = Components.classes["@mozilla.org/browser/sessionstore;1"]
                                   .getService(Components.interfaces.nsISessionStore);
                var undoItems = eval("(" + ss.getClosedTabData(window) + ")");
                for (let i = 0; i < undoItems.length; i++)
                    undoCloseTab(); // doesn't work with i as the index to undoCloseTab
            },
            { argCount: "0" });

        liberator.commands.add(["wqa[ll]", "wq", "xa[ll]"],
            "Save the session and quit",
            function ()
            {
                liberator.quit(true);
            },
            { argCount: "0" });
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        get alternate() alternates[1],

        get count() getBrowser().mTabs.length,

        // used for :setlocal
        get options()
        {
            var tab = this.getTab();
            if (!tab.liberatorOptions)
                tab.liberatorOptions = {};

            return tab.liberatorOptions;
        },

        get tabStrip()
        {
            if (liberator.config.hostApplication == "Firefox")
                return getBrowser().mStrip.getElementsByClassName("tabbrowser-tabs")[0];
            else if (liberator.config.hostApplication == "Thunderbird")
                return getBrowser().mStrip;
        },

        // @returns the index of the currently selected tab starting with 0
        index: function (tab)
        {
            if (tab)
            {
                var length = getBrowser().mTabs.length;
                for (let i = 0; i < length; i++)
                {
                    if (getBrowser().mTabs[i] == tab)
                        return i;
                }
                return -1;
            }

            return getBrowser().mTabContainer.selectedIndex;
        },

        // TODO: implement filter
        // @returns an array of tabs which match filter
        get: function (filter)
        {
            var buffers = [];
            var browsers = getBrowser().browsers;
            for (let i = 0; i < browsers.length; i++)
            {
                var title = browsers[i].contentTitle || "(Untitled)";
                var uri = browsers[i].currentURI.spec;
                var number = i + 1;
                buffers.push([number, title, uri]);
            }
            return buffers;
        },

        getTab: function (index)
        {
            if (index)
                return getBrowser().mTabs[index];

            return getBrowser().mTabContainer.selectedItem;
        },

        // TODO: shouldn't that have a filter argument?
        list: function ()
        {
            // TODO: move this to liberator.tabs.get()
            var items = liberator.completion.buffer("")[1];
            var number, indicator, title, url;

            var list = ":" + (liberator.util.escapeHTML(liberator.commandline.getCommand()) || "buffers") + "<br/>" + "<table>";
            for (let i = 0; i < items.length; i++)
            {
                if (i == liberator.tabs.index())
                   indicator = " <span style=\"color: blue\">%</span> ";
                else if (i == liberator.tabs.index(liberator.tabs.alternate))
                   indicator = " <span style=\"color: blue\">#</span> ";
                else
                   indicator = "   ";

                [number, title] = items[i][0].split(/:\s+/, 2);
                url = items[i][1];
                url = liberator.util.escapeHTML(url);
                title = liberator.util.escapeHTML(title);

                list += "<tr><td align=\"right\">  " + number + "</td><td>" + indicator +
                        "</td><td style=\"width: 250px; max-width: 500px; overflow: hidden;\">" + title +
                        "</td><td><a href=\"#\" class=\"hl-URL buffer-list\">" + url + "</a></td></tr>";
            }
            list += "</table>";

            liberator.commandline.echo(list, liberator.commandline.HL_NORMAL, liberator.commandline.FORCE_MULTILINE);
        },

        // wrap causes the movement to wrap around the start and end of the tab list
        // NOTE: position is a 0 based index
        move: function (tab, spec, wrap)
        {
            var index = indexFromSpec(spec, wrap);
            getBrowser().moveTabTo(tab, index);
        },

        // quitOnLastTab = 1: quit without saving session
        // quitOnLastTab = 2: quit and save session
        remove: function (tab, count, focusLeftTab, quitOnLastTab)
        {
            var removeOrBlankTab = {
                    Firefox: function (tab)
                    {
                        if (getBrowser().mTabs.length > 1)
                            getBrowser().removeTab(tab);
                        else
                        {
                            if (liberator.buffer.URL != "about:blank" ||
                                getWebNavigation().sessionHistory.count > 0)
                            {
                                liberator.open("about:blank", liberator.NEW_BACKGROUND_TAB);
                                getBrowser().removeTab(tab);
                            }
                            else
                                liberator.beep();
                        }
                    },
                    Thunderbird: function (tab)
                    {
                        if (getBrowser().mTabs.length > 1)
                            getBrowser().removeTab(tab);
                        else
                            liberator.beep();
                    }
                }[liberator.config.hostApplication] || function () {};

            if (typeof count != "number" || count < 1)
                count = 1;

            if (quitOnLastTab >= 1 && getBrowser().mTabs.length <= count)
            {
                if (liberator.windows.length > 1)
                    window.close();
                else
                    liberator.quit(quitOnLastTab == 2);

                return;
            }

            var index = this.index(tab);
            if (focusLeftTab)
            {
                var lastRemovedTab = 0;
                for (let i = index; i > index - count && i >= 0; i--)
                {
                    removeOrBlankTab(this.getTab(i));
                    lastRemovedTab = i > 0 ? i : 1;
                }
                getBrowser().mTabContainer.selectedIndex = lastRemovedTab - 1;
            }
            else
            {
                var i = index + count - 1;
                if (i >= this.count)
                    i = this.count - 1;

                for (; i >= index; i--)
                    removeOrBlankTab(this.getTab(i));
            }
        },

        keepOnly: function (tab)
        {
            getBrowser().removeAllTabsBut(tab);
        },

        select: function (spec, wrap)
        {
            var index = indexFromSpec(spec, wrap);
            // FIXME:
            if (index === -1)
            {
                liberator.beep(); // XXX: move to ex-handling?
                return;
            }
            getBrowser().mTabContainer.selectedIndex = index;
        },

        reload: function (tab, bypassCache)
        {
            if (bypassCache)
            {
                const nsIWebNavigation = Components.interfaces.nsIWebNavigation;
                const flags = nsIWebNavigation.LOAD_FLAGS_BYPASS_PROXY | nsIWebNavigation.LOAD_FLAGS_BYPASS_CACHE;
                getBrowser().getBrowserForTab(tab).reloadWithFlags(flags);
            }
            else
            {
                getBrowser().reloadTab(tab);
            }
        },

        reloadAll: function (bypassCache)
        {
            if (bypassCache)
            {
                for (let i = 0; i < getBrowser().mTabs.length; i++)
                {
                    try
                    {
                        this.reload(getBrowser().mTabs[i], bypassCache);
                    }
                    catch (e)
                    {
                        // FIXME: can we do anything useful here without stopping the
                        //        other tabs from reloading?
                    }
                }
            }
            else
            {
                getBrowser().reloadAllTabs();
            }
        },

        // "buffer" is a string which matches the URL or title of a buffer, if it
        // is null, the last used string is used again
        switchTo: function (buffer, allowNonUnique, count, reverse)
        {
            if (buffer == "")
                return;

            if (buffer != null)
            {
                // store this command, so it can be repeated with "B"
                lastBufferSwitchArgs = buffer;
                lastBufferSwitchSpecial = allowNonUnique;
            }
            else
            {
                buffer = lastBufferSwitchArgs;
                if (typeof allowNonUnique == "undefined" || allowNonUnique == null)
                    allowNonUnique = lastBufferSwitchSpecial;
            }

            if (buffer == "#")
            {
                liberator.tabs.selectAlternateTab();
                return;
            }

            if (!count || count < 1)
                count = 1;
            if (typeof reverse != "boolean")
                reverse = false;

            var match;
            if (match = buffer.match(/^(\d+):?/))
            {
                liberator.tabs.select(parseInt(match[1], 10) - 1, false); // make it zero-based
                return;
            }

            var matches = [];
            var lowerBuffer = buffer.toLowerCase();
            var first = liberator.tabs.index() + (reverse ? 0 : 1);
            for (let i = 0; i < getBrowser().browsers.length; i++)
            {
                var index = (i + first) % getBrowser().browsers.length;
                var url = getBrowser().getBrowserAtIndex(index).contentDocument.location.href;
                var title = getBrowser().getBrowserAtIndex(index).contentDocument.title.toLowerCase();
                if (url == buffer)
                {
                    liberator.tabs.select(index, false);
                    return;
                }

                if (url.indexOf(buffer) >= 0 || title.indexOf(lowerBuffer) >= 0)
                    matches.push(index);
            }
            if (matches.length == 0)
                liberator.echoerr("E94: No matching buffer for " + buffer);
            else if (matches.length > 1 && !allowNonUnique)
                liberator.echoerr("E93: More than one match for " + buffer);
            else
            {
                if (reverse)
                {
                    index = matches.length - count;
                    while (index < 0)
                        index += matches.length;
                }
                else
                    index = (count - 1) % matches.length;

                liberator.tabs.select(matches[index], false);
            }
        },

        cloneTab: function (tab, activate)
        {
            var newTab = getBrowser().addTab();
            copyTab(newTab, tab);

            if (activate)
                getBrowser().mTabContainer.selectedItem = newTab;

            return newTab;
        },

        detachTab: function (tab)
        {
            if (!tab)
                tab = getBrowser().mTabContainer.selectedItem;

            window.open();
            var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                               .getService(Components.interfaces.nsIWindowMediator);
            var win = wm.getMostRecentWindow("navigator:browser");

            copyTab(win.getBrowser().mCurrentTab, tab);
            this.remove(tab, 1, false, 1);
        },

        selectAlternateTab: function ()
        {
            if (liberator.tabs.alternate == null || liberator.tabs.getTab() == liberator.tabs.alternate)
            {
                liberator.echoerr("E23: No alternate page");
                return;
            }

            // NOTE: this currently relies on v.tabs.index() returning the
            // currently selected tab index when passed null
            var index = liberator.tabs.index(liberator.tabs.alternate);

            // TODO: since a tab close is more like a bdelete for us we
            // should probably reopen the closed tab when a 'deleted'
            // alternate is selected
            if (index == -1)
                liberator.echoerr("E86: Buffer does not exist");  // TODO: This should read "Buffer N does not exist"
            else
                liberator.tabs.select(index);
        },

        // NOTE: when restarting a session FF selects the first tab and then the
        // tab that was selected when the session was created.  As a result the
        // alternate after a restart is often incorrectly tab 1 when there
        // shouldn't be one yet.
        updateSelectionHistory: function ()
        {
            alternates = [this.getTab(), alternates[0]];
        }
    };
    //}}}
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
