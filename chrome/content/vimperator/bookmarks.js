/*
 * also includes methods for dealing with
 * keywords and search engines
 */
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

    if(vimperator.options["preload"])
        setTimeout(function() { load(); } , 100);

    function load()
    {
        // update our bookmark cache
        var root = rdf_service.GetResource("NC:BookmarksRoot");
        bookmarks  = new Array(); // also clear our bookmark cache
        keywords   = new Array();

        var bmarks = [];   // here getAllChildren will store the bookmarks
        BookmarksUtils.getAllChildren(root, bmarks);
        for(var bm in bmarks)
        {
            if (bmarks[bm][0] && bmarks[bm][1])
                bookmarks.push([bmarks[bm][1].Value, bmarks[bm][0].Value ]);

            // keyword
            if(bmarks[bm][1] && bmarks[bm][2])
                keywords.push([bmarks[bm][2].Value, bmarks[bm][0].Value, bmarks[bm][1].Value]);
        }
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{
    /*
     * @return a new Array() of our bookmarks
     */
    this.get = function()
    {
        if (!bookmarks)
            load();

        return bookmarks;
    }

    /**
     * @TODO: keyword support
     */
    this.add = function (title, uri, keyword)
    {
        if(!bookmarks)
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

    /* no idea what it does, it Just Works (TM)
     *
     * @returns number of deleted bookmarks
     */
    this.remove = function(url)
    {
        var deleted = 0;
        if(!url)
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
                if (type != "ImmutableBookmark") {
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
        if(deleted > 0)
            load();

        return deleted;
    }

    /* also ensures that each search engine has a vimperator-friendly alias */
    this.getSearchEngines = function()
    {
        var search_engines = new Array();
        var firefox_engines = search_service.getVisibleEngines({ });
        for(var i in firefox_engines)
        {
            if (!firefox_engines[i].alias || !firefox_engines[i].alias.match(/^[a-z0-9_]+$/))
            {
                var alias = firefox_engines[i].name.replace(/^\W*(\w+).*/, "$1").toLowerCase();
                firefox_engines[i].alias = alias;
            }
            search_engines.push([firefox_engines[i].alias, firefox_engines[i].description]);
        }

        return search_engines;
    }

    // format of returned array:
    // [keyword, helptext, url]
    this.getKeywords = function()
    {
        if(!keywords)
            load();

        return keywords;
    }

    // if the engine name is null, it uses the default search engine
    // @returns the url for the search string
    this.getSearchURL = function(text, engine_name)
    {
        var url = null;
        if(!engine_name || engine_name == "")
            engine_name = vimperator.options["defsearch"];

        // first checks the search engines for a match
        var engine = search_service.getEngineByAlias(engine_name);
        if(engine)
        {
            if(text)
                url = engine.getSubmission(text, null).uri.spec;
            else
                url = engine.searchForm;
        }
        else // check for keyword urls
        {
            if(!keywords)
                load();

            for (var i in keywords)
            {
                if(keywords[i][0] == engine_name)
                {
                    if (text == null)
                        text = "";
                    url = keywords[i][2].replace(/%s/g, encodeURIComponent(text));
                    break;
                }
            }
        }

        // if we came here, the engine_name is neither a search engine or URL
        return url;
    }

    /*
       res = parseBookmarkString("-t tag1,tag2 -T title http://www.orf.at");
       res.tags is an array of tags
       res.title is the title or "" if no one was given
       res.url is the url as a string
       returns null, if parsing failed
    */
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

        while(!str.match(/^\s*$/))
        {
            /* first check for --tags */
            match_tags = str.match(re_tags);
            if(match_tags != null)
            {
                str = match_tags[match_tags.length-1]; // the last captured parenthesis is the rest of the string
                tags = match_tags[3].split(",");
                res.tags = res.tags.concat(tags);
            }
            else /* then for --titles */
            {

                match_title = str.match(re_title);
                if(match_title != null)
                {
                    // only one title allowed
                    if (res.title != null)
                        return null;

                    str = match_title[match_title.length-1]; // the last captured parenthesis is the rest of the string
                    var title = match_title[3];
                    if(title.charAt(0) == '"')
                        title = title.substring(1,title.length-1);
                    res.title = title;
                }
                else /* at last check for an url */
                {
                    match_url = str.match(re_url);
                    if (match_url != null)
                    {
                        // only one url allowed
                        if (res.url != null)
                            return null;

                        str = match_url[match_url.length-1]; // the last captured parenthesis is the rest of the string
                        url = match_url[1];
                        if(url.charAt(0) == '"')
                            url = url.substring(1,url.length-1);
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

    if(vimperator.options["preload"])
        setTimeout(function() { load(); } , 100);

    function load()
    {
        history = new Array();

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
            if(titleLiteral)
                title = titleLiteral.Value;
            else
                title = "";

            history.push([url, title]);
        }
    }
    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{
    /*
     * @return a new Array() of our bookmarks
     */
    this.get = function()
    {
        if (!history)
            load();

        return history;
    }

    this.add = function (url, title)
    {
        if(!history)
            load();

        history = history.filter(function(elem) {
                return elem[0] != url;
        });

        history.unshift([url, title]);
        return true;
    };
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
                    vimperator.log("Deleting local mark: " + mark + " | " + local_marks[mark][i].location + " | (" + local_marks[mark][i].position.x + ", " + local_marks[mark][i].position.y + ") | tab: " + vimperator.tabs.index(local_marks[mark][i].tab));
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
            vimperator.log("Deleting URL mark: " + mark + " | " + url_marks[mark].location + " | (" + url_marks[mark].position.x + ", " + url_marks[mark].position.y + ") | tab: " + vimperator.tabs.index(url_marks[mark].tab));
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

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    // TODO: add support for frameset pages
    this.add = function(mark)
    {
        var win = window.content;

        if (win.document.body.localName.toLowerCase() == "frameset")
        {
            vimperator.echo("marks support for frameset pages not implemented yet");
            return;
        }

        var x = win.scrollMaxX ? win.pageXOffset / win.scrollMaxX : 0;
        var y = win.scrollMaxY ? win.pageYOffset / win.scrollMaxY : 0;
        var position = { x: x, y: y };
        if (isURLMark(mark))
        {
            vimperator.log("Adding URL mark: " + mark + " | " + win.location.href + " | (" + position.x + ", " + position.y + ") | tab: " + vimperator.tabs.index(vimperator.tabs.getTab()));
            url_marks[mark] = { location: win.location.href, position: position, tab: vimperator.tabs.getTab() };
        }
        else if (isLocalMark(mark))
        {
            // remove any previous mark of the same name for this location
            removeLocalMark(mark);
            if (!local_marks[mark])
                local_marks[mark] = [];
            vimperator.log("Adding local mark: " + mark + " | " + win.location.href + " | (" + position.x + ", " + position.y + ")");
            local_marks[mark].push({ location: win.location.href, position: position });
        }
    }

    this.remove = function(marks_str, special)
    {
        if (special)
        {
            // :delmarks! only deletes a-z marks
            for (var mark in local_marks)
                removeLocalMark(mark);
        }
        else
        {
            var pattern = new RegExp("[" + marks_str.replace(/\s+/g, '') + "]");
            for (mark in url_marks)
            {
                if (pattern.test(mark))
                    removeURLMark(mark);
            }
            for (mark in local_marks)
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
                    openURLsInNewTab(slice.location, true);
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
                    vimperator.log("Jumping to URL mark: " + mark + " | " + slice.location + " | (" + slice.position.x + ", " + slice.position.y + ") | tab: " + vimperator.tabs.index(slice.tab));
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
                    vimperator.log("Jumping to local mark: " + mark + " | " + slice[i].location + " | (" + slice[i].position.x + ", " + slice[i].position.y + ")");
                    win.scrollTo(slice[i].position.x * win.scrollMaxX, slice[i].position.y * win.scrollMaxY);
                    ok = true;
                }
            }
        }

        if (!ok)
            vimperator.echoerr("E20: Mark not set"); // FIXME: move up?
    }

    // TODO: show marks like vim does (when the multiline echo impl is done) or in the preview window right now
    this.list = function()
    {
        //        FIXME: hashes don't have a .length property --mst
//        if (local_marks.length + url_marks.length < 1)
//        {
//            vimperator.echoerr("No marks defined");
//            return;
//        }

        var list = "<table><tr style=\"color: magenta\"><td>mark</td><td>line</td><td>col</td><td>file</td></tr>";
        for (var i in local_marks)
        {
            list += "<tr><td>&nbsp;" + i + "</td><td align=\"right\">"
                + Math.round(local_marks[i][0].position.y *100)+ "%</td><td align=\"right\">"
                + Math.round(local_marks[i][0].position.x *100)+ "%</td><td>"
                + local_marks[i][0].location + "</td></tr>";
        }
        for (var j in url_marks)
        {
            list += "<tr><td>&nbsp;" + j + "</td><td align=\"right\">"
                + Math.round(url_marks[j].position.y *100)+ "%</td><td align=\"right\">"
                + Math.round(url_marks[j].position.x *100)+ "%</td><td>"
                + url_marks[j].location + "</td></tr>";
        }
        list += "</table>";
        vimperator.commandline.echo(list, true); // TODO: force of multiline widget a better way
    }
    //}}}
} //}}}

// vim: set fdm=marker sw=4 ts=4 et:
