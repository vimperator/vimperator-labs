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

const modes = (function () //{{{
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

    var modeStack = [];

    function getModeMessage()
    {
        if (passNextKey && !passAllKeys)
            return "-- PASS THROUGH (next) --";
        else if (passAllKeys && !passNextKey)
            return "-- PASS THROUGH --";

        var ext = "";
        if (extended & modes.MENU) // TODO: desirable?
            ext += " (menu)";

        // when recording a macro
        var macromode = "";
        if (modes.isRecording)
            macromode = "recording";
        else if (modes.isReplaying)
            macromode = "replaying";

        ext += " --" + macromode;

        switch (main)
        {
            case modes.INSERT:
                return "-- INSERT" + ext;
            case modes.VISUAL:
                return (extended & modes.LINE) ? "-- VISUAL LINE" + ext : "-- VISUAL" + ext;
            case modes.COMMAND_LINE:
                // under modes.COMMAND_LINE, this block will never be reached
                return macromode;
            case modes.CARET:
                return "-- CARET" + ext;
            case modes.TEXTAREA:
                return "-- TEXTAREA" + ext;
            case modes.MESSAGE:
                return "-- MESSAGE" + ext;
            case modes.COMPOSE:
                return "-- COMPOSE" + ext;
            case modes.CUSTOM:
                return "-- " + plugins.mode + ext;
            default: // NORMAL mode
                return macromode;
        }
    }

    // NOTE: Pay attention that you don't run into endless loops
    // Usually you should only indicate to leave a special mode like HINTS
    // by calling modes.reset() and adding the stuff which is needed
    // for its cleanup here
    function handleModeChange(oldMode, newMode)
    {
        // TODO: fix v.log() to work with verbosity level
        //liberator.log("switching from mode " + oldMode + " to mode " + newMode, 7);
        //liberator.dump("switching from mode " + oldMode + " to mode " + newMode + "\n");

        switch (oldMode)
        {
            case modes.TEXTAREA:
            case modes.INSERT:
                editor.unselectText();
                break;

            case modes.VISUAL:
                if (newMode == modes.CARET)
                {
                    // clear any selection made
                    var selection = window.content.getSelection();
                    try
                    { // a simple if (selection) does not work
                        selection.collapseToStart();
                    }
                    catch (e) {}
                }
                else
                    editor.unselectText();
                break;

            case modes.CUSTOM:
                plugins.stop();
                break;

            case modes.COMMAND_LINE:
                // clean up for HINT mode
                if (modes.extended & modes.HINTS)
                        hints.hide();
                commandline.close();
                break;
        }

        if (newMode == modes.NORMAL)
        {
            // disable caret mode when we want to switch to normal mode
            var value = options.getPref("accessibility.browsewithcaret", false);
            if (value)
                options.setPref("accessibility.browsewithcaret", false);

            statusline.updateUrl();
            liberator.focusContent(false);
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
        COMMAND_LINE:     1 << 3,
        CARET:            1 << 4, // text cursor is visible
        TEXTAREA:         1 << 5, // text cursor is in a HTMLTextAreaElement
        MESSAGE:          1 << 6, // for now only used in Muttator when the message has focus
        COMPOSE:          1 << 7,
        CUSTOM:           1 << 8,
        // extended modes, can include multiple modes, and even main modes
        EX:               1 << 9,
        HINTS:            1 << 10,
        INPUT_MULTILINE:  1 << 11,
        OUTPUT_MULTILINE: 1 << 12,
        SEARCH_FORWARD:   1 << 13,
        SEARCH_BACKWARD:  1 << 14,
        MENU:             1 << 15, // a popupmenu is active
        LINE:             1 << 16, // linewise visual mode
        RECORDING:        1 << 17,
        PROMPT:           1 << 18,

        __iterator__: function () util.Array.iterator(this.all),

        get all() [this.NONE, this.NORMAL, this.INSERT, this.VISUAL,
                   this.HINTS, this.COMMAND_LINE, this.CARET,
                   this.TEXTAREA, this.MESSAGE, this.COMPOSE, this.CUSTOM],

        // show the current mode string in the command line
        show: function ()
        {
            if (!options["showmode"])
                return;

            // never show mode messages if we are in command line mode
            if (main == modes.COMMAND_LINE)
                return;

            commandline.echo(getModeMessage(), commandline.HL_MODEMSG,
                                        commandline.DISALLOW_MULTILINE);
        },

        // add/remove always work on the extended mode only
        add: function (mode)
        {
            extended |= mode;
            this.show();
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
                    extended = modes.NONE;
            }
            if (typeof extendedMode === "number")
                extended = extendedMode;

            if (!silent)
                this.show();
        },

        push: function (mainMode, extendedMode, silent)
        {
            modeStack.push([main, extended]);
            this.set(mainMode, extendedMode, silent);
        },

        pop: function (silent)
        {
            var a = modeStack.pop();
            if (a)
                this.set(a[0], a[1], silent);
            else
                this.reset(silent);
        },

        setCustomMode: function (modestr, oneventfunc, stopfunc)
        {
            // TODO this.plugin[id]... ('id' maybe submode or what..)
            plugins.mode = modestr;
            plugins.onEvent = oneventfunc;
            plugins.stop = stopfunc;
        },

        // keeps recording state
        reset: function (silent)
        {
            modeStack = [];
            if (config.isComposeWindow)
                this.set(modes.COMPOSE, modes.NONE, silent);
            else
                this.set(modes.NORMAL, modes.NONE, silent);
        },

        remove: function (mode)
        {
            extended &= ~mode;
            this.show();
        },

        get passNextKey() passNextKey,
        set passNextKey(value) { passNextKey = value; this.show(); },

        get passAllKeys() passAllKeys,
        set passAllKeys(value) { passAllKeys = value; this.show(); },

        get isRecording()  isRecording,
        set isRecording(value) { isRecording = value; this.show(); },

        get isReplaying() isReplaying,
        set isReplaying(value) { isReplaying = value; this.show(); },

        get main() main,
        set main(value) {
            if (value != main)
                handleModeChange(main, value);

            main = value;
            // setting the main mode always resets any extended mode
            extended = modes.NONE;
            this.show();
        },

        get extended() extended,
        set extended(value) { extended = value; this.show(); }

    };
    //}}}
})(); //}}}

// vim: set fdm=marker sw=4 ts=4 et:
