/***** B/GIN LICENSE BLOCK ***** {{{
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
function Search() //{{{
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
    liberator.registerCallback("change", modes.SEARCH_FORWARD, function (command) { search.searchKeyPressed(command); });
    liberator.registerCallback("submit", modes.SEARCH_FORWARD, function (command) { search.searchSubmitted(command); });
    liberator.registerCallback("cancel", modes.SEARCH_FORWARD, function () { search.searchCanceled(); });
    // TODO: allow advanced myModes in register/triggerCallback
    liberator.registerCallback("change", modes.SEARCH_BACKWARD, function (command) { search.searchKeyPressed(command); });
    liberator.registerCallback("submit", modes.SEARCH_BACKWARD, function (command) { search.searchSubmitted(command); });
    liberator.registerCallback("cancel", modes.SEARCH_BACKWARD, function () { search.searchCanceled(); });

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
        else if (options["linksearch"])
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
        else if (options["ignorecase"] && options["smartcase"] && /[A-Z]/.test(pattern))
            caseSensitive = true;
        else if (options["ignorecase"])
            caseSensitive = false;
        else
            caseSensitive = true;

        // strip case-sensitive modifiers
        pattern = pattern.replace(/(\\)?\\[cC]/g, function ($0, $1) { return $1 ? $0 : ""; });

        // remove any modifer escape \
        pattern = pattern.replace(/\\(\\[cClL])/g, "$1");

        searchString = pattern;
    }

    /* Stolen from toolkit.jar in Firefox, for the time being. The private
     * methods were unstable, and changed. The new version is not remotely
     * compatible with what we do.
     *   The following only applies to this object, and may not be
     * necessary, or accurate, but, just in case:
     *   The Original Code is mozilla.org viewsource frontend.
     *
     *   The Initial Developer of the Original Code is
     *   Netscape Communications Corporation.
     *   Portions created by the Initial Developer are Copyright (C) 2003
     *   the Initial Developer. All Rights Reserved.
     *
     *   Contributor(s):
     *       Blake Ross <blake@cs.stanford.edu> (Original Author)
     *       Masayuki Nakano <masayuki@d-toybox.com>
     *       Ben Basson <contact@cusser.net>
     *       Jason Barnabe <jason_barnabe@fastmail.fm>
     *       Asaf Romano <mano@mozilla.com>
     *       Ehsan Akhgari <ehsan.akhgari@gmail.com>
     *       Graeme McCutcheon <graememcc_firefox@graeme-online.co.uk>
     */
    var highlightObj = {
        search: function (aWord, matchCase)
        {
            var finder = Cc["@mozilla.org/embedcomp/rangefind;1"]
                                   .createInstance()
                                   .QueryInterface(Ci.nsIFind);
            if (matchCase !== undefined)
                finder.caseSensitive = matchCase;

            var range;
            while ((range = finder.Find(aWord,
                                        this.searchRange,
                                        this.startPt,
                                        this.endPt)))
                yield range;
        },

        highlightDoc: function highlightDoc(win, aWord)
        {
            Array.forEach(win.frames, function (frame) highlightObj.highlightDoc(frame, aWord));

            var doc = win.document;
            if (!doc || !(doc instanceof HTMLDocument))
                return;

            if (!aWord)
            {
                let elems = highlightObj.getSpans(doc);
                for (let i = elems.snapshotLength; --i >= 0;)
                {
                    let elem = elems.snapshotItem(i);
                    let docfrag = doc.createDocumentFragment();
                    let next = elem.nextSibling;
                    let parent = elem.parentNode;

                    let child;
                    while (child = elem.firstChild)
                        docfrag.appendChild(child);

                    parent.removeChild(elem);
                    parent.insertBefore(docfrag, next);
                    parent.normalize();
                }
                return;
            }

            var baseNode = <span highlight="Search"/>;
            baseNode = util.xmlToDom(baseNode, window.content.document);

            var body = doc.body;
            var count = body.childNodes.length;
            this.searchRange = doc.createRange();
            this.startPt = doc.createRange();
            this.endPt = doc.createRange();

            this.searchRange.setStart(body, 0);
            this.searchRange.setEnd(body, count);

            this.startPt.setStart(body, 0);
            this.startPt.setEnd(body, 0);
            this.endPt.setStart(body, count);
            this.endPt.setEnd(body, count);

            liberator.interrupted = false;
            let n = 0;
            for (let retRange in this.search(aWord, caseSensitive))
            {
                // Highlight
                var nodeSurround = baseNode.cloneNode(true);
                var node = this.highlight(retRange, nodeSurround);
                this.startPt = node.ownerDocument.createRange();
                this.startPt.setStart(node, node.childNodes.length);
                this.startPt.setEnd(node, node.childNodes.length);
                if (n++ % 20 == 0)
                    liberator.threadYield(true);
                if (liberator.interrupted)
                    break;
            }
        },

        highlight: function highlight(aRange, aNode)
        {
            var startContainer = aRange.startContainer;
            var startOffset = aRange.startOffset;
            var endOffset = aRange.endOffset;
            var docfrag = aRange.extractContents();
            var before = startContainer.splitText(startOffset);
            var parent = before.parentNode;
            aNode.appendChild(docfrag);
            parent.insertBefore(aNode, before);
            return aNode;
        },

        getSpans: function (doc) buffer.evaluateXPath("//*[@liberator:highlight='Search']", doc)
    };

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// OPTIONS /////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    options.add(["hlsearch", "hls"],
        "Highlight previous search pattern matches",
        "boolean", "false",
        {
            setter: function (value)
            {
                if (value)
                    search.highlight();
                else
                    search.clear();

                return value;
            }
        });

    options.add(["ignorecase", "ic"],
        "Ignore case in search patterns",
        "boolean", true);

    options.add(["incsearch", "is"],
        "Show where the search pattern matches as it is typed",
        "boolean", true);

    options.add(["linksearch", "lks"],
        "Limit the search to hyperlink text",
        "boolean", false);

    options.add(["smartcase", "scs"],
        "Override the 'ignorecase' option if the pattern contains uppercase characters",
        "boolean", true);

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// MAPPINGS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var myModes = config.browserModes;
    myModes = myModes.concat([modes.CARET]);

    mappings.add(myModes,
        ["/"], "Search forward for a pattern",
        function () { search.openSearchDialog(modes.SEARCH_FORWARD); });

    mappings.add(myModes,
        ["?"], "Search backwards for a pattern",
        function () { search.openSearchDialog(modes.SEARCH_BACKWARD); });

    mappings.add(myModes,
        ["n"], "Find next",
        function () { search.findAgain(false); });

    mappings.add(myModes,
        ["N"], "Find previous",
        function () { search.findAgain(true); });

    mappings.add(myModes.concat([modes.CARET, modes.TEXTAREA]), ["*"],
        "Find word under cursor",
        function ()
        {
            found = false;
            search.searchSubmitted(buffer.getCurrentWord(), false);
            search.findAgain();
        });

    mappings.add(myModes.concat([modes.CARET, modes.TEXTAREA]), ["#"],
        "Find word under cursor backwards",
        function ()
        {
            found = false;
            search.searchSubmitted(buffer.getCurrentWord(), true);
            search.findAgain();
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    commands.add(["noh[lsearch]"],
        "Remove the search highlighting",
        function () { search.clear(); },
        { argCount: "0" });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        // Called when the search dialog is asked for
        // If you omit "mode", it will default to forward searching
        openSearchDialog: function (mode)
        {
            if (mode == modes.SEARCH_BACKWARD)
            {
                commandline.open("?", "", modes.SEARCH_BACKWARD);
                backwards = true;
            }
            else
            {
                commandline.open("/", "", modes.SEARCH_FORWARD);
                backwards = false;
            }

            // TODO: focus the top of the currently visible screen
        },

        // Finds text in a page
        // TODO: backwards seems impossible i fear :(
        find: function (str, backwards)
        {
            let fastFind = getBrowser().fastFind;

            processUserPattern(str);

            fastFind.caseSensitive = caseSensitive;
            found = fastFind.find(searchString, linksOnly) != Ci.nsITypeAheadFind.FIND_NOTFOUND;

            if (!found)
                setTimeout(function () liberator.echoerr("E486: Pattern not found: " + searchPattern, commandline.FORCE_SINGLELINE), 0);

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

            let up = reverse ? !lastSearchBackwards : lastSearchBackwards;
            let result = getBrowser().fastFind.findAgain(up, linksOnly);

            if (result == Ci.nsITypeAheadFind.FIND_NOTFOUND)
            {
                liberator.echoerr("E486: Pattern not found: " + lastSearchPattern, commandline.FORCE_SINGLELINE);
            }
            else if (result == Ci.nsITypeAheadFind.FIND_WRAPPED)
            {
                // hack needed, because wrapping causes a "scroll" event which clears
                // our command line
                setTimeout(function () {
                    if (up)
                        commandline.echo("search hit TOP, continuing at BOTTOM",
                            commandline.HL_WARNINGMSG, commandline.APPEND_TO_MESSAGES | commandline.FORCE_SINGLELINE);
                    else
                        commandline.echo("search hit BOTTOM, continuing at TOP",
                            commandline.HL_WARNINGMSG, commandline.APPEND_TO_MESSAGES | commandline.FORCE_SINGLELINE);
                }, 0);
            }
            else
            {
                commandline.echo((up ? "?" : "/") + lastSearchPattern, null, commandline.FORCE_SINGLELINE);

                if (options["hlsearch"])
                    this.highlight(lastSearchString);
            }
        },

        // Called when the user types a key in the search dialog. Triggers a find attempt if 'incsearch' is set
        searchKeyPressed: function (command)
        {
            if (options["incsearch"])
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

            if (!options["incsearch"] || !found)
                this.find(command, backwards);

            lastSearchBackwards = backwards;
            //lastSearchPattern = command.replace(backwards ? /\?.*/ : /\/.*/, ""); // XXX
            lastSearchPattern = command;
            lastSearchString = searchString;

            // TODO: move to find() when reverse incremental searching is kludged in
            // need to find again for reverse searching
            if (backwards)
                setTimeout(function () { search.findAgain(false); }, 0);

            if (options["hlsearch"])
                this.highlight(searchString);

            modes.reset();
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
            if (config.name == "Muttator")
                return;

            // already highlighted?
            if (highlightObj.getSpans(content.document).snapshotLength > 0)
                return;

            if (!text)
                text = lastSearchString;

            highlightObj.highlightDoc(window.content, text);

            // recreate selection since _highlightDoc collapses the selection backwards
            getBrowser().fastFind.findAgain(false, linksOnly);

            // TODO: remove highlighting from non-link matches (HTML - A/AREA with href attribute; XML - Xlink [type="simple"])
        },

        clear: function ()
        {
            highlightObj.highlightDoc(window.content);
            // need to manually collapse the selection if the document is not
            // highlighted
            getBrowser().fastFind.collapseSelection();
        }

    };
    //}}}
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
