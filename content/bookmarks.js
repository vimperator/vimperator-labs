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

// also includes methods for dealing with keywords and search engines
vimperator.Bookmarks = function () //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const historyService   = Components.classes["@mozilla.org/browser/nav-history-service;1"]
                             .getService(Components.interfaces.nsINavHistoryService);
    const bookmarksService = Components.classes["@mozilla.org/browser/nav-bookmarks-service;1"]
                             .getService(Components.interfaces.nsINavBookmarksService);
    const taggingService   = Components.classes["@mozilla.org/browser/tagging-service;1"]
                              .getService(Components.interfaces.nsITaggingService);
    const searchService    = Components.classes["@mozilla.org/browser/search-service;1"]
                              .getService(Components.interfaces.nsIBrowserSearchService);
    const ioService        = Components.classes["@mozilla.org/network/io-service;1"]
                              .getService(Components.interfaces.nsIIOService);

    var bookmarks = null;
    var keywords = null;

    if (vimperator.options["preload"])
        setTimeout(function () { load(); }, 100);

    function load()
    {
        // update our bookmark cache
        bookmarks = []; // also clear our bookmark cache
        keywords  = [];

        var folders = [bookmarksService.toolbarFolder, bookmarksService.bookmarksMenuFolder, bookmarksService.unfiledBookmarksFolder];
        var query = historyService.getNewQuery();
        var options = historyService.getNewQueryOptions();
        while (folders.length > 0)
        {
            //comment out the next line for now; the bug hasn't been fixed; final version should include the next line
            //options.setGroupingMode(options.GROUP_BY_FOLDER);
            query.setFolders(folders, 1);
            var result = historyService.executeQuery(query, options);
            //result.sortingMode = options.SORT_BY_DATE_DESCENDING;
            result.sortingMode = options.SORT_BY_VISITCOUNT_DESCENDING;
            var rootNode = result.root;
            rootNode.containerOpen = true;

            folders.shift();
            // iterate over the immediate children of this folder
            for (var i = 0; i < rootNode.childCount; i++)
            {
                var node = rootNode.getChild(i);
                if (node.type == node.RESULT_TYPE_FOLDER)   // folder
                    folders.push(node.itemId);
                else if (node.type == node.RESULT_TYPE_URI) // bookmark
                {
                    var kw = bookmarksService.getKeywordForBookmark(node.itemId);
                    if (kw)
                        keywords.push([kw, node.title, node.uri]);

                    var count = {};
                    var tags = taggingService.getTagsForURI(ioService.newURI(node.uri, null, null), count);
                    bookmarks.push([node.uri, node.title, kw, tags]);
                }
            }

            // close a container after using it!
            rootNode.containerOpen = false;
        }
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        // if "bypassCache" is true, it will force a reload of the bookmarks database
        // on my PC, it takes about 1ms for each bookmark to load, so loading 1000 bookmarks
        // takes about 1 sec
        get: function (filter, tags, bypassCache)
        {
            if (!bookmarks || bypassCache)
                load();

            return vimperator.completion.filterURLArray(bookmarks, filter, tags);
        },

        // if starOnly = true it is saved in the unfiledBookmarksFolder, otherwise in the bookmarksMenuFolder
        add: function (starOnly, title, url, keyword, tags)
        {
            if (!bookmarks)
                load();

            // if no protocol specified, default to http://, isn't there a better way?
            if (!/^[\w-]+:/.test(url))
                url = "http://" + url;

            try
            {
                var uri = ioService.newURI(url, null, null);
                var id = bookmarksService.insertBookmark(
                         starOnly ? bookmarksService.unfiledBookmarksFolder : bookmarksService.bookmarksMenuFolder,
                         uri, -1, title);

                if (!id)
                    return false;

                if (keyword)
                {
                    bookmarksService.setKeywordForBookmark(id, keyword);
                    keywords.unshift([keyword, title, url]);
                }

                if (tags)
                    taggingService.tagURI(uri, tags);
            }
            catch (e)
            {
                vimperator.log(e);
                return false;
            }

            // update the display of our "bookmarked" symbol
            vimperator.statusline.updateUrl();

            //also update bookmark cache
            bookmarks.unshift([url, title, keyword, tags || []]);
            return true;
        },

        toggle: function (url)
        {
            if (!url)
                return;

            var count = this.remove(url);
            if (count > 0)
            {
                vimperator.commandline.echo("Removed bookmark: " + url, vimperator.commandline.HL_NORMAL, vimperator.commandline.FORCE_SINGLELINE);
            }
            else
            {
                var title = vimperator.buffer.title || url;
                var extra = "";
                if (title != url)
                    extra = " (" + title + ")";
                this.add(true, title, url);
                vimperator.commandline.echo("Added bookmark: " + url + extra, vimperator.commandline.HL_NORMAL, vimperator.commandline.FORCE_SINGLELINE);
            }
        },

        isBookmarked: function (url)
        {
            try
            {
                var uri = ioService.newURI(url, null, null);
                var count = {};
                bookmarksService.getBookmarkIdsForURI(uri, count);
            }
            catch (e)
            {
                return false;
            }

            return count.value > 0;
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
                vimperator.log(e);
                return i;
            }


            // also update bookmark cache, if we removed at least one bookmark
            if (count.value > 0)
                load();

            // update the display of our "bookmarked" symbol
            vimperator.statusline.updateUrl();

            return count.value;
        },

        // TODO: add filtering
        // also ensures that each search engine has a Vimperator-friendly alias
        getSearchEngines: function ()
        {
            var searchEngines = [];
            var firefoxEngines = searchService.getVisibleEngines({ });
            for (var i in firefoxEngines)
            {
                var alias = firefoxEngines[i].alias;
                if (!alias || !/^[a-z0-9_-]+$/.test(alias))
                    alias = firefoxEngines[i].name.replace(/^\W*([a-zA-Z_-]+).*/, "$1").toLowerCase();
                if (!alias)
                    alias = "search"; // for search engines which we can't find a suitable alias

                // make sure we can use search engines which would have the same alias (add numbers at the end)
                var newAlias = alias;
                for (var j = 1; j <= 10; j++) // <=10 is intentional
                {
                    if (!searchEngines.some(function (item) { return (item[0] == newAlias); }))
                        break;

                    newAlias = alias + j;
                }
                // only write when it changed, writes are really slow
                if (firefoxEngines[i].alias != newAlias)
                    firefoxEngines[i].alias = newAlias;

                searchEngines.push([firefoxEngines[i].alias, firefoxEngines[i].description]);
            }

            return searchEngines;
        },

        // TODO: add filtering
        // format of returned array:
        // [keyword, helptext, url]
        getKeywords: function ()
        {
            if (!keywords)
                load();

            return keywords;
        },

        // if @param engineName is null, it uses the default search engine
        // @returns the url for the search string
        //          if the search also requires a postData, [url, postData] is returned
        getSearchURL: function (text, engineName)
        {
            var url = null;
            var postData = null;
            if (!engineName)
                engineName = vimperator.options["defsearch"];

            // we need to make sure our custom alias have been set, even if the user
            // did not :open <tab> once before
            this.getSearchEngines();

            // first checks the search engines for a match
            var engine = searchService.getEngineByAlias(engineName);
            if (engine)
            {
                if (text)
                {
                    var submission = engine.getSubmission(text, null);
                    url = submission.uri.spec;
                    postData = submission.postData;
                }
                else
                    url = engine.searchForm;
            }
            else // check for keyword urls
            {
                if (!keywords)
                    load();

                for (var i in keywords)
                {
                    if (keywords[i][0] == engineName)
                    {
                        if (text == null)
                            text = "";
                        url = keywords[i][2].replace(/%s/g, encodeURIComponent(text));
                        break;
                    }
                }
            }

            // if we came here, the engineName is neither a search engine or URL
            if (postData)
                return [url, postData];
            else
                return url; // can be null
        },

        list: function (filter, tags, fullmode)
        {
            if (fullmode)
            {
                vimperator.open("chrome://browser/content/bookmarks/bookmarksPanel.xul", vimperator.NEW_TAB);
            }
            else
            {
                var items = this.get(filter, tags, false);

                if (items.length == 0)
                {
                    if (filter.length > 0 || tags.length > 0)
                        vimperator.echoerr("E283: No bookmarks matching \"" + filter + "\"");
                    else
                        vimperator.echoerr("No bookmarks set");

                    return;
                }

                var title, url, tags, keyword, extra;
                var list = ":" + vimperator.util.escapeHTML(vimperator.commandline.getCommand()) + "<br/>" +
                           "<table><tr align=\"left\" class=\"hl-Title\"><th>title</th><th>URL</th></tr>";
                for (var i = 0; i < items.length; i++)
                {
                    title = vimperator.util.escapeHTML(items[i][1]);
                    if (title.length > 50)
                        title = title.substr(0, 47) + "...";
                    url = vimperator.util.escapeHTML(items[i][0]);
                    keyword = items[i][2];
                    tags = items[i][3].join(", ");

                    extra = "";
                    if (keyword)
                    {
                        extra = "<span style=\"color: gray;\"> (keyword: <span style=\"color: red;\">" + vimperator.util.escapeHTML(keyword) + "</span>";
                        if (tags)
                            extra += " tags: <span style=\"color: blue;\">" + vimperator.util.escapeHTML(tags) + ")</span>";
                        else
                            extra += ")</span>";
                    }
                    else if (tags)
                    {
                        extra = "<span style=\"color: gray;\"> (tags: <span style=\"color: blue;\">" + vimperator.util.escapeHTML(tags) + "</span>)</span>";
                    }


                    list += "<tr><td>" + title + "</td><td style=\"width: 100%\"><a href=\"#\" class=\"hl-URL\">" + url + "</a>" + extra + "</td></tr>";
                }
                list += "</table>";

                vimperator.commandline.echo(list, vimperator.commandline.HL_NORMAL, vimperator.commandline.FORCE_MULTILINE);
            }
        }

    };
    //}}}
}; //}}}

vimperator.History = function () //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const historyService   = Components.classes["@mozilla.org/browser/nav-history-service;1"]
                             .getService(Components.interfaces.nsINavHistoryService);

    var history = null;

    if (vimperator.options["preload"])
        setTimeout(function () { load(); }, 100);

    function load()
    {
        history = [];

        // no query parameters will get all history
        // XXX default sorting is... ?
        var options = historyService.getNewQueryOptions();
        var query = historyService.getNewQuery();

        // execute the query
        var result = historyService.executeQuery(query, options);
        var rootNode = result.root;
        rootNode.containerOpen = true;
        // iterate over the immediate children of this folder
        for (var i = 0; i < rootNode.childCount; i++)
        {
            var node = rootNode.getChild(i);
            if (node.type == node.RESULT_TYPE_URI) // just make sure it's a bookmark
            {
                history.push([node.uri, node.title]);
            }
            else
                dump("History child " + node.itemId + ": " + node.title + " - " + node.type + "\n");
        }

        // close a container after using it!
        rootNode.containerOpen = false;
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        get: function (filter)
        {
            if (!history)
                load();

                return vimperator.completion.filterURLArray(history, filter);
        },

        // the history is automatically added to the Places global history
        // so just update our cached history here
        add: function (url, title)
        {
            if (!history)
                load();

            history = history.filter(function (elem) {
                return elem[0] != url;
            });

            history.unshift([url, title]);
            return true;
        },

        // TODO: better names?
        //       and move to vimperator.buffer.?
        stepTo: function (steps)
        {
            var index = getWebNavigation().sessionHistory.index + steps;

            if (index >= 0 && index < getWebNavigation().sessionHistory.count)
            {
                getWebNavigation().gotoIndex(index);
            }
            else
            {
                vimperator.beep();
            }
        },

        goToStart: function ()
        {
            var index = getWebNavigation().sessionHistory.index;

            if (index == 0)
            {
                vimperator.beep();
                return;
            }

            getWebNavigation().gotoIndex(0);
        },

        goToEnd: function ()
        {
            var index = getWebNavigation().sessionHistory.index;
            var max = getWebNavigation().sessionHistory.count - 1;

            if (index == max)
            {
                vimperator.beep();
                return;
            }

            getWebNavigation().gotoIndex(max);
        },

        list: function (filter, fullmode)
        {
            if (fullmode)
            {
                vimperator.open("chrome://browser/content/history/history-panel.xul", vimperator.NEW_TAB);
            }
            else
            {
                var items = this.get(filter);

                if (items.length == 0)
                {
                    if (filter.length > 0)
                        vimperator.echoerr("E283: No history matching \"" + filter + "\"");
                    else
                        vimperator.echoerr("No history set");

                    return;
                }

                var list = ":" + vimperator.util.escapeHTML(vimperator.commandline.getCommand()) + "<br/>" +
                           "<table><tr align=\"left\" class=\"hl-Title\"><th>title</th><th>URL</th></tr>";
                for (var i = 0; i < items.length; i++)
                {
                    var title = vimperator.util.escapeHTML(items[i][1]);
                    if (title.length > 50)
                        title = title.substr(0, 47) + "...";
                    var url = vimperator.util.escapeHTML(items[i][0]);
                    list += "<tr><td>" + title + "</td><td><a href=\"#\" class=\"hl-URL\">" + url + "</a></td></tr>";
                }
                list += "</table>";
                vimperator.commandline.echo(list, vimperator.commandline.HL_NORMAL, vimperator.commandline.FORCE_MULTILINE);
            }
        }

    };
    //}}}
}; //}}}

vimperator.Marks = function () //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var localMarks = {};
    var urlMarks = {};
    var pendingJumps = [];
    var appContent = document.getElementById("appcontent");

    if (appContent)
        appContent.addEventListener("load", onPageLoad, true);

    function onPageLoad(event)
    {
        var win = event.originalTarget.defaultView;
        for (var i = 0, length = pendingJumps.length; i < length; i++)
        {
            var mark = pendingJumps[i];
            if (win.location.href == mark.location)
            {
                win.scrollTo(mark.position.x * win.scrollMaxX, mark.position.y * win.scrollMaxY);
                pendingJumps.splice(i, 1);
                return;
            }
        }
    }

    function removeLocalMark(mark)
    {
        if (mark in localMarks)
        {
            var win = window.content;
            for (var i = 0; i < localMarks[mark].length; i++)
            {
                if (localMarks[mark][i].location == win.location.href)
                {
                    vimperator.log("Deleting local mark: " + mark + " | " + localMarks[mark][i].location + " | (" + localMarks[mark][i].position.x + ", " + localMarks[mark][i].position.y + ") | tab: " + vimperator.tabs.index(localMarks[mark][i].tab), 5);
                    localMarks[mark].splice(i, 1);
                    if (localMarks[mark].length == 0)
                        delete localMarks[mark];
                    break;
                }
            }
        }
    }

    function removeURLMark(mark)
    {
        if (mark in urlMarks)
        {
            vimperator.log("Deleting URL mark: " + mark + " | " + urlMarks[mark].location + " | (" + urlMarks[mark].position.x + ", " + urlMarks[mark].position.y + ") | tab: " + vimperator.tabs.index(urlMarks[mark].tab), 5);
            delete urlMarks[mark];
        }
    }

    function isLocalMark(mark)
    {
        return /^[a-z]$/.test(mark);
    }

    function isURLMark(mark)
    {
        return /^[A-Z0-9]$/.test(mark);
    }

    function getSortedMarks()
    {
        // local marks
        var lmarks = [];

        for (var mark in localMarks)
        {
            for (var i = 0; i < localMarks[mark].length; i++)
            {
                if (localMarks[mark][i].location == window.content.location.href)
                    lmarks.push([mark, localMarks[mark][i]]);
            }
        }
        lmarks.sort();

        // URL marks
        var umarks = [];

        for (var mark in urlMarks)
            umarks.push([mark, urlMarks[mark]]);
        // FIXME: why does umarks.sort() cause a "Component is not available =
        // NS_ERROR_NOT_AVAILABLE" exception when used here?
        umarks.sort(function (a, b) {
            if (a[0] < b[0])
                return -1;
            else if (a[0] > b[0])
                return 1;
            else
                return 0;
        });

        return lmarks.concat(umarks);
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        // TODO: add support for frameset pages
        add: function (mark)
        {
            var win = window.content;

            if (win.document.body.localName.toLowerCase() == "frameset")
            {
                vimperator.echoerr("marks support for frameset pages not implemented yet");
                return;
            }

            var x = win.scrollMaxX ? win.pageXOffset / win.scrollMaxX : 0;
            var y = win.scrollMaxY ? win.pageYOffset / win.scrollMaxY : 0;
            var position = { x: x, y: y };

            if (isURLMark(mark))
            {
                vimperator.log("Adding URL mark: " + mark + " | " + win.location.href + " | (" + position.x + ", " + position.y + ") | tab: " + vimperator.tabs.index(vimperator.tabs.getTab()), 5);
                urlMarks[mark] = { location: win.location.href, position: position, tab: vimperator.tabs.getTab() };
            }
            else if (isLocalMark(mark))
            {
                // remove any previous mark of the same name for this location
                removeLocalMark(mark);
                if (!localMarks[mark])
                    localMarks[mark] = [];
                vimperator.log("Adding local mark: " + mark + " | " + win.location.href + " | (" + position.x + ", " + position.y + ")", 5);
                localMarks[mark].push({ location: win.location.href, position: position });
            }
        },

        remove: function (filter, special)
        {
            if (special)
            {
                // :delmarks! only deletes a-z marks
                for (var mark in localMarks)
                    removeLocalMark(mark);
            }
            else
            {
                var pattern = new RegExp("[" + filter.replace(/\s+/g, "") + "]");
                for (var mark in urlMarks)
                {
                    if (pattern.test(mark))
                        removeURLMark(mark);
                }
                for (var mark in localMarks)
                {
                    if (pattern.test(mark))
                        removeLocalMark(mark);
                }
            }
        },

        jumpTo: function (mark)
        {
            var ok = false;

            if (isURLMark(mark))
            {
                var slice = urlMarks[mark];
                if (slice && slice.tab && slice.tab.linkedBrowser)
                {
                    if (!slice.tab.parentNode)
                    {
                        pendingJumps.push(slice);
                        // NOTE: this obviously won't work on generated pages using
                        // non-unique URLs, like Vimperator's help :(
                        vimperator.open(slice.location, vimperator.NEW_TAB);
                        return;
                    }
                    var index = vimperator.tabs.index(slice.tab);
                    if (index != -1)
                    {
                        vimperator.tabs.select(index);
                        var win = slice.tab.linkedBrowser.contentWindow;
                        if (win.location.href != slice.location)
                        {
                            pendingJumps.push(slice);
                            win.location.href = slice.location;
                            return;
                        }
                        vimperator.log("Jumping to URL mark: " + mark + " | " + slice.location + " | (" + slice.position.x + ", " + slice.position.y + ") | tab: " + vimperator.tabs.index(slice.tab), 5);
                        win.scrollTo(slice.position.x * win.scrollMaxX, slice.position.y * win.scrollMaxY);
                        ok = true;
                    }
                }
            }
            else if (isLocalMark(mark))
            {
                var win = window.content;
                var slice = localMarks[mark] || [];

                for (var i = 0; i < slice.length; i++)
                {
                    if (win.location.href == slice[i].location)
                    {
                        vimperator.log("Jumping to local mark: " + mark + " | " + slice[i].location + " | (" + slice[i].position.x + ", " + slice[i].position.y + ")", 5);
                        win.scrollTo(slice[i].position.x * win.scrollMaxX, slice[i].position.y * win.scrollMaxY);
                        ok = true;
                    }
                }
            }

            if (!ok)
                vimperator.echoerr("E20: Mark not set"); // FIXME: move up?
        },

        list: function (filter)
        {
            var marks = getSortedMarks();

            if (marks.length == 0)
            {
                vimperator.echoerr("No marks set");
                return;
            }

            if (filter.length > 0)
            {
                marks = marks.filter(function (mark) {
                        if (filter.indexOf(mark[0]) > -1)
                            return mark;
                });
                if (marks.length == 0)
                {
                    vimperator.echoerr("E283: No marks matching \"" + filter + "\"");
                    return;
                }
            }

            var list = ":" + vimperator.util.escapeHTML(vimperator.commandline.getCommand()) + "<br/>" +
                       "<table><tr align=\"left\" class=\"hl-Title\"><th>mark</th><th>line</th><th>col</th><th>file</th></tr>";
            for (var i = 0; i < marks.length; i++)
            {
                list += "<tr>" +
                        "<td> "                        + marks[i][0]                              +  "</td>" +
                        "<td align=\"right\">"         + Math.round(marks[i][1].position.y * 100) + "%</td>" +
                        "<td align=\"right\">"         + Math.round(marks[i][1].position.x * 100) + "%</td>" +
                        "<td style=\"color: green;\">" + vimperator.util.escapeHTML(marks[i][1].location) + "</td>" +
                        "</tr>";
            }
            list += "</table>";

            vimperator.commandline.echo(list, vimperator.commandline.HL_NORMAL, vimperator.commandline.FORCE_MULTILINE);
        }

    };
    //}}}
}; //}}}

vimperator.QuickMarks = function () //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var qmarks = {};
    var savedMarks = vimperator.options.getPref("quickmarks", "").split("\n");

    // load the saved quickmarks -- TODO: change to sqlite
    for (var i = 0; i < savedMarks.length - 1; i += 2)
    {
        qmarks[savedMarks[i]] = savedMarks[i + 1];
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        add: function (qmark, location)
        {
            qmarks[qmark] = location;
        },

        remove: function (filter)
        {
            var pattern = new RegExp("[" + filter.replace(/\s+/g, "") + "]");

            for (var qmark in qmarks)
            {
                if (pattern.test(qmark))
                    delete qmarks[qmark];
            }
        },

        removeAll: function ()
        {
            qmarks = {};
        },

        jumpTo: function (qmark, where)
        {
            var url = qmarks[qmark];

            if (url)
                vimperator.open(url, where);
            else
                vimperator.echoerr("E20: QuickMark not set");
        },

        list: function (filter)
        {
            var marks = [];

            // TODO: should we sort these in a-zA-Z0-9 order?
            for (var mark in qmarks)
                marks.push([mark, qmarks[mark]]);
            marks.sort();

            if (marks.length == 0)
            {
                vimperator.echoerr("No QuickMarks set");
                return;
            }

            if (filter.length > 0)
            {
                marks = marks.filter(function (mark) {
                        if (filter.indexOf(mark[0]) > -1)
                            return mark;
                });
                if (marks.length == 0)
                {
                    vimperator.echoerr("E283: No QuickMarks matching \"" + filter + "\"");
                    return;
                }
            }

            var list = ":" + vimperator.util.escapeHTML(vimperator.commandline.getCommand()) + "<br/>" +
                       "<table><tr align=\"left\" class=\"hl-Title\"><th>QuickMark</th><th>URL</th></tr>";
            for (var i = 0; i < marks.length; i++)
            {
                list += "<tr><td>    " + marks[i][0] +
                        "</td><td style=\"color: green;\">" + vimperator.util.escapeHTML(marks[i][1]) + "</td></tr>";
            }
            list += "</table>";

            vimperator.commandline.echo(list, vimperator.commandline.HL_NORMAL, vimperator.commandline.FORCE_MULTILINE);
        },

        destroy: function ()
        {
            // save the quickmarks
            var savedQuickMarks = "";

            for (var i in qmarks)
            {
                savedQuickMarks += i + "\n";
                savedQuickMarks += qmarks[i] + "\n";
            }

            vimperator.options.setPref("quickmarks", savedQuickMarks);
        }

    };
    //}}}
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
