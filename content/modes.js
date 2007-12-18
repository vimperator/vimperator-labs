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

vimperator.modes = (function () //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var main = 1;     // NORMAL
    var extended = 0; // NONE

    var passNextKey = false;
    var passAllKeys = false;
    var isRecording = false;
    var isReplaying = false; // playing a macro

    function getModeMessage()
    {
        if (passNextKey && !passAllKeys)
            return "-- PASS THROUGH (next) --";
        else if (passAllKeys && !passNextKey)
            return "-- PASS THROUGH --";

        var ext = "";
        if (extended & vimperator.modes.QUICK_HINT)
            ext += " (quick)";
        if (extended & vimperator.modes.EXTENDED_HINT)
            ext += " (extended)";
        if (extended & vimperator.modes.ALWAYS_HINT)
            ext += " (always)";
        if (extended & vimperator.modes.INACTIVE_HINT)
            ext += " (inactive)";
        if (extended & vimperator.modes.MENU) // TODO: desirable?
            ext += " (menu)";

        ext += " --";

        // when recording a macro
        if (vimperator.modes.isRecording)
            ext += "recording";

        switch (main)
        {
            case vimperator.modes.INSERT:
                return "-- INSERT" + ext;
            case vimperator.modes.VISUAL:
                return (extended & vimperator.modes.LINE) ? "-- VISUAL LINE" + ext : "-- VISUAL" + ext;
            case vimperator.modes.HINTS:
                return "-- HINTS" + ext;
            case vimperator.modes.CARET:
                return "-- CARET" + ext;
            case vimperator.modes.TEXTAREA:
                return "-- TEXTAREA" + ext;
            default: // NORMAL mode
                if (vimperator.modes.isRecording)
                    return "recording";
                else
                    return "";
        }
    }

    // NOTE: Pay attention that you don't run into endless loops
    // Usually you should only indicate to leave a special mode linke HINTS
    // by calling vimperator.modes.reset() and adding the stuff which is needed
    // for its cleanup here
    function handleModeChange(oldMode, newMode)
    {
        // TODO: fix v.log() to work with verbosity level
        // vimperator.log("switching from mode " + oldMode + " to mode " + newMode, 7);
        dump("switching from mode " + oldMode + " to mode " + newMode + "\n");

        switch (oldMode)
        {
            case vimperator.modes.TEXTAREA:
            case vimperator.modes.INSERT:
                vimperator.editor.unselectText();
                break;

            case vimperator.modes.VISUAL:
                if (newMode == vimperator.modes.CARET)
                {
                    // clear any selection made
                    var selection = window.content.getSelection();
                    try
                    { // a simple if (selection) does not work
                        selection.collapseToStart();
                    }
                    catch (e) { }
                }
                else
                    vimperator.editor.unselectText();
                break;

            case vimperator.modes.HINTS:
                vimperator.hints.hide();
                break;

            case vimperator.modes.COMMAND_LINE:
                vimperator.commandline.close();
                break;
        }

        if (newMode == vimperator.modes.NORMAL)
        {
            // disable caret mode when we want to switch to normal mode
            var value = vimperator.options.getFirefoxPref("accessibility.browsewithcaret", false);
            if (value)
                vimperator.options.setFirefoxPref("accessibility.browsewithcaret", false);

            vimperator.statusline.updateUrl();
            vimperator.focusContent(false);
        }
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        // main modes, only one should ever be active
        NONE:             0,
        NORMAL:           1 << 0,
        INSERT:           1 << 1,
        VISUAL:           1 << 2,
        HINTS:            1 << 3,
        COMMAND_LINE:     1 << 4,
        CARET:            1 << 5, // text cursor is visible
        TEXTAREA:         1 << 6, // text cursor is in a HTMLTextAreaElement
        // extended modes, can include multiple modes, and even main modes
        EX:               1 << 10,
        INPUT_MULTILINE:  1 << 11,
        OUTPUT_MULTILINE: 1 << 12,
        SEARCH_FORWARD:   1 << 13,
        SEARCH_BACKWARD:  1 << 14,
        QUICK_HINT:       1 << 15,
        EXTENDED_HINT:    1 << 16,
        ALWAYS_HINT:      1 << 17,
        INACTIVE_HINT:    1 << 18, // a short time after following a hint, we do not accept any input
        MENU:             1 << 19, // a popupmenu is active
        LINE:             1 << 20, // linewise visual mode
        RECORDING:        1 << 21,

        __iterator__: function ()
        {
            var modes = [this.NONE, this.NORMAL, this.INSERT, this.VISUAL,
                         this.HINTS, this.COMMAND_LINE, this.CARET, this.TEXTAREA];

            for (var i = 0; i < modes.length; i++)
                yield modes[i];

            throw StopIteration;
        },

        // keeps recording state
        reset: function (silent)
        {
            this.set(vimperator.modes.NORMAL, vimperator.modes.NONE, silent);
        },

        show: function ()
        {
            if (!vimperator.options["showmode"])
                return;

            // never show mode messages if we are in command line mode
            if (main == vimperator.modes.COMMAND_LINE)
                return;

            vimperator.commandline.echo(getModeMessage(), vimperator.commandline.HL_MODEMSG, vimperator.commandline.DISALLOW_MULTILINE);
        },

        // helper function to set both modes in one go
        // if silent == true, you also need to take care of the mode handling changes yourself
        set: function (mainMode, extendedMode, silent)
        {
            // if a main mode is set, the extended is always cleared
            if (typeof mainMode === "number")
            {
                if (!silent && mainMode != main)
                    handleModeChange(main, mainMode);

                main = mainMode;
                if (!extendedMode)
                    extended = vimperator.modes.NONE;

            }
            if (typeof extendedMode === "number")
                extended = extendedMode;

            if (!silent)
                this.show();
        },

        // add/remove always work on the extended mode only
        add: function (mode)
        {
            extended |= mode;
            this.show();
        },
        remove: function (mode)
        {
            extended = (extended | mode) ^ mode;
            this.show();
        },

        get passNextKey() { return passNextKey; },
        set passNextKey(value) { passNextKey = value; this.show(); },

        get passAllKeys() { return passAllKeys; },
        set passAllKeys(value) { passAllKeys = value; this.show(); },

        get isRecording() { return isRecording; },
        set isRecording(value) { isRecording = value; this.show(); },

        get isReplaying() { return isReplaying; },
        set isReplaying(value) { isReplaying = value; },

        get main()      { return main; },
        set main(value) {
            if (value != main)
                handleModeChange(main, value);

            main = value;
            // setting the main mode always resets any extended mode
            extended = vimperator.modes.NONE;
            this.show();
        },

        get extended()      { return extended; },
        set extended(value) {
            extended = value; this.show();
        }

    };
    //}}}
})(); //}}}

// vim: set fdm=marker sw=4 ts=4 et:
