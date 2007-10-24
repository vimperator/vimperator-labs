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

vimperator.modes = (function()
{
    var main = 1;     // NORMAL
    var extended = 0; // NONE

    var passNextKey = false;
    var passAllKeys = false;

    function getModeMessage()
    {
        if (passNextKey && !passAllKeys)
            return "PASS THROUGH (next)";
        else if (passAllKeys && !passNextKey)
            return "PASS THROUGH";

        var ext = "";
        switch (extended)
        {
            case vimperator.modes.QUICK_HINT:
                ext = " (quick)"; break;
            case vimperator.modes.EXTENDED_HINT:
                ext = " (extended)"; break;
            case vimperator.modes.ALWAYS_HINT:
                ext = " (always)"; break;
            case vimperator.modes.MENU: // TODO: desirable?
                ext = " (menu)"; break;
        }

        switch (main)
        {
            case vimperator.modes.INSERT:
                return "INSERT" + ext;
            case vimperator.modes.VISUAL:
                return (extended & vimperator.modes.LINE) ? "VISUAL LINE" + ext : "VISUAL" + ext;
            case vimperator.modes.HINTS:
                return "HINTS" + ext;
            case vimperator.modes.CARET:
                return "CARET" + ext;
            case vimperator.modes.TEXTAREA:
                return "TEXTAREA" + ext;
            default:
                return null;
        }
    }

    // XXX: Pay attention that you don't run into endless loops
    // Usually you should only indicate to leave a special mode linke HINTS
    // by calling vimperator.modes.reset() and adding the stuff which is needed
    // for its cleanup here
    function handleModeChange(oldmode, newmode)
    {
        vimperator.log("switching from mode " + oldmode + " to mode " + newmode, 7);

        switch (oldmode)
        {
            case vimperator.modes.TEXTAREA:
            case vimperator.modes.INSERT:
                vimperator.editor.unselectText();
                break;

            case vimperator.modes.VISUAL:
                if (newmode == vimperator.modes.CARET)
                {
                    // clear any selection made
                    var selection = window.content.getSelection();
                    try { // a simple if (selection) does not work
                        selection.collapseToStart();
                    } catch (e) { }
                }
                else
                    vimperator.editor.unselectText();
                break;

            case vimperator.modes.HINTS:
                vimperator.hints.hide();
                break;
        }

        if (newmode == vimperator.modes.NORMAL)
        {
            // XXX: why this code?
            var value = vimperator.options.getFirefoxPref("accessibility.browsewithcaret", false);
            if (value)
                vimperator.options.setFirefoxPref("accessibility.browsewithcaret", false);

            vimperator.statusline.updateUrl();
            // XXX: auto-focusing of content disabled, as it breaks hints partly
            //vimperator.focusContent();
        }
    }

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
        MENU:             1 << 18, // a popupmenu is active
        LINE:             1 << 19, // linewise visual mode

        reset: function(silent)
        {
            this.set(vimperator.modes.NORMAL, vimperator.modes.NONE, silent);
        },

        show: function()
        {
            if (!vimperator.options["showmode"])
                return;

            // never show mode messages if we are in command line mode
            if (main == vimperator.modes.COMMAND_LINE)
                return;

            var msg = getModeMessage();
            if (msg)
                vimperator.commandline.echo("-- " + getModeMessage() + " --", vimperator.commandline.HL_MODEMSG, vimperator.commandline.DISALLOW_MULTILINE);
            else
                vimperator.commandline.echo("", null, vimperator.commandline.DISALLOW_MULTILINE);
        },

        // helper function to set both modes in one go
        set: function(main_mode, extended_mode, silent)
        {
            // if a main mode is set, the extended is always cleared
            if (typeof main_mode === "number")
            {
                if (main_mode != main)
                    handleModeChange(main, main_mode);

                main = main_mode;
                if (!extended_mode)
                    extended = vimperator.modes.NONE;

            }
            if (typeof extended_mode === "number")
                extended = extended_mode;

            if (!silent)
                this.show();
        },

        // add/remove always work on the extended mode only
        add: function(mode)
        {
            extended |= mode;
            this.show();
        },
        remove: function(mode)
        {
            extended = (extended | mode) ^ mode;
            this.show();
        },

        get passNextKey() { return passNextKey; },
        set passNextKey(value) { passNextKey = value; this.show(); },

        get passAllKeys() { return passAllKeys; },
        set passAllKeys(value) { passAllKeys = value; this.show(); },

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
    }
})();

// vim: set fdm=marker sw=4 ts=4 et:
