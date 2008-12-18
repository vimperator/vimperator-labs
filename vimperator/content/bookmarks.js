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

const DEFAULT_FAVICON = "chrome://mozapps/skin/places/defaultFavicon.png";

if (liberator.options.getPref("extensions.vimperator.commandline_cmd_history"))
{
    // Try to import older command line history, quick marks, etc.
    liberator.registerObserver("load_options", function () {
        let store = liberator.storage["history-command"];
        let pref  = liberator.options.getPref("extensions.vimperator.commandline_cmd_history");
        for (let [k, v] in Iterator(pref.split("\n")))
            store.push(v);

        store = liberator.storage["quickmarks"];
        pref = liberator.options.getPref("extensions.vimperator.quickmarks")
                        .split("\n");
        while(pref.length > 0)
            store.set(pref.shift(), pref.shift());
         
        liberator.options.resetPref("extensions.vimperator.commandline_cmd_history");
        liberator.options.resetPref("extensions.vimperator.commandline_search_history");
        liberator.options.resetPref("extensions.vimperator.quickmarks");
    });
}

// also includes methods for dealing with keywords and search engines
function Bookmarks() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const historyService   = PlacesUtils.history;
    const bookmarksService = PlacesUtils.bookmarks;
    const taggingService   = PlacesUtils.tagging;
    const searchService    = Cc["@mozilla.org/browser/search-service;1"].getService(Ci.nsIBrowserSearchService);
    const ioService        = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
    const faviconService   = Cc["@mozilla.org/browser/favicon-service;1"].getService(Ci.nsIFaviconService);

    const Bookmark = new Struct("url", "title", "icon", "keyword", "tags", "id");
    const Keyword = new Struct("keyword", "title", "icon", "url");
    Bookmark.defaultValue("icon", function () getFavicon(this.url));
    Bookmark.prototype.__defineGetter__("extra", function () [
                            ['keyword', this.keyword,         "Keyword"],
                            ['tags',    this.tags.join(', '), "Tag"]
                        ].filter(function (item) item[1]));

    const storage = modules.storage;
    function Cache(name, store, serial)
    {
        const rootFolders = [bookmarksService.toolbarFolder, bookmarksService.bookmarksMenuFolder, bookmarksService.unfiledBookmarksFolder];
        const sleep = liberator.sleep;

        var bookmarks = [];
        var self = this;

        this.__defineGetter__("name",  function () name);
        this.__defineGetter__("store", function () store);
        this.__defineGetter__("bookmarks", function () this.load());

        this.__defineGetter__("keywords",
            function () [new Keyword(k.keyword, k.title, k.icon, k.url) for each (k in self.bookmarks) if (k.keyword)]);

        this.__iterator__ = function () (val for each (val in self.bookmarks));

        function loadBookmark(node)
        {
            let uri = ioService.newURI(node.uri, null, null);
            let keyword = bookmarksService.getKeywordForBookmark(node.itemId);
            let tags = taggingService.getTagsForURI(uri, {}) || [];

            return bookmarks.push(new Bookmark(node.uri, node.title, node.icon && node.icon.spec, keyword, tags, node.itemId));
        }

        function readBookmark(id)
        {
            return {
                itemId: id,
                uri:    bookmarksService.getBookmarkURI(id).spec,
                title:  bookmarksService.getItemTitle(id)
            };
        }

        function deleteBookmark(id)
        {
            var length = bookmarks.length;
            bookmarks = bookmarks.filter(function (item) item.id != id);
            return bookmarks.length < length;
        }

        function findRoot(id)
        {
            do
            {
                var root = id;
                id = bookmarksService.getFolderIdForItem(id);
            } while (id != bookmarksService.placesRoot && id != root);
            return root;
        }

        let loading = false;
        this.load = function load()
        {
            if (loading)
            {
                while (loading)
                    sleep(10);
                return bookmarks;
            }

            // update our bookmark cache
            bookmarks = [];
            loading = true;

            let folders = rootFolders.slice();
            let query = historyService.getNewQuery();
            let options = historyService.getNewQueryOptions();
            while (folders.length > 0)
            {
                query.setFolders(folders, 1);
                folders.shift();
                let result = historyService.executeQuery(query, options);
                let folder = result.root;
                folder.containerOpen = true;

                // iterate over the immediate children of this folder
                for (let i = 0; i < folder.childCount; i++)
                {
                    let node = folder.getChild(i);
                    if (node.type == node.RESULT_TYPE_FOLDER)   // folder
                        folders.push(node.itemId);
                    else if (node.type == node.RESULT_TYPE_URI) // bookmark
                        loadBookmark(node);
                }

                // close a container after using it!
                folder.containerOpen = false;
            }
            this.__defineGetter__("bookmarks", function () bookmarks);
            loading = false;
            return bookmarks;
        };

        var observer = {
            onBeginUpdateBatch: function onBeginUpdateBatch() {},
            onEndUpdateBatch:   function onEndUpdateBatch() {},
            onItemVisited:      function onItemVisited() {},
            onItemMoved:        function onItemMoved() {},
            onItemAdded: function onItemAdded(itemId, folder, index)
            {
                // liberator.dump("onItemAdded(" + itemId + ", " + folder + ", " + index + ")\n");
                if (bookmarksService.getItemType(itemId) == bookmarksService.TYPE_BOOKMARK)
                {
                    if (rootFolders.indexOf(findRoot(itemId)) >= 0)
                    {
                        let bmark = loadBookmark(readBookmark(itemId));
                        storage.fireEvent(name, "add", bmark);
                    }
                }
            },
            onItemRemoved: function onItemRemoved(itemId, folder, index)
            {
                // liberator.dump("onItemRemoved(" + itemId + ", " + folder + ", " + index + ")\n");
                if (deleteBookmark(itemId))
                    storage.fireEvent(name, "remove", itemId);
            },
            onItemChanged: function onItemChanged(itemId, property, isAnnotation, value)
            {
                if (isAnnotation)
                    return;
                // liberator.dump("onItemChanged(" + itemId + ", " + property + ", " + value + ")\n");
                var bookmark = bookmarks.filter(function (item) item.id == itemId)[0];
                if (bookmark)
                {
                    if (property == "tags")
                        value = taggingService.getTagsForURI(ioService.newURI(bookmark.url, null, null), {});
                    if (property in bookmark)
                        bookmark[property] = value;
                    storage.fireEvent(name, "change", itemId);
                }
            },
            QueryInterface: function QueryInterface(iid)
            {
                if (iid.equals(Ci.nsINavBookmarkObserver) || iid.equals(Ci.nsISupports))
                    return this;
                throw Cr.NS_ERROR_NO_INTERFACE;
            }
        };

        bookmarksService.addObserver(observer, false);
    }

    function getFavicon(uri)
    {
        try
        {
            return faviconService.getFaviconImageForPage(ioService.newURI(uri, null, null)).spec;
        }
        catch (e)
        {
            return "";
        }
    }

    let bookmarkObserver = function (key, event, arg)
    {
        if (event == "add")
            autocommands.trigger("BookmarkAdd", arg);
        statusline.updateUrl();
    };

    var cache = storage.newObject("bookmark-cache", Cache, false);
    storage.addObserver("bookmark-cache", bookmarkObserver);
    liberator.registerObserver("shutdown", function () {
        storage.removeObserver("bookmark-cache", bookmarkObserver)
    });

    liberator.registerObserver("enter", function () {
        if (options["preload"])
        {
            // Forces a load, if not already loaded but wait 10sec
            // so most tabs should be restored and the CPU should be idle again usually
            setTimeout(function () { liberator.callFunctionInThread(null, function () cache.bookmarks); }, 10000);
        }
    });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// OPTIONS /////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    options.add(["defsearch", "ds"],
        "Set the default search engine",
        "string", "google",
        {
            completer: function completer(context) completion.search(context, true),
            validator: Option.validateCompleter
        });

    options.add(["preload"],
        "Speed up first time history/bookmark completion",
        "boolean", true);

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// MAPPINGS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var myModes = config.browserModes;

    mappings.add(myModes, ["a"],
        "Open a prompt to bookmark the current URL",
        function ()
        {
            var title = "";
            if (buffer.title != buffer.URL)
                title = " -title=\"" + buffer.title + "\"";
            commandline.open(":", "bmark " + buffer.URL + title, modes.EX);
        });

    mappings.add(myModes, ["A"],
        "Toggle bookmarked state of current URL",
        function () { bookmarks.toggle(buffer.URL); });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    commands.add(["ju[mps]"],
        "Show jumplist",
        function ()
        {
            var sh = window.getWebNavigation().sessionHistory;

            let entries = [sh.getEntryAtIndex(i, false) for (i in util.range(0, sh.count))];
            let list = template.jumps(sh.index, entries);
            commandline.echo(list, commandline.HL_NORMAL, commandline.FORCE_MULTILINE);
        },
        { argCount: "0" });

    // TODO: Clean this up.
    function tags(context, args)
    {
        let filter = context.filter;
        let have = filter.split(",");

        args.completeFilter = have.pop();

        let prefix = filter.substr(0, filter.length - args.completeFilter.length);
        let tags = util.Array.uniq(util.Array.flatten([b.tags for ([k, b] in Iterator(cache.bookmarks))]));

        return [[prefix + tag, tag] for ([i, tag] in Iterator(tags)) if (have.indexOf(tag) < 0)];
    }

    function title(context, args)
    {
        if (!args.bang)
            return [[content.document.title, "Current Page Title"]];
        context.keys.text = "title";
        context.keys.description = "url";
        return bookmarks.get(args.join(" "), args["-tags"], null, { keyword: args["-keyword"], title: context.filter });
    }

    function keyword(context, args)
    {
        if (!args.bang)
            return [];
        context.keys.text = "keyword";
        return bookmarks.get(args.join(" "), args["-tags"], null, { keyword: context.filter, title: args["-title"] });
    }

    commands.add(["bma[rk]"],
        "Add a bookmark",
        function (args)
        {
            var url = args.length == 0 ? buffer.URL : args[0];
            var title = args["-title"] || (args.length == 0 ? buffer.title : null);
            var keyword = args["-keyword"] || null;
            var tags =    args["-tags"] || [];

            if (bookmarks.add(false, title, url, keyword, tags, args.bang))
            {
                let extra = (title == url) ? "" : " (" + title + ")";
                liberator.echomsg("Added bookmark: " + url + extra, 1, commandline.FORCE_SINGLELINE);
            }
            else
                liberator.echoerr("Exxx: Could not add bookmark `" + title + "'", commandline.FORCE_SINGLELINE);
        },
        {
            argCount: "?",
            bang: true,
            completer: function (context, args)
            {
                if (!args.bang)
                {
                    context.completions = [[content.document.documentURI, "Current Location"]];
                    return
                }
                completion.bookmark(context, args["-tags"], { keyword: args["-keyword"], title: args["-title"] });
            },
            options: [[["-title", "-t"],    commands.OPTION_STRING, null, title],
                      [["-tags", "-T"],     commands.OPTION_LIST, null, tags],
                      [["-keyword", "-k"],  commands.OPTION_STRING, function (arg) /\w/.test(arg)]]
        });

    commands.add(["bmarks"],
        "List or open multiple bookmarks",
        function (args)
        {
            bookmarks.list(args.join(" "), args["-tags"] || [], args.bang, args["-max"]);
        },
        {
            bang: true,
            completer: function completer(context, args)
            {
                context.quote = null;
                context.filter = args.join(" ");
                completion.bookmark(context, args["-tags"]);
            },
            options: [[["-tags", "-T"], commands.OPTION_LIST, null, tags],
                      [["-max", "-m"], commands.OPTION_INT]]
        });

    commands.add(["delbm[arks]"],
        "Delete a bookmark",
        function (args)
        {
            let url = args.string || buffer.URL;
            let deletedCount = bookmarks.remove(url);

            liberator.echomsg(deletedCount + " bookmark(s) with url `" + url + "' deleted", 1, commandline.FORCE_SINGLELINE);
        },
        {
            argCount: "?",
            completer: function completer(context) completion.bookmark(context),
            literal: 0
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        get format() ({
            anchored: false,
            title: ["URL", "Info"],
            keys: { text: "url", description: "title", icon: "icon", extra: "extra" },
            process: [template.icon, template.bookmarkDescription]
        }),

        // if "bypassCache" is true, it will force a reload of the bookmarks database
        // on my PC, it takes about 1ms for each bookmark to load, so loading 1000 bookmarks
        // takes about 1 sec
        get: function get(filter, tags, maxItems, extra)
        {
            return completion.runCompleter("bookmark", filter, maxItems, tags, extra);
        },

        // if starOnly = true it is saved in the unfiledBookmarksFolder, otherwise in the bookmarksMenuFolder
        add: function add(starOnly, title, url, keyword, tags, force)
        {
            try
            {
                var uri = util.createURI(url);
                if (!force)
                {
                    for (let bmark in cache)
                    {
                        if (bmark[0] == uri.spec)
                        {
                            var id = bmark[5];
                            if (title)
                                bookmarksService.setItemTitle(id, title);
                            break;
                        }
                    }
                }
                if (id == undefined)
                    id = bookmarksService.insertBookmark(
                             bookmarksService[starOnly ? "unfiledBookmarksFolder" : "bookmarksMenuFolder"],
                             uri, -1, title || url);
                if (!id)
                    return false;

                if (keyword)
                    bookmarksService.setKeywordForBookmark(id, keyword);
                if (tags)
                    taggingService.tagURI(uri, tags);
            }
            catch (e)
            {
                liberator.log(e, 0);
                return false;
            }

            return true;
        },

        toggle: function toggle(url)
        {
            if (!url)
                return;

            var count = this.remove(url);
            if (count > 0)
            {
                commandline.echo("Removed bookmark: " + url, commandline.HL_NORMAL, commandline.FORCE_SINGLELINE);
            }
            else
            {
                var title = buffer.title || url;
                var extra = "";
                if (title != url)
                    extra = " (" + title + ")";
                this.add(true, title, url);
                commandline.echo("Added bookmark: " + url + extra, commandline.HL_NORMAL, commandline.FORCE_SINGLELINE);
            }
        },

        isBookmarked: function isBookmarked(url)
        {
            try
            {
                var uri = ioService.newURI(url, null, null);
                return (bookmarksService.getBookmarkedURIFor(uri) != null);
            }
            catch (e)
            {
                return false;
            }
        },

        // returns number of deleted bookmarks
        remove: function remove(url)
        {
            if (!url)
                return 0;

            var i = 0;
            try
            {
                var uri = ioService.newURI(url, null, null);
                var count = {};
                var bmarks = bookmarksService.getBookmarkIdsForURI(uri, count);

                for (; i < bmarks.length; i++)
                    bookmarksService.removeItem(bmarks[i]);
            }
            catch (e)
            {
                liberator.log(e, 0);
                return i;
            }

            // update the display of our "bookmarked" symbol
            statusline.updateUrl();

            return count.value;
        },

        getFavicon: function (url) getFavicon(url),

        // TODO: add filtering
        // also ensures that each search engine has a Vimperator-friendly alias
        getSearchEngines: function getSearchEngines()
        {
            var searchEngines = [];
            var firefoxEngines = searchService.getVisibleEngines({});
            for (let [,engine] in Iterator(firefoxEngines))
            {
                var alias = engine.alias;
                if (!alias || !/^[a-z0-9_-]+$/.test(alias))
                    alias = engine.name.replace(/^\W*([a-zA-Z_-]+).*/, "$1").toLowerCase();
                if (!alias)
                    alias = "search"; // for search engines which we can't find a suitable alias

                // make sure we can use search engines which would have the same alias (add numbers at the end)
                var newAlias = alias;
                for (let j = 1; j <= 10; j++) // <=10 is intentional
                {
                    if (!searchEngines.some(function (item) item[0] == newAlias))
                        break;

                    newAlias = alias + j;
                }
                // only write when it changed, writes are really slow
                if (engine.alias != newAlias)
                    engine.alias = newAlias;

                searchEngines.push([engine.alias, engine.description, engine.iconURI.spec]);
            }

            return searchEngines;
        },

        getSuggestions: function getSuggestions(engine, query, callback)
        {
            let ss = Cc["@mozilla.org/browser/search-service;1"].getService(Ci.nsIBrowserSearchService);
            const responseType = "application/x-suggestions+json";

            let engine = ss.getEngineByAlias(engine);
            if (engine && engine.supportsResponseType(responseType))
                var queryURI = engine.getSubmission(query, responseType).uri.spec;
            if (!queryURI)
                return [];

            function process(resp)
            {
                const json = Cc["@mozilla.org/dom/json;1"].createInstance(Ci.nsIJSON);
                let results = [];
                try
                {
                    results = json.decode(resp.responseText)[1];
                    results = [[item, ""] for ([k, item] in Iterator(results)) if (typeof item == "string")];
                }
                catch (e) {}
                if (!callback)
                    return results;
                callback(results);
            }

            let resp = util.httpGet(queryURI, callback && process);
            if (!callback)
                return process(resp);
        },

        // TODO: add filtering
        // format of returned array:
        // [keyword, helptext, url]
        getKeywords: function getKeywords()
        {
            return cache.keywords;
        },

        // full search string including engine name as first word in @param text
        // if @param useDefSearch is true, it uses the default search engine
        // @returns the url for the search string
        //          if the search also requires a postData, [url, postData] is returned
        getSearchURL: function getSearchURL(text, useDefsearch)
        {
            var url = null;
            var aPostDataRef = {};
            var searchString = (useDefsearch ? options["defsearch"] + " " : "") + text;

            // we need to make sure our custom alias have been set, even if the user
            // did not :open <tab> once before
            this.getSearchEngines();

            url = window.getShortcutOrURI(searchString, aPostDataRef);
            if (url == searchString)
                url = null;

            if (aPostDataRef && aPostDataRef.value)
                return [url, aPostDataRef.value];
            else
                return url; // can be null
        },

        // if openItems is true, open the matching bookmarks items in tabs rather than display
        list: function list(filter, tags, openItems, maxItems)
        {
            // FIXME: returning here doesn't make sense
            //   Why the hell doesn't it make sense? --Kris
            // Because it unconditionally bypasses the final error message
            // block and does so only when listing items, not opening them. In
            // short it breaks the :bmarks command which doesn't make much
            // sense to me but I'm old-fashioned. --djk
            if (!openItems)
                return completion.listCompleter("bookmark", filter, maxItems, tags);
            let items = completion.runCompleter("bookmark", filter, maxItems, tags);

            if (items.length)
                return liberator.open(items.map(function (i) i.url), liberator.NEW_TAB);

            if (filter.length > 0 && tags.length > 0)
                liberator.echoerr("E283: No bookmarks matching tags: \"" + tags + "\" and string: \"" + filter + "\"");
            else if (filter.length > 0)
                liberator.echoerr("E283: No bookmarks matching string: \"" + filter + "\"");
            else if (tags.length > 0)
                liberator.echoerr("E283: No bookmarks matching tags: \"" + tags + "\"");
            else
                liberator.echoerr("No bookmarks set");
        }
    };
    //}}}
}; //}}}

function History() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const historyService = PlacesUtils.history;

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// MAPPINGS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var myModes = config.browserModes;

    mappings.add(myModes,
        ["<C-o>"], "Go to an older position in the jump list",
        function (count) { history.stepTo(-(count > 1 ? count : 1)); },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes,
        ["<C-i>"], "Go to a newer position in the jump list",
        function (count) { history.stepTo(count > 1 ? count : 1); },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes,
        ["H", "<A-Left>", "<M-Left>"], "Go back in the browser history",
        function (count) { history.stepTo(-(count > 1 ? count : 1)); },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes,
        ["L", "<A-Right>", "<M-Right>"], "Go forward in the browser history",
        function (count) { history.stepTo(count > 1 ? count : 1); },
        { flags: Mappings.flags.COUNT });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    commands.add(["ba[ck]"],
        "Go back in the browser history",
        function (args)
        {
            args = args.string;

            if (args.bang)
            {
                history.goToStart();
            }
            else
            {
                if (args)
                {
                    var sh = window.getWebNavigation().sessionHistory;
                    for (let i = sh.index - 1; i >= 0; i--)
                    {
                        if (sh.getEntryAtIndex(i, false).URI.spec == args)
                        {
                            window.getWebNavigation().gotoIndex(i);
                            return;
                        }
                    }
                    liberator.echoerr("Exxx: URL not found in history");
                }
                else
                {
                    history.stepTo(args.count > 0 ? -1 * args.count : -1);
                }
            }
        },
        {
            argCount: "?",
            bang: true,
            completer: function completer(context)
            {
                let sh = window.getWebNavigation().sessionHistory;

                context.completions = [sh.getEntryAtIndex(i, false) for (i in util.range(sh.index, 0, true))];
                context.keys = { text: function (item) item.URI.spec, description: "title" };
            },
            count: true,
            literal: 0
        });

    commands.add(["fo[rward]", "fw"],
        "Go forward in the browser history",
        function (args)
        {
            args = args.string;

            if (args.bang)
            {
                history.goToEnd();
            }
            else
            {
                if (args)
                {
                    var sh = window.getWebNavigation().sessionHistory;
                    for (let i in util.range(sh.index + 1, sh.count))
                    {
                        if (sh.getEntryAtIndex(i, false).URI.spec == args)
                        {
                            window.getWebNavigation().gotoIndex(i);
                            return;
                        }
                    }
                    liberator.echoerr("Exxx: URL not found in history");
                }
                else
                {
                    history.stepTo(args.count > 0 ? args.count : 1);
                }
            }
        },
        {
            argCount: "?",
            bang: true,
            completer: function completer(context)
            {
                let sh = window.getWebNavigation().sessionHistory;

                context.completions = [sh.getEntryAtIndex(i, false) for (i in util.range(sh.index + 1, sh.count))];
                context.keys = { text: function (item) item.URI.spec, description: "title" };
            },
            count: true,
            literal: 0
        });

    commands.add(["hist[ory]", "hs"],
        "Show recently visited URLs",
        function (args) { history.list(args.join(" "), args.bang, args["-max"] || 1000); },
        {
            bang: true,
            completer: function (context) { context.quote = null, completion.history(context) },
            options: [[["-max", "-m"], options.OPTION_INT]]
            // completer: function (filter) completion.history(filter)
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        get format() bookmarks.format,

        get service() historyService,

        get: function get(filter, maxItems)
        {
            // no query parameters will get all history
            let query = historyService.getNewQuery();
            let options = historyService.getNewQueryOptions();

            if (typeof filter == "string")
                filter = { searchTerms: filter };
            for (let [k, v] in Iterator(filter))
                query[k] = v;
            options.sortingMode = options.SORT_BY_DATE_DESCENDING;
            options.resultType = options.RESULTS_AS_URI;
            if (maxItems > 0)
                options.maxResults = maxItems;

            // execute the query
            let root = historyService.executeQuery(query, options).root;
            root.containerOpen = true;
            let items = util.map(util.range(0, root.childCount), function (i) {
                let node = root.getChild(i);
                return {
                    url: node.uri,
                    title: node.title,
                    icon: node.icon ? node.icon.spec : DEFAULT_FAVICON
                }
            });
            root.containerOpen = false; // close a container after using it!

            return items;
        },

        // TODO: better names and move to buffer.?
        stepTo: function stepTo(steps)
        {
            let index = window.getWebNavigation().sessionHistory.index + steps;
            if (index >= 0 && index < window.getWebNavigation().sessionHistory.count)
                window.getWebNavigation().gotoIndex(index);
            else
                liberator.beep();
        },

        goToStart: function goToStart()
        {
            let index = window.getWebNavigation().sessionHistory.index;
            if (index == 0)
                return liberator.beep(); // really wanted?

            window.getWebNavigation().gotoIndex(0);
        },

        goToEnd: function goToEnd()
        {
            let index = window.getWebNavigation().sessionHistory.index;
            if (index == window.getWebNavigation().sessionHistory.count - 1)
                return liberator.beep();

            window.getWebNavigation().gotoIndex(max);
        },

        // if openItems is true, open the matching history items in tabs rather than display
        list: function list(filter, openItems, maxItems)
        {
            // FIXME: returning here doesn't make sense
            //   Why the hell doesn't it make sense? --Kris
            // See comment at bookmarks.list --djk
            if (!openItems)
                return completion.listCompleter("history", filter, maxItems);
            let items = completion.runCompleter("history", filter, maxItems);

            if (items.length)
                return liberator.open([i[0] for each (i in items)], liberator.NEW_TAB);

            if (filter.length > 0)
                liberator.echoerr("E283: No history matching \"" + filter + "\"");
            else
                liberator.echoerr("No history set");
        }
    };
    //}}}
}; //}}}

function QuickMarks() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var qmarks = storage.newMap("quickmarks", true);

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// MAPPINGS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var myModes = config.browserModes;

    mappings.add(myModes,
        ["go"], "Jump to a QuickMark",
        function (arg) { quickmarks.jumpTo(arg, liberator.CURRENT_TAB); },
        { flags: Mappings.flags.ARGUMENT });

    mappings.add(myModes,
        ["gn"], "Jump to a QuickMark in a new tab",
        function (arg)
        {
            quickmarks.jumpTo(arg,
                /\bquickmark\b/.test(options["activate"]) ?
                liberator.NEW_TAB : liberator.NEW_BACKGROUND_TAB);
        },
        { flags: Mappings.flags.ARGUMENT });

    mappings.add(myModes,
        ["M"], "Add new QuickMark for current URL",
        function (arg)
        {
            if (/[^a-zA-Z0-9]/.test(arg))
            {
                liberator.beep();
                return;
            }

            quickmarks.add(arg, buffer.URL);
        },
        { flags: Mappings.flags.ARGUMENT });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    commands.add(["delqm[arks]"],
        "Delete the specified QuickMarks",
        function (args)
        {
            // TODO: finish arg parsing - we really need a proper way to do this. :)
            if (!args.bang && !args.string)
            {
                liberator.echoerr("E471: Argument required");
                return;
            }

            if (args.bang && args.string)
            {
                liberator.echoerr("E474: Invalid argument");
                return;
            }

            if (args.bang)
                quickmarks.removeAll();
            else
                quickmarks.remove(args.string);
        },
        { bang: true });

    commands.add(["qma[rk]"],
        "Mark a URL with a letter for quick access",
        function (args)
        {
            var matches = args.string.match(/^([a-zA-Z0-9])(?:\s+(.+))?$/);
            if (!matches)
                liberator.echoerr("E488: Trailing characters");
            else if (!matches[2])
                quickmarks.add(matches[1], buffer.URL);
            else
                quickmarks.add(matches[1], matches[2]);
        },
        { argCount: "+" });

    commands.add(["qmarks"],
        "Show all QuickMarks",
        function (args)
        {
            args = args.string;

            // ignore invalid qmark characters unless there are no valid qmark chars
            if (args && !/[a-zA-Z0-9]/.test(args))
            {
                liberator.echoerr("E283: No QuickMarks matching \"" + args + "\"");
                return;
            }

            var filter = args.replace(/[^a-zA-Z0-9]/g, "");
            quickmarks.list(filter);
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        add: function add(qmark, location)
        {
            qmarks.set(qmark, location);
            liberator.echomsg("Added Quick Mark '" + qmark + "': " + location, 1);
        },

        remove: function remove(filter)
        {
            var pattern = new RegExp("[" + filter.replace(/\s+/g, "") + "]");

            for (let [qmark,] in qmarks)
            {
                if (pattern.test(qmark))
                    qmarks.remove(qmark);
            }
        },

        removeAll: function removeAll()
        {
            qmarks.clear();
        },

        jumpTo: function jumpTo(qmark, where)
        {
            var url = qmarks.get(qmark);

            if (url)
                liberator.open(url, where);
            else
                liberator.echoerr("E20: QuickMark not set");
        },

        list: function list(filter)
        {
            var marks = [key for ([key, val] in qmarks)];
            // This was a lot nicer without the lambda...
            var lowercaseMarks = marks.filter(function (x) /[a-z]/.test(x)).sort();
            var uppercaseMarks = marks.filter(function (x) /[A-Z]/.test(x)).sort();
            var numberMarks    = marks.filter(function (x) /[0-9]/.test(x)).sort();

            marks = Array.concat(lowercaseMarks, uppercaseMarks, numberMarks);

            if (marks.length == 0)
            {
                liberator.echoerr("No QuickMarks set");
                return;
            }

            if (filter.length > 0)
            {
                marks = marks.filter(function (qmark) filter.indexOf(qmark) >= 0);
                if (marks.length == 0)
                {
                    liberator.echoerr("E283: No QuickMarks matching \"" + filter + "\"");
                    return;
                }
            }

            let items = [[mark, qmarks.get(mark)] for ([k, mark] in Iterator(marks))];
            template.genericTable(items, { title: ["QuickMark", "URL"] });
        }
    };
    //}}}
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
