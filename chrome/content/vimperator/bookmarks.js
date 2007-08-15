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
function Bookmarks() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const search_service = Components.classes["@mozilla.org/browser/search-service;1"].
                           getService(Components.interfaces.nsIBrowserSearchService);
    const rdf_service    = Components.classes["@mozilla.org/rdf/rdf-service;1"].
                           getService( Components.interfaces.nsIRDFService );

    var bookmarks = null;
    var keywords = null;

    if (vimperator.options["preload"])
        setTimeout(function() { load(); } , 100);

    function load()
    {
        // update our bookmark cache
        var root = rdf_service.GetResource("NC:BookmarksRoot");
        bookmarks = []; // also clear our bookmark cache
        keywords  = [];

        var bmarks = [];   // here getAllChildren will store the bookmarks
        BookmarksUtils.getAllChildren(root, bmarks);
        for (var bm in bmarks)
        {
            if (bmarks[bm][0] && bmarks[bm][1])
                bookmarks.push([bmarks[bm][1].Value, bmarks[bm][0].Value ]);

            // keyword
            if (bmarks[bm][1] && bmarks[bm][2])
                keywords.push([bmarks[bm][2].Value, bmarks[bm][0].Value, bmarks[bm][1].Value]);
        }
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    // FIXME: add filtering here rather than having to calling
    // get_bookmark_completions()
    this.get = function()
    {
        if (!bookmarks)
            load();

        return bookmarks;
    }

    // TODO: keyword support
    this.add = function (title, uri, keyword)
    {
        if (!bookmarks)
            load();

        folder = rdf_service.GetResource("NC:BookmarksRoot");
        var rSource = BookmarksUtils.createBookmark(title, uri, keyword, title);
        var selection = BookmarksUtils.getSelectionFromResource(rSource);
        var target = BookmarksUtils.getTargetFromFolder(folder);
        BookmarksUtils.insertAndCheckSelection("newbookmark", selection, target);

        //also update bookmark cache
        bookmarks.unshift([uri, title]);
        return true;
    }

    // NOTE: no idea what it does, it Just Works (TM)
    // returns number of deleted bookmarks
    this.remove = function(url)
    {
        var deleted = 0;
        if (!url)
            return 0;

        // gNC_NS for trunk, NC_NS for 1.X
        //try { var pNC_NS; pNC_NS = gNC_NS;} catch (err) { pNC_NS = NC_NS;}
        if (!BMSVC || !BMDS || !RDF || !gNC_NS) // defined from firefox
            return 0;

        var curfolder = RDF.GetResource("NC:BookmarksRoot");
        var urlArc = RDF.GetResource(gNC_NS + "URL");
        var urlLiteral = RDF.GetLiteral(url);
        if (BMDS.hasArcIn(urlLiteral, urlArc))
        {
            var bmResources, bmResource, title, uri, type, ptype;
            bmResources = BMSVC.GetSources(urlArc, urlLiteral, true);
            while (bmResources.hasMoreElements())
            {
                bmResource = bmResources.getNext();
                type = BookmarksUtils.resolveType(bmResource);
                if (type != "ImmutableBookmark")
                {
                    ptype = BookmarksUtils.resolveType(BMSVC.getParent(bmResource));
                    //              alert(type);
                    //              if ( type == "Folder")  // store the current folder
                    //                  curfolder = bmResource;
                    if ( (type == "Bookmark" || type == "IEFavorite") && ptype != "Livemark")
                    {
                        title = BookmarksUtils.getProperty(bmResource, gNC_NS + "Name");
                        uri = BookmarksUtils.getProperty(bmResource, gNC_NS + "URL");

                        if (uri == url)
                        {
                            RDFC.Init(BMDS, BMSVC.getParent(bmResource));
                            RDFC.RemoveElement(bmResource, true);
                            deleted++;
                        }
                    }
                }
            }
        }

        // also update bookmark cache, if we removed at least one bookmark
        if (deleted > 0)
            load();

        return deleted;
    }

    // also ensures that each search engine has a vimperator-friendly alias
    this.getSearchEngines = function()
    {
        var search_engines = [];
        var firefox_engines = search_service.getVisibleEngines({ });
        for (var i in firefox_engines)
        {
            var alias = firefox_engines[i].alias;
            if (!alias || !alias.match(/^[a-z0-9_-]+$/))
                alias = firefox_engines[i].name.replace(/^\W*([a-zA-Z_-]+).*/, "$1").toLowerCase();
            if (!alias)
                alias = "search"; // for search engines which we can't find a suitable alias

            // make sure we can use search engines which would have the same alias (add numbers at the end)
            var newalias = alias;
            for (var j = 1; j <= 10; j++) // <=10 is intentional
            {
                if (!search_engines.some(function(item) { return (item[0] == newalias); }))
                    break;

                newalias = alias + j;
            }
            // only write when it changed, writes are really slow
            if (firefox_engines[i].alias != newalias)
                firefox_engines[i].alias = newalias;

            search_engines.push([firefox_engines[i].alias, firefox_engines[i].description]);
        }

        return search_engines;
    }

    // format of returned array:
    // [keyword, helptext, url]
    this.getKeywords = function()
    {
        if (!keywords)
            load();

        return keywords;
    }

    // if @param engine_name is null, it uses the default search engine
    // @returns the url for the search string
    //          if the search also requires a postdata, [url, postdata] is returned
    this.getSearchURL = function(text, engine_name)
    {
        var url = null;
        var postdata = null;
        if (!engine_name || engine_name == "")
            engine_name = vimperator.options["defsearch"];

        // first checks the search engines for a match
        var engine = search_service.getEngineByAlias(engine_name);
        if (engine)
        {
            if (text)
            {
                var submission = engine.getSubmission(text, null);
                url = submission.uri.spec;
                postdata = submission.postData;
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
                if (keywords[i][0] == engine_name)
                {
                    if (text == null)
                        text = "";
                    url = keywords[i][2].replace(/%s/g, encodeURIComponent(text));
                    break;
                }
            }
        }

        // if we came here, the engine_name is neither a search engine or URL
        if (postdata)
            return [url, postdata];
        else
            return url; // can be null
    }

    this.list = function(filter, fullmode)
    {
        if (fullmode)
        {
            vimperator.open("chrome://browser/content/bookmarks/bookmarksPanel.xul", vimperator.NEW_TAB);
        }
        else
        {
            var items = vimperator.completion.get_bookmark_completions(filter);

            if (items.length == 0)
            {
                if (filter.length > 0)
                    vimperator.echoerr("E283: No bookmarks matching \"" + filter + "\"");
                else
                    vimperator.echoerr("No bookmarks set");

                return;
            }

            for (var i = 0; i < items.length; i++)
            {
                var list = "<table><tr align=\"left\" style=\"color: magenta\"><th>title</th><th>URL</th></tr>";
                for (var i = 0; i < items.length; i++)
                {
                    list += "<tr><td>" + items[i][1] + "</td><td>" + items[i][0] + "</td></tr>";
                }
                list += "</table>";

                vimperator.commandline.echo(list, true);
            }
        }
    }

    //  res = parseBookmarkString("-t tag1,tag2 -T title http://www.orf.at");
    //  res.tags is an array of tags
    //  res.title is the title or "" if no one was given
    //  res.url is the url as a string
    //  returns null, if parsing failed
    Bookmarks.parseBookmarkString = function(str)
    {
        var res = {};
        res.tags = [];
        res.title = null;
        res.url = null;

        var re_title = /^\s*((-t|--title)\s+(\w+|\".*\"))(.*)/;
        var re_tags = /^\s*((-T|--tags)\s+((\w+)(,\w+)*))(.*)/;
        var re_url = /^\s*(\".+\"|\S+)(.*)/;

        var match_tags = null;
        var match_title = null;
        var match_url = null;

        while (!str.match(/^\s*$/))
        {
            // first check for --tags
            match_tags = str.match(re_tags);
            if (match_tags != null)
            {
                str = match_tags[match_tags.length-1]; // the last captured parenthesis is the rest of the string
                tags = match_tags[3].split(",");
                res.tags = res.tags.concat(tags);
            }
            else // then for --titles
            {

                match_title = str.match(re_title);
                if (match_title != null)
                {
                    // only one title allowed
                    if (res.title != null)
                        return null;

                    str = match_title[match_title.length - 1]; // the last captured parenthesis is the rest of the string
                    var title = match_title[3];
                    if (title.charAt(0) == '"')
                        title = title.substring(1, title.length - 1);
                    res.title = title;
                }
                else // at last check for a URL
                {
                    match_url = str.match(re_url);
                    if (match_url != null)
                    {
                        // only one url allowed
                        if (res.url != null)
                            return null;

                        str = match_url[match_url.length - 1]; // the last captured parenthesis is the rest of the string
                        url = match_url[1];
                        if (url.charAt(0) == '"')
                            url = url.substring(1, url.length - 1);
                        res.url = url;
                    }
                    else
                        return null; // no url, tag or title found but still text left, abort
                }
            }
        }
        return res;
    }
    //}}}
} //}}}

function History() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const rdf_service    = Components.classes["@mozilla.org/rdf/rdf-service;1"].
                           getService( Components.interfaces.nsIRDFService );
    const global_history_service = Components.classes["@mozilla.org/browser/global-history;2"].
                           getService(Components.interfaces.nsIRDFDataSource);

    var history = null;

    if (vimperator.options["preload"])
        setTimeout(function() { load(); } , 100);

    function load()
    {
        history = [];

        var historytree = document.getElementById("hiddenHistoryTree");
        if (!historytree)
            return;

        if (historytree.hidden)
        {
            historytree.hidden = false;
            historytree.database.AddDataSource(global_history_service);
        }

        if (!historytree.ref)
            historytree.ref = "NC:HistoryRoot";

        var nameResource = rdf_service.GetResource(gNC_NS + "Name");
        var builder = historytree.builder.QueryInterface(Components.interfaces.nsIXULTreeBuilder);

        var count = historytree.view.rowCount;
        for (var i = count-1; i >= 0; i--)
        {
            var res = builder.getResourceAtIndex(i);
            var url = res.Value;
            var title;
            var titleRes = historytree.database.GetTarget(res, nameResource, true);
            if (!titleRes)
                continue;

            var titleLiteral = titleRes.QueryInterface(Components.interfaces.nsIRDFLiteral);
            if (titleLiteral)
                title = titleLiteral.Value;
            else
                title = "";

            history.push([url, title]);
        }
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    // FIXME: add filtering here rather than having to call
    // get_bookmark_completions()
    this.get = function()
    {
        if (!history)
            load();

        return history;
    }

    this.add = function (url, title)
    {
        if (!history)
            load();

        history = history.filter(function(elem) {
            return elem[0] != url;
        });

        history.unshift([url, title]);
        return true;
    };

    // TODO: better names?
    this.stepTo = function(steps)
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
    }

    this.goToStart = function()
    {
        var index = getWebNavigation().sessionHistory.index;

        if (index == 0)
        {
            vimperator.beep();
            return;
        }

        getWebNavigation().gotoIndex(0);
    }

    this.goToEnd = function()
    {
        var index = getWebNavigation().sessionHistory.index;
        var max = getWebNavigation().sessionHistory.count - 1;

        if (index == max)
        {
            vimperator.beep();
            return;
        }

        getWebNavigation().gotoIndex(max);
    }

    this.list = function(filter, fullmode)
    {
        if (fullmode)
        {
            vimperator.open("chrome://browser/content/history/history-panel.xul", vimperator.NEW_TAB);
        }
        else
        {
            var items = vimperator.completion.get_history_completions(filter);

            if (items.length == 0)
            {
                if (filter.length > 0)
                    vimperator.echoerr("E283: No history matching \"" + filter + "\"");
                else
                    vimperator.echoerr("No history set");

                return;
            }

            for (var i = 0; i < items.length; i++)
            {
                var list = "<table><tr align=\"left\" style=\"color: magenta\"><th>title</th><th>URL</th></tr>";
                for (var i = 0; i < items.length; i++)
                {
                    list += "<tr><td>" + items[i][1] + "</td><td>" + items[i][0] + "</td></tr>";
                }
                list += "</table>";

                vimperator.commandline.echo(list, true);
            }
        }
    }
    //}}}
} //}}}

function Marks() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var local_marks = {};
    var url_marks = {};
    var pending_jumps = [];
    var appcontent = document.getElementById("appcontent");

    if (appcontent)
        appcontent.addEventListener("load", onPageLoad, true);

    function onPageLoad(event)
    {
        var win = event.originalTarget.defaultView;
        for (var i = 0, length = pending_jumps.length; i < length; i++)
        {
            var mark = pending_jumps[i];
            if (win.location.href == mark.location)
            {
                win.scrollTo(mark.position.x * win.scrollMaxX, mark.position.y * win.scrollMaxY);
                pending_jumps.splice(i, 1);
                return;
            }
        }
    }

    function removeLocalMark(mark)
    {
        if (mark in local_marks)
        {
            var win = window.content;
            for (var i = 0; i < local_marks[mark].length; i++)
            {
                if (local_marks[mark][i].location == win.location.href)
                {
                    vimperator.log("Deleting local mark: " + mark + " | " + local_marks[mark][i].location + " | (" + local_marks[mark][i].position.x + ", " + local_marks[mark][i].position.y + ") | tab: " + vimperator.tabs.index(local_marks[mark][i].tab), 5);
                    local_marks[mark].splice(i, 1);
                    if (local_marks[mark].length == 0)
                        delete local_marks[mark];
                    break;
                }
            }
        }
    }

    function removeURLMark(mark)
    {
        if (mark in url_marks)
        {
            vimperator.log("Deleting URL mark: " + mark + " | " + url_marks[mark].location + " | (" + url_marks[mark].position.x + ", " + url_marks[mark].position.y + ") | tab: " + vimperator.tabs.index(url_marks[mark].tab), 5);
            delete url_marks[mark];
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

        for (var mark in local_marks)
        {
            for (var i = 0; i < local_marks[mark].length; i++)
            {
                if (local_marks[mark][i].location == window.content.location.href)
                    lmarks.push([mark, local_marks[mark][i]]);
            }
        }
        lmarks.sort();

        // URL marks
        var umarks = [];

        for (var mark in url_marks)
            umarks.push([mark, url_marks[mark]]);
        // FIXME: why does umarks.sort() cause a "Component is not available =
        // NS_ERROR_NOT_AVAILABLE" exception when used here?
        umarks.sort(function(a, b) {
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

    // TODO: add support for frameset pages
    this.add = function(mark)
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
            url_marks[mark] = { location: win.location.href, position: position, tab: vimperator.tabs.getTab() };
        }
        else if (isLocalMark(mark))
        {
            // remove any previous mark of the same name for this location
            removeLocalMark(mark);
            if (!local_marks[mark])
                local_marks[mark] = [];
            vimperator.log("Adding local mark: " + mark + " | " + win.location.href + " | (" + position.x + ", " + position.y + ")", 5);
            local_marks[mark].push({ location: win.location.href, position: position });
        }
    }

    this.remove = function(filter, special)
    {
        if (special)
        {
            // :delmarks! only deletes a-z marks
            for (var mark in local_marks)
                removeLocalMark(mark);
        }
        else
        {
            var pattern = new RegExp("[" + filter.replace(/\s+/g, '') + "]");
            for (var mark in url_marks)
            {
                if (pattern.test(mark))
                    removeURLMark(mark);
            }
            for (var mark in local_marks)
            {
                if (pattern.test(mark))
                    removeLocalMark(mark);
            }
        }
    }

    this.jumpTo = function(mark)
    {
        var ok = false;

        if (isURLMark(mark))
        {
            var slice = url_marks[mark];
            if (slice && slice.tab && slice.tab.linkedBrowser)
            {
                if (!slice.tab.parentNode)
                {
                    pending_jumps.push(slice);
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
                        pending_jumps.push(slice);
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
            var slice = local_marks[mark] || [];

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
    }

    this.list = function(filter)
    {
        var marks = getSortedMarks();

        if (marks.length == 0)
        {
            vimperator.echoerr("No marks set");
            return;
        }

        if (filter.length > 0)
        {
            marks = marks.filter(function(mark) {
                    if (filter.indexOf(mark[0]) > -1)
                        return mark;
            });
            if (marks.length == 0)
            {
                vimperator.echoerr("E283: No marks matching \"" + filter + "\"");
                return;
            }
        }

        var list = "<table><tr style=\"color: magenta\"><td>mark</td><td>line</td><td>col</td><td>file</td></tr>";
        for (var i = 0; i < marks.length; i++)
        {
            list += "<tr>"
                  + "<td>&nbsp;"           + marks[i][0]                              +  "</td>"
                  + "<td align=\"right\">" + Math.round(marks[i][1].position.y * 100) + "%</td>"
                  + "<td align=\"right\">" + Math.round(marks[i][1].position.x * 100) + "%</td>"
                  + "<td>"                 + marks[i][1].location                     +  "</td>"
                  + "</tr>";
        }
        list += "</table>";

        vimperator.commandline.echo(list, true); // TODO: force of multiline widget a better way
    }
    //}}}
} //}}}

function QuickMarks() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var qmarks = {};
    var saved_marks = Options.getPref("quickmarks", "").split("\n");

    // load the saved quickmarks -- TODO: change to sqlite
    for (var i = 0; i < saved_marks.length - 1; i += 2)
    {
        qmarks[saved_marks[i]] = saved_marks[i + 1];
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    this.add = function(qmark, location)
    {
        qmarks[qmark] = location;
    }

    this.remove = function(filter)
    {
        var pattern = new RegExp("[" + filter.replace(/\s+/g, '') + "]");

        for (var qmark in qmarks)
        {
            if (pattern.test(qmark))
                delete qmarks[qmark];
        }
    }

    this.removeAll = function()
    {
        qmarks = {};
    }

    this.jumpTo = function(qmark, where)
    {
        var url = qmarks[qmark];

        if (url)
            vimperator.open(url, where);
        else
            vimperator.echoerr("E20: QuickMark not set");
    }

    this.list = function(filter)
    {
        var marks = [];

        // TODO: should we sort these in a-zA-Z0-9 order?
        for (var mark in qmarks)
            marks.push([mark, qmarks[mark]]);
        marks.sort();

        if (marks.length == 0)
        {
            vimperator.echoerr("No marks set");
            return;
        }

        if (filter.length > 0)
        {
            marks = marks.filter(function(mark) {
                    if (filter.indexOf(mark[0]) > -1)
                        return mark;
            });
            if (marks.length == 0)
            {
                vimperator.echoerr("E283: No QuickMarks matching \"" + filter + "\"");
                return;
            }
        }

        var list = "<table><tr style=\"color: magenta\"><td>QuickMark</td><td>URL</td></tr>";
        for (var i = 0; i < marks.length; i++)
        {
            list += "<tr><td>&nbsp;&nbsp;&nbsp;&nbsp;" + marks[i][0] + "</td><td>" + marks[i][1] + "</td></tr>";
        }
        list += "</table>";

        vimperator.commandline.echo(list, true); // TODO: force of multiline widget a better way
    }

    this.destroy = function()
    {
        // save the quickmarks
        var saved_qmarks = "";

        for (var i in qmarks)
        {
            saved_qmarks += i + "\n";
            saved_qmarks += qmarks[i] + "\n";
        }

        Options.setPref("quickmarks", saved_qmarks);
    }
    //}}}
} //}}}

// vim: set fdm=marker sw=4 ts=4 et:
