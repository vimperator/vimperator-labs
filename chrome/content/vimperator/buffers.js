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

function Buffer() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var zoom_manager = ZoomManager.prototype.getInstance();
    const ZOOM_INTERVAL = 25;

    // initialise the zoom levels
    zoom_manager.zoomFactors = [zoom_manager.MIN];
    for (var i = ZOOM_INTERVAL; i <= zoom_manager.MAX; i += ZOOM_INTERVAL)
        zoom_manager.zoomFactors.push(i);

    // NOTE: this is only needed as there's currently no way to specify a
    // {count} when calling ZM.reduce()/ZM.enlarge().  TODO: see if we can get
    // this added to ZoomManager.
    function bumpZoomLevel(steps)
    {
        var adjusted_zoom = zoom_manager.snap(zoom_manager.textZoom);
        var current = zoom_manager.indexOf(adjusted_zoom);
        var next = current + steps;

        var start = 0, end = zoom_manager.zoomFactors.length - 1;

        if ((current == start && steps < 0) || (current == end && steps > 0))
        {
            vimperator.beep();
            return;
        }

        if (next < start)
            next = start;
        else if (next > end)
            next = end;

        zoom_manager.textZoom = zoom_manager.zoomFactors[next];
        vimperator.hints.reshowHints();
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    this.__defineGetter__("location", function()
    {
        return window.content.document.location.href;
    });

    this.__defineGetter__("textZoom", function()
    {
        return zoom_manager.textZoom;
    });

    this.__defineSetter__("textZoom", function(value)
    {
        try
        {
            zoom_manager.textZoom = value;
        }
        catch (e) // Components.results.NS_ERROR_INVALID_ARG
        {
            vimperator.echoerr("Zoom value out of range (" + zoom_manager.MIN + "-" + zoom_manager.MAX + ")");
        }

        // TODO: shouldn't this just recalculate hint coords, rather than
        // unsuccessfully attempt to reshow hints?  i.e. isn't it just relying
        // on the recalculation side effect? -- djk
        // NOTE: we could really do with a zoom event...
        vimperator.hints.reshowHints();
    });

    this.__defineGetter__("title", function()
    {
        return window.content.document.title;
    });

    // both values are given in percent, -1 means no change
    this.scrollAbsolute = function(horizontal, vertical)
    {
        var win = document.commandDispatcher.focusedWindow;
        //var win = window.content;
        var horiz, vert;

        if (horizontal < 0)
            horiz = win.scrollX;
        else
            horiz = win.scrollMaxX / 100 * horizontal;

        if (vertical < 0)
            vert = win.scrollY;
        else
            vert = win.scrollMaxY / 100 * vertical;

        win.scrollTo(horiz, vert);
    }

    this.scrollRelative = function(right, down)
    {
        var win = window.document.commandDispatcher.focusedWindow;
        //var win = window.content; // XXX: This would fix scrolling when the tab has focus, but breaks when it has frames --MST

        // beep if we can't go there
        if (down > 0)
        {
            if (win.scrollY == win.scrollMaxY)
                vimperator.beep();
        }
        else if (down < 0)
        {
            if (win.scrollY == 0)
                vimperator.beep();
        }

        if (right > 0)
        {
            if (win.scrollX == win.scrollMaxX)
                vimperator.beep();
        }
        else if (right < 0)
        {
            if (win.scrollX == 0)
                vimperator.beep();
        }

        win.scrollBy(right * 20, down * 20);
    }

    // TODO: allow callback for filtering out unwanted frames? User defined?
    this.shiftFrameFocus = function(count, forward)
    {
        try
        {
            var frames = [];

            // find all frames - depth-first search
            (function(frame)
            {
                if (frame.document.body.localName.toLowerCase() == "body")
                    frames.push(frame);
                for (var i = 0; i < frame.frames.length; i++)
                    arguments.callee(frame.frames[i])
            })(window.content);

            if (frames.length == 0) // currently top is always included
                return;

            // remove all unfocusable frames
            // TODO: find a better way to do this
            var start = document.commandDispatcher.focusedWindow;
            frames = frames.filter(function(frame) {
                    frame.focus();
                    if (document.commandDispatcher.focusedWindow == frame)
                        return frame;
            });
            start.focus();

            // find the currently focused frame index
            // TODO: If the window is a frameset then the first _frame_ should be
            //       focused.  Since this is not the current FF behaviour,
            //       we initalise current to -1 so the first call takes us to the
            //       first frame.
            var current = -1;
            for (var i = 0; i < frames.length; i++)
            {
                if (frames[i] == document.commandDispatcher.focusedWindow)
                {
                    var current = i;
                    break;
                }
            }

            // calculate the next frame to focus
            var next = current;
            if (forward)
            {
                if (count > 1)
                    next = current + count;
                else
                    next++;

                if (next > frames.length - 1)
                    next = frames.length - 1;
            }
            else
            {
                if (count > 1)
                    next = current - count;
                else
                    next--;

                if (next < 0)
                    next = 0;
            }

            // focus next frame and scroll into view
            frames[next].focus();
            if (frames[next] != window.content)
                frames[next].frameElement.scrollIntoView(false);

            // add the frame indicator
            var doc = frames[next].document;
            var indicator = doc.createElement("div");
            indicator.id = "vimperator-frame-indicator";
            // NOTE: need to set a high z-index - it's a crapshoot!
            var style = "background-color: red; opacity: 0.5; z-index: 999;" +
                        "position: fixed; top: 0; bottom: 0; left: 0; right: 0;";
            indicator.setAttribute("style", style);
            doc.body.appendChild(indicator);

            // remove the frame indicator
            setTimeout(function() { doc.body.removeChild(indicator); }, 500);
        }
        catch (e)
        {
            //vimperator.echoerr(e);
            // FIXME: fail silently here for now
        }
    }

    // updates the buffer preview in place only if list is visible
    this.updateBufferList = function()
    {
        if (!vimperator.bufferwindow.visible())
            return false;

        var items = get_buffer_completions("");
        vimperator.bufferwindow.show(items);
        vimperator.bufferwindow.selectItem(getBrowser().mTabContainer.selectedIndex);
    }

    this.zoomIn = function(steps)
    {
        bumpZoomLevel(steps);
    }

    this.zoomOut = function(steps)
    {
        bumpZoomLevel(-steps);
    }
    //}}}
} //}}}

// vim: set fdm=marker sw=4 ts=4 et:
