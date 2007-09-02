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


// make sure you only create this object when the "vimperator" object is ready
// vimperator.search = new function()
function Search() //{{{
{
    var self = this; // needed for callbacks since "this" is the "vimperator" object in a callback
    var found = false;   // true if the last search was successful
    var backwards = false;
    var lastsearch = ""; // keep track of the last searched string
    var lastsearch_backwards = false; // like "backwards", but for the last search, so if you cancel a search with <esc> this is not set

    // Event handlers for search - closure is needed
    vimperator.registerCallback("change", vimperator.modes.SEARCH_FORWARD, function(command){ self.searchKeyPressed(command); });
    vimperator.registerCallback("submit", vimperator.modes.SEARCH_FORWARD, function(command){ self.searchSubmitted(command); });
    vimperator.registerCallback("cancel", vimperator.modes.SEARCH_FORWARD, function(){ self.searchCanceled(); });
    // TODO: allow advanced modes in register/triggerCallback
    vimperator.registerCallback("change", vimperator.modes.SEARCH_BACKWARD, function(command){ self.searchKeyPressed(command); });
    vimperator.registerCallback("submit", vimperator.modes.SEARCH_BACKWARD, function(command){ self.searchSubmitted(command); });
    vimperator.registerCallback("cancel", vimperator.modes.SEARCH_BACKWARD, function(){ self.searchCanceled(); });

    // Called when the search dialog is asked for
    // If you omit "mode", it will default to forward searching
    this.openSearchDialog = function(mode)
    {
        if (mode == vimperator.modes.SEARCH_BACKWARD)
        {
            vimperator.commandline.open('?', '', vimperator.modes.SEARCH_BACKWARD);
            backwards = true;
        }
        else
        {
            vimperator.commandline.open('/', '', vimperator.modes.SEARCH_FORWARD);
            backwards = false;
        }

        // TODO: focus the top of the currently visible screen
    }

    // Finds text in a page
    // TODO: backwards seems impossible i fear :(
    this.find = function(str, backwards)
    {
        const FIND_NORMAL = 0;
        const FIND_TYPEAHEAD = 1;
        const FIND_LINKS = 2;

        found = getBrowser().fastFind.find(str, false) != Components.interfaces.nsITypeAheadFind.FIND_NOTFOUND;

        return found;
    }

    // Called when the current search needs to be repeated
    this.findAgain = function(reverse)
    {
        // this hack is needed to make n/N work with the correct string, if
        // we typed /foo<esc> after the original search
        if (getBrowser().fastFind.searchString != lastsearch)
        {
            this.clear();
            this.find(lastsearch, false);
            gFindBar._highlightDoc("yellow", "black", lastsearch);
        }

        var up = reverse ? !lastsearch_backwards : lastsearch_backwards;
        var result = getBrowser().fastFind.findAgain(up, false);

        if (result == Components.interfaces.nsITypeAheadFind.FIND_NOTFOUND)
            vimperator.echoerr("E486: Pattern not found: " + lastsearch);
        else if (result == Components.interfaces.nsITypeAheadFind.FIND_WRAPPED)
        {
            // hack needed, because wrapping causes a "scroll" event which clears
            // our command line
            setTimeout( function() {
                if (up)
                    vimperator.echoerr("search hit TOP, continuing at BOTTOM");
                else
                    vimperator.echoerr("search hit BOTTOM, continuing at TOP");
            }, 10);
        }
        else // just clear the command line if something has been found
            vimperator.echo("");
    }

    // Called when the user types a key in the search dialog. Triggers a find attempt
    this.searchKeyPressed = function(command)
    {
        // TODO: check for 'incsearch'
        var backward = vimperator.hasMode(vimperator.modes.SEARCH_BACKWARD);
        this.find(command, backward);
    }

    // Called when the enter key is pressed to trigger a search
    this.searchSubmitted = function(command)
    {
        this.clear();
        gFindBar._highlightDoc("yellow", "black", command);

        // need to find again to draw the highlight of the current search
        // result over the "highlight all" search results
        // very hacky, but seem to work
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

    this.clear = function()
    {
        gFindBar._highlightDoc();
    }

} //}}}

// vim: set fdm=marker sw=4 ts=4 et:
