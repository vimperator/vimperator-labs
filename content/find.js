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

// make sure you only create this object when the "liberator" object is ready
liberator.Search = function () //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    // FIXME:
    //var self = this;               // needed for callbacks since "this" is the "liberator" object in a callback
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
    liberator.registerCallback("change", liberator.modes.SEARCH_FORWARD, function (command) { liberator.search.searchKeyPressed(command); });
    liberator.registerCallback("submit", liberator.modes.SEARCH_FORWARD, function (command) { liberator.search.searchSubmitted(command); });
    liberator.registerCallback("cancel", liberator.modes.SEARCH_FORWARD, function () { liberator.search.searchCanceled(); });
    // TODO: allow advanced modes in register/triggerCallback
    liberator.registerCallback("change", liberator.modes.SEARCH_BACKWARD, function (command) { liberator.search.searchKeyPressed(command); });
    liberator.registerCallback("submit", liberator.modes.SEARCH_BACKWARD, function (command) { liberator.search.searchSubmitted(command); });
    liberator.registerCallback("cancel", liberator.modes.SEARCH_BACKWARD, function () { liberator.search.searchCanceled(); });

    // set searchString, searchPattern, caseSensitive, linksOnly
    function processUserPattern(pattern)
    {
        //// strip off pattern terminator and offset
        //if (backwards)
        //    pattern = pattern.replace(/\?.*/, "");
        //else
        //    pattern = pattern.replace(/\/.*/, "");

        searchPattern = pattern;

        // links only search - \l wins if both modifiers specified
        if (/\\l/.test(pattern))
            linksOnly = true;
        else if (/\L/.test(pattern))
            linksOnly = false;
        else if (liberator.options["linksearch"])
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
        else if (liberator.options["ignorecase"] && liberator.options["smartcase"] && /[A-Z]/.test(pattern))
            caseSensitive = true;
        else if (liberator.options["ignorecase"])
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

    liberator.options.add(["hlsearch", "hls"],
        "Highlight previous search pattern matches",
        "boolean", "false",
        {
            setter: function (value)
            {
                if (value)
                    liberator.search.highlight();
                else
                    liberator.search.clear();

                return value;
            }
        });

    liberator.options.add(["hlsearchstyle", "hlss"],
        "CSS specification of highlighted search items",
        "string", "color: black; background-color: yellow; padding: 0; display: inline;");

    liberator.options.add(["ignorecase", "ic"],
        "Ignore case in search patterns",
        "boolean", true);

    liberator.options.add(["incsearch", "is"],
        "Show where the search pattern matches as it is typed",
        "boolean", true);

    liberator.options.add(["linksearch", "lks"],
        "Limit the search to hyperlink text",
        "boolean", false);

    liberator.options.add(["smartcase", "scs"],
        "Override the 'ignorecase' option if the pattern contains uppercase characters",
        "boolean", true);

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// MAPPINGS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var modes = liberator.config.browserModes || [liberator.modes.NORMAL];
    modes = modes.concat([liberator.modes.CARET]);

    liberator.mappings.add(modes,
        ["/"], "Search forward for a pattern",
        function () { liberator.search.openSearchDialog(liberator.modes.SEARCH_FORWARD); });

    liberator.mappings.add(modes,
        ["?"], "Search backwards for a pattern",
        function () { liberator.search.openSearchDialog(liberator.modes.SEARCH_BACKWARD); });

    liberator.mappings.add(modes,
        ["n"], "Find next",
        function () { liberator.search.findAgain(false); });

    liberator.mappings.add(modes,
        ["N"], "Find previous",
        function () { liberator.search.findAgain(true); });

    liberator.mappings.add(modes.concat([liberator.modes.CARET, liberator.modes.TEXTAREA]), ["*"],
        "Find word under cursor",
        function ()
        {
            liberator.search.searchSubmitted(liberator.buffer.getCurrentWord(), false);
            liberator.search.findAgain();
        });

    liberator.mappings.add(modes.concat([liberator.modes.CARET, liberator.modes.TEXTAREA]), ["#"],
        "Find word under cursor backwards",
        function ()
        {
            liberator.search.searchSubmitted(liberator.buffer.getCurrentWord(), true);
            liberator.search.findAgain();
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    liberator.commands.add(["noh[lsearch]"],
        "Remove the search highlighting",
        function ()
        {
            liberator.search.clear();
        },
        { argCount: "0" });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        // Called when the search dialog is asked for
        // If you omit "mode", it will default to forward searching
        openSearchDialog: function (mode)
        {
            if (mode == liberator.modes.SEARCH_BACKWARD)
            {
                liberator.commandline.open("?", "", liberator.modes.SEARCH_BACKWARD);
                backwards = true;
            }
            else
            {
                liberator.commandline.open("/", "", liberator.modes.SEARCH_FORWARD);
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
                setTimeout(function () { liberator.echoerr("E486: Pattern not found: " + searchPattern); }, 0);

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
                liberator.echoerr("E486: Pattern not found: " + lastSearchPattern);
            }
            else if (result == Components.interfaces.nsITypeAheadFind.FIND_WRAPPED)
            {
                // hack needed, because wrapping causes a "scroll" event which clears
                // our command line
                setTimeout(function () {
                    if (up)
                        liberator.commandline.echo("search hit TOP, continuing at BOTTOM", liberator.commandline.HL_WARNING);
                    else
                        liberator.commandline.echo("search hit BOTTOM, continuing at TOP", liberator.commandline.HL_WARNING);
                }, 0);
            }
            else
            {
                liberator.echo((up ? "?" : "/") + lastSearchPattern, null, liberator.commandline.FORCE_SINGLELINE);

                if (liberator.options["hlsearch"])
                    this.highlight(lastSearchString);
            }
        },

        // Called when the user types a key in the search dialog. Triggers a find attempt if 'incsearch' is set
        searchKeyPressed: function (command)
        {
            if (liberator.options["incsearch"])
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
            if (!liberator.options["incsearch"])
                this.find(command, backwards);

            lastSearchBackwards = backwards;
            //lastSearchPattern = command.replace(backwards ? /\?.*/ : /\/.*/, ""); // XXX
            lastSearchPattern = command;
            lastSearchString = searchString;

            // TODO: move to find() when reverse incremental searching is kludged in
            // need to find again for reverse searching
            if (backwards)
                setTimeout(function () { liberator.search.findAgain(false); }, 0);

            if (liberator.options["hlsearch"])
                this.highlight(searchString);

            liberator.modes.reset();
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
            if (liberator.config.name == "Muttator")
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
                    spans[i].setAttribute("style", liberator.options["hlsearchstyle"]);
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
