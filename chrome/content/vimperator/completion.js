/*
 * COMPLETION HANDLING
 *
 * also responsible for command history, url history and bookmark handling
 */

// array of all our bookmarks
var g_bookmarks = [];
var bookmarks_loaded = false;

// array of all our history items
var g_history = [];
var history_loaded = false;

// variables for the tab completion and command history:
// -1: filled, but no selection made
// >= 0: index of current item in the g_completions array
const COMPLETION_UNINITIALIZED = -2; // if we need to build the completion array first
const COMPLETION_MAXITEMS = 10;
const COMPLETION_CONTEXTLINES = 3;
const COMMAND_LINE_HISTORY_SIZE = 500;

// 2 dimensional: 1st element: what to complete
//                2nd element: help description
var g_completions = new Array(); 

var comp_tab_index = COMPLETION_UNINITIALIZED;  // the index in the internal g_completions array
var comp_tab_list_offset = 0; // how many items is the displayed list shifted from the internal tab index
var comp_tab_startstring = ""; 
var comp_history = new Array();
var comp_history_index = -1;



/* uses the entries in g_completions to fill the listbox
 * starts at index 'startindex', and shows COMPLETION_MAXITEMS
 * returns the number of items */
function completion_fill_list(startindex)/*{{{*/
{
    // remove all old items first
    var items = completion_list.getElementsByTagName("listitem");
    while (items.length > 0) { completion_list.removeChild(items[0]);}

    // find start index
    //var i = index - 3; // 3 lines of context
    if (startindex + COMPLETION_MAXITEMS > g_completions.length)
        startindex = g_completions.length - COMPLETION_MAXITEMS;
    if (startindex < 0)
        startindex = 0;

    for(i=startindex; i<g_completions.length && i < startindex + COMPLETION_MAXITEMS; i++)
    {
        completion_add_to_list(g_completions[i], false);
    }
    //completion_list.hidden = true;
//  completion_list.setAttribute("rows", (i-startindex).toString());
//  showStatusbarMessage ( (i-startindex).toString(), 1);
//  if ( i-startindex > 0) // XXX: respect completetopt setting
//      completion_list.hidden = false;
//  else
//      completion_list.hidden = true;
//  completion_list.setAttribute("rows", (i-startindex).toString());

    return (i-startindex);
}/*}}}*/

function completion_show_list()/*{{{*/
{
    var items = g_completions.length;
    if (items > COMPLETION_MAXITEMS)
        items = COMPLETION_MAXITEMS;
    if (items > 1) // FIXME
    {
        completion_list.setAttribute("rows", items.toString());
        completion_list.hidden = false;
    }
    else
        completion_list.hidden = true;
}/*}}}*/

/* add a single completion item to the list */
function completion_add_to_list(completion_item, at_beginning)/*{{{*/
{
        var item  = document.createElement("listitem");
        var cell1 = document.createElement("listcell");
        var cell2 = document.createElement("listcell");

        cell1.setAttribute("label", completion_item[0]);
        cell1.setAttribute("width", "200");
        cell2.setAttribute("label", completion_item[1]);
        cell2.setAttribute("style", "color:green; font-family: sans");

        item.appendChild(cell1);
        item.appendChild(cell2);
        if (at_beginning == true)
        {
            var items = completion_list.getElementsByTagName("listitem");
            if (items.length > 0)
                completion_list.insertBefore(item, items[0]);
            else
                completion_list.appendChild(item);
        }
        else
            completion_list.appendChild(item);
}/*}}}*/

/* select the next index, refill list if necessary
 *
 * changes 'comp_tab_index' */
function completion_select_next_item()/*{{{*/
{
    comp_tab_index++;
    if (comp_tab_index >= g_completions.length) /* wrap around */
    {
        comp_tab_index = -1;
        completion_list.selectedIndex = -1;
        return;
    }

    if (comp_tab_index == 0) // at the top of the list
    {
        completion_fill_list(0);
        comp_tab_list_offset = 0;
    }

    var listindex = comp_tab_index - comp_tab_list_offset;
    // only move the list, if there are still items we can move
    if (listindex >= COMPLETION_MAXITEMS - COMPLETION_CONTEXTLINES &&
        comp_tab_list_offset < g_completions.length - COMPLETION_MAXITEMS)
    {
        // for speed reason: just remove old item, and add new at the end of the list
        var items = completion_list.getElementsByTagName("listitem");
        completion_list.removeChild(items[0]);
        completion_add_to_list(g_completions[comp_tab_index + COMPLETION_CONTEXTLINES], false);
        comp_tab_list_offset++;
    }

    listindex = comp_tab_index - comp_tab_list_offset;
    completion_list.selectedIndex = listindex;

    showStatusbarMessage(" match " + (comp_tab_index+1).toString() + " of " + g_completions.length.toString() + " ", STATUSFIELD_PROGRESS);
}/*}}}*/

/* select the previous index, refill list if necessary
 *
 * changes 'comp_tab_index' */
function completion_select_previous_item()/*{{{*/
{
    comp_tab_index--;
    if (comp_tab_index == -1)
    {
        completion_list.selectedIndex = -1;
        return;
    }

    if (comp_tab_index < -1) // go to the end of the list
    {
        comp_tab_index = g_completions.length -1;
        completion_fill_list(g_completions.length - COMPLETION_MAXITEMS);
        comp_tab_list_offset = g_completions.length - COMPLETION_MAXITEMS;//COMPLETION_MAXITEMS - 1;
        if (comp_tab_list_offset < 0)
            comp_tab_list_offset = 0;
    }

    var listindex = comp_tab_index - comp_tab_list_offset;
    // only move the list, if there are still items we can move
    if (listindex < COMPLETION_CONTEXTLINES && comp_tab_list_offset > 0)
    {
        // for speed reason: just remove old item, and add new at the end of the list
        var items = completion_list.getElementsByTagName("listitem");
        completion_list.removeChild(items[items.length-1]);
        completion_add_to_list(g_completions[comp_tab_index - COMPLETION_CONTEXTLINES], true);
        comp_tab_list_offset--;
    }

    listindex = comp_tab_index - comp_tab_list_offset;
    completion_list.selectedIndex = listindex;

    showStatusbarMessage("item " + (comp_tab_index+1).toString() + " of " + g_completions.length.toString(), STATUSFIELD_PROGRESS);
}/*}}}*/



/* 
 * filter a list of urls
 *
 * may consist of searchengines, boorkmarks and history,
 * depending on the 'complete' option
 */
function get_url_completions(filter)/*{{{*/
{
    g_completions = [];

    var cpt = get_pref("complete");
    // join all completion arrays together
    for (var i = 0; i < cpt.length; i++)
    {
        if (cpt[i] == 's')
            g_completions = g_completions.concat(get_search_completions(filter));
        else if (cpt[i] == 'b')
            g_completions = g_completions.concat(get_bookmark_completions(filter));
        else if (cpt[i] == 'h')
            g_completions = g_completions.concat(get_history_completions(filter));
    }

    return g_completions;
}/*}}}*/

/* discard all entries in the 'urls' array, which don't match 'filter */
function filter_url_array(urls, filter, use_regex)/*{{{*/
{
    var filtered = [];
    // completions which don't match the url but just the description
    // list them add the end of the array
    var additional_completions = [];

    var reg, reg2;
    if (use_regex)
    {
        reg = new RegExp("^" + filter, "i");
        reg2 = new RegExp(filter, "i");
    }

outer:
    for (var i = 0; i < urls.length; ++i)
    {
        if (filter != null && filter.length > 0)
        {
            // first check if the filter matches in the main part of the URL
            var bm = urls[i][0].replace(/^.*:\/\/(www)?/, "");
            bm = bm.replace(/\/.*$/, "");
            var tokens = bm.split(".");
            for (var k = 0; k < tokens.length-1; k++) // -1 because we don't search the domain (like .com)
            {
                if (use_regex)
                {
                    if(tokens[k].search(reg) != -1)
                    {
                        filtered.push([urls[i][0], urls[i][1] ]);
                        continue outer;
                    }
                }
                else
                {
                    if (tokens[k].indexOf(filter) == 0)
                    {
                        filtered.push([urls[i][0], urls[i][1] ]);
                        continue outer;
                    }
                }
            }

            // otherwise check if the filter matches in the description of the bookmark
            if (use_regex)
            {
                if(urls[i][0].search(reg2) == -1 && urls[i][1].search(reg2) == -1)
                    continue;
            }
            else
            {
                if (urls[i][0].indexOf(filter) == -1 && urls[i][1].indexOf(filter) == -1)
                    continue;
            }
        }
        additional_completions.push([urls[i][0], urls[i][1] ]);
    }
    return filtered.concat(additional_completions);
}/*}}}*/

function get_search_completions(filter)/*{{{*/
{
    var search_completions = [];
    
    var reg = new RegExp("^" + filter, "i");
    for (var i = 0; i < g_searchengines.length; i++)
    {
        if (g_searchengines[i][0].search(reg) != -1)
            search_completions.push([g_searchengines[i][0] + " ", g_searchengines[i][1] ]);
    }

    return search_completions;
}/*}}}*/

function get_bookmark_completions(filter)/*{{{*/
{
    if (!bookmarks_loaded)
    {
        // update our bookmark cache
        var RDF = Components.classes["@mozilla.org/rdf/rdf-service;1"].getService( Components.interfaces.nsIRDFService );
        var root = RDF.GetResource( "NC:BookmarksRoot" );
        bookmarks = [];   // here getAllChildren will store the bookmarks
        g_bookmarks = []; // also clear our bookmark cache
        BookmarksUtils.getAllChildren(root, bookmarks);
        for(var i = 0; i < bookmarks.length; i++)
        {
            if (bookmarks[i][0] && bookmarks[i][1])
                g_bookmarks.push([bookmarks[i][1].Value, bookmarks[i][0].Value ]);
        }
        bookmarks_loaded = true;
    }

    return filter_url_array(g_bookmarks, filter, true);
}/*}}}*/

function get_history_completions(filter)/*{{{*/
{
    var history = document.getElementById("hiddenHistoryTree");

    // build our history cache
    if (history_loaded == false)
    {
        if (history.hidden)
        {
            history.hidden = false;
            var globalHistory = Components.classes["@mozilla.org/browser/global-history;2"].getService(Components.interfaces.nsIRDFDataSource);
            history.database.AddDataSource(globalHistory);
            history_completions = [];
        }

        if (!history.ref)
            history.ref = "NC:HistoryRoot";

        const NC_NS     = "http://home.netscape.com/NC-rdf#";
        if (!gRDF)
            gRDF = Components.classes["@mozilla.org/rdf/rdf-service;1"]
                .getService(Components.interfaces.nsIRDFService);

        var nameResource = gRDF.GetResource(NC_NS + "Name");
        var builder = history.builder.QueryInterface(Components.interfaces.nsIXULTreeBuilder);

        var count = history.view.rowCount;
        for (var i = count-1; i >= 0; i--)
        {
            var res = builder.getResourceAtIndex(i);
            var url = res.Value;
            //      var col = history.columns["Name"];
            //var title = history.view.getCellText(i, col);
            var title;
            var titleRes = history.database.GetTarget(res, nameResource, true);
            if (!titleRes)
                continue;
            
            var titleLiteral = titleRes.QueryInterface(Components.interfaces.nsIRDFLiteral);
            if(titleLiteral)
                title = titleLiteral.Value;
            else
                title = "";

            g_history.push([url, title]);
        }
        //      if(url.toLowerCase().indexOf(filter.toLowerCase()) > -1)
        history_loaded = true;  
    }

    return filter_url_array(g_history, filter, true);
}/*}}}*/

function get_command_completions(filter)/*{{{*/
{
    g_completions = [];
    for(var i=0; i<g_commands.length; i++)
    {
        for(var j=0; j<g_commands[i][0].length; j++)
        {
            //var re = new RegExp("^" + filter);
            if (g_commands[i][0][j].indexOf(filter) == 0)
            {
                g_completions.push([g_commands[i][0][j], g_commands[i][1]]);
                break; // only add a command once
            }
        }
    }
    // commands should be sorted anyway, but it doesn't really hurt -> it DOES hurt :(
    //g_completions.sort();
}/*}}}*/

function get_settings_completions(filter)/*{{{*/
{
    settings_completions = [];
    var no_mode = false;

    if (filter.indexOf("no") == 0) // boolean option
    {
        no_mode = true;
        filter = filter.substr(2);
    }
    // check if filter ends with =, then complete current value
    else if(filter.length > 0 && filter.lastIndexOf("=") == filter.length -1)
    {
        filter = filter.substr(0, filter.length-1);
        for(var i=0; i<g_settings.length; i++)
        {
            for(var j=0; j<g_settings[i][0].length; j++)
            {
                if (g_settings[i][0][j] == filter)
                {
                    settings_completions.push([filter + "=" + g_settings[i][4].call(this), ""]);
                    return settings_completions;
                }
            }
        }
        return settings_completions;
    }

    for(var i=0; i<g_settings.length; i++)
    {
        if (filter == "" || g_settings[i][0][0].indexOf(filter) > -1)
        {
            // for 'no'-mode only return bool options
            if (no_mode)
            {
                if (g_settings[i][5] == "bool")
                    settings_completions.push(["no" + g_settings[i][0][0], g_settings[i][1]]);
            }
            else
                settings_completions.push([g_settings[i][0][0], g_settings[i][1]]);
        }
    }

    return settings_completions;
}/*}}}*/

function get_buffer_completions(filter)
{
    var reg = new RegExp(filter,"i");
    items = new Array();
    var num = getBrowser().browsers.length;
    var title, url;

    for(var i=0; i<num;i++)
    {
        try
        {
            title = getBrowser().getBrowserAtIndex(i).contentDocument.getElementsByTagName('title')[0].text;
        }
        catch (e)
        {
            title = "";
        }
        if (title == "")
            title = "(Untitled)";

        url = getBrowser().getBrowserAtIndex(i).contentDocument.location.href;

        if(title.search(reg) != -1 || url.search(reg) != -1)
        {
            items.push([(i+1)+": "+title, url]);
        }
    }
    return items;
}

////////// COMMAND HISTORY HANDLING ////////////

function add_to_command_history(str)
{
    /* add string to the command line history */
    if (str.length >= 2 && comp_history.push(str) > COMMAND_LINE_HISTORY_SIZE)
        comp_history.shift();
}

function save_history()
{
    set_pref("comp_history", comp_history.join("\n"));
}

function load_history()
{
    var hist = get_pref("comp_history", "");
    comp_history = hist.split("\n");
}


///////// PREVIEW WINDOW //////////////////////

/* uses the entries in completions to fill the listbox */
function preview_window_fill(completions)
{
    // remove all old items first
    var items = preview_window.getElementsByTagName("listitem");
    while (items.length > 0) { preview_window.removeChild(items[0]);}

    for(i=0; i<completions.length; i++)
    {
        var item  = document.createElement("listitem");
        var cell1 = document.createElement("listcell");
        var cell2 = document.createElement("listcell");

        cell1.setAttribute("label", completions[i][0]);
        cell2.setAttribute("label", completions[i][1]);
        //cell2.setAttribute("style", "color:green; font-family: sans; text-align:right");
        cell2.setAttribute("style", "color:green; font-family: sans;");

        item.appendChild(cell1);
        item.appendChild(cell2);
        preview_window.appendChild(item);
    }
}

function preview_window_select(event)
{
    var listcell = document.getElementsByTagName("listcell");
    // 2 columns for now, use the first column
    var index = (preview_window.selectedIndex * 2) + 0;
    var val = listcell[index].getAttribute("label");
    if (val && event.button == 0 && event.type == "dblclick") // left double click
        openURLs(val);
    else if (val && event.button == 1) // middle click
        openURLsInNewTab(val);
    else
        return false;
}

function preview_window_show()/*{{{*/
{
    var items = preview_window.getElementsByTagName("listitem").length;
    var height = get_pref("previewheight");
    if (items > height)
        items = height;
    if (items < 3)
        items = 3;

    preview_window.setAttribute("rows", items.toString());
    preview_window.hidden = false;
}/*}}}*/
// vim: set fdm=marker sw=4 ts=4 et:
