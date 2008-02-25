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

vimperator.Tabs = function () //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{
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

    // hide tabs initially
    getBrowser().mStrip.getElementsByClassName("tabbrowser-tabs")[0].collapsed = true;

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// OPTIONS /////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    vimperator.options.add(["activate", "act"],
        "Define when tabs are automatically activated",
        "stringlist", "homepage,quickmark,tabopen,paste",
        {
            validator: function (value)
            {
                return value.split(",").every(function (item) { return /^(homepage|quickmark|tabopen|paste|)$/.test(item); });
            }
        });
    vimperator.options.add(["popups", "pps"],
        "Where to show requested popup windows",
        "number", 1,
        {
            setter: function (value)
            {
                var values = [[0, 1], // always in current tab
                              [0, 3], // in a new tab
                              [2, 3], // in a new window if it has specified sizes
                              [1, 2]];// always in new window
                vimperator.options.setPref("browser.link.open_newwindow.restriction", values[value][0]);
                vimperator.options.setPref("browser.link.open_newwindow", values[value][1]);
            },
            validator: function (value) { return (value >= 0 && value <= 3); }
        });
    vimperator.options.add(["showtabline", "stal"], 
        "Control when to show the tab bar of opened web pages",
        "number", 2,
        {
            setter: function (value)
            {
                var tabs = getBrowser().mStrip.getElementsByClassName("tabbrowser-tabs")[0];
                if (!tabs)
                    return;

                if (value == 0)
                {
                    tabs.collapsed = true;
                }
                else if (value == 1)
                {
                    vimperator.options.setPref("browser.tabs.autoHide", true);
                    tabs.collapsed = false;
                }
                else
                {
                    vimperator.options.setPref("browser.tabs.autoHide", false);
                    tabs.collapsed = false;
                }
            },
            validator: function (value) { return (value >= 0 && value <= 2); }
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// MAPPINGS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    vimperator.mappings.add([vimperator.modes.NORMAL], ["b"],
        "Open a prompt to switch buffers",
        function () { vimperator.commandline.open(":", "buffer! ", vimperator.modes.EX); });

    vimperator.mappings.add([vimperator.modes.NORMAL], ["B"],
        "Show buffer list",
        function () { vimperator.buffer.list(false); });

    vimperator.mappings.add([vimperator.modes.NORMAL], ["d"],
        "Delete current buffer",
        function (count) { vimperator.tabs.remove(getBrowser().mCurrentTab, count, false, 0); },
        { flags: vimperator.Mappings.flags.COUNT });

    vimperator.mappings.add([vimperator.modes.NORMAL], ["D"],
        "Delete current buffer, focus tab to the left",
        function (count) { vimperator.tabs.remove(getBrowser().mCurrentTab, count, true, 0); },
        { flags: vimperator.Mappings.flags.COUNT });

    vimperator.mappings.add([vimperator.modes.NORMAL], ["gb"],
        "Repeat last :buffer[!] command",
        function (count) { vimperator.tabs.switchTo(null, null, count, false); },
        { flags: vimperator.Mappings.flags.COUNT });

    vimperator.mappings.add([vimperator.modes.NORMAL], ["gB"],
        "Repeat last :buffer[!] command in reverse direction",
        function (count) { vimperator.tabs.switchTo(null, null, count, true); },
        { flags: vimperator.Mappings.flags.COUNT });

    vimperator.mappings.add([vimperator.modes.NORMAL], ["g0", "g^"],
        "Go to the first tab",
        function (count) { vimperator.tabs.select(0); });

    vimperator.mappings.add([vimperator.modes.NORMAL], ["g$"],
        "Go to the last tab",
        function (count) { vimperator.tabs.select("$"); });

    vimperator.mappings.add([vimperator.modes.NORMAL], ["gt", "<C-n>", "<C-Tab>", "<C-PageDown>"],
        "Go to the next tab",
        function (count) { vimperator.tabs.select(count > 0 ? count - 1: "+1", count > 0 ? false : true); },
        { flags: vimperator.Mappings.flags.COUNT });

    vimperator.mappings.add([vimperator.modes.NORMAL], ["gT", "<C-p>", "<C-S-Tab>", "<C-PageUp>"],
       "Go to previous tab",
        function (count) { vimperator.tabs.select("-" + (count < 1 ? 1 : count), true); },
        { flags: vimperator.Mappings.flags.COUNT });

    vimperator.mappings.add([vimperator.modes.NORMAL], ["u"],
        "Undo closing of a tab",
        function (count) { vimperator.commands.undo("", false, count); },
        { flags: vimperator.Mappings.flags.COUNT });

    vimperator.mappings.add([vimperator.modes.NORMAL], ["<C-^>", "<C-6>"],
        "Select the alternate tab",
        function ()
        {
            if (vimperator.tabs.alternate == null || vimperator.tabs.getTab() == vimperator.tabs.alternate)
            {
                vimperator.echoerr("E23: No alternate page");
                return;
            }

            // NOTE: this currently relies on v.tabs.index() returning the
            // currently selected tab index when passed null
            var index = vimperator.tabs.index(vimperator.tabs.alternate);

            // TODO: since a tab close is more like a bdelete for us we
            // should probably reopen the closed tab when a 'deleted'
            // alternate is selected
            if (index == -1)
                vimperator.echoerr("E86: Buffer does not exist");  // TODO: This should read "Buffer N does not exist"
            else
                vimperator.tabs.select(index);
        });


    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    vimperator.commands.add(["bd[elete]", "bw[ipeout]", "bun[load]", "tabc[lose]"],
        "Delete current buffer",
        function (args, special, count)
        {
            vimperator.tabs.remove(getBrowser().mCurrentTab, count > 0 ? count : 1, special, 0);
        });

    vimperator.commands.add(["b[uffer]"],
        "Switch to a buffer",
        function (args, special) { vimperator.tabs.switchTo(args, special); },
        { completer: function (filter) { return vimperator.completion.buffer(filter); } });

    vimperator.commands.add(["buffers", "files", "ls", "tabs"],
        "Show a list of all buffers",
        function (args, special)
        {
            if (args)
            {
                vimperator.echoerr("E488: Trailing characters");
                return;
            }

            vimperator.buffer.list(special);
        });

    vimperator.commands.add(["tab"],
        "Execute a command and tell it to output in a new tab",
        function (args) { vimperator.execute(args, { inTab: true }); },
        { completer: function (filter) { return vimperator.completion.command(filter); } });

    vimperator.commands.add(["tabl[ast]"],
        "Switch to the last tab",
        function () { vimperator.tabs.select("$", false); });

    vimperator.commands.add(["tabm[ove]"],
        "Move the current tab after tab N",
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
        });

    // TODO: count support
    vimperator.commands.add(["tabn[ext]", "tn[ext]"],
        "Switch to the next or [count]th tab",
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
        });


    vimperator.commands.add(["tabo[nly]"],
        "Close all other tabs",
        function () { vimperator.tabs.keepOnly(getBrowser().mCurrentTab); });

    vimperator.commands.add(["tabopen", "t[open]", "tabnew", "tabe[dit]"],
        "Open one or more URLs in a new tab",
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
        { completer: function (filter) { return vimperator.completion.url(filter); } });

    // TODO: count support
    vimperator.commands.add(["tabp[revious]", "tp[revious]", "tabN[ext]", "tN[ext]"],
        "Switch to the previous tab or go [count] tabs back",
        function (args)
        {
            if (!args)
                vimperator.tabs.select("-1", true);
            else if (/^\d+$/.test(args))
                vimperator.tabs.select("-" + args, true); // FIXME: urgh!
            else
                vimperator.echoerr("E488: Trailing characters");
        });

    vimperator.commands.add(["tabr[ewind]", "tabfir[st]"],
        "Switch to the first tab",
        function () { vimperator.tabs.select(0, false); });

    // TODO: extract common functionality of "undoall"
    vimperator.commands.add(["u[ndo]"],
        "Undo closing of a tab",
        function (args, special, count)
        {
            if (count < 1)
                count = 1;

            if (args)
            {
                var ss = Components.classes["@mozilla.org/browser/sessionstore;1"].
                         getService(Components.interfaces.nsISessionStore);
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
            completer: function (filter)
            {
                // get closed-tabs from nsSessionStore
                var ss = Components.classes["@mozilla.org/browser/sessionstore;1"].
                         getService(Components.interfaces.nsISessionStore);
                var undoItems = eval("(" + ss.getClosedTabData(window) + ")");
                var completions = [];
                for (var i = 0; i < undoItems.length; i++)
                {
                    // undoItems[i].image is also available if needed for favicons
                    var url = undoItems[i].state.entries[0].url;
                    var title = undoItems[i].title;
                    if (vimperator.completion.match([url, title], filter, false))
                        completions.push([url, title]);
                }
                return [0, completions];
            }
        });

    vimperator.commands.add(["undoa[ll]"],
        "Undo closing of all closed tabs",
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

            var ss = Components.classes["@mozilla.org/browser/sessionstore;1"].
                     getService(Components.interfaces.nsISessionStore);
            var undoItems = eval("(" + ss.getClosedTabData(window) + ")");
            for (var i = 0; i < undoItems.length; i++)
                undoCloseTab(); // doesn't work with i as the index to undoCloseTab
        });


    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        get alternate() { return alternates[1]; },

        get count() { return getBrowser().mTabs.length; },

        // @returns the index of the currently selected tab starting with 0
        index: function (tab)
        {
            if (tab)
            {
                var length = getBrowser().mTabs.length;
                for (var i = 0; i < length; i++)
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
            for (var i in browsers)
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
            function removeOrBlankTab (tab)
            {
                if (getBrowser().mTabs.length > 1)
                    getBrowser().removeTab(tab);
                else
                {
                    if (vimperator.buffer.URL != "about:blank" ||
                        getWebNavigation().sessionHistory.count > 0)
                    {
                        vimperator.open("about:blank", vimperator.NEW_BACKGROUND_TAB);
                        getBrowser().removeTab(tab);
                    }
                    else
                        vimperator.beep();
                }
            }

            if (typeof count != "number" || count < 1)
                count = 1;

            if (quitOnLastTab >= 1 && getBrowser().mTabs.length <= count)
            {
                if (vimperator.windows.length > 1)
                    window.close();
                else
                    vimperator.quit(quitOnLastTab == 2);

                return;
            }

            var index = this.index(tab);
            if (focusLeftTab)
            {
                var lastRemovedTab = 0;
                for (var i = index; i > index - count && i >= 0; i--)
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
                vimperator.beep(); // XXX: move to ex-handling?
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
                for (var i = 0; i < getBrowser().mTabs.length; i++)
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
        switchTo: function(buffer, allowNonUnique, count, reverse)
        {
            if (buffer == "")
            {
                return;
            }
            else if (buffer != null)
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

            if (!count || count < 1)
                count = 1;
            if (typeof reverse != "boolean")
                reverse = false;

            var match;
            if (match = buffer.match(/^(\d+):?/))
            {
                vimperator.tabs.select(parseInt(match[1], 10) - 1, false); // make it zero-based
                return;
            }

            var matches = [];
            var lowerBuffer = buffer.toLowerCase();
            var first = vimperator.tabs.index() + (reverse ? 0 : 1);
            for (var i = 0; i < getBrowser().browsers.length; i++)
            {
                var index = (i + first) % getBrowser().browsers.length;
                var url = getBrowser().getBrowserAtIndex(index).contentDocument.location.href;
                var title = getBrowser().getBrowserAtIndex(index).contentDocument.title.toLowerCase();
                if (url == buffer)
                {
                    vimperator.tabs.select(index, false);
                    return;
                }

                if (url.indexOf(buffer) >= 0 || title.indexOf(lowerBuffer) >= 0)
                    matches.push(index);
            }
            if (matches.length == 0)
                vimperator.echoerr("E94: No matching buffer for " + buffer);
            else if (matches.length > 1 && !allowNonUnique)
                vimperator.echoerr("E93: More than one match for " + buffer);
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

                vimperator.tabs.select(matches[index], false);
            }
        },

        // TODO: when restarting a session FF selects the first tab and then the
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
