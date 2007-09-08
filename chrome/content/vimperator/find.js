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

// TODO: <ESC> should cancel search highlighting in 'incsearch' mode
// make sure you only create this object when the "vimperator" object is ready
function Search() //{{{
{
    var self = this;                  // needed for callbacks since "this" is the "vimperator" object in a callback
    var found = false;                // true if the last search was successful
    var backwards = false;            // currently searching backwards
    var lastsearch = "";              // keep track of the last searched string
    var lastsearch_backwards = false; // like "backwards", but for the last search, so if you cancel a search with <esc> this is not set
    var case_sensitive = true;

    // Event handlers for search - closure is needed
    vimperator.registerCallback("change", vimperator.modes.SEARCH_FORWARD, function(command) { self.searchKeyPressed(command); });
    vimperator.registerCallback("submit", vimperator.modes.SEARCH_FORWARD, function(command) { self.searchSubmitted(command); });
    vimperator.registerCallback("cancel", vimperator.modes.SEARCH_FORWARD, function() { self.searchCanceled(); });
    // TODO: allow advanced modes in register/triggerCallback
    vimperator.registerCallback("change", vimperator.modes.SEARCH_BACKWARD, function(command) { self.searchKeyPressed(command); });
    vimperator.registerCallback("submit", vimperator.modes.SEARCH_BACKWARD, function(command) { self.searchSubmitted(command); });
    vimperator.registerCallback("cancel", vimperator.modes.SEARCH_BACKWARD, function() { self.searchCanceled(); });

    // clean the pattern search string of modifiers and set the
    // case-sensitivity flag
    function processPattern(pattern)
    {
        // strip off pattern terminator and trailing /junk
        if (backwards)
            pattern = pattern.replace(/\?.*/, "");
        else
            pattern = pattern.replace(/\/.*/, "");

        if (!pattern)
            pattern = lastsearch;

        if (/\\C/.test(pattern))
        {
            case_sensitive = true;
            pattern = pattern.replace(/\\C/, "");
        }
        else if (/\\c/.test(pattern))
        {
            case_sensitive = false;
            pattern = pattern.replace(/\\c/, "");
        }
        else if (vimperator.options["ignorecase"] && vimperator.options["smartcase"] && /[A-Z]/.test(pattern))
        {
            case_sensitive = true;
        }
        else if (vimperator.options["ignorecase"])
        {
            case_sensitive = false;
        }
        else
        {
            case_sensitive = true;
        }

        return pattern;
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
        str = processPattern(str);

        fastFind.caseSensitive = case_sensitive;
        found = fastFind.find(str, false) != Components.interfaces.nsITypeAheadFind.FIND_NOTFOUND;

        return found;
    }

    // Called when the current search needs to be repeated
    this.findAgain = function(reverse)
    {
        // this hack is needed to make n/N work with the correct string, if
        // we typed /foo<esc> after the original search
        // TODO: this should also clear the current item highlighting
        if (getBrowser().fastFind.searchString != lastsearch)
        {
            this.clear();
            this.find(lastsearch, false);
            this.highlight(lastsearch);
        }

        var up = reverse ? !lastsearch_backwards : lastsearch_backwards;
        var result;

        if (up)
            result = getBrowser().fastFind.findPrevious();
        else
            result = getBrowser().fastFind.findNext();

        if (result == Components.interfaces.nsITypeAheadFind.FIND_NOTFOUND)
        {
            vimperator.echoerr("E486: Pattern not found: " + lastsearch);
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
            }, 10);
        }
        else // just clear the command line if something has been found
        {
            vimperator.echo("");
        }
    }

    // Called when the user types a key in the search dialog. Triggers a find attempt
    this.searchKeyPressed = function(command)
    {
        if (!vimperator.options["incsearch"])
            return;

        this.find(command, backwards);
    }

    // Called when the enter key is pressed to trigger a search
    // use forced_direction if you call this function directly
    this.searchSubmitted = function(command, forced_backward)
    {
        if (typeof forced_backward === "boolean")
            backwards = forced_backward;

        this.clear();
        this.find(command, backwards);
        this.highlight(command);

        // need to find again to draw the highlight of the current search
        // result over the "highlight all" search results
        // very hacky, but seems to work
        setTimeout(function() { self.findAgain(false); }, 10);

        lastsearch_backwards = backwards;
        lastsearch = command;

        vimperator.setMode(vimperator.modes.NORMAL);
        vimperator.focusContent();
    }

    // Called when the search is cancelled - for example if someone presses
    // escape while typing a search
    this.searchCanceled = function()
    {
        //removeMode(MODE_SEARCH);
        vimperator.setMode(vimperator.modes.NORMAL);
        this.clear();
        vimperator.focusContent();
    }

    this.highlight = function(word)
    {
        if (!word)
            word = lastsearch;

        gFindBar.setCaseSensitivity(case_sensitive)
        gFindBar.highlightDoc("yellow", "black", word);
    }

    this.clear = function()
    {
        gFindBar.highlightDoc();
    }

} //}}}

// vim: set fdm=marker sw=4 ts=4 et:
