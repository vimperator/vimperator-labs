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

// TODO: proper backwards search - implement our own component?
//     : implement our own highlighter?
//     : frameset pages
//     : <ESC> should cancel search highlighting in 'incsearch' mode and jump
//       back to the presearch page location - can probably use the same
//       solution as marks
//     : 'linksearch' searches should highlight link matches only
//     : changing any search settings should also update the search state including highlighting
//     : incremental searches shouldn't permanently update search modifiers

// make sure you only create this object when the "vimperator" object is ready
function Search() //{{{
{
    var self = this;                   // needed for callbacks since "this" is the "vimperator" object in a callback
    var found = false;                 // true if the last search was successful
    var backwards = false;             // currently searching backwards
    var search_string = "";            // current search string (without modifiers)
    var search_pattern = "";           // current search string (includes modifiers)
    var last_search_pattern = "";      // the last searched pattern (includes modifiers)
    var last_search_string = "";       // the last searched string (without modifiers)
    var last_search_backwards = false; // like "backwards", but for the last search, so if you cancel a search with <esc> this is not set
    var case_sensitive = false;        // search string is case sensitive
    var links_only = false;            // search is limited to link text only

    // Event handlers for search - closure is needed
    vimperator.registerCallback("change", vimperator.modes.SEARCH_FORWARD, function(command) { self.searchKeyPressed(command); });
    vimperator.registerCallback("submit", vimperator.modes.SEARCH_FORWARD, function(command) { self.searchSubmitted(command); });
    vimperator.registerCallback("cancel", vimperator.modes.SEARCH_FORWARD, function() { self.searchCanceled(); });
    // TODO: allow advanced modes in register/triggerCallback
    vimperator.registerCallback("change", vimperator.modes.SEARCH_BACKWARD, function(command) { self.searchKeyPressed(command); });
    vimperator.registerCallback("submit", vimperator.modes.SEARCH_BACKWARD, function(command) { self.searchSubmitted(command); });
    vimperator.registerCallback("cancel", vimperator.modes.SEARCH_BACKWARD, function() { self.searchCanceled(); });

    // set search_string, search_pattern, case_sensitive, links_only
    function processUserPattern(pattern)
    {
        // strip off pattern terminator and offset
        if (backwards)
            pattern = pattern.replace(/\?.*/, "");
        else
            pattern = pattern.replace(/\/.*/, "");

        search_pattern = pattern;

        // case sensitivity - \c wins if both modifiers specified
        if (/\c/.test(pattern))
            case_sensitive = false;
        else if (/\C/.test(pattern))
            case_sensitive = true;
        else if (vimperator.options["ignorecase"] && vimperator.options["smartcase"] && /[A-Z]/.test(pattern))
            case_sensitive = true;
        else if (vimperator.options["ignorecase"])
            case_sensitive = false;
        else
            case_sensitive = true;

        // links only search - \u wins if both modifiers specified
        if (/\\u/.test(pattern))
            links_only = false;
        else if (/\U/.test(pattern))
            links_only = true;
        else if (vimperator.options["linksearch"])
            links_only = true;
        else
            links_only = false;

        // strip modifiers
        pattern = pattern.replace(/(\\)?\\[cCuU]/g, function($0, $1) { return $1 ? $0 : "" });

        // remove the modifer escape \
        pattern = pattern.replace(/\\(\\[cCuU])/g, '$1')

        search_string = pattern;
    }

    // Called when the search dialog is asked for
    // If you omit "mode", it will default to forward searching
    this.openSearchDialog = function(mode)
    {
        if (mode == vimperator.modes.SEARCH_BACKWARD)
        {
            vimperator.commandline.open("?", "", vimperator.modes.SEARCH_BACKWARD);
            backwards = true;
        }
        else
        {
            vimperator.commandline.open("/", "", vimperator.modes.SEARCH_FORWARD);
            backwards = false;
        }

        // TODO: focus the top of the currently visible screen
    }

    // Finds text in a page
    // TODO: backwards seems impossible i fear :(
    this.find = function(str, backwards)
    {
        var fastFind = getBrowser().fastFind;

        processUserPattern(str);

        fastFind.caseSensitive = case_sensitive;
        found = fastFind.find(search_string, links_only) != Components.interfaces.nsITypeAheadFind.FIND_NOTFOUND;

        if (!found)
            vimperator.echoerr("E486: Pattern not found: " + search_pattern);

        return found;
    }

    // Called when the current search needs to be repeated
    this.findAgain = function(reverse)
    {
        // this hack is needed to make n/N work with the correct string, if
        // we typed /foo<esc> after the original search.  Since searchString is
        // readonly we have to call find() again to update it.
        if (getBrowser().fastFind.searchString != last_search_string)
            this.find(last_search_string, false);

        var up = reverse ? !last_search_backwards : last_search_backwards;
        var result = getBrowser().fastFind.findAgain(up, links_only);

        if (result == Components.interfaces.nsITypeAheadFind.FIND_NOTFOUND)
        {
            vimperator.echoerr("E486: Pattern not found: " + last_search_pattern);
        }
        else if (result == Components.interfaces.nsITypeAheadFind.FIND_WRAPPED)
        {
            // hack needed, because wrapping causes a "scroll" event which clears
            // our command line
            setTimeout(function() {
                if (up)
                    vimperator.echoerr("search hit TOP, continuing at BOTTOM");
                else
                    vimperator.echoerr("search hit BOTTOM, continuing at TOP");
            }, 0);
        }
        else
        {
            vimperator.echo((up ? "?" : "/") + last_search_pattern);

            if (vimperator.options["hlsearch"])
                this.highlight(last_search_string);
        }
    }

    // Called when the user types a key in the search dialog. Triggers a find attempt if 'incsearch' is set
    this.searchKeyPressed = function(command)
    {
        if (vimperator.options["incsearch"])
            this.find(command, backwards);
    }

    // Called when the enter key is pressed to trigger a search
    // use forced_direction if you call this function directly
    this.searchSubmitted = function(command, forced_backward)
    {
        if (typeof forced_backward === "boolean")
            backwards = forced_backward;

        // use the last pattern if none specified
        if (!command)
            command = last_search_pattern;

        this.clear();
        this.find(command, backwards);

        last_search_backwards = backwards;
        last_search_pattern = command.replace(backwards ? /\?.*/ : /\/.*/, ""); // XXX
        last_search_string = search_string;

        // TODO: move to find() when reverse incremental searching is kludged in
        // need to find again for reverse searching
        if (backwards)
            setTimeout(function() { self.findAgain(false); }, 0);

        if (vimperator.options["hlsearch"])
            this.highlight(search_string);

        vimperator.modes.set(vimperator.modes.NORMAL, null, true);
    }

    // Called when the search is cancelled - for example if someone presses
    // escape while typing a search
    this.searchCanceled = function()
    {
        vimperator.modes.reset();          
        //vimperator.focusContent();
    }

    // this is not dependent on the value of 'hlsearch'
    this.highlight = function(text)
    {
        // already highlighted?
        if (window.content.document.getElementsByClassName("__mozilla-findbar-search").length > 0)
            return;

        if (!text)
            text = last_search_string;

        gFindBar._setCaseSensitivity(case_sensitive)
        gFindBar._highlightDoc("white", "black", text);

        // TODO: seems fast enough for now
        var spans = window.content.document.getElementsByClassName("__mozilla-findbar-search")
        for (var i = 0; i < spans.length; i++)
            spans[i].setAttribute("style", vimperator.options["hlsearchstyle"]);

        // recreate selection since _highlightDoc collapses the selection backwards
        getBrowser().fastFind.findAgain(false, links_only);

        // TODO: remove highlighting from non-link matches (HTML - A/AREA with href attribute; XML - Xlink [type="simple"])
    }

    this.clear = function()
    {
        gFindBar._highlightDoc();
        // need to manually collapse the selection if the document is not
        // highlighted
        getBrowser().fastFind.collapseSelection();
    }

} //}}}

// vim: set fdm=marker sw=4 ts=4 et:
