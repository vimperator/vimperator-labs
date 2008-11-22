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

// TODO: with the new subscript loader, is there really no way to keep variable in per-file scope?
const DEFAULT_FAVICON = "chrome://mozapps/skin/places/defaultFavicon.png";

// also includes methods for dealing with keywords and search engines
function Bookmarks() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const historyService   = PlacesUtils.history;
    const bookmarksService = PlacesUtils.bookmarks;
    const taggingService   = PlacesUtils.tagging;
    const searchService    = Components.classes["@mozilla.org/browser/search-service;1"]
                                       .getService(Components.interfaces.nsIBrowserSearchService);
    const ioService        = Components.classes["@mozilla.org/network/io-service;1"]
                                       .getService(Components.interfaces.nsIIOService);
    const faviconService   = Components.classes["@mozilla.org/browser/favicon-service;1"]
                                       .getService(Components.interfaces.nsIFaviconService);

    const Bookmark = new Struct("url", "title", "icon", "keyword", "tags", "id");
    const Keyword = new Struct("keyword", "title", "icon", "url");
    Bookmark.defaultValue("icon", function () getFavicon(this.url));
    Bookmark.prototype.__defineGetter__("extra", function () [
                            ['keyword', this.keyword,         "hl-Keyword"],
                            ['tags',    this.tags.join(', '), "hl-Tag"]
                        ].filter(function (item) item[1]));

    const storage = modules.storage;
    function Cache(name, store, serial)
    {
        const rootFolders = [bookmarksService.toolbarFolder, bookmarksService.bookmarksMenuFolder, bookmarksService.unfiledBookmarksFolder];

        var bookmarks = [];
        var self = this;

        this.__defineGetter__("name",  function () key);
        this.__defineGetter__("store", function () store);
        this.__defineGetter__("bookmarks", function () { this.load(); return bookmarks; });

        this.__defineGetter__("keywords",
            function () [new Keyword(k.keyword, k.title, k.icon, k.url) for each (k in self.bookmarks) if (k.keyword)]);

        this.__iterator__ = function () (val for each (val in self.bookmarks));

        function loadBookmark(node)
        {
            let uri = ioService.newURI(node.uri, null, null);
            let keyword = bookmarksService.getKeywordForBookmark(node.itemId);
            let tags = taggingService.getTagsForURI(uri, {}) || [];

            return bookmarks.push(new Bookmark(node.uri, node.title, null, keyword, tags, node.itemId));
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

        this.load = function load()
        {
            // liberator.dump("cache.load()\n");
            // update our bookmark cache
            bookmarks = [];
            this.__defineGetter__("bookmarks", function () bookmarks);

            var folders = rootFolders.concat([]);
            var query = historyService.getNewQuery();
            var options = historyService.getNewQueryOptions();
            while (folders.length > 0)
            {
                //comment out the next line for now; the bug hasn't been fixed; final version should include the next line
                //options.setGroupingMode(options.GROUP_BY_FOLDER);
                query.setFolders(folders, 1);
                folders.shift();
                var result = historyService.executeQuery(query, options);
                result.sortingMode = options.SORT_BY_VISITCOUNT_DESCENDING; /* This is silly. Results are still sorted by folder first. --Kris */
                var rootNode = result.root;
                rootNode.containerOpen = true;

                // iterate over the immediate children of this folder
                for (let i = 0; i < rootNode.childCount; i++)
                {
                    var node = rootNode.getChild(i);
                    if (node.type == node.RESULT_TYPE_FOLDER)   // folder
                        folders.push(node.itemId);
                    else if (node.type == node.RESULT_TYPE_URI) // bookmark
                        loadBookmark(node);
                }

                // close a container after using it!
                rootNode.containerOpen = false;
            }
        };

        var observer = {
            onBeginUpdateBatch: function () {},
            onEndUpdateBatch:   function () {},
            onItemVisited:      function () {},
            onItemMoved:        function () {},
            onItemAdded: function (itemId, folder, index)
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
            onItemRemoved: function (itemId, folder, index)
            {
                // liberator.dump("onItemRemoved(" + itemId + ", " + folder + ", " + index + ")\n");
                if (deleteBookmark(itemId))
                    storage.fireEvent(name, "remove", itemId);
            },
            onItemChanged: function (itemId, property, isAnnotation, value)
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
            QueryInterface: function (iid)
            {
                if (iid.equals(Components.interfaces.nsINavBookmarkObserver) || iid.equals(Components.interfaces.nsISupports))
                    return this;
                throw Components.results.NS_ERROR_NO_INTERFACE;
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
            setTimeout(function() { liberator.callFunctionInThread(null, function () cache.load()); }, 10000);
        }
    });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// OPTIONS /////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    options.add(["defsearch", "ds"],
        "Set the default search engine",
        "string", "google",
        {
            completer: function (filter) completion._url(filter, "s").items,
            validator: function (value)
            {
                return completion._url("", "s").items.some(function (s) s[0] == value);
            }
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
            var sh = getWebNavigation().sessionHistory;

            let entries = [sh.getEntryAtIndex(i, false) for (i in util.range(0, sh.count))];
            let list = template.jumps(sh.index, entries);
            commandline.echo(list, commandline.HL_NORMAL, commandline.FORCE_MULTILINE);
        },
        { argCount: "0" });

    function tags() util.Array.uniq(util.Array.flatten([b.tags for ([k, b] in Iterator(cache.bookmarks))]))
                        .map(function (tag) [tag, tag]);

    commands.add(["bma[rk]"],
        "Add a bookmark",
        function (args, special)
        {
            var url = args.arguments.length == 0 ? buffer.URL : args.arguments[0];
            var title = args["-title"] || (args.arguments.length == 0 ? buffer.title : null);
            var keyword = args["-keyword"] || null;
            var tags =    args["-tags"] || [];

            if (bookmarks.add(false, title, url, keyword, tags, special))
            {
                var extra = "";
                if (title != url)
                    extra = " (" + title + ")";
                liberator.echo("Added bookmark: " + url + extra, commandline.FORCE_SINGLELINE);
            }
            else
                liberator.echoerr("Exxx: Could not add bookmark `" + title + "'", commandline.FORCE_SINGLELINE);
        },
        {
            argCount: "?",
            bang: true,
            options: [[["-title", "-t"],    commands.OPTION_STRING],
                      [["-tags", "-T"],     commands.OPTION_LIST],
                      [["-keyword", "-k"],  commands.OPTION_STRING, function (arg) /\w/.test(arg)]]
        });

    commands.add(["bmarks"],
        "List or open multiple bookmarks",
        function (args, special)
        {
            bookmarks.list(args.arguments.join(" "), args["-tags"] || [], special);
        },
        {
            bang: true,
            completer: function (context, args)
            {
                if (args.completeOpt)
                    return;
                context.advance(args.completeStart); // TODO: Move this to completion.ex?
                completion.url(context, "b");
            },
            options: [[["-tags", "-T"], commands.OPTION_LIST, null, tags]]
        });

    commands.add(["delbm[arks]"],
        "Delete a bookmark",
        function (args)
        {
            let url = args.string || buffer.URL;
            let deletedCount = bookmarks.remove(url);

            liberator.echo(deletedCount + " bookmark(s) with url `" + url + "' deleted", commandline.FORCE_SINGLELINE);
        },
        { completer: function (context) completion.bookmark(context.filter) });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        // if "bypassCache" is true, it will force a reload of the bookmarks database
        // on my PC, it takes about 1ms for each bookmark to load, so loading 1000 bookmarks
        // takes about 1 sec
        get: function (filter, tags, bypassCache)
        {
            if (bypassCache) // Is this really necessary anymore?
                cache.load();
            return completion.cached("bookmarks", filter, function () cache.bookmarks, "filterURLArray", tags);
        },

        // if starOnly = true it is saved in the unfiledBookmarksFolder, otherwise in the bookmarksMenuFolder
        add: function (starOnly, title, url, keyword, tags, force)
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
                            var id = bmark[4];
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

        toggle: function (url)
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

        isBookmarked: function (url)
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
        remove: function (url)
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

        getFavicon: function (url) { return getFavicon(url); },

        // TODO: add filtering
        // also ensures that each search engine has a Vimperator-friendly alias
        getSearchEngines: function ()
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

        // TODO: add filtering
        // format of returned array:
        // [keyword, helptext, url]
        getKeywords: function ()
        {
            return cache.keywords;
        },

        // full search string including engine name as first word in @param text
        // if @param useDefSearch is true, it uses the default search engine
        // @returns the url for the search string
        //          if the search also requires a postData, [url, postData] is returned
        getSearchURL: function (text, useDefsearch)
        {
            var url = null;
            var aPostDataRef = {};
            var searchString = (useDefsearch? options["defsearch"] + " " : "") + text;

            // we need to make sure our custom alias have been set, even if the user
            // did not :open <tab> once before
            this.getSearchEngines();

            url = getShortcutOrURI(searchString, aPostDataRef);
            if (url == searchString)
                url = null;

            if (aPostDataRef && aPostDataRef.value)
                return [url, aPostDataRef.value];
            else
                return url; // can be null
        },

        // if openItems is true, open the matching bookmarks items in tabs rather than display
        list: function (filter, tags, openItems)
        {
            var items = this.get(filter, tags, false);
            if (items.length == 0)
            {
                if (filter.length > 0 && tags.length > 0)
                    liberator.echoerr("E283: No bookmarks matching tags: \"" + tags + "\" and string: \"" + filter + "\"");
                else if (filter.length > 0)
                    liberator.echoerr("E283: No bookmarks matching string: \"" + filter + "\"");
                else if (tags.length > 0)
                    liberator.echoerr("E283: No bookmarks matching tags: \"" + tags + "\"");
                else
                    liberator.echoerr("No bookmarks set");

                return;
            }

            if (openItems)
                return liberator.open([i.url for each (i in items)], liberator.NEW_TAB);

            let list = template.genericTable(["", "title", "URL"], items);
            commandline.echo(list, commandline.HL_NORMAL, commandline.FORCE_MULTILINE);
        }
    };
    //}}}
}; //}}}

function History() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const historyService = Components.classes["@mozilla.org/browser/nav-history-service;1"]
                                     .getService(Components.interfaces.nsINavHistoryService);


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
        function (args, special, count)
        {
            args = args.string;

            if (special)
            {
                history.goToStart();
            }
            else
            {
                if (args)
                {
                    var sh = getWebNavigation().sessionHistory;
                    for (let i = sh.index - 1; i >= 0; i--)
                    {
                        if (sh.getEntryAtIndex(i, false).URI.spec == args)
                        {
                            getWebNavigation().gotoIndex(i);
                            return;
                        }
                    }
                    liberator.echoerr("Exxx: URL not found in history");
                }
                else
                {
                    history.stepTo(count > 0 ? -1 * count : -1);
                }
            }
        },
        {
            bang: true,
            completer: function (context)
            {
                let filter = context.filter;
                var sh = getWebNavigation().sessionHistory;
                var completions = [];
                for (let i = sh.index - 1; i >= 0; i--)
                {
                    var entry = sh.getEntryAtIndex(i, false);
                    var url = entry.URI.spec;
                    var title = entry.title;
                    if (completion.match([url, title], filter, false))
                        completions.push([url, title]);
                }
                return [0, completions];
            },
            count: true
        });

    commands.add(["fo[rward]", "fw"],
        "Go forward in the browser history",
        function (args, special, count)
        {
            args = args.string;

            if (special)
            {
                history.goToEnd();
            }
            else
            {
                if (args)
                {
                    var sh = getWebNavigation().sessionHistory;
                    for (let i = sh.index + 1; i < sh.count; i++)
                    {
                        if (sh.getEntryAtIndex(i, false).URI.spec == args)
                        {
                            getWebNavigation().gotoIndex(i);
                            return;
                        }
                    }
                    liberator.echoerr("Exxx: URL not found in history");
                }
                else
                {
                    history.stepTo(count > 0 ? count : 1);
                }
            }
        },
        {
            bang: true,
            completer: function (context)
            {
                let filter = context.filter;
                var sh = getWebNavigation().sessionHistory;
                var completions = [];
                for (let i = sh.index + 1; i < sh.count; i++)
                {
                    var entry = sh.getEntryAtIndex(i, false);
                    var url = entry.URI.spec;
                    var title = entry.title;
                    if (completion.match([url, title], filter, false))
                        completions.push([url, title]);
                }
                return [0, completions];
            },
            count: true
        });

    commands.add(["hist[ory]", "hs"],
        "Show recently visited URLs",
        function (args, special) { history.list(args.string, special); },
        {
            bang: true,
            // completer: function (filter) completion.history(filter)
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        get: function (filter, maxItems)
        {
            let items = [];

            // no query parameters will get all history
            let query = historyService.getNewQuery();
            query.searchTerms = filter;

            let options = historyService.getNewQueryOptions();
            options.sortingMode = options.SORT_BY_DATE_DESCENDING;
            if (maxItems > 0)
                options.maxResults = maxItems;

            // execute the query
            let root = historyService.executeQuery(query, options).root;
            root.containerOpen = true;
            for (let i = 0; i < root.childCount; i++)
            {
                let node = root.getChild(i);
                if (node.type == node.RESULT_TYPE_URI) // just make sure it's a bookmark
                items.push({ url: node.uri,
                             title: node.title,
                             icon: node.icon ? node.icon.spec : DEFAULT_FAVICON,
                             get xml() template.bookmarkItem(this)});
            }
            root.containerOpen = false; // close a container after using it!

            return items;
        },

        // TODO: better names and move to buffer.?
        stepTo: function (steps)
        {
            let index = getWebNavigation().sessionHistory.index + steps;
            if (index >= 0 && index < getWebNavigation().sessionHistory.count)
                getWebNavigation().gotoIndex(index);
            else
                liberator.beep();
        },

        goToStart: function ()
        {
            let index = getWebNavigation().sessionHistory.index;
            if (index == 0)
                return liberator.beep(); // really wanted?

            getWebNavigation().gotoIndex(0);
        },

        goToEnd: function ()
        {
            let index = getWebNavigation().sessionHistory.index;
            if (index == getWebNavigation().sessionHistory.count - 1)
                return liberator.beep();

            getWebNavigation().gotoIndex(max);
        },

        // if openItems is true, open the matching history items in tabs rather than display
        list: function (filter, openItems)
        {
            var items = this.get(filter, 1000);
            if (items.length == 0)
            {
                if (filter.length > 0)
                    liberator.echoerr("E283: No history matching \"" + filter + "\"");
                else
                    liberator.echoerr("No history set");

                return;
            }

            if (openItems)
                return liberator.open([i[0] for each (i in items)], liberator.NEW_TAB);

            let list = template.genericTable(["", "title", "URL"], items);
            commandline.echo(list, commandline.HL_NORMAL, commandline.FORCE_MULTILINE);
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
        function (args, special)
        {
            args = args.string;

            // TODO: finish arg parsing - we really need a proper way to do this. :)
            if (!special && !args)
            {
                liberator.echoerr("E471: Argument required");
                return;
            }

            if (special && args)
            {
                liberator.echoerr("E474: Invalid argument");
                return;
            }

            if (special)
                quickmarks.removeAll();
            else
                quickmarks.remove(args);
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

        add: function (qmark, location)
        {
            qmarks.set(qmark, location);
        },

        remove: function (filter)
        {
            var pattern = new RegExp("[" + filter.replace(/\s+/g, "") + "]");

            for (let [qmark,] in qmarks)
            {
                if (pattern.test(qmark))
                    qmarks.remove(qmark);
            }
        },

        removeAll: function ()
        {
            qmarks.clear();
        },

        jumpTo: function (qmark, where)
        {
            var url = qmarks.get(qmark);

            if (url)
                liberator.open(url, where);
            else
                liberator.echoerr("E20: QuickMark not set");
        },

        list: function (filter)
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

            let items = ({ title: String(mark),
                           url: qmarks.get(mark),
                           get xml() <tr><td>&#xa0;&#xa0;{this.title}</td><td>{this.url}</td></tr>
                         } for each (mark in marks));

            let list = template.genericTable(["QuickMark", "URL"], items);
            commandline.echo(list, commandline.HL_NORMAL, commandline.FORCE_MULTILINE);
        }
    };
    //}}}
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
