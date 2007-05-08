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

// array of our bookmark keywords
var g_keywords = [];

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

// The completion substrings, used for showing the longest common match
var g_substrings = [];

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
function completion_select_next_item(has_list, has_full, has_longest)/*{{{*/
{
    if (has_full)
        comp_tab_index++;
    has_list = has_list || (!completion_list.hidden && (has_full || has_longest));
    if (comp_tab_index >= g_completions.length) /* wrap around */
    {
        comp_tab_index = -1;
        if (has_list && has_full)
            completion_list.selectedIndex = -1;
        return;
    }

    if (has_full)
        showStatusbarMessage(" match " + (comp_tab_index + 1).toString() + " of " + g_completions.length.toString() + " ", STATUSFIELD_PROGRESS);
    if (!has_list) return;

    if (comp_tab_index < 1) // at the top of the list
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

    if (has_full)
    {
        listindex = comp_tab_index - comp_tab_list_offset;
        completion_list.selectedIndex = listindex;
    }
}/*}}}*/

/* select the previous index, refill list if necessary
 *
 * changes 'comp_tab_index' */
function completion_select_previous_item(has_list, has_full, has_longest)/*{{{*/
{
    if (has_full)
        comp_tab_index--;
    has_list = has_list || (!completion_list.hidden && (has_full || has_longest));
    if (comp_tab_index == -1)
    {
        if (has_list && has_full)
            completion_list.selectedIndex = -1;
        return;
    }

    if (has_full)
        showStatusbarMessage("match " + (comp_tab_index+1).toString() + " of " + g_completions.length.toString(), STATUSFIELD_PROGRESS);

    if (comp_tab_index < -1) // go to the end of the list
    {
        comp_tab_index = g_completions.length -1;
        if (!has_list) return;
        completion_fill_list(g_completions.length - COMPLETION_MAXITEMS);
        comp_tab_list_offset = g_completions.length - COMPLETION_MAXITEMS;//COMPLETION_MAXITEMS - 1;
        if (comp_tab_list_offset < 0)
            comp_tab_list_offset = 0;
    }
    if (!has_list) return;

    var listindex = comp_tab_index - comp_tab_list_offset;
    // only move the list, if there are still items we can move
    if (listindex < COMPLETION_CONTEXTLINES && comp_tab_list_offset > 0)
    {
        // for speed reason: just remove old item, and add new at the end of the list
        if (has_list)
        {
            var items = completion_list.getElementsByTagName("listitem");
            completion_list.removeChild(items[items.length-1]);
            completion_add_to_list(g_completions[comp_tab_index - COMPLETION_CONTEXTLINES], true);
        }
        comp_tab_list_offset--;
    }

    if (has_full)
    {
        listindex = comp_tab_index - comp_tab_list_offset;
        completion_list.selectedIndex = listindex;
    }
}/*}}}*/

/*
 * returns the longest common substring
 * used for the 'longest' setting for wildmode
 *
 */
function get_longest_substring()/*{{{*/
{
    if (g_substrings.length == 0)
        return '';
    var longest = g_substrings[0];
    for (var i = 1; i < g_substrings.length; i++)
    {
        if (g_substrings[i].length > longest.length)
            longest = g_substrings[i];
    }
    //alert(longest);
    return longest;
}/*}}}*/

// function is case insensitive
// list = [ [['com1', 'com2'], 'text'], [['com3', 'com4'], 'text'] ]
function build_longest_common_substring(list, filter)/*{{{*/
{
    var filtered = [];
    //var filter_length = filter.length;
    //filter = filter.toLowerCase();
    var ignorecase = false;
    if(filter == filter.toLowerCase())
        ignorecase = true;

    for (var i = 0; i < list.length; i++)
    {
        for (var j = 0; j < list[i][0].length; j++)
        {
            var item = list[i][0][j];
            if(ignorecase)
                item = item.toLowerCase();

            if (item.indexOf(filter) == -1)
                continue;

            if (g_substrings.length == 0)
            {
                //alert('if: ' + item);
                var last_index = item.lastIndexOf(filter);
                var length = item.length;
                for (var k = item.indexOf(filter); k != -1 && k <= last_index; k = item.indexOf(filter, k + 1))
                {
                    for (var l = k + filter.length; l <= length; l++)
                        g_substrings.push(list[i][0][j].substring(k, l));
                }
            }
            else
            {
                //alert('else: ' + item);
                g_substrings = g_substrings.filter(function($_) {
                    return list[i][0][j].indexOf($_) >= 0;
                });
            }
            filtered.push([list[i][0][j], list[i][1]]);
            break;
        }
    }
    return filtered;
}/*}}}*/

/* this function is case senstitive */
function build_longest_starting_substring(list, filter)/*{{{*/
{
    var filtered = [];
    //var filter_length = filter.length;
    for (var i = 0; i < list.length; i++)
    {
        for (var j = 0; j < list[i][COMMANDS].length; j++)
        {
            if (list[i][0][j].indexOf(filter) != 0)
                continue;
            if (g_substrings.length == 0)
            {
                var length = list[i][COMMANDS][j].length;
                for (var k = filter.length; k <= length; k++)
                    g_substrings.push(list[i][COMMANDS][j].substring(0, k));
            }
            else
            {
                g_substrings = g_substrings.filter(function($_) {
                    return list[i][COMMANDS][j].indexOf($_) == 0;
                });
            }
            filtered.push([list[i][COMMANDS][j], list[i][SHORTHELP]]);
            break;
        }
    }
    return filtered;
}/*}}}*/


/* 
 * filter a list of urls
 *
 * may consist of searchengines, filenames, bookmarks and history,
 * depending on the 'complete' option
 * if the 'complete' argument is passed like "h", it temproarily overrides the complete option
 */
function get_url_completions(filter, complete)/*{{{*/
{
    g_completions = [];
    g_substrings = [];

    var cpt = complete || get_pref("complete");
    // join all completion arrays together
    for (var i = 0; i < cpt.length; i++)
    {
        if (cpt[i] == 's')
            g_completions = g_completions.concat(get_search_completions(filter));
        else if (cpt[i] == 'b')
            g_completions = g_completions.concat(get_bookmark_completions(filter));
        else if (cpt[i] == 'h')
            g_completions = g_completions.concat(get_history_completions(filter));
        else if (cpt[i] == 'f')
            g_completions = g_completions.concat(get_file_completions(filter, true));
    }

    return g_completions;
}/*}}}*/

/* discard all entries in the 'urls' array, which don't match 'filter */
function filter_url_array(urls, filter)/*{{{*/
{
    var filtered = [];
    // completions which don't match the url but just the description
    // list them add the end of the array
    var additional_completions = [];

    if (!filter) return urls.map(function($_) {
        return [$_[0], $_[1]]
    });

    //var filter_length = filter.length;
    var ignorecase = false;
    if(filter == filter.toLowerCase())
        ignorecase = true;

    /*
     * Longest Common Subsequence
     * This shouldn't use build_longest_common_substring
     * for performance reasons, so as not to cycle through the urls twice
     */
    for (var i = 0; i < urls.length; i++)
    {
        var url = urls[i][0] || "";
        var title = urls[i][1] || "";
        if(ignorecase)
        {
            url = url.toLowerCase();
            title = title.toLowerCase();
        }

        if (url.indexOf(filter) == -1)
        {
            if (title.indexOf(filter) != -1)
                additional_completions.push([ urls[i][0], urls[i][1] ]);
            continue;
        }
        if (g_substrings.length == 0)   // Build the substrings
        {
            var last_index = url.lastIndexOf(filter);
            var url_length = url.length;
            for (var k = url.indexOf(filter); k != -1 && k <= last_index; k = url.indexOf(filter, k + 1))
            {
                for (var l = k + filter.length; l <= url_length; l++)
                    g_substrings.push(url.substring(k, l));
            }
        }
        else
        {
            g_substrings = g_substrings.filter(function($_) {
                return url.indexOf($_) >= 0;
            });
        }
        filtered.push([urls[i][0], urls[i][1]]);
    }

    return filtered.concat(additional_completions);
}/*}}}*/

function get_search_completions(filter)/*{{{*/
{
    //var engines = bookmarks.getSearchEngines();//.concat(bookmarks.getKeywords());
    //var engines = bokmarks.getKeywords();//.concat(bookmarks.getKeywords());
    var engines = bookmarks.getSearchEngines().concat(bookmarks.getKeywords());

    if (!filter) return engines.map(function($_) {
        return [$_[0], $_[1]];
    });
    var mapped = engines.map(function($_) {
        return [[$_[0]], $_[1]];
    });
    return build_longest_common_substring(mapped, filter);
}/*}}}*/

function get_history_completions(filter)/*{{{*/
{
    var history = document.getElementById("hiddenHistoryTree");
    if (!history)
        return [];

    // build our history cache
    if (history_loaded == false)
    {
        if (history.hidden)
        {
            history.hidden = false;
            var globalHistory = Components.classes["@mozilla.org/browser/global-history;2"].getService(Components.interfaces.nsIRDFDataSource);
            history.database.AddDataSource(globalHistory);
            g_history = [];
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
        history_loaded = true;  
    }
    return filter_url_array(g_history, filter);
}/*}}}*/

function get_bookmark_completions(filter)/*{{{*/
{
    if (!bookmarks_loaded)
    {
        // update our bookmark cache
        var RDF = Components.classes["@mozilla.org/rdf/rdf-service;1"].getService( Components.interfaces.nsIRDFService );
        var root = RDF.GetResource( "NC:BookmarksRoot" );
        var bmarks = [];   // here getAllChildren will store the bookmarks
        g_bookmarks = []; // also clear our bookmark cache
        // FIXME: wrong location
        g_keywords = [];

        BookmarksUtils.getAllChildren(root, bmarks);
//        alert(bookmarks[0].length);
        for(var i = 0; i < bmarks.length; i++)
        {
            if (bmarks[i][0] && bmarks[i][1])
            {
                g_bookmarks.push([bmarks[i][1].Value, bmarks[i][0].Value ]);
            }
           // for(var j=0; j < bookmarks[i].length; j++)
           // {
                // keyword
            if(bmarks[i][1] && bmarks[i][2])
                g_keywords.push([bmarks[i][2].Value, bmarks[i][0].Value, bmarks[i][1].Value]);
                //g_keywords.push([bookmarks[i][2].Value, bookmarks[i][0].Value + " (" + bookmarks[i][1].Value + ")"]);
                //g_keywords.push([[bookmarks[i][2].Value, bookmarks[i][1].Value], bookmarks[i][0].Value]);
                //alert("2: " + bookmarks[i][2].Value);
//                if(bookmarks[i][3])
//                    alert("3: " + bookmarks[i][3].Value);
//                if(bookmarks[i][4])
//                    alert("4: " + bookmarks[i][4].Value);
//                if(bookmarks[i][5])
//                    alert("5: " + bookmarks[i][5].Value);
            //alert("0: " + bookmarks[i][0].Value + " - 1: " + bookmarks[i][1].Value + "- 2:" + bookmarks[i][2].Value);// + "- 3:"+  bookmarks[i][3].Value + "- 4:" + bookmarks[i][4].Value);// + "- 5:" + bookmarks[i][5].Value);
            //}
        }
        bookmarks_loaded = true;
    }


    return filter_url_array(g_bookmarks, filter);
}/*}}}*/

function get_file_completions(filter)/*{{{*/
{
    g_completions = [];
    /* This is now also used as part of the url completion, so the substrings shouldn't be cleared for that case */
    if (!arguments[1])
        g_substrings = [];
    var match = filter.match(/^(.*[\/\\])(.*?)$/);
    var dir;

    if (!match || !(dir = match[1]))
        return [];

    var compl = match[2] || '';
    try {
        var fd = fopen(dir, "<");
    } catch(e) {
        // thrown if file does not exist
        return [ ];
    }

    if (!fd)
        return [];

    var entries = fd.read();
    var delim = fd.path.length == 1 ? '' : (fd.path.search(/\\/) != -1) ? "\\" : "/";
    var new_filter = fd.path + delim + compl;
    if (!filter) return entries.map(function($_) {
        var path = $_.path;
        if ($_.isDirectory()) path += '/';
        return [path, ''];
    });
    var mapped = entries.map(function($_) {
        var path = $_.path;
        if ($_.isDirectory()) path += '/';
        return [[path], ''];
    });

    return g_completions = build_longest_starting_substring(mapped, new_filter);
}/*}}}*/

function get_help_completions(filter)/*{{{*/
{
    var help_array = [];
    g_substrings = [];
    help_array = help_array.concat(g_commands.map(function($_) {
        return [
                $_[COMMANDS].map(function($_) { return ":" + $_; }),
                $_[SHORTHELP]
            ];
    }));
    settings = get_settings_completions(filter, true);
    help_array = help_array.concat(settings.map(function($_) {
        return [
                $_[COMMANDS].map(function($_) { return "'" + $_ + "'"; }),
                $_[1]
            ];
    }));
    help_array = help_array.concat(g_mappings.map(function($_) {
        return [ $_[COMMANDS], $_[SHORTHELP] ];
    }));

    if (!filter) return help_array.map(function($_) {
        return [$_[COMMANDS][0], $_[1]]; // unfiltered, use the first command
    });

    return build_longest_common_substring(help_array, filter);
}/*}}}*/

function get_command_completions(filter)/*{{{*/
{
    g_completions = [];
    g_substrings = [];
    if (!filter) return g_completions = g_commands.map(function($_) {
        return [$_[COMMANDS][0], $_[SHORTHELP]];
    });
    return g_completions = build_longest_starting_substring(g_commands, filter);
}/*}}}*/

function get_settings_completions(filter, unfiltered)/*{{{*/
{
    g_substrings = [];
    var settings_completions = [];
    var no_mode = false;
    if (filter.indexOf("no") == 0) // boolean option
    {
        no_mode = true;
        filter = filter.substr(2);
    }
    if (unfiltered) return g_settings.filter(function($_) {
        if (no_mode && $_[TYPE] != "boolean") return false;
        else return true;
    }).map(function($_) {
        return [$_[COMMANDS], $_[SHORTHELP]];
    });
    if (!filter) return g_settings.filter(function($_) {
        if (no_mode && $_[TYPE] != "boolean") return false;
        else return true;
    }).map(function($_) {
        return [$_[COMMANDS][0], $_[SHORTHELP]];
    });


    // check if filter ends with =, then complete current value
    else if(filter.length > 0 && filter.lastIndexOf("=") == filter.length -1)
    {
        filter = filter.substr(0, filter.length-1);
        for(var i=0; i<g_settings.length; i++)
        {
            for(var j=0; j<g_settings[i][COMMANDS].length; j++)
            {
                if (g_settings[i][COMMANDS][j] == filter)
                {
                    settings_completions.push([filter + "=" + g_settings[i][GETFUNC].call(this), ""]);
                    return settings_completions;
                }
            }
        }
        return settings_completions;
    }

    // can't use b_l_s_s, since this has special requirements (the prefix)
    var filter_length = filter.length;
    for (var i = 0; i < g_settings.length; i++)
    {
        if (no_mode && g_settings[i][TYPE] != "boolean")
            continue;

        var prefix = no_mode ? 'no' : '';
        for (var j = 0; j < g_settings[i][COMMANDS].length; j++)
        {
            if (g_settings[i][COMMANDS][j].indexOf(filter) != 0) continue;
            if (g_substrings.length == 0)
            {
                var length = g_settings[i][COMMANDS][j].length;
                for (var k = filter_length; k <= length; k++)
                    g_substrings.push(prefix + g_settings[i][COMMANDS][j].substring(0, k));
            }
            else
            {
                g_substrings = g_substrings.filter(function($_) {
                    return g_settings[i][COMMANDS][j].indexOf($_) == 0;
                });
            }
            settings_completions.push([prefix + g_settings[i][COMMANDS][j], g_settings[i][SHORTHELP]]);
            break;
        }
    }

    return settings_completions;
}/*}}}*/

function get_buffer_completions(filter)/*{{{*/
{
    g_substrings = [];
    var items = [];
    var num = getBrowser().browsers.length;
    var title, url;

    for (var i = 0; i < num; i++)
    {
        try
        {
            title = getBrowser().getBrowserAtIndex(i).contentDocument.getElementsByTagName('title')[0].text;
        }
        catch (e)
        {
            title = "";
        }

        url = getBrowser().getBrowserAtIndex(i).contentDocument.location.href;

        if (title.indexOf(filter) == -1 && url.indexOf(filter) == -1)
            continue;

        
        if (title.indexOf(filter) != -1 || url.indexOf(filter) != -1)
        {
            if (title == "")
                title = "(Untitled)";
            items.push([[(i + 1) + ": " + title, (i + 1) + ": " + url], url]);
        }
    }
    if (!filter) return items.map(function($_) {
        return [$_[0][0], $_[1]];
    });
    return build_longest_common_substring(items, filter);
}/*}}}*/

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
function preview_window_fill(completions)/*{{{*/
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
}/*}}}*/

function preview_window_select(event)/*{{{*/
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
}/*}}}*/

function preview_window_show()/*{{{*/
{
    var items = preview_window.getElementsByTagName("listitem").length;
    var height = get_pref("previewheight");
    if (items > height)
        items = height;
    if (items < 3) // minimum of 3 entries, drop that constraint?
        items = 3;

    preview_window.setAttribute("rows", items.toString());
    preview_window.hidden = false;
    g_bufshow = false;
}/*}}}*/
// vim: set fdm=marker sw=4 ts=4 et:
