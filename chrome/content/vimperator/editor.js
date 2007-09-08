/***** BEGIN LICENSE BLOCK ***** {{{
 *
 * Mozilla Public License Notice
 *
 * The contents of this file are subject to the Mozilla Public License
 * Version 1.1  (the "License"); you may  not use this  file except in
 * compliance with the  License. You may obtain a  copy of the License
 * at http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS"
 * basis, WITHOUT WARRANTY OF ANY KIND, either express or implied. See
 * the  License  for  the   specific  language  governing  rights  and
 * limitations under the License.
 *
}}} ***** END LICENSE BLOCK *****/

// command names taken from:
// http://developer.mozilla.org/en/docs/Editor_Embedding_Guide

function Editor() //{{{
{
    function editor()
    {
        return window.document.commandDispatcher.focusedElement;
    }

    function getController()
    {
        var el = window.document.commandDispatcher.focusedElement;
        if (!el || !el.controllers)
            return null;

        return el.controllers.getControllerAt(0);
    }

    this.unselectText = function()
    {
        var elt = window.document.commandDispatcher.focusedElement;
        elt.selectionEnd = elt.selectionStart;
        return true;
    }

    this.pasteClipboard = function()
    {
        var elt = window.document.commandDispatcher.focusedElement;

        if (elt.setSelectionRange && readFromClipboard())
            // readFromClipboard would return 'undefined' if not checked
            // dunno about .setSelectionRange
        {
            var rangeStart = elt.selectionStart; // caret position
            var rangeEnd = elt.selectionEnd;
            var tempStr1 = elt.value.substring(0,rangeStart);
            var tempStr2 = readFromClipboard();
            var tempStr3 = elt.value.substring(rangeEnd);
            elt.value = tempStr1 + tempStr2  + tempStr3;
            elt.selectionStart = rangeStart + tempStr2.length;
            elt.selectionEnd = elt.selectionStart;
        }
    }

    // count is optional, defaults to 1
    this.executeCommand = function(cmd, count)
    {
        var controller = getController();
        var el = window.document.commandDispatcher.focusedElement;
        if (!controller || !el)
            return false;
        
        if (!controller.supportsCommand(cmd) || !controller.isCommandEnabled(cmd))
        {
            vimperator.beep();
            return false;
        }

        if (typeof count != "number" || count < 1)
            count = 1;

        var did_command = false;
        while(count--)
        {
            // some commands need this try/catch workaround, because a cmd_charPrevious triggered
            // at the beginning of the textarea, would hang the doCommand()
            // good thing is, we need this code anyway for proper beeping
            try
            {
                controller.doCommand(cmd);
                did_command = true;

                if (vimperator.hasMode(vimperator.modes.TEXTAREA))
                    this.moveCaret();
            }
            catch(e)
            {
                if (!did_command)
                    vimperator.beep();
                return false;
            }
        }

        return true;
    }

    this.startNormal = function()
    {
        vimperator.setMode(vimperator.modes.TEXTAREA);
        this.moveCaret();
    }

    this.startVisual = function()
    {
        vimperator.setMode(vimperator.modes.VISUAL, vimperator.modes.TEXTAREA);
    }

    this.startInsert = function()
    {
        vimperator.setMode(vimperator.modes.INSERT, vimperator.modes.TEXTAREA);
        this.moveCaret();
    }

    this.stopInsert = function()
    {
        vimperator.setMode(vimperator.modes.TEXTAREA);
        this.moveCaret();
    }

    // very rudimentary testing code
    this.moveCaret = function(pos)
    {
        if (!pos)
            pos = editor().selectionStart - 1;

        if (!vimperator.hasMode(vimperator.modes.INSERT))
            editor().setSelectionRange(pos, pos+1);        
        else if (!vimperator.hasMode(vimperator.modes.VISUAL))
            editor().setSelectionRange(pos, pos);        
    }
    
    // cmd = y, d, c
    // motion = b, 0, gg, G, etc.
    this.executeCommandWithMotion = function(cmd, motion)
    {

    }
} //}}}

// vim: set fdm=marker sw=4 ts=4 et:
