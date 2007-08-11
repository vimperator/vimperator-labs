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

The Initial Developer of the Original Code is Shawn Betts.
Portions created by the Initial Developer are Copyright (C) 2004,2005
by the Initial Developer. All Rights Reserved.

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

// Finder for vimperator
// Author: Nigel McNie <http://nigel.mcnie.name/>
// Original Author: Shawn Betts
//
// The algorithm was taken from conkeror <http://conkeror.mozdev.net/>, but
// extensively refactored and changed to behave like vim (naturally!)

// The window to search in (which frame)
//var gWin = null;
//var gSelCtrl = null;

//function highlight(range, node) {
//  var startContainer = range.startContainer;
//  var startOffset = range.startOffset;
//  var endOffset = range.endOffset;
//  var docfrag = range.extractContents();
//  var before = startContainer.splitText(startOffset);
//  var parent = before.parentNode;
//  node.appendChild(docfrag);
//  parent.insertBefore(node, before);
//  return node;
//}

// Clears the current selection
// @todo this should be in vimperator.js, and not depend on searcher.gSelCtrl
function clearSelection() {
    //var selctrl = gSelCtrl;
    var selctrl = vimperator.search.gSelCtrl;
    var sel = selctrl.getSelection(Components.interfaces.nsISelectionController.SELECTION_NORMAL);
    sel.removeAllRanges();
    gFindBar.highlightDoc();
}

// Sets what is currently selected
// @todo as for clearSelection
function setSelection(range) {
    try {
        var selctrlcomp = Components.interfaces.nsISelectionController;
        //var selctrl = gSelCtrl;
        var selctrl = vimperator.search.gSelCtrl;
        var sel = selctrl.getSelection(selctrlcomp.SELECTION_NORMAL);
        sel.removeAllRanges();
        sel.addRange(range.cloneRange());

        selctrl.scrollSelectionIntoView(selctrlcomp.SELECTION_NORMAL,
                        selctrlcomp.SELECTION_FOCUS_REGION,
                         true);
    }
    catch (e) {
        alert("setSelection: " + e);
    }
}

// Highlight find matches and move selection to the first occurrence
// starting from pt.
// @todo move into searcher and clean up
function highlightFind(str, color, wrapped, dir, pt)
{
    try {
    var gWin = vimperator.search.gWin;//document.commandDispatcher.focusedWindow;
    if (!gWin) {
        alert('gWin does not exist here...');
        alert(vimperator.search.gWin);
    }
	var doc = gWin.document;
	var finder = Components.classes["@mozilla.org/embedcomp/rangefind;1"].createInstance()
	    .QueryInterface(Components.interfaces.nsIFind);
	var searchRange;
	var startPt;
	var endPt;
	var body = doc.body;

	finder.findBackwards = !dir;

	searchRange = doc.createRange();
	startPt = doc.createRange();
	endPt = doc.createRange();

	var count = body.childNodes.length;

	// Search range in the doc
	searchRange.setStart(body,0);
	searchRange.setEnd(body, count);

	if (!dir) {
	    if (pt == null) {
		startPt.setStart(body, count);
		startPt.setEnd(body, count);
	    } else {
		startPt.setStart(pt.startContainer, pt.startOffset);
		startPt.setEnd(pt.startContainer, pt.startOffset);
	    }
	    endPt.setStart(body, 0);
	    endPt.setEnd(body, 0);
	} else {
	    if (pt == null) {
		startPt.setStart(body, 0);
		startPt.setEnd(body, 0);
	    } else {
		startPt.setStart(pt.endContainer, pt.endOffset);
		startPt.setEnd(pt.endContainer, pt.endOffset);
	    }
	    endPt.setStart(body, count);
	    endPt.setEnd(body, count);
	}
	// search the doc
	var retRange = null;
	var selectionRange = null;

	if (!wrapped) {
	    do {
		retRange = finder.Find(str, searchRange, startPt, endPt);
		var keepSearching = false;
		if (retRange) {
		    var sc = retRange.startContainer;
		    var ec = retRange.endContainer;
		    var scp = sc.parentNode;
		    var ecp = ec.parentNode;
		    var sy1 = abs_point(scp).y;
		    var ey2 = abs_point(ecp).y + ecp.offsetHeight;

		    startPt = retRange.startContainer.ownerDocument.createRange();
		    if (!dir) {
			startPt.setStart(retRange.startContainer, retRange.startOffset);
			startPt.setEnd(retRange.startContainer, retRange.startOffset);
		    } else {
			startPt.setStart(retRange.endContainer, retRange.endOffset);
			startPt.setEnd(retRange.endContainer, retRange.endOffset);
		    }
		    // We want to find a match that is completely
		    // visible, otherwise the view will scroll just a
		    // bit to fit the selection in completely.
// 		    alert ("sy1: " + sy1 + " scry: " + gWin.scrollY);
// 		    alert ("ey2: " + ey2 + " bot: " + (gWin.scrollY + gWin.innerHeight));
		    keepSearching = (dir && sy1 < gWin.scrollY)
			|| (!dir && ey2 >= gWin.scrollY + gWin.innerHeight);
		}
	    } while (retRange && keepSearching);
	} else {
	    retRange = finder.Find(str, searchRange, startPt, endPt);
	}

	if (retRange) {
	    setSelection(retRange);
	    selectionRange = retRange.cloneRange();
	    // 	    highlightAllBut(str, retRange, color);
	} else {

	}

	return selectionRange;
    } catch(e) { alert('highlightFind:'+e); }
}

function clearHighlight()
{
    gFindBar.highlightDoc();
    var win = window.content;
    var doc = win.document;
    if (!document)
	return;

    var elem = null;
    while ((elem = doc.getElementById("__vimperator-findbar-search-id"))) {
	var child = null;
	var docfrag = doc.createDocumentFragment();
	var next = elem.nextSibling;
	var parent = elem.parentNode;
	while((child = elem.firstChild)) {
	    docfrag.appendChild(child);
	}
	parent.removeChild(elem);
	parent.insertBefore(docfrag, next);
    }
}

/*
 * Finds the absolute X and Y co-ordinates of a given node from the top left of
 * the document
 *
 * Taken from conkeror utils.js
 */
function abs_point (node) {
    var orig = node;
    var pt = {};
    try {
        pt.x = node.offsetLeft;
        pt.y = node.offsetTop;

        // Find imagemap's coordinates
        if (node.tagName == "AREA") {
            var coords = node.getAttribute("coords").split(",");
            pt.x += Number(coords[0]);
            pt.y += Number(coords[1]);
        }

        node = node.offsetParent;

        while (node.tagName != "BODY") {
            pt.x += node.offsetLeft;
            pt.y += node.offsetTop;
            node = node.offsetParent;
        }
    }
    catch (e) {
        // Ignore
    }
    return pt;
}

// Vimperator searcher
// make sure you only create this object when the "vimperator" object is ready
//vimperator.search = new function()
function Search() //{{{
{
    var self = this; // needed for callbacks since "this" is the "vimperator" object in a callback
    this.gWin = null;
    this.gSelCtrl = null;
    this.gFindState = [];

    // Event handlers for search - closure is needed
    vimperator.registerCallback("change", vimperator.modes.SEARCH_FORWARD, function(command){ self.searchKeyPressed(command); });
    vimperator.registerCallback("submit", vimperator.modes.SEARCH_FORWARD, function(command){ self.searchSubmitted(command); });
    vimperator.registerCallback("cancel", vimperator.modes.SEARCH_FORWARD, function(){ self.searchCancelled(); });


    // Called when the search dialog is asked for. Sets up everything necessary
    // for this round of searching
    this.openSearchDialog = function()
    {
        // Get a reference to the focused window if necessary
        if (this.gWin == null) this.gWin = document.commandDispatcher.focusedWindow;

        // Change the currently selected text to not be the attention colour
        // @todo: check what this REALLY does
        try {
            this.gSelCtrl = this.getFocusedSelCtrl();
            this.gSelCtrl.setDisplaySelection(Components.interfaces.nsISelectionController.SELECTION_ATTENTION);
            this.gSelCtrl.repaintSelection(Components.interfaces.nsISelectionController.SELECTION_NORMAL);
        }
        catch (e) {
            alert('Could not change the colour of the current selection:' + e);
        }

        // Initialize the state list for this attempt at searching
        var state = this.createInitialFindState();
        this.gFindState = [];
        this.gFindState.push(state);
        this.resumeFindState(state);

        vimperator.commandline.open('/', '', vimperator.modes.SEARCH_FORWARD);
    }

    // Called when the current search needs to be repeated in the forward
    // direction
    // @todo will need re-jigging when reverse search comes in
    this.findNext = function() {
        this.find(this.lastFindState()["search-str"], true, this.lastFindState()["range"]);
        this.resumeFindState(this.lastFindState());
        // if there is still a search result
        if (this.lastFindState()["range"]) {
            if (this.lastFindState()["wrapped"]) {
                vimperator.echoerr("search hit BOTTOM, continuing at TOP");
                this.lastFindState()["wrapped"] = false;
            }
            else {
                // TODO: this could probably be done in a nicer way - perhaps
                // echoErr could not clobber all of this information somehow?
                vimperator.echo('/' + this.lastFindState()["search-str"]);
            }
        }
    }

    // Called when the current search needs to be repeated in the backward
    // direction
    this.findPrevious = function() {
        this.find(this.lastFindState()["search-str"], false, this.lastFindState()["range"]);
        this.resumeFindState(this.lastFindState());
        // if there is still a search result
        if (this.lastFindState()["range"]) {
            if (this.lastFindState()["wrapped"]) {
                vimperator.echoerr("search hit TOP, continuing at BOTTOM");
                this.lastFindState()["wrapped"] = false;
            }
            else {
                vimperator.echo('/' + this.lastFindState()["search-str"]);
            }
        }
    }

    // Called when the user types a key in the search dialog. Triggers a find attempt
    this.searchKeyPressed = function(command) {
        if (command != "") {
            var str = vimperator.commandline.getCommand();
            this.find(str, true, this.lastFindState()["point"]);
            this.resumeFindState(this.lastFindState());
        }
        else {
            clearSelection();
        }
    }

    // Called when the enter key is pressed to trigger a search
    this.searchSubmitted = function(command) {
        //removeMode(MODE_SEARCH);
        vimperator.setMode(vimperator.modes.NORMAL);
        if (this.lastFindState()["range"] == null) {
            vimperator.echoerr("E492: Pattern not found: " + this.lastFindState()["search-str"]);
        }
    }

    // Called when the search is cancelled - for example if someone presses
    // escape while typing a search
    this.searchCancelled = function() {
        //removeMode(MODE_SEARCH);
        vimperator.setMode(vimperator.modes.NORMAL);
        clearSelection();
        vimperator.focusContent();
    }


    //
    // Helper methods
    //

    // Turn on the selection in all frames
    // @todo to tell the truth, I have no idea what this does
    this.getFocusedSelCtrl = function() {
      var ds = getBrowser().docShell;
      var dsEnum = ds.getDocShellEnumerator(Components.interfaces.nsIDocShellTreeItem.typeContent,
                                            Components.interfaces.nsIDocShell.ENUMERATE_FORWARDS);
      while (dsEnum.hasMoreElements()) {
          ds = dsEnum.getNext().QueryInterface(Components.interfaces.nsIDocShell);
          if (ds.hasFocus) {
              var display = ds.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                  .getInterface(Components.interfaces.nsISelectionDisplay);
              if (!display) return null;
              return display.QueryInterface(Components.interfaces.nsISelectionController);
          }
      }

      // One last try
      return getBrowser().docShell
          .QueryInterface(Components.interfaces.nsIInterfaceRequestor)
          .getInterface(Components.interfaces.nsISelectionDisplay)
          .QueryInterface(Components.interfaces.nsISelectionController);
    }

    // Creates a default find state
    this.createInitialFindState = function() {
        var state = [];
        state["screenx"] = this.gWin.scrollX;
        state["screeny"] = this.gWin.scrollY;
        state["search-str"] = "";
        state["wrapped"] = false;
        state["point"] = null;
        state["range"] = document.createRange();
        state["selection"] = null;
        state["direction"] = true;
        return state;
    }

    // Given a find state, moves the browser to the way it should be in the
    // state - highlighting the correct thing and the screen scrolled to the
    // correct location
    this.resumeFindState = function(state) {
        if (state["selection"]) {
            setSelection(state["selection"]);
        }
        else {
            clearSelection();
        }
        this.gWin.scrollTo(state["screenx"], state["screeny"]);
    }

    // Retrieves the current find state that we're in
    // @todo rename to currentFindState?
    this.lastFindState = function() {
        return this.gFindState[this.gFindState.length - 1];
    }

    // Adds a find state to the stack of such states. This is done every time a find is successful
    this.addFindState = function(screenX, screenY, searchStr, wrapped, point, range, selection, direction) {
        var state = [];
        state["screenx"] = screenX;
        state["screeny"] = screenY;
        state["search-str"] = searchStr;
        state["wrapped"] = wrapped;
        state["point"] = point;
        state["range"] = range;
        state["selection"] = selection;
        state["direction"] = direction;
        this.gFindState.push(state);
    }

    // Finds text in a page
    this.find = function(str, dir, pt)
    {
        var norecurse = arguments[3];

        var matchRange;
        clearHighlight();

        // Should we wrap this time?
        var wrapped = this.lastFindState()["wrapped"];
        var point = pt;
        if (this.lastFindState()["wrapped"] == false
        && this.lastFindState()["range"] == null
        && this.lastFindState()["search-str"] == str
        && this.lastFindState()["direction"] == dir) {
            wrapped = true;
            point = null;
        }
        gFindBar.highlightDoc('yellow', 'black', str);
        matchRange = highlightFind(str, "lightblue", wrapped, dir, point);
        if (matchRange == null) {
            // No more matches in this direction. So add the state and then find
            // again to wrap around. But only find again once to prevent infinite
            // recursion if an error occurs
            this.addFindState(this.gWin.scrollX, this.gWin.scrollY, str, wrapped, point,
                matchRange, this.lastFindState()["selection"], dir);
            if (!norecurse)
                this.find(str, dir, pt, true);
        }
        else {
            this.addFindState(this.gWin.scrollX, this.gWin.scrollY, str, wrapped,
                point, matchRange, matchRange, dir);
        }
    }
} //}}}

//// @TODO should be moved into commands.js
//vimperator.commands.add(new Command(["noh[lsearch]"],
//        clearSelection,
//        {
//            short_help: "Clear the current selection"
//        }
//));

// vim: set fdm=marker sw=4 ts=4 et:
