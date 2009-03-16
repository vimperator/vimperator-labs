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

Copyright (c) 2006-2009 by Martin Stubenschrott <stubenschrott@gmx.net>

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

/** @scope modules */

// TODO: many methods do not work with Thunderbird correctly yet

function Tabs() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var tabmail;
    var getBrowser = (function () {
        if (config.hostApplication == "Thunderbird")
        {
            return function ()
            {
                if (!tabmail)
                {
                    tabmail = document.getElementById("tabmail");
                    tabmail.__defineGetter__("mTabContainer", function () this.tabContainer);
                    tabmail.__defineGetter__("mTabs", function () this.tabContainer.childNodes);
                    tabmail.__defineGetter__("mCurrentTab", function () this.tabContainer.selectedItem);
                    tabmail.__defineGetter__("mStrip", function () this.tabStrip);
                    tabmail.__defineGetter__("browsers", function () [browser for (browser in Iterator(this.mTabs))] );
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
        let position = getBrowser().mTabContainer.selectedIndex;
        let length   = getBrowser().mTabs.length;
        let last     = length - 1;

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
        if (!from)
            from = getBrowser().mTabContainer.selectedItem;

        let tabState = services.get("sessionStore").getTabState(from);
        services.get("sessionStore").setTabState(to, tabState);
    }

    // hide tabs initially
    if (config.name == "Vimperator")
        getBrowser().mStrip.getElementsByClassName("tabbrowser-tabs")[0].collapsed = true;
/*
    if (config.name == "Xulmus")
        getBrowser()._strip.getElementsByClassName(
*/
    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// OPTIONS /////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    options.add(["showtabline", "stal"],
        "Control when to show the tab bar of opened web pages",
        "number", config.name == "Vimperator" ? 2 : 0,
        {
            setter: function (value)
            {
                let tabStrip = tabs.tabStrip;

                if (!tabStrip)
                    return options["showtabline"]; // XXX

                if (value == 0)
                {
                    tabStrip.collapsed = true;
                }
                else
                {
                    let pref = "browser.tabStrip.autoHide";
                    if (options.getPref(pref) == null) // Try for FF 3.0 & 3.1
                        pref = "browser.tabs.autoHide";
                    options.safeSetPref(pref, value == 1);
                    tabStrip.collapsed = false;
                }

                return value;
            },
            completer: function (context) [
                ["0", "Never show tab bar"],
                ["1", "Show tab bar only if more than one tab is open"],
                ["2", "Always show tab bar"]
            ],
            validator: Option.validateCompleter
        });

    if (config.name == "Vimperator" || config.name == "Xulmus" )
    {
        options.add(["activate", "act"],
            "Define when tabs are automatically activated",
            "stringlist", "homepage,quickmark,tabopen,paste",
            {
                completer: function (context) [
                    ["homepage", "gH mapping"],
                    ["quickmark", "go and gn mappings"],
                    ["tabopen", ":tabopen[!] command"],
                    ["paste", "P and gP mappings"]
                ],
                validator: Option.validateCompleter
            });

        options.add(["newtab"],
            "Define which commands should output in a new tab by default",
            "stringlist", "",
            {
                completer: function (context) [
                    ["all", "All commands"],
                    ["addons", ":addo[ns] command"],
                    ["downloads", ":downl[oads] command"],
                    ["help", ":h[elp] command"],
                    ["javascript", ":javascript! or :js! command"],
                    ["prefs", ":pref[erences]! or :prefs! command"]
                ],
                validator: Option.validateCompleter
            });

        options.add(["popups", "pps"],
            "Where to show requested popup windows",
            "number", 1,
            {
                setter: function (value)
                {
                    let values = [[0, 1], // always in current tab
                                  [0, 3], // in a new tab
                                  [2, 3], // in a new window if it has specified sizes
                                  [1, 2], // always in new window
                                  [2, 1]];// current tab unless it has specified sizes

                    options.safeSetPref("browser.link.open_newwindow.restriction", values[value][0]);
                    options.safeSetPref("browser.link.open_newwindow", values[value][1]);

                    return value;
                },
                completer: function (context) [
                    ["0", "Force to open in the current tab"],
                    ["1", "Always open in a new tab"],
                    ["2", "Open in a new window if it has a specific requested size (default in Firefox)"],
                    ["3", "Always open in a new window"],
                    ["4", "Open in the same tab unless it has a specific requested size"]
                ],
                validator: Option.validateCompleter
            });
        let fragment = liberator.has("MacUnix") ? "tab-mac" : "tab";
        // TODO: Add option, or only apply when go~=[nN]
        styles.addSheet(true, "tab-binding", "chrome://browser/content/browser.xul",
            ".tabbrowser-tab { -moz-binding: url(chrome://liberator/content/bindings.xml#" + fragment + ") !important; }");

    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// MAPPINGS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    mappings.add([modes.NORMAL], ["g0", "g^"],
        "Go to the first tab",
        function (count) { tabs.select(0); });

    mappings.add([modes.NORMAL], ["g$"],
        "Go to the last tab",
        function (count) { tabs.select("$"); });

    mappings.add([modes.NORMAL], ["gt"],
        "Go to the next tab",
        function (count) { tabs.select(count > 0 ? count - 1 : "+1", count > 0 ? false : true); },
        { flags: Mappings.flags.COUNT });

    mappings.add([modes.NORMAL], ["<C-n>", "<C-Tab>", "<C-PageDown>"],
        "Go to the next tab",
        function (count) { tabs.select("+" + (count < 1 ? 1 : count), true); },
        { flags: Mappings.flags.COUNT });

    mappings.add([modes.NORMAL], ["gT", "<C-p>", "<C-S-Tab>", "<C-PageUp>"],
       "Go to previous tab",
        function (count) { tabs.select("-" + (count < 1 ? 1 : count), true); },
        { flags: Mappings.flags.COUNT });

    if (config.name == "Vimperator" || config.name == "Xulmus")
    {
        mappings.add([modes.NORMAL], ["b"],
            "Open a prompt to switch buffers",
            function (count)
            {
                if (count != -1)
                    tabs.switchTo(String(count));
                else
                    commandline.open(":", "buffer! ", modes.EX);
            },
            { flags: Mappings.flags.COUNT });

        mappings.add([modes.NORMAL], ["B"],
            "Show buffer list",
            function () { tabs.list(false); });

        mappings.add([modes.NORMAL], ["d"],
            "Delete current buffer",
            function (count) { tabs.remove(tabs.getTab(), count, false, 0); },
            { flags: Mappings.flags.COUNT });

        mappings.add([modes.NORMAL], ["D"],
            "Delete current buffer, focus tab to the left",
            function (count) { tabs.remove(tabs.getTab(), count, true, 0); },
            { flags: Mappings.flags.COUNT });

        mappings.add([modes.NORMAL], ["gb"],
            "Repeat last :buffer[!] command",
            function (count) { tabs.switchTo(null, null, count, false); },
            { flags: Mappings.flags.COUNT });

        mappings.add([modes.NORMAL], ["gB"],
            "Repeat last :buffer[!] command in reverse direction",
            function (count) { tabs.switchTo(null, null, count, true); },
            { flags: Mappings.flags.COUNT });

        mappings.add([modes.NORMAL], ["u"],
            "Undo closing of a tab",
            function (count) { commands.get("undo").execute("", false, count); },
            { flags: Mappings.flags.COUNT });

        mappings.add([modes.NORMAL], ["<C-^>", "<C-6>"],
            "Select the alternate tab or the [count]th tab",
            function (count)
            {
                if (count < 1)
                    tabs.selectAlternateTab();
                else
                    tabs.switchTo(count.toString(), false);
            },
            { flags: Mappings.flags.COUNT });
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    commands.add(["bd[elete]", "bw[ipeout]", "bun[load]", "tabc[lose]"],
        "Delete current buffer",
        function (args)
        {
            let special = args.bang;
            let count   = args.count;
            let arg     = args.literalArg;

            if (arg)
            {
                arg = arg.toLowerCase();
                let removed = 0;
                let matches = arg.match(/^(\d+):?/);

                if (matches)
                {
                    tabs.remove(tabs.getTab(parseInt(matches[1], 10) - 1));
                    removed = 1;
                }
                else
                {
                    let browsers = getBrowser().browsers;
                    for (let i = browsers.length - 1; i >= 0; i--)
                    {
                        let title = browsers[i].contentTitle.toLowerCase() || "";
                        let uri = browsers[i].currentURI.spec.toLowerCase();
                        let host = browsers[i].currentURI.host.toLowerCase();

                        if (host.indexOf(arg) >= 0 || uri == arg ||
                            (special && (title.indexOf(arg) >= 0 || uri.indexOf(arg) >= 0)))
                        {
                            tabs.remove(tabs.getTab(i));
                            removed++;
                        }
                    }
                }

                if (removed > 0)
                    liberator.echomsg(removed + " fewer tab(s)", 9);
                else
                    liberator.echoerr("E94: No matching tab for " + arg);
            }
            else // just remove the current tab
                tabs.remove(tabs.getTab(), count > 0 ? count : 1, special, 0);
        },
        {
            argCount: "?",
            bang: true,
            count: true,
            completer: function (context) completion.buffer(context),
            literal: 0
        });

    // TODO: this should open in a new tab positioned directly after the current one, not at the end
    commands.add(["tab"],
        "Execute a command and tell it to output in a new tab",
        function (args)
        {
            liberator.forceNewTab = true;
            liberator.execute(args.string);
            liberator.forceNewTab = false;
        },
        {
            argCount: "+",
            completer: function (context) completion.ex(context),
            literal: 0
        });

    commands.add(["tabl[ast]", "bl[ast]"],
        "Switch to the last tab",
        function () tabs.select("$", false),
        { argCount: "0" });

    // TODO: "Zero count" if 0 specified as arg
    commands.add(["tabp[revious]", "tp[revious]", "tabN[ext]", "tN[ext]", "bp[revious]", "bN[ext]"],
        "Switch to the previous tab or go [count] tabs back",
        function (args)
        {
            let count = args.count;
            let arg   = args[0];

            // count is ignored if an arg is specified, as per Vim
            if (arg)
            {
                if (/^\d+$/.test(arg))
                    tabs.select("-" + arg, true); // FIXME: urgh!
                else
                    liberator.echoerr("E488: Trailing characters");
            }
            else if (count > 0)
            {
                tabs.select("-" + count, true);
            }
            else
            {
                tabs.select("-1", true);
            }
        },
        {
            argCount: "?",
            count: true
        });

    // TODO: "Zero count" if 0 specified as arg
    commands.add(["tabn[ext]", "tn[ext]", "bn[ext]"],
        "Switch to the next or [count]th tab",
        function (args)
        {
            let count = args.count;
            let arg   = args[0];

            if (arg || count > 0)
            {
                let index;

                // count is ignored if an arg is specified, as per Vim
                if (arg)
                {
                    if (/^\d+$/.test(arg))
                    {
                        index = arg - 1;
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

                if (index < tabs.count)
                    tabs.select(index, true);
                else
                    liberator.beep();
            }
            else
            {
                tabs.select("+1", true);
            }
        },
        {
            argCount: "?",
            count: true
        });

    commands.add(["tabr[ewind]", "tabfir[st]", "br[ewind]", "bf[irst]"],
        "Switch to the first tab",
        function () { tabs.select(0, false); },
        { argCount: "0" });

    if (config.name == "Vimperator" || config.name == "Xulmus")
    {
        // TODO: "Zero count" if 0 specified as arg, multiple args and count ranges?
        commands.add(["b[uffer]"],
            "Switch to a buffer",
            function (args)
            {
                let special = args.bang;
                let count   = args.count;
                let arg     = args.literalArg;

                // if a numeric arg is specified any count is ignored; if a
                // count and non-numeric arg are both specified then E488
                if (arg && count > 0)
                {
                    if (/^\d+$/.test(arg))
                        tabs.switchTo(arg, special);
                    else
                        liberator.echoerr("E488: Trailing characters");
                }
                else if (count > 0)
                {
                    tabs.switchTo(count.toString(), special);
                }
                else
                {
                    tabs.switchTo(arg, special);
                }
            },
            {
                argCount: "?",
                bang: true,
                count: true,
                completer: function (context) completion.buffer(context),
                literal: 0
            });

        commands.add(["buffers", "files", "ls", "tabs"],
            "Show a list of all buffers",
            function (args) { tabs.list(args.literalArg); },
            {
                argCount: "?",
                literal: 0
            });

        commands.add(["quita[ll]", "qa[ll]"],
            "Quit " + config.name,
            function (args) { liberator.quit(false, args.bang); },
            {
                argCount: "0",
                bang: true
            });

        commands.add(["reloada[ll]"],
            "Reload all tab pages",
            function (args) { tabs.reloadAll(args.bang); },
            {
                argCount: "0",
                bang: true
            });

        // TODO: add count support
        commands.add(["tabm[ove]"],
            "Move the current tab after tab N",
            function (args)
            {
                let arg = args[0];

                // FIXME: tabmove! N should probably produce an error
                if (arg && !/^([+-]?\d+)$/.test(arg))
                {
                    liberator.echoerr("E488: Trailing characters");
                    return;
                }

                // if not specified, move to after the last tab
                tabs.move(getBrowser().mCurrentTab, arg || "$", args.bang);
            },
            {
                argCount: "?",
                bang: true
            });

        commands.add(["tabo[nly]"],
            "Close all other tabs",
            function () { tabs.keepOnly(getBrowser().mCurrentTab); },
            { argCount: "0" });

        commands.add(["tabopen", "t[open]", "tabnew", "tabe[dit]"],
            "Open one or more URLs in a new tab",
            function (args)
            {
                let special = args.bang;
                args = args.string;

                let where = special ? liberator.NEW_TAB : liberator.NEW_BACKGROUND_TAB;
                if (/\btabopen\b/.test(options["activate"]))
                    where = special ? liberator.NEW_BACKGROUND_TAB : liberator.NEW_TAB;

                if (args)
                    liberator.open(args, where);
                else
                    liberator.open("about:blank", where);
            },
            {
                bang: true,
                completer: function (context) completion.url(context),
                literal: 0
            });

        commands.add(["tabde[tach]"],
            "Detach current tab to its own window",
            function () { tabs.detachTab(null); },
            { argCount: "0" });

        commands.add(["tabd[uplicate]"],
            "Duplicate current tab",
            function (args)
            {
                let tab = tabs.getTab();

                let activate = args.bang ? true : false;
                if (/\btabopen\b/.test(options["activate"]))
                    activate = !activate;

                for (let i in util.range(0, Math.max(1, args.count)))
                    tabs.cloneTab(tab, activate);
            },
            {
                argCount: "0",
                bang: true,
                count: true
            });
    }

    if (liberator.has("session") && config.name != "Xulmus")
    {
        // TODO: extract common functionality of "undoall"
        commands.add(["u[ndo]"],
            "Undo closing of a tab",
            function (args)
            {
                let count = args.count;
                args = args[0];

                if (count < 1)
                    count = 1;

                if (args)
                {
                    count = 0;
                    for (let [i, item] in Iterator(tabs.closedTabs))
                    {
                        if (item.state.entries[0].url == args)
                        {
                            count = i + 1;
                            break;
                        }
                    }

                    if (!count)
                    {
                        liberator.echoerr("Exxx: No matching closed tab");
                        return;
                    }
                }

                window.undoCloseTab(count - 1);
            },
            {
                argCount: "?",
                completer: function (context)
                {
                    context.anchored = false;
                    context.compare = CompletionContext.Sort.unsorted;
                    context.keys = { text: function (item) item.state.entries[0].url, description: "title" };
                    context.completions = tabs.closedTabs;
                },
                count: true,
                literal: 0
            });

        commands.add(["undoa[ll]"],
            "Undo closing of all closed tabs",
            function (args)
            {
                for (let i in Iterator(tabs.closedTabs))
                    window.undoCloseTab(0);

            },
            { argCount: "0" });

        commands.add(["wqa[ll]", "wq", "xa[ll]"],
            "Save the session and quit",
            function () { liberator.quit(true); },
            { argCount: "0" });
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        get alternate() alternates[1],

        get browsers()
        {
            let browsers = getBrowser().browsers;
            for (let i = 0; i < browsers.length; i++)
                yield [i, browsers[i]];
        },

        get count() getBrowser().mTabs.length,

        get options()
        {
            let store = this.localStore;
            if (!("options" in store))
                store.options = {};
            return store.options;
        },

        getLocalStore: function (tabIndex)
        {
            let tab = this.getTab(tabIndex);
            if (!tab.liberatorStore)
                tab.liberatorStore = {};
            return tab.liberatorStore;
        },

        get localStore() this.getLocalStore(),

        get tabStrip()
        {
            let tabStrip = null;

            if (config.hostApplication == "Firefox")
                tabStrip = getBrowser().mStrip.getElementsByClassName("tabbrowser-tabs")[0];
            else if (config.hostApplication == "Thunderbird")
                tabStrip = getBrowser().mStrip;

            return tabStrip;
        },

        // @returns the index of the currently selected tab starting with 0
        index: function (tab)
        {
            if (tab)
                return Array.indexOf(getBrowser().mTabs, tab);

            return getBrowser().mTabContainer.selectedIndex;
        },

        // TODO: implement filter
        // @returns an array of tabs which match filter
        get: function (filter)
        {
            let buffers = [];
            for (let [i, browser] in this.browsers)
            {
                let title = browser.contentTitle || "(Untitled)";
                let uri = browser.currentURI.spec;
                let number = i + 1;
                buffers.push([number, title, uri]);
            }
            return buffers;
        },

        getContentIndex: function (content)
        {
            for (let [i, browser] in this.browsers)
            {
                if (browser.contentWindow == content || browser.contentDocument == content)
                    return i;
            }
            return -1;
        },

        getTab: function (index)
        {
            if (index != undefined)
                return getBrowser().mTabs[index];
            else
                return getBrowser().mCurrentTab;
        },

        get closedTabs()
        {
            return services.get("json").decode(services.get("sessionStore").getClosedTabData(window));
        },

        list: function (filter)
        {
            completion.listCompleter("buffer", filter);
        },

        // wrap causes the movement to wrap around the start and end of the tab list
        // NOTE: position is a 0 based index
        move: function (tab, spec, wrap)
        {
            let index = indexFromSpec(spec, wrap);
            getBrowser().moveTabTo(tab, index);
        },

        // quitOnLastTab = 1: quit without saving session
        // quitOnLastTab = 2: quit and save session
        remove: function (tab, count, focusLeftTab, quitOnLastTab)
        {
            let removeOrBlankTab = {
                    Firefox: function (tab)
                    {
                        if (getBrowser().mTabs.length > 1)
                            getBrowser().removeTab(tab);
                        else
                        {
                            if (buffer.URL != "about:blank" ||
                                window.getWebNavigation().sessionHistory.count > 0)
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
                    },
                    Songbird: function (tab)
                    {
                        if (getBrowser().mTabs.length > 1)
                            getBrowser().removeTab(tab);
                        else
                        {
                            if (buffer.URL != "about:blank" ||
                                window.getWebNavigation().sessionHistory.count > 0)
                            {
                                liberator.open("about:blank", liberator.NEW_BACKGROUND_TAB);
                                getBrowser().removeTab(tab);
                            }
                            else
                                liberator.beep();
                        }
                    }
                }[config.hostApplication] || function () {};

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

            let index = this.index(tab);
            if (focusLeftTab)
            {
                let lastRemovedTab = 0;
                for (let i = index; i > index - count && i >= 0; i--)
                {
                    removeOrBlankTab(this.getTab(i));
                    lastRemovedTab = i > 0 ? i : 1;
                }
                getBrowser().mTabContainer.selectedIndex = lastRemovedTab - 1;
            }
            else
            {
                let i = index + count - 1;
                if (i >= this.count)
                    i = this.count - 1;

                for (; i >= index; i--)
                    removeOrBlankTab(this.getTab(i));
                getBrowser().mTabContainer.selectedIndex = index;
            }
        },

        keepOnly: function (tab)
        {
            getBrowser().removeAllTabsBut(tab);
        },

        select: function (spec, wrap)
        {
            let index = indexFromSpec(spec, wrap);
            // FIXME:
            if (index == -1)
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
                const flags = Ci.nsIWebNavigation.LOAD_FLAGS_BYPASS_PROXY | Ci.nsIWebNavigation.LOAD_FLAGS_BYPASS_CACHE;
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
                if (allowNonUnique === undefined || allowNonUnique == null) // XXX
                    allowNonUnique = lastBufferSwitchSpecial;
            }

            if (buffer == "#")
            {
                tabs.selectAlternateTab();
                return;
            }

            if (!count || count < 1)
                count = 1;
            if (typeof reverse != "boolean")
                reverse = false;

            let matches = buffer.match(/^(\d+):?/);
            if (matches)
            {
                tabs.select(parseInt(matches[1], 10) - 1, false); // make it zero-based
                return;
            }

            matches = [];
            let lowerBuffer = buffer.toLowerCase();
            let first = tabs.index() + (reverse ? 0 : 1);
            let nbrowsers = getBrowser().browsers.length;
            for (let [i,] in tabs.browsers)
            {
                let index = (i + first) % nbrowsers;
                let url = getBrowser().getBrowserAtIndex(index).contentDocument.location.href;
                let title = getBrowser().getBrowserAtIndex(index).contentDocument.title.toLowerCase();
                if (url == buffer)
                {
                    tabs.select(index, false);
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

                tabs.select(matches[index], false);
            }
        },

        cloneTab: function (tab, activate)
        {
            let newTab = getBrowser().addTab();
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
            let win = services.get("windowMediator").getMostRecentWindow("navigator:browser");

            copyTab(win.getBrowser().mCurrentTab, tab);
            this.remove(tab, 1, false, 1);
        },

        selectAlternateTab: function ()
        {
            if (tabs.alternate == null || tabs.getTab() == tabs.alternate)
            {
                liberator.echoerr("E23: No alternate page");
                return;
            }

            // NOTE: this currently relies on v.tabs.index() returning the
            // currently selected tab index when passed null
            let index = tabs.index(tabs.alternate);

            // TODO: since a tab close is more like a bdelete for us we
            // should probably reopen the closed tab when a 'deleted'
            // alternate is selected
            if (index == -1)
                liberator.echoerr("E86: Buffer does not exist");  // TODO: This should read "Buffer N does not exist"
            else
                tabs.select(index);
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
