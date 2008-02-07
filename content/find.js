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
vimperator.Search = function () //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    // FIXME:
    //var self = this;               // needed for callbacks since "this" is the "vimperator" object in a callback
    var found = false;               // true if the last search was successful
    var backwards = false;           // currently searching backwards
    var searchString = "";           // current search string (without modifiers)
    var searchPattern = "";          // current search string (includes modifiers)
    var lastSearchPattern = "";      // the last searched pattern (includes modifiers)
    var lastSearchString = "";       // the last searched string (without modifiers)
    var lastSearchBackwards = false; // like "backwards", but for the last search, so if you cancel a search with <esc> this is not set
    var caseSensitive = false;       // search string is case sensitive
    var linksOnly = false;           // search is limited to link text only

    // Event handlers for search - closure is needed
    vimperator.registerCallback("change", vimperator.modes.SEARCH_FORWARD, function (command) { vimperator.search.searchKeyPressed(command); });
    vimperator.registerCallback("submit", vimperator.modes.SEARCH_FORWARD, function (command) { vimperator.search.searchSubmitted(command); });
    vimperator.registerCallback("cancel", vimperator.modes.SEARCH_FORWARD, function () { vimperator.search.searchCanceled(); });
    // TODO: allow advanced modes in register/triggerCallback
    vimperator.registerCallback("change", vimperator.modes.SEARCH_BACKWARD, function (command) { vimperator.search.searchKeyPressed(command); });
    vimperator.registerCallback("submit", vimperator.modes.SEARCH_BACKWARD, function (command) { vimperator.search.searchSubmitted(command); });
    vimperator.registerCallback("cancel", vimperator.modes.SEARCH_BACKWARD, function () { vimperator.search.searchCanceled(); });

    // set searchString, searchPattern, caseSensitive, linksOnly
    function processUserPattern(pattern)
    {
        // strip off pattern terminator and offset
        if (backwards)
            pattern = pattern.replace(/\?.*/, "");
        else
            pattern = pattern.replace(/\/.*/, "");

        searchPattern = pattern;

        // links only search - \l wins if both modifiers specified
        if (/\\l/.test(pattern))
            linksOnly = false;
        else if (/\L/.test(pattern))
            linksOnly = true;
        else if (vimperator.options["linksearch"])
            linksOnly = true;
        else
            linksOnly = false;

        // strip links-only modifiers
        pattern = pattern.replace(/(\\)?\\[lL]/g, function ($0, $1) { return $1 ? $0 : ""; });

        // case sensitivity - \c wins if both modifiers specified
        if (/\c/.test(pattern))
            caseSensitive = false;
        else if (/\C/.test(pattern))
            caseSensitive = true;
        else if (vimperator.options["ignorecase"] && vimperator.options["smartcase"] && /[A-Z]/.test(pattern))
            caseSensitive = true;
        else if (vimperator.options["ignorecase"])
            caseSensitive = false;
        else
            caseSensitive = true;

        // strip case-sensitive modifiers
        pattern = pattern.replace(/(\\)?\\[cC]/g, function ($0, $1) { return $1 ? $0 : ""; });

        // remove any modifer escape \
        pattern = pattern.replace(/\\(\\[cClL])/g, "$1");

        searchString = pattern;
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// OPTIONS /////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    vimperator.options.add(["hlsearch", "hls"],
        "Highlight previous search pattern matches",
        "boolean", "false",
        {
            setter: function (value)
            {
                if (value)
                    vimperator.search.highlight();
                else
                    vimperator.search.clear();
            }
        });
    vimperator.options.add(["hlsearchstyle", "hlss"],
        "CSS specification of highlighted search items",
        "string", "color: black; background-color: yellow; padding: 0; display: inline;");
    vimperator.options.add(["ignorecase", "ic"],
        "Ignore case in search patterns",
        "boolean", true);
    vimperator.options.add(["incsearch", "is"],
        "Show where the search pattern matches as it is typed",
        "boolean", true);
    vimperator.options.add(["linksearch", "lks"],
        "Limit the search to hyperlink text",
        "boolean", false);
    vimperator.options.add(["smartcase", "scs"], 
        "Override the 'ignorecase' option if the pattern contains uppercase characters",
        "boolean", true);

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        // Called when the search dialog is asked for
        // If you omit "mode", it will default to forward searching
        openSearchDialog: function (mode)
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
        },

        // Finds text in a page
        // TODO: backwards seems impossible i fear :(
        find: function (str, backwards)
        {
            var fastFind = getBrowser().fastFind;

            processUserPattern(str);

            fastFind.caseSensitive = caseSensitive;
            found = fastFind.find(searchString, linksOnly) != Components.interfaces.nsITypeAheadFind.FIND_NOTFOUND;

            if (!found)
                setTimeout(function () { vimperator.echoerr("E486: Pattern not found: " + searchPattern); }, 0);

            return found;
        },

        // Called when the current search needs to be repeated
        findAgain: function (reverse)
        {
            // this hack is needed to make n/N work with the correct string, if
            // we typed /foo<esc> after the original search.  Since searchString is
            // readonly we have to call find() again to update it.
            if (getBrowser().fastFind.searchString != lastSearchString)
                this.find(lastSearchString, false);

            var up = reverse ? !lastSearchBackwards : lastSearchBackwards;
            var result = getBrowser().fastFind.findAgain(up, linksOnly);

            if (result == Components.interfaces.nsITypeAheadFind.FIND_NOTFOUND)
            {
                vimperator.echoerr("E486: Pattern not found: " + lastSearchPattern);
            }
            else if (result == Components.interfaces.nsITypeAheadFind.FIND_WRAPPED)
            {
                // hack needed, because wrapping causes a "scroll" event which clears
                // our command line
                setTimeout(function () {
                    if (up)
                        vimperator.commandline.echo("search hit TOP, continuing at BOTTOM", vimperator.commandline.HL_WARNING);
                    else
                        vimperator.commandline.echo("search hit BOTTOM, continuing at TOP", vimperator.commandline.HL_WARNING);
                }, 0);
            }
            else
            {
                vimperator.echo((up ? "?" : "/") + lastSearchPattern, null, vimperator.commandline.FORCE_SINGLELINE);

                if (vimperator.options["hlsearch"])
                    this.highlight(lastSearchString);
            }
        },

        // Called when the user types a key in the search dialog. Triggers a find attempt if 'incsearch' is set
        searchKeyPressed: function (command)
        {
            if (vimperator.options["incsearch"])
                this.find(command, backwards);
        },

        // Called when the enter key is pressed to trigger a search
        // use forcedBackward if you call this function directly
        searchSubmitted: function (command, forcedBackward)
        {
            if (typeof forcedBackward === "boolean")
                backwards = forcedBackward;

            // use the last pattern if none specified
            if (!command)
                command = lastSearchPattern;

            this.clear();
            this.find(command, backwards);

            lastSearchBackwards = backwards;
            lastSearchPattern = command.replace(backwards ? /\?.*/ : /\/.*/, ""); // XXX
            lastSearchString = searchString;

            // TODO: move to find() when reverse incremental searching is kludged in
            // need to find again for reverse searching
            if (backwards)
                setTimeout(function () { vimperator.search.findAgain(false); }, 0);

            if (vimperator.options["hlsearch"])
                this.highlight(searchString);

            vimperator.modes.reset();
        },

        // Called when the search is canceled - for example if someone presses
        // escape while typing a search
        searchCanceled: function ()
        {
            this.clear();
            // TODO: code to reposition the document to the place before search started
        },

        // FIXME: thunderbird incompatible
        // this is not dependent on the value of 'hlsearch'
        highlight: function (text)
        {
            if (vimperator.config.name == "Muttator")
                return;

            // already highlighted?
            if (window.content.document.getElementsByClassName("__mozilla-findbar-search").length > 0)
                return;

            if (!text)
                text = lastSearchString;

            gFindBar._setCaseSensitivity(caseSensitive);
            gFindBar._highlightDoc("white", "black", text);

            // TODO: seems fast enough for now...just
            (function (win)
            {
                for (var i = 0; i < win.frames.length; i++)
                    arguments.callee(win.frames[i]);
                var spans = window.content.document.getElementsByClassName("__mozilla-findbar-search");
                for (var i = 0; i < spans.length; i++)
                    spans[i].setAttribute("style", vimperator.options["hlsearchstyle"]);
            })(window.content);

            // recreate selection since _highlightDoc collapses the selection backwards
            getBrowser().fastFind.findAgain(false, linksOnly);

            // TODO: remove highlighting from non-link matches (HTML - A/AREA with href attribute; XML - Xlink [type="simple"])
        },

        clear: function ()
        {
            gFindBar._highlightDoc();
            // need to manually collapse the selection if the document is not
            // highlighted
            getBrowser().fastFind.collapseSelection();
        }

    };
    //}}}
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
