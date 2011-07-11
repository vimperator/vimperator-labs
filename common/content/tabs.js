// Copyright (c) 2006-2011 by Martin Stubenschrott <stubenschrott@vimperator.org>
// Copyright (c) 2007-2009 by Doug Kearns <dougkearns@gmail.com>
// Copyright (c) 2008-2009 by Kris Maglione <maglione.k at Gmail>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the License.txt file included with this file.


/** @scope modules */

// TODO: many methods do not work with Thunderbird correctly yet

/**
 * @instance tabs
 */
const Tabs = Module("tabs", {
    requires: ["config"],

    init: function () {
        this._alternates = [config.tabbrowser.mCurrentTab, null];

        // used for the "gb" and "gB" mappings to remember the last :buffer[!] command
        this._lastBufferSwitchArgs = "";
        this._lastBufferSwitchSpecial = true;

    },

    _updateTabCount: function () {
        statusline.updateTabCount(true);
    },

    _onTabSelect: function () {
        // TODO: is all of that necessary?
        //       I vote no. --Kris
        modes.reset();
        statusline.updateTabCount(true);
        this.updateSelectionHistory();
        if (options["focuscontent"])
            setTimeout(function () { liberator.focusContent(true); }, 10); // just make sure, that no widget has focus
    },

    /**
     * @property {Object} The previously accessed tab or null if no tab
     *     other than the current one has been accessed.
     */
    get alternate() this._alternates[1],

    /**
     * @property {Iterator(Object)} A genenerator that returns all browsers
     *     in the current window.
     */
    get browsers() {
        let browsers = config.tabbrowser.browsers;
        for (let i = 0; i < browsers.length; i++)
            yield [i, browsers[i]];
    },

    /**
     * @property {number} The number of tabs in the current window.
     */
    get count() config.tabbrowser.mTabs.length,

    /**
     * @property {Object} The local options store for the current tab.
     */
    get options() {
        let store = this.localStore;
        if (!("options" in store))
            store.options = {};
        return store.options;
    },

    /**
     * Returns the local state store for the tab at the specified
     * <b>tabIndex</b>. If <b>tabIndex</b> is not specified then the
     * current tab is used.
     *
     * @param {number} tabIndex
     * @returns {Object}
     */
    // FIXME: why not a tab arg? Why this and the property?
    //      : To the latter question, because this works for any tab, the
    //        property doesn't. And the property is so oft-used that it's
    //        convenient. To the former question, because I think this is mainly
    //        useful for autocommands, and they get index arguments. --Kris
    getLocalStore: function (tabIndex) {
        let tab = this.getTab(tabIndex);
        if (!tab.liberatorStore)
            tab.liberatorStore = {};
        return tab.liberatorStore;
    },

    /**
     * @property {Object} The local state store for the currently selected
     *     tab.
     */
    get localStore() this.getLocalStore(),

    /**
     * @property {Object[]} The array of closed tabs for the current
     *     session.
     */
    get closedTabs() JSON.parse(services.get("sessionStore").getClosedTabData(window)),

    /**
     * Returns the index of <b>tab</b> or the index of the currently
     * selected tab if <b>tab</b> is not specified. This is a 0-based
     * index.
     *
     * @param {Object} tab A tab from the current tab list.
     * @returns {number}
     */
    index: function (tab) {
        if (tab)
            return Array.indexOf(config.tabbrowser.mTabs, tab);
        else
            return config.tabbrowser.mTabContainer.selectedIndex;
    },

    // TODO: implement filter
    /**
     * Returns an array of all tabs in the tab list.
     *
     * @returns {Object[]}
     */
    // FIXME: why not return the tab element?
    //      : unused? Remove me.
    get: function () {
        let buffers = [];
        for (let [i, browser] in this.browsers) {
            let title = browser.contentTitle || "(Untitled)";
            let uri = browser.currentURI.spec;
            let number = i + 1;
            buffers.push([number, title, uri]);
        }
        return buffers;
    },

    /**
     * Returns the index of the tab containing <b>content</b>.
     *
     * @param {Object} content Either a content window or a content
     *     document.
     */
    // FIXME: Only called once...necessary?
    getContentIndex: function (content) {
        for (let [i, browser] in this.browsers) {
            if (browser.contentWindow == content || browser.contentDocument == content)
                return i;
        }
        return -1;
    },

    /**
     * Returns the tab at the specified <b>index</b> or the currently
     * selected tab if <b>index</b> is not specified. This is a 0-based
     * index.
     *
     * @param {number} index The index of the tab required.
     * @returns {Object}
     */
    getTab: function (index) {
        if (index != undefined)
            return config.tabbrowser.mTabs[index];
        else
            return config.tabbrowser.mCurrentTab;
    },

    /**
     * Lists all tabs matching <b>filter</b>.
     *
     * @param {string} filter A filter matching a substring of the tab's
     *     document title or URL.
     * @param {boolean} showAll
     */
    list: function (filter, showAll) {
        completion.listCompleter("buffer", filter, null, completion.buffer[showAll ? "ALL" : "VISIBLE"]);
    },

    /**
     * Moves a tab to a new position in the tab list.
     *
     * @param {Object} tab The tab to move.
     * @param {string} spec See {@link Tabs.indexFromSpec}.
     * @param {boolean} wrap Whether an out of bounds <b>spec</b> causes
     *     the destination position to wrap around the start/end of the tab
     *     list.
     */
    move: function (tab, spec, wrap) {
        let index = Tabs.indexFromSpec(spec, wrap, false);
        index = tabs.getTab(index)._tPos;
        config.tabbrowser.moveTabTo(tab, index);
    },

    /**
     * Removes the specified <b>tab</b> from the tab list.
     *
     * @param {Object} tab The tab to remove.
     * @param {number} count How many tabs to remove.
     * @param {boolean} focusLeftTab Focus the tab to the left of the removed tab.
     * @param {number} quitOnLastTab Whether to quit if the tab being
     *     deleted is the only tab in the tab list:
     *         1 - quit without saving session
     *         2 - quit and save session
     * @param {boolean} force Close even if the tab is an app tab.
     */
    // FIXME: what is quitOnLastTab {1,2} all about then, eh? --djk
    remove: function (tab, count, focusLeftTab, quitOnLastTab, force) {
        let vTabs = config.tabbrowser.visibleTabs;
        let removeOrBlankTab = {
                Firefox: function (tab) {
                    if (vTabs.length > 1)
                        config.tabbrowser.removeTab(tab);
                    else {
                        if (buffer.URL != "about:blank" ||
                            window.getWebNavigation().sessionHistory.count > 0) {
                            liberator.open("about:blank", liberator.NEW_BACKGROUND_TAB);
                            config.tabbrowser.removeTab(tab);
                        }
                        else
                            liberator.beep();
                    }
                },
                Thunderbird: function (tab) {
                    if (config.tabbrowser.mTabs.length > 1 && !tab.hasAttribute("first-tab"))
                        config.tabbrowser.closeTab(tab);
                    else
                        liberator.beep();
                },
                Songbird: function (tab) {
                    if (config.tabbrowser.mTabs.length > 1)
                        config.tabbrowser.removeTab(tab);
                    else {
                        if (buffer.URL != "about:blank" || window.getWebNavigation().sessionHistory.count > 0) {
                            liberator.open("about:blank", liberator.NEW_BACKGROUND_TAB);
                            config.tabbrowser.removeTab(tab);
                        }
                        else
                            liberator.beep();
                    }
                }
            }[config.hostApplication] || function () {};

        if (typeof count != "number" || count < 1)
            count = 1;

        if (quitOnLastTab >= 1 && config.tabbrowser.mTabs.length <= count) {
            if (liberator.windows.length > 1)
                window.close();
            else
                liberator.quit(quitOnLastTab == 2);

            return;
        }

        let index = vTabs.indexOf(tab);
        // should close even if the tab is not visible such as ":tabclose arg"
        if (index < 0) {
            // XXX: should consider the count variable ?
            if (tab.pinned && !force)
                liberator.echoerr("Cannot close an app tab [" + tab.label + "]. Use :tabclose!");
            else
                removeOrBlankTab(tab);

            return;
        }

        let start, end, selIndex = 0;
        if (focusLeftTab) {
            start = Math.max(0, index - count + 1);
            end = index;
        }
        else {
            start = index;
            end = Math.min(index + count, vTabs.length) - 1;
            selIndex = end + 1;
        }
        if (!force) {
            for (; start <= end && vTabs[start].pinned; start++)
                liberator.echoerr("Cannot close an app tab [" + vTabs[start].label + "]. Use :tabclose!");

            if (start > end)
                return;
        }

        if ((focusLeftTab && 0 < start - 1) || selIndex >= vTabs.length)
            selIndex = start - 1;

        let currentIndex = vTabs.indexOf(tabs.getTab());
        if (start <= currentIndex && currentIndex <= end)
            config.tabbrowser.mTabContainer.selectedItem = vTabs[selIndex];

        for (let i = end; i >= start; i--) {
            removeOrBlankTab(vTabs[i]);
            vTabs.splice(i, 1);
        }
    },

    /**
     * Removes all tabs from the tab list except the specified <b>tab</b>.
     *
     * @param {Object} tab The tab to keep.
     */
    keepOnly: function (tab) {
        config.tabbrowser.removeAllTabsBut(tab);
    },

    /**
     * Selects the tab at the position specified by <b>spec</b>.
     *
     * @param {string} spec See {@link Tabs.indexFromSpec}
     * @param {boolean} wrap Whether an out of bounds <b>spec</b> causes
     *     the selection position to wrap around the start/end of the tab
     *     list.
     * @param {boolean} allTabs
     */
    select: function (spec, wrap, allTabs) {
        let index = Tabs.indexFromSpec(spec, wrap, allTabs);
        // FIXME:
        if (index == -1)
            liberator.beep();
        else
            config.tabbrowser.mTabContainer.selectedIndex = index;
    },

    /**
     * Reloads the specified tab.
     *
     * @param {Object} tab The tab to reload.
     * @param {boolean} bypassCache Whether to bypass the cache when
     *     reloading.
     */
    reload: function (tab, bypassCache) {
        if (bypassCache) {
            const flags = Ci.nsIWebNavigation.LOAD_FLAGS_BYPASS_PROXY | Ci.nsIWebNavigation.LOAD_FLAGS_BYPASS_CACHE;
            config.tabbrowser.getBrowserForTab(tab).reloadWithFlags(flags);
        }
        else
            config.tabbrowser.reloadTab(tab);
    },

    /**
     * Reloads all tabs.
     *
     * @param {boolean} bypassCache Whether to bypass the cache when
     *     reloading.
     */
    reloadAll: function (bypassCache) {
        if (bypassCache) {
            for (let i = 0; i < config.tabbrowser.mTabs.length; i++) {
                try {
                    this.reload(config.tabbrowser.mTabs[i], bypassCache);
                }
                catch (e) {
                    // FIXME: can we do anything useful here without stopping the
                    //        other tabs from reloading?
                }
            }
        }
        else
            config.tabbrowser.reloadAllTabs();
    },

    /**
     * Stops loading the specified tab.
     *
     * @param {Object} tab The tab to stop loading.
     */
    stop: function (tab) {
        if (config.stop)
            config.stop(tab);
        else
            tab.linkedBrowser.stop();
    },

    /**
     * Stops loading all tabs.
     */
    stopAll: function () {
        for (let [, browser] in this.browsers)
            browser.stop();
    },

    /**
     * Returns tabs containing the specified <b>buffer</b>.
     * @param {string} buffer
     * @return {array} array of tabs
     */
    getTabsFromBuffer: function (buffer) {
        if (!buffer || typeof buffer != "string")
            return [];

        if (buffer == "#")
            return [tabs.alternate];

        let matches = buffer.match(/^(\d+):?/);
        if (matches)
            return [tabs.getTab(parseInt(matches[1], 10) - 1)];
        else if (liberator.has("tabgroup")) {
            matches = buffer.match(/^(.+?)\.(\d+):?/);
            if (matches) {
                let [, groupName, tabNum] = matches;
                tabNum = parseInt(tabNum, 10);
                let group = tabGroup.getGroup(groupName);
                if (group) {
                    let tabItem = group.getChild(tabNum - 1);
                    if (tabItem)
                        return [tabItem.tab];
                }
            }
        }

        matches = [];
        let lowerBuffer = buffer.toLowerCase();
        let first = tabs.index();
        let nbrowsers = config.tabbrowser.browsers.length;
        for (let [i, ] in tabs.browsers) {
            let index = (i + first) % nbrowsers;
            let browser = config.tabbrowser.browsers[index];
            let url, title;
            if ("__SS_restoreState" in browser) {
                let entry = browser.__SS_data.entries[browser.__SS_data.index - 1];
                url = entry.url;
                title = entry.title || url;
            }
            else {
                url = browser.contentDocument.location.href;
                title = browser.contentDocument.title;
            }
            title = title.toLowerCase();
            if (url == buffer)
                return [tabs.getTab(index)];

            if (url.indexOf(buffer) >= 0 || title.indexOf(lowerBuffer) >= 0)
                matches.push(tabs.getTab(index));
        }

        return matches;
    },

    /**
     * Selects the tab containing the specified <b>buffer</b>.
     *
     * @param {string} buffer A string which matches the URL or title of a
     *     buffer, if it is null, the last used string is used again.
     * @param {boolean} allowNonUnique Whether to select the first of
     *     multiple matches.
     * @param {number} count If there are multiple matches select the
     *     count'th match.
     * @param {boolean} reverse Whether to search the buffer list in
     *     reverse order.
     *
     */
    // FIXME: help!
    switchTo: function (buffer, allowNonUnique, count, reverse) {
        if (buffer == "")
            return;

        if (buffer != null) {
            // store this command, so it can be repeated with "B"
            this._lastBufferSwitchArgs = buffer;
            this._lastBufferSwitchSpecial = allowNonUnique;
        }
        else {
            buffer = this._lastBufferSwitchArgs;
            if (allowNonUnique === undefined || allowNonUnique == null) // XXX
                allowNonUnique = this._lastBufferSwitchSpecial;
        }

        if (!count || count < 1)
            count = 1;
        if (typeof reverse != "boolean")
            reverse = false;

        let tabItems = tabs.getTabsFromBuffer(buffer);
        if (tabItems.length == 0)
            liberator.echoerr("No matching buffer for: " + buffer);
        else if (tabItems.length == 1)
            config.tabbrowser.mTabContainer.selectedItem = tabItems[0];
        else if (!allowNonUnique)
            liberator.echoerr("More than one match for: " + buffer);
        else {
            let length = tabItems.length;
            if (reverse) {
                index = length - count;
                while (index < 0)
                    index += length;
            }
            else
                index = count % length;

            config.tabbrowser.mTabContainer.selectedItem = tabItems[index];
        }
    },

    /**
     * Clones the specified <b>tab</b> and append it to the tab list.
     *
     * @param {Object} tab The tab to clone.
     * @param {boolean} activate Whether to select the newly cloned tab.
     */
    cloneTab: function (tab, activate) {
        let newTab = config.tabbrowser.addTab();
        Tabs.copyTab(newTab, tab);

        if (activate)
            config.tabbrowser.mTabContainer.selectedItem = newTab;

        return newTab;
    },

    /**
     * Detaches the specified <b>tab</b> and open it in a new window. If no
     * tab is specified the currently selected tab is detached.
     *
     * @param {Object} tab The tab to detach.
     */
    detachTab: function (tab) {
        if (!tab)
            tab = config.tabbrowser.mTabContainer.selectedItem;

        services.get("windowWatcher")
                .openWindow(window, window.getBrowserURL(), null, "chrome,dialog=no,all", tab);
    },

    /**
     * Selects the alternate tab.
     */
    selectAlternateTab: function () {
        liberator.assert(tabs.alternate != null && tabs.getTab() != tabs.alternate, "No alternate page");

        // NOTE: this currently relies on v.tabs.index() returning the
        // currently selected tab index when passed null
        let index = tabs.index(tabs.alternate);

        // TODO: since a tab close is more like a bdelete for us we
        // should probably reopen the closed tab when a 'deleted'
        // alternate is selected
        liberator.assert(index >= 0, "Alternate buffer does not exist");  // TODO: This should read "Buffer N does not exist"
        tabs.select(index, false, true);
    },

    // NOTE: when restarting a session FF selects the first tab and then the
    // tab that was selected when the session was created.  As a result the
    // alternate after a restart is often incorrectly tab 1 when there
    // shouldn't be one yet.
    /**
     * Sets the current and alternate tabs, updating the tab selection
     * history.
     *
     * @param {Array(Object)} tabs The current and alternate tab.
     * @see tabs#alternate
     */
    updateSelectionHistory: function (tabs) {
        this._alternates = tabs || [this.getTab(), this._alternates[0]];
    }
}, {
    copyTab: function (to, from) {
        if (!from)
            from = config.tabbrowser.mTabContainer.selectedItem;

        let tabState = services.get("sessionStore").getTabState(from);
        services.get("sessionStore").setTabState(to, tabState);
    },

    /**
     * @param spec can either be:
     * - an absolute integer
     * - "" for the current tab
     * - "+1" for the next tab
     * - "-3" for the tab, which is 3 positions left of the current
     * - "$" for the last tab
     * @param wrap
     * @param allTabs
     */
    indexFromSpec: function (spec, wrap, allTabs) {
        let tabs =     allTabs ? config.tabbrowser.mTabs : config.tabbrowser.visibleTabs;
        let position = allTabs ?
            config.tabbrowser.mTabContainer.selectedIndex :
            tabs.indexOf(config.tabbrowser.mCurrentTab);
        let length =   tabs.length;
        let last =     length - 1;

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
            position = wrap ? ((position % length) + length) % length : 0;

        if (config.hostApplication === "Firefox")
            return tabs[position]._tPos;

        return position;
    }
}, {
    commands: function () {
        commands.add(["bd[elete]", "bw[ipeout]", "bun[load]", "tabc[lose]"],
            "Delete current buffer",
            function (args) {
                let special = args.bang;
                let count   = args.count;
                let arg     = args.literalArg;

                if (arg) {
                    let removed = 0;
                    let matches = arg.match(/^(\d+):?/);

                    if (matches) {
                        tabs.remove(tabs.getTab(parseInt(matches[1], 10) - 1), 1, false, 0, special);
                        removed = 1;
                    }
                    else {
                        let str = arg.toLowerCase();
                        let browsers = config.tabbrowser.browsers;

                        for (let i = browsers.length - 1; i >= 0; i--) {
                            let host, title, uri = browsers[i].currentURI.spec;
                            if (browsers[i].currentURI.schemeIs("about")) {
                                host = "";
                                title = "(Untitled)";
                            }
                            else {
                                host = browsers[i].currentURI.host;
                                title = browsers[i].contentTitle;
                            }

                            [host, title, uri] = [host, title, uri].map(String.toLowerCase);

                            if (host.indexOf(str) >= 0 || uri == str ||
                                (special && (title.indexOf(str) >= 0 || uri.indexOf(str) >= 0))) {
                                tabs.remove(tabs.getTab(i), 1, false, 0, special);
                                removed++;
                            }
                        }
                    }

                    if (removed == 1)
                        liberator.echomsg("Removed tab: " + arg);
                    else if (removed > 1)
                        liberator.echomsg("Removed " + removed + " tabs");
                    else
                        liberator.echoerr("No matching tab for: " + arg);
                }
                else // just remove the current tab
                    tabs.remove(tabs.getTab(), Math.max(count, 1), false, 0, special);
            }, {
                argCount: "?",
                bang: true,
                count: true,
                completer: function (context) completion.buffer(context),
                literal: 0
            });

        commands.add(["keepa[lt]"],
            "Execute a command without changing the current alternate buffer",
            function (args) {
                let alternate = tabs.alternate;

                try {
                    liberator.execute(args[0], null, true);
                }
                finally {
                    tabs.updateSelectionHistory([tabs.getTab(), alternate]);
                }
            }, {
                argCount: "+",
                completer: function (context) completion.ex(context),
                literal: 0
            });

        commands.add(["tab"],
            "Execute a command and tell it to output in a new tab",
            function (args) {
                liberator.forceNewTab = true;
                liberator.execute(args.string, null, true);
                liberator.forceNewTab = false;
            }, {
                argCount: "+",
                completer: function (context) completion.ex(context),
                literal: 0
            });

        commands.add(["tabd[o]", "bufd[o]"],
            "Execute a command in each tab",
            function (args) {
                for (let i = 0; i < tabs.count; i++) {
                    tabs.select(i);
                    liberator.execute(args.string, null, true);
                }
            }, {
                argCount: "1",
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
            function (args) {
                let count = args.count;
                let arg   = args[0];

                // count is ignored if an arg is specified, as per Vim
                if (arg) {
                    if (/^\d+$/.test(arg))
                        tabs.select("-" + arg, true);
                    else
                        liberator.echoerr("Trailing characters");
                }
                else if (count > 0)
                    tabs.select("-" + count, true);
                else
                    tabs.select("-1", true);
            }, {
                argCount: "?",
                count: true
            });

        // TODO: "Zero count" if 0 specified as arg
        commands.add(["tabn[ext]", "tn[ext]", "bn[ext]"],
            "Switch to the next or [count]th tab",
            function (args) {
                let count = args.count;
                let arg   = args[0];

                if (arg || count > 0) {
                    let index;

                    // count is ignored if an arg is specified, as per Vim
                    if (arg) {
                        liberator.assert(/^\d+$/.test(arg), "Trailing characters");
                        index = arg - 1;
                    }
                    else
                        index = count - 1;

                    if (index < tabs.count)
                        tabs.select(index, true);
                    else
                        liberator.beep();
                }
                else
                    tabs.select("+1", true);
            }, {
                argCount: "?",
                count: true
            });

        commands.add(["tabr[ewind]", "tabfir[st]", "br[ewind]", "bf[irst]"],
            "Switch to the first tab",
            function () { tabs.select(0, false); },
            { argCount: "0" });

        if (config.hasTabbrowser) {
            // TODO: "Zero count" if 0 specified as arg, multiple args and count ranges?
            commands.add(["b[uffer]"],
                "Switch to a buffer",
                function (args) {
                    let special = args.bang;
                    let count   = args.count;
                    let arg     = args.literalArg;

                    if (arg && count > 0) {
                        liberator.assert(/^\d+$/.test(arg), "Trailing characters");
                        tabs.switchTo(arg, special);
                    }
                    else if (count > 0)
                        tabs.switchTo(count.toString(), special);
                    else
                        tabs.switchTo(arg, special);
                }, {
                    argCount: "?",
                    bang: true,
                    count: true,
                    completer: function (context) completion.buffer(context, completion.buffer.ALL),
                    literal: 0
                });

            commands.add(["buffers", "files", "ls", "tabs"],
                "Show a list of all buffers",
                function (args) { tabs.list(args.literalArg, args.bang); }, {
                    argCount: "?",
                    bang: true,
                    literal: 0
                });

            commands.add(["quita[ll]", "qa[ll]"],
                "Quit " + config.name,
                function (args) { liberator.quit(false, args.bang); }, {
                    argCount: "0",
                    bang: true
                });

            commands.add(["reloada[ll]"],
                "Reload all tab pages",
                function (args) { tabs.reloadAll(args.bang); }, {
                    argCount: "0",
                    bang: true
                });

            commands.add(["stopa[ll]"],
                "Stop loading all tab pages",
                function () { tabs.stopAll(); },
                { argCount: "0" });

            // TODO: add count support
            commands.add(["tabm[ove]"],
                "Move the current tab after tab N",
                function (args) {
                    let arg = args[0];

                    // FIXME: tabmove! N should probably produce an error
                    liberator.assert(!arg || /^([+-]?\d+)$/.test(arg), "Trailing characters");

                    // if not specified, move to after the last tab
                    tabs.move(config.tabbrowser.mCurrentTab, arg || "$", args.bang);
                }, {
                    argCount: "?",
                    bang: true
                });

            commands.add(["tabo[nly]"],
                "Close all other tabs",
                function () { tabs.keepOnly(config.tabbrowser.mCurrentTab); },
                { argCount: "0" });

            commands.add(["tabopen", "t[open]", "tabnew"],
                "Open one or more URLs in a new tab",
                function (args) {
                    let special = args.bang;
                    args = args.string;

                    if (options.get("activate").has("all", "tabopen"))
                        special = !special;
                    let where = special ? liberator.NEW_TAB : liberator.NEW_BACKGROUND_TAB;
                    if (args)
                        liberator.open(args, { where: where });
                    else
                        liberator.open("about:blank", { where: where });
                }, {
                    bang: true,
                    completer: function (context) completion.url(context),
                    literal: 0,
                    privateData: true
                });

            commands.add(["tabde[tach]"],
                "Detach current tab to its own window",
                function () {
                    liberator.assert(tabs.count > 1, "Can't detach the last tab");

                    tabs.detachTab(null);
                },
                { argCount: "0" });

            commands.add(["tabdu[plicate]"],
                "Duplicate current tab",
                function (args) {
                    let tab = tabs.getTab();

                    let activate = args.bang ? true : false;
                    if (options.get("activate").has("tabopen", "all"))
                        activate = !activate;

                    for (let i in util.range(0, Math.max(1, args.count)))
                        tabs.cloneTab(tab, activate);
                }, {
                    argCount: "0",
                    bang: true,
                    count: true
                });

            // TODO: match window by title too?
            //     : accept the full :tabmove arg spec for the tab index arg?
            //     : better name or merge with :tabmove?
            commands.add(["taba[ttach]"],
                "Attach the current tab to another window",
                function (args) {
                    liberator.assert(args.length <= 2 && !args.some(function (i) !/^\d+$/.test(i)),
                        "Trailing characters");

                    let [winIndex, tabIndex] = args.map(parseInt);
                    let win = liberator.windows[winIndex - 1];

                    liberator.assert(win, "Window " + winIndex + " does not exist");
                    liberator.assert(win != window, "Cannot reattach to the same window");

                    let browser = win.getBrowser();
                    let dummy = browser.addTab("about:blank");
                    browser.stop();
                    // XXX: the implementation of DnD in tabbrowser.xml suggests
                    // that we may not be guaranteed of having a docshell here
                    // without this reference?
                    browser.docShell;

                    let last = browser.mTabs.length - 1;

                    browser.moveTabTo(dummy, util.Math.constrain(tabIndex || last, 0, last));
                    browser.selectedTab = dummy; // required
                    browser.swapBrowsersAndCloseOther(dummy, config.tabbrowser.mCurrentTab);
                }, {
                    argCount: "+",
                    completer: function (context, args) {
                        if (args.completeArg == 0) {
                            context.filters.push(function ({ item: win }) win != window);
                            completion.window(context);
                        }
                    }
                });
        }

        if (liberator.has("tabs_undo")) {
            commands.add(["u[ndo]"],
                "Undo closing of a tab",
                function (args) {
                    if (args.length)
                        args = args[0];
                    else
                        args = args.count || 0;

                    let m = /^(\d+)(:|$)/.exec(args || '1');
                    if (m)
                        window.undoCloseTab(Number(m[1]) - 1);
                    else if (args) {
                        for (let [i, item] in Iterator(tabs.closedTabs))
                            if (item.state.entries[item.state.index - 1].url == args) {
                                window.undoCloseTab(i);
                                return;
                            }

                        liberator.echoerr("No matching closed tab: " + args);
                    }
                }, {
                    argCount: "?",
                    completer: function (context) {
                        context.anchored = false;
                        context.compare = CompletionContext.Sort.unsorted;
                        context.filters = [CompletionContext.Filter.textDescription];
                        context.keys = { text: function ([i, { state: s }]) (i + 1) + ": " + s.entries[s.index - 1].url, description: "[1].title", icon: "[1].image" };
                        context.completions = Iterator(tabs.closedTabs);
                    },
                    count: true,
                    literal: 0
                });

            commands.add(["undoa[ll]"],
                "Undo closing of all closed tabs",
                function (args) {
                    for (let i in Iterator(tabs.closedTabs))
                        window.undoCloseTab(0);

                },
                { argCount: "0" });

        }

        if (liberator.has("session")) {
            commands.add(["wqa[ll]", "wq", "xa[ll]"],
                "Save the session and quit",
                function () { liberator.quit(true); },
                { argCount: "0" });
        }
    },
    completion: function () {
        completion.addUrlCompleter("t",
            "Open tabs",
            completion.buffer);
    },
    events: function () {
        let tabContainer = config.tabbrowser.mTabContainer;
        ["TabMove", "TabOpen", "TabClose"].forEach(function (event) {
            events.addSessionListener(tabContainer, event, this.closure._updateTabCount, false);
        }, this);
        events.addSessionListener(tabContainer, "TabSelect", this.closure._onTabSelect, false);
    },
    mappings: function () {
        mappings.add([modes.NORMAL], ["g0", "g^"],
            "Go to the first tab",
            function (count) { tabs.select(0); });

        mappings.add([modes.NORMAL], ["g$"],
            "Go to the last tab",
            function (count) { tabs.select("$"); });

        mappings.add([modes.NORMAL], ["gt"],
            "Go to the next tab",
            function (count) {
                if (count != null)
                    tabs.select(count - 1, false);
                else
                    tabs.select("+1", true);
            },
            { count: true });

        mappings.add([modes.NORMAL], ["<C-n>", "<C-Tab>", "<C-PageDown>"],
            "Go to the next tab",
            function (count) { tabs.select("+" + (count || 1), true); },
            { count: true });

        mappings.add([modes.NORMAL], ["gT", "<C-p>", "<C-S-Tab>", "<C-PageUp>"],
           "Go to previous tab",
            function (count) { tabs.select("-" + (count || 1), true); },
            { count: true });

        if (config.hasTabbrowser) {
            mappings.add([modes.NORMAL], ["b"],
                "Open a prompt to switch buffers",
                function (count) {
                    if (count != null)
                        tabs.select(count - 1);
                    else
                        commandline.open("", "buffer! ", modes.EX);
                },
                { count: true });

            mappings.add([modes.NORMAL], ["B"],
                "Show buffer list",
                function () { tabs.list(false); commandline.show("buffers"); });

            mappings.add([modes.NORMAL], ["d"],
                "Delete current buffer",
                function (count) { tabs.remove(tabs.getTab(), count, false, 0); },
                { count: true });

            mappings.add([modes.NORMAL], ["D"],
                "Delete current buffer, focus tab to the left",
                function (count) { tabs.remove(tabs.getTab(), count, true, 0); },
                { count: true });

            mappings.add([modes.NORMAL], ["gb"],
                "Repeat last :buffer[!] command",
                function (count) { tabs.switchTo(null, null, count, false); },
                { count: true });

            mappings.add([modes.NORMAL], ["gB"],
                "Repeat last :buffer[!] command in reverse direction",
                function (count) { tabs.switchTo(null, null, count, true); },
                { count: true });

            // TODO: feature dependencies - implies "session"?
            if (liberator.has("tabs_undo")) {
                mappings.add([modes.NORMAL], ["u"],
                    "Undo closing of a tab",
                    function (count) { commands.get("undo").execute("", false, count); },
                    { count: true });
            }

            mappings.add([modes.NORMAL], ["<C-^>", "<C-6>"],
                "Select the alternate tab or the [count]th tab",
                function (count) {
                    if (count < 1)
                        tabs.selectAlternateTab();
                    else
                        tabs.switchTo(count.toString(), false);
                },
                { count: true });
        }
    },
    options: function () {
        if (config.hasTabbrowser) {
            options.add(["activate", "act"],
                "Define when tabs are automatically activated",
                "stringlist", "addons,downloads,extoptions,help,homepage,quickmark,tabopen,paste",
                {
                    completer: function (context) [
                        ["all", "All tabs created by any commands and mappings"],
                        ["addons", ":addo[ns] command"],
                        ["downloads", ":downl[oads] command"],
                        ["extoptions", ":exto[ptions] command"],
                        ["help", ":h[elp] command"],
                        ["homepage", "gH mapping"],
                        ["quickmark", "go and gn mappings"],
                        ["tabopen", ":tabopen[!] command"],
                        ["paste", "P and gP mappings"]
                    ]
                });

            options.add(["newtab"],
                "Define which commands should output in a new tab by default",
                "stringlist", "",
                {
                    completer: function (context) [
                        ["all", "All commands"],
                        ["addons", ":addo[ns] command"],
                        ["downloads", ":downl[oads] command"],
                        ["extoptions", ":exto[ptions] command"],
                        ["help", ":h[elp] command"],
                        ["javascript", ":javascript! or :js! command"],
                        ["prefs", ":pref[erences]! or :prefs! command"]
                    ]
                });

            // TODO: Is this really applicable to Xulmus?
            options.add(["popups", "pps"],
                "Where to show requested popup windows",
                "stringlist", "tab",
                {
                    setter: function (value) {
                        let [open, restriction] = [1, 0];
                        for (let [, opt] in Iterator(this.parseValues(value))) {
                            if (opt == "tab")
                                open = 3;
                            else if (opt == "window")
                                open = 2;
                            else if (opt == "resized")
                                restriction = 2;
                        }

                        options.safeSetPref("browser.link.open_newwindow", open, "See 'popups' option.");
                        options.safeSetPref("browser.link.open_newwindow.restriction", restriction, "See 'popups' option.");
                        return value;
                    },
                    completer: function (context) [
                        ["tab",     "Open popups in a new tab"],
                        ["window",  "Open popups in a new window"],
                        ["resized", "Open resized popups in a new window"]
                    ]
                });

            options.add(["tabnumbers", "tn"],
                "Show small numbers at each tab to allow quicker selection",
                "boolean", false,
                {
                    setter: function (value) {
                        // TODO: Change this stuff for muttator
                        if (value)
                            styles.addSheet(true, "tabnumbers", "chrome://*",
                                // we need to change the visible of the "new tab" buttons because the "inline" "new tab" button in the toolbar
                                // gets moved just after the last app tab with tab numbers on
                                "#TabsToolbar { counter-reset:tabnumber; } #TabsToolbar tab::after { counter-increment:tabnumber; content:counter(tabnumber); font:bold 0.84em monospace; cursor: default; } #TabsToolbar tab:not([pinned])::after { display:block; padding-bottom:0.4em; } .tabs-newtab-button { display: none !important; } #new-tab-button { visibility: visible !important; }"
                            );
                        else
                            styles.removeSheet(true, "tabnumbers");
                        return value;
                    }
                });
        }
    }
});

// vim: set fdm=marker sw=4 ts=4 et:
