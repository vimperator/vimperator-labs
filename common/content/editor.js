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

Copyright (c) 2006-2009 by Martin Stubenschrott <stubenschrott@vimperator.org>

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

/** @scope modules */

// command names taken from:
// http://developer.mozilla.org/en/docs/Editor_Embedding_Guide

/**
 * @instance editor
 */
function Editor() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    // store our last search with f, F, t or T
    var lastFindChar = null;
    var lastFindCharFunc = null;
    // XXX: this strikes me as a rather odd ds; everyone's a critic --djk
    var abbreviations = {}; // abbreviations["lhr"][0]["{i,c,!}","rhs"]

    // (summarized from Vim's ":help abbreviations")
    //
    // There are three types of abbreviations:
    //
    // full-id: Consists entirely of keyword characters.
    //          ("foo", "g3", "-1")
    //
    // end-id: Ends in a keyword character, but all other
    //         are not keyword characters.
    //         ("#i", "..f", "$/7")
    //
    // non-id: Ends in a non-keyword character, but the
    //         others can be of any type other than space
    //         and tab.
    //         ("def#", "4/7$")
    //
    // Example strings that cannot be abbreviations:
    //         "a.b", "#def", "a b", "_$r"
    //
    // For now, a keyword character is anything except for \s, ", or '
    // (i.e., whitespace and quotes). In Vim, a keyword character is
    // specified by the 'iskeyword' setting and is a much less inclusive
    // list.
    //
    // TODO: Make keyword definition closer to Vim's default keyword
    //       definition (which differs across platforms).
    //

    let nonkw = "\\s\"'";
    let keyword = "[^" + nonkw + "]";
    let nonkeyword = "[" + nonkw + "]";

    let full_id = keyword + "+";
    let end_id = nonkeyword + "+" + keyword;
    let non_id = "\\S*" + nonkeyword;

    // Used in addAbbrevation and expandAbbreviation
    var abbrevmatch = full_id + "|" + end_id + "|" + non_id;

    function getEditor()
    {
        return window.document.commandDispatcher.focusedElement;
    }

    function getController()
    {
        let ed = getEditor();
        if (!ed || !ed.controllers)
            return null;

        return ed.controllers.getControllerForCommand("cmd_beginLine");
    }

    function selectPreviousLine()
    {
        editor.executeCommand("cmd_selectLinePrevious");
        if ((modes.extended & modes.LINE) && !editor.selectedText())
            editor.executeCommand("cmd_selectLinePrevious");
    }
    function selectNextLine()
    {
        editor.executeCommand("cmd_selectLineNext");
        if ((modes.extended & modes.LINE) && !editor.selectedText())
            editor.executeCommand("cmd_selectLineNext");
    }

    // add mappings for commands like h,j,k,l,etc. in CARET, VISUAL and TEXTAREA mode
    function addMovementMap(keys, hasCount, caretModeMethod, caretModeArg, textareaCommand, visualTextareaCommand)
    {
        let extraInfo = {};
        if (hasCount)
            extraInfo.flags = Mappings.flags.COUNT;

        mappings.add([modes.CARET], keys, "",
            function (count)
            {
                if (typeof count != "number" || count < 1)
                    count = 1;

                let controller = buffer.selectionController;
                while (count--)
                    controller[caretModeMethod](caretModeArg, false);
            },
            extraInfo);

        mappings.add([modes.VISUAL], keys, "",
            function (count)
            {
                if (typeof count != "number" || count < 1 || !hasCount)
                    count = 1;

                let controller = buffer.selectionController;
                while (count--)
                {
                    if (modes.extended & modes.TEXTAREA)
                    {
                        if (typeof visualTextareaCommand == "function")
                            visualTextareaCommand();
                        else
                            editor.executeCommand(visualTextareaCommand);
                    }
                    else
                        controller[caretModeMethod](caretModeArg, true);
                }
            },
            extraInfo);

        mappings.add([modes.TEXTAREA], keys, "",
            function (count)
            {
                if (typeof count != "number" || count < 1)
                    count = 1;

                editor.executeCommand(textareaCommand, count);
            },
            extraInfo);
    }

    // add mappings for commands like i,a,s,c,etc. in TEXTAREA mode
    function addBeginInsertModeMap(keys, commands)
    {
        mappings.add([modes.TEXTAREA], keys, "",
            function (count)
            {
                commands.forEach(function (cmd)
                    editor.executeCommand(cmd, 1));
                modes.set(modes.INSERT, modes.TEXTAREA);
            });
    }

    function addMotionMap(key)
    {
        mappings.add([modes.TEXTAREA], [key],
            "Motion command",
            function (motion, count) { editor.executeCommandWithMotion(key, motion, count); },
            { flags: Mappings.flags.MOTION | Mappings.flags.COUNT });
    }

    // For the record, some of this code I've just finished throwing
    // away makes me want to pull someone else's hair out. --Kris
    function abbrevs()
    {
        for (let [lhs, abbr] in Iterator(abbreviations))
            for (let [,rhs] in Iterator(abbr))
                yield [lhs, rhs];
    }

    // mode = "i" -> add :iabbrev, :iabclear and :iunabbrev commands
    function addAbbreviationCommands(ch, modeDescription)
    {
        let mode = ch || "!";
        modeDescription = modeDescription ? " in " + modeDescription + " mode" : "";

        commands.add([ch ? ch + "a[bbrev]" : "ab[breviate]"],
            "Abbreviate a key sequence" + modeDescription,
            function (args)
            {
                let matches = args.string.match(RegExp("^\\s*($|" + abbrevmatch + ")(?:\\s*$|\\s+(.*))"));
                if (!matches)
                {
                    liberator.echoerr("E474: Invalid argument");
                    return false;
                }
                let [,lhs,rhs] = matches;
                if (rhs)
                    editor.addAbbreviation(mode, lhs, rhs);
                else
                    editor.listAbbreviations(mode, lhs || "");
            },
            {
                completer: function (context, args) completion.abbreviation(context, args, mode),
                literal: 0,
                serial: function () [
                    {
                        command: this.name,
                        arguments: [lhs],
                        literalArg: abbr[1]
                    }
                    for ([lhs, abbr] in abbrevs())
                    if (abbr[0] == mode)
                ]
            });

        commands.add([ch ? ch + "una[bbrev]" : "una[bbreviate]"],
            "Remove an abbreviation" + modeDescription,
            function (args) { editor.removeAbbreviation(mode, args.literalArg); },
            {
                argCount: "1",
                completer: function (context, args) completion.abbreviation(context, args, mode),
                literal: 0
            });

        commands.add([ch + "abc[lear]"],
            "Remove all abbreviations" + modeDescription,
            function () { editor.removeAllAbbreviations(mode); },
            { argCount: "0" });
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// OPTIONS /////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    options.add(["editor"],
        "Set the external text editor",
        "string", "gvim -f");

    options.add(["insertmode", "im"],
        "Use Insert mode as the default for text areas",
        "boolean", true);

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// MAPPINGS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var myModes = [modes.INSERT, modes.COMMAND_LINE];

    //             KEYS                          COUNT  CARET                   TEXTAREA            VISUAL_TEXTAREA
    addMovementMap(["k", "<Up>"],                true,  "lineMove", false,      "cmd_linePrevious", selectPreviousLine);
    addMovementMap(["j", "<Down>", "<Return>"],  true,  "lineMove", true,       "cmd_lineNext",     selectNextLine);
    addMovementMap(["h", "<Left>", "<BS>"],      true,  "characterMove", false, "cmd_charPrevious", "cmd_selectCharPrevious");
    addMovementMap(["l", "<Right>", "<Space>"],  true,  "characterMove", true,  "cmd_charNext",     "cmd_selectCharNext");
    addMovementMap(["b", "B", "<C-Left>"],       true,  "wordMove", false,      "cmd_wordPrevious", "cmd_selectWordPrevious");
    addMovementMap(["w", "W", "e", "<C-Right>"], true,  "wordMove", true,       "cmd_wordNext",     "cmd_selectWordNext");
    addMovementMap(["<C-f>", "<PageDown>"],      true,  "pageMove", true,       "cmd_movePageDown", "cmd_selectNextPage");
    addMovementMap(["<C-b>", "<PageUp>"],        true,  "pageMove", false,      "cmd_movePageUp",   "cmd_selectPreviousPage");
    addMovementMap(["gg", "<C-Home>"],           false, "completeMove", false,  "cmd_moveTop",      "cmd_selectTop");
    addMovementMap(["G", "<C-End>"],             false, "completeMove", true,   "cmd_moveBottom",   "cmd_selectBottom");
    addMovementMap(["0", "^", "<Home>"],         false, "intraLineMove", false, "cmd_beginLine",    "cmd_selectBeginLine");
    addMovementMap(["$", "<End>"],               false, "intraLineMove", true,  "cmd_endLine" ,     "cmd_selectEndLine" );

    addBeginInsertModeMap(["i", "<Insert"], []);
    addBeginInsertModeMap(["a"],            ["cmd_charNext"]);
    addBeginInsertModeMap(["I", "gI"],      ["cmd_beginLine"]);
    addBeginInsertModeMap(["A"],            ["cmd_endLine"]);
    addBeginInsertModeMap(["s"],            ["cmd_deleteCharForward"]);
    addBeginInsertModeMap(["S"],            ["cmd_deleteToEndOfLine", "cmd_deleteToBeginningOfLine"]);
    addBeginInsertModeMap(["C"],            ["cmd_deleteToEndOfLine"]);

    addMotionMap("d"); // delete
    addMotionMap("c"); // change
    addMotionMap("y"); // yank

    // insert mode mappings
    mappings.add(myModes,
        ["<C-o>", "<C-f>", "<C-g>", "<C-n>", "<C-p>"],
        "Ignore certain " + config.hostApplication + " key bindings",
        function () { /*liberator.beep();*/ });

    mappings.add(myModes,
        ["<C-w>"], "Delete previous word",
        function () { editor.executeCommand("cmd_deleteWordBackward", 1); });

    mappings.add(myModes,
        ["<C-u>"], "Delete until beginning of current line",
        function ()
        {
            // broken in FF3, deletes the whole line:
            // editor.executeCommand("cmd_deleteToBeginningOfLine", 1);
            editor.executeCommand("cmd_selectBeginLine", 1);
            if (getController().isCommandEnabled("cmd_delete"))
                editor.executeCommand("cmd_delete", 1);
        });

    mappings.add(myModes,
        ["<C-k>"], "Delete until end of current line",
        function () { editor.executeCommand("cmd_deleteToEndOfLine", 1); });

    mappings.add(myModes,
        ["<C-a>"], "Move cursor to beginning of current line",
        function () { editor.executeCommand("cmd_beginLine", 1); });

    mappings.add(myModes,
        ["<C-e>"], "Move cursor to end of current line",
        function () { editor.executeCommand("cmd_endLine", 1); });

    mappings.add(myModes,
        ["<C-h>"], "Delete character to the left",
        function () { editor.executeCommand("cmd_deleteCharBackward", 1); });

    mappings.add(myModes,
        ["<C-d>"], "Delete character to the right",
        function () { editor.executeCommand("cmd_deleteCharForward", 1); });

    /*mappings.add(myModes,
        ["<C-Home>"], "Move cursor to beginning of text field",
        function () { editor.executeCommand("cmd_moveTop", 1); });

    mappings.add(myModes,
        ["<C-End>"], "Move cursor to end of text field",
        function () { editor.executeCommand("cmd_moveBottom", 1); });*/

    mappings.add(myModes,
        ["<S-Insert>"], "Insert clipboard/selection",
        function () { editor.pasteClipboard(); });

    mappings.add([modes.INSERT, modes.TEXTAREA, modes.COMPOSE],
        ["<C-i>"], "Edit text field with an external editor",
        function () { editor.editFieldExternally(); });

    // FIXME: <esc> does not work correctly
    mappings.add([modes.INSERT],
        ["<C-t>"], "Edit text field in vi mode",
        function () { liberator.mode = modes.TEXTAREA; });

    mappings.add([modes.INSERT],
        ["<Space>", "<Return>"], "Expand insert mode abbreviation",
        function () { editor.expandAbbreviation("i"); },
        { flags: Mappings.flags.ALLOW_EVENT_ROUTING });

    mappings.add([modes.INSERT],
        ["<Tab>"], "Expand insert mode abbreviation",
        function () { editor.expandAbbreviation("i"); document.commandDispatcher.advanceFocus(); });

    mappings.add([modes.INSERT],
        ["<C-]>", "<C-5>"], "Expand insert mode abbreviation",
        function () { editor.expandAbbreviation("i"); });

    // textarea mode
    mappings.add([modes.TEXTAREA],
        ["u"], "Undo",
        function (count)
        {
            editor.executeCommand("cmd_undo", count);
            liberator.mode = modes.TEXTAREA;
        },
        { flags: Mappings.flags.COUNT });

    mappings.add([modes.TEXTAREA],
        ["<C-r>"], "Redo",
        function (count)
        {
            editor.executeCommand("cmd_redo", count);
            liberator.mode = modes.TEXTAREA;
        },
        { flags: Mappings.flags.COUNT });

    mappings.add([modes.TEXTAREA],
        ["D"], "Delete the characters under the cursor until the end of the line",
        function () { editor.executeCommand("cmd_deleteToEndOfLine"); });

    mappings.add([modes.TEXTAREA],
        ["o"], "Open line below current",
        function (count)
        {
            editor.executeCommand("cmd_endLine", 1);
            modes.set(modes.INSERT, modes.TEXTAREA);
            events.feedkeys("<Return>");
        });

    mappings.add([modes.TEXTAREA],
        ["O"], "Open line above current",
        function (count)
        {
            editor.executeCommand("cmd_beginLine", 1);
            modes.set(modes.INSERT, modes.TEXTAREA);
            events.feedkeys("<Return>");
            editor.executeCommand("cmd_linePrevious", 1);
        });

    mappings.add([modes.TEXTAREA],
        ["X"], "Delete character to the left",
        function (count) { editor.executeCommand("cmd_deleteCharBackward", count); },
        { flags: Mappings.flags.COUNT });

    mappings.add([modes.TEXTAREA],
        ["x"], "Delete character to the right",
        function (count) { editor.executeCommand("cmd_deleteCharForward", count); },
        { flags: Mappings.flags.COUNT });

    // visual mode
    mappings.add([modes.CARET, modes.TEXTAREA],
        ["v"], "Start visual mode",
        function (count) { modes.set(modes.VISUAL, liberator.mode); });

    mappings.add([modes.VISUAL],
        ["v"], "End visual mode",
        function (count) { events.onEscape() });

    mappings.add([modes.TEXTAREA],
        ["V"], "Start visual line mode",
        function (count)
        {
            modes.set(modes.VISUAL, modes.TEXTAREA | modes.LINE);
            editor.executeCommand("cmd_beginLine", 1);
            editor.executeCommand("cmd_selectLineNext", 1);
        });

    mappings.add([modes.VISUAL],
        ["c", "s"], "Change selected text",
        function (count)
        {
            if (modes.extended & modes.TEXTAREA)
            {
                editor.executeCommand("cmd_cut");
                modes.set(modes.INSERT, modes.TEXTAREA);
            }
            else
                liberator.beep();
        });

    mappings.add([modes.VISUAL],
        ["d"], "Delete selected text",
        function (count)
        {
            if (modes.extended & modes.TEXTAREA)
            {
                editor.executeCommand("cmd_cut");
                modes.set(modes.TEXTAREA);
            }
            else
                liberator.beep();
        });

    mappings.add([modes.VISUAL],
        ["y"], "Yank selected text",
        function (count)
        {
            if (modes.extended & modes.TEXTAREA)
            {
                editor.executeCommand("cmd_copy");
                modes.set(modes.TEXTAREA);
            }
            else
            {
                let sel = window.content.document.getSelection();
                if (sel)
                    util.copyToClipboard(sel, true);
                else
                    liberator.beep();
            }
        });

    mappings.add([modes.VISUAL, modes.TEXTAREA],
        ["p"], "Paste clipboard contents",
        function (count)
        {
            if (!(modes.extended & modes.CARET))
            {
                if (!count) count = 1;
                while (count--)
                    editor.executeCommand("cmd_paste");
                liberator.mode = modes.TEXTAREA;
            }
            else
                liberator.beep();
        });

    // finding characters
    mappings.add([modes.TEXTAREA, modes.VISUAL],
        ["f"], "Move to a character on the current line after the cursor",
        function (count, arg)
        {
            let pos = editor.findCharForward(arg, count);
            if (pos >= 0)
                editor.moveToPosition(pos, true, liberator.mode == modes.VISUAL);
        },
        { flags: Mappings.flags.ARGUMENT | Mappings.flags.COUNT });

    mappings.add([modes.TEXTAREA, modes.VISUAL],
        ["F"], "Move to a charater on the current line before the cursor",
        function (count, arg)
        {
            let pos = editor.findCharBackward(arg, count);
            if (pos >= 0)
                editor.moveToPosition(pos, false, liberator.mode == modes.VISUAL);
        },
        { flags: Mappings.flags.ARGUMENT | Mappings.flags.COUNT });

    mappings.add([modes.TEXTAREA, modes.VISUAL],
        ["t"], "Move before a character on the current line",
        function (count, arg)
        {
            let pos = editor.findCharForward(arg, count);
            if (pos >= 0)
                editor.moveToPosition(pos - 1, true, liberator.mode == modes.VISUAL);
        },
        { flags: Mappings.flags.ARGUMENT | Mappings.flags.COUNT });

    mappings.add([modes.TEXTAREA, modes.VISUAL],
        ["T"], "Move before a character on the current line, backwards",
        function (count, arg)
        {
            let pos = editor.findCharBackward(arg, count);
            if (pos >= 0)
                editor.moveToPosition(pos + 1, false, liberator.mode == modes.VISUAL);
        },
        { flags: Mappings.flags.ARGUMENT | Mappings.flags.COUNT });

        // textarea and visual mode
    mappings.add([modes.TEXTAREA, modes.VISUAL],
        ["~"], "Switch case of the character under the cursor and move the cursor to the right",
        function (count)
        {
            if (modes.main == modes.VISUAL)
            {
                count = getEditor().selectionEnd - getEditor().selectionStart;
            }
            if (typeof count != "number" || count < 1)
            {
                count = 1;
            }

            while (count-- > 0)
            {
                let text = getEditor().value;
                let pos = getEditor().selectionStart;
                if (pos >= text.length)
                {
                    liberator.beep();
                    return;
                }
                let chr = text[pos];
                getEditor().value = text.substring(0, pos) +
                    (chr == chr.toLocaleLowerCase() ? chr.toLocaleUpperCase() : chr.toLocaleLowerCase()) +
                    text.substring(pos + 1);
                editor.moveToPosition(pos + 1, true, false);
            }
            modes.set(modes.TEXTAREA);
        },
        { flags: Mappings.flags.COUNT });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    addAbbreviationCommands("", "");
    addAbbreviationCommands("i", "insert");
    addAbbreviationCommands("c", "command line");

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        line: function ()
        {
            let line = 1;
            let text = getEditor().value;
            for (let i = 0; i < getEditor().selectionStart; i++)
                if (text[i] == "\n")
                    line++;
            return line;
        },

        col: function ()
        {
            let col = 1;
            let text = getEditor().value;
            for (let i = 0; i < getEditor().selectionStart; i++)
            {
                col++;
                if (text[i] == "\n")
                    col = 1;
            }
            return col;
        },

        unselectText: function ()
        {
            let elem = window.document.commandDispatcher.focusedElement;
            // A error occurs if the element has been removed when "elem.selectionStart" is executed.
            try {
                if (elem && elem.selectionEnd)
                    elem.selectionEnd = elem.selectionStart;
            }
            catch (e) {}
        },

        selectedText: function ()
        {
            let text = getEditor().value;
            return text.substring(getEditor().selectionStart, getEditor().selectionEnd);
        },

        pasteClipboard: function ()
        {
            if (liberator.has("Win32"))
            {
                this.executeCommand("cmd_paste");
                return;
            }

            // FIXME: #93 (<s-insert> in the bottom of a long textarea bounces up)
            let elem = window.document.commandDispatcher.focusedElement;

            if (elem.setSelectionRange && util.readFromClipboard())
                // readFromClipboard would return 'undefined' if not checked
                // dunno about .setSelectionRange
            {
                // This is a hacky fix - but it works.
                let curTop = elem.scrollTop;
                let curLeft = elem.scrollLeft;

                let rangeStart = elem.selectionStart; // caret position
                let rangeEnd = elem.selectionEnd;
                let tempStr1 = elem.value.substring(0, rangeStart);
                let tempStr2 = util.readFromClipboard();
                let tempStr3 = elem.value.substring(rangeEnd);
                elem.value = tempStr1 + tempStr2 + tempStr3;
                elem.selectionStart = rangeStart + tempStr2.length;
                elem.selectionEnd = elem.selectionStart;

                elem.scrollTop = curTop;
                elem.scrollLeft = curLeft;
            }
        },

        // count is optional, defaults to 1
        executeCommand: function (cmd, count)
        {
            let controller = getController();
            if (!controller || !controller.supportsCommand(cmd) || !controller.isCommandEnabled(cmd))
            {
                liberator.beep();
                return false;
            }

            if (typeof count != "number" || count < 1)
                count = 1;

            let didCommand = false;
            while (count--)
            {
                // some commands need this try/catch workaround, because a cmd_charPrevious triggered
                // at the beginning of the textarea, would hang the doCommand()
                // good thing is, we need this code anyway for proper beeping
                try
                {
                    controller.doCommand(cmd);
                    didCommand = true;
                }
                catch (e)
                {
                    if (!didCommand)
                        liberator.beep();
                    return false;
                }
            }

            return true;
        },

        // cmd = y, d, c
        // motion = b, 0, gg, G, etc.
        executeCommandWithMotion: function (cmd, motion, count)
        {
            if (!typeof count == "number" || count < 1)
                count = 1;

            if (cmd == motion)
            {
                motion = "j";
                count--;
            }

            modes.set(modes.VISUAL, modes.TEXTAREA);

            switch (motion)
            {
                case "j":
                    this.executeCommand("cmd_beginLine", 1);
                    this.executeCommand("cmd_selectLineNext", count+1);
                    break;
                case "k":
                    this.executeCommand("cmd_beginLine", 1);
                    this.executeCommand("cmd_lineNext", 1);
                    this.executeCommand("cmd_selectLinePrevious", count+1);
                    break;
                case "h":
                    this.executeCommand("cmd_selectCharPrevious", count);
                    break;
                case "l":
                    this.executeCommand("cmd_selectCharNext", count);
                    break;
                case "e":
                case "w":
                    this.executeCommand("cmd_selectWordNext", count);
                    break;
                case "b":
                    this.executeCommand("cmd_selectWordPrevious", count);
                    break;
                case "0":
                case "^":
                    this.executeCommand("cmd_selectBeginLine", 1);
                    break;
                case "$":
                    this.executeCommand("cmd_selectEndLine", 1);
                    break;
                case "gg":
                    this.executeCommand("cmd_endLine", 1);
                    this.executeCommand("cmd_selectTop", 1);
                    this.executeCommand("cmd_selectBeginLine", 1);
                    break;
                case "G":
                    this.executeCommand("cmd_beginLine", 1);
                    this.executeCommand("cmd_selectBottom", 1);
                    this.executeCommand("cmd_selectEndLine", 1);
                    break;

                default:
                    liberator.beep();
                    return false;
            }

            switch (cmd)
            {
                case "d":
                    this.executeCommand("cmd_delete", 1);
                    // need to reset the mode as the visual selection changes it
                    modes.main = modes.TEXTAREA;
                    break;
                case "c":
                    this.executeCommand("cmd_delete", 1);
                    modes.set(modes.INSERT, modes.TEXTAREA);
                    break;
                case "y":
                    this.executeCommand("cmd_copy", 1);
                    this.unselectText();
                    break;

                default:
                    liberator.beep();
                    return false;
            }
            return true;
        },

        // This function will move/select up to given "pos"
        // Simple setSelectionRange() would be better, but we want to maintain the correct
        // order of selectionStart/End (a Firefox bug always makes selectionStart <= selectionEnd)
        // Use only for small movements!
        moveToPosition: function (pos, forward, select)
        {
            if (!select)
            {
                getEditor().setSelectionRange(pos, pos);
                return;
            }

            if (forward)
            {
                if (pos <= getEditor().selectionEnd || pos > getEditor().value.length)
                    return false;

                do // TODO: test code for endless loops
                {
                    this.executeCommand("cmd_selectCharNext", 1);
                }
                while (getEditor().selectionEnd != pos);
            }
            else
            {
                if (pos >= getEditor().selectionStart || pos < 0)
                    return false;

                do // TODO: test code for endless loops
                {
                    this.executeCommand("cmd_selectCharPrevious", 1);
                }
                while (getEditor().selectionStart != pos);
            }
        },

        // returns the position of char
        findCharForward: function (ch, count)
        {
            if (!getEditor())
                return -1;

            lastFindChar = ch;
            lastFindCharFunc = this.findCharForward;

            let text = getEditor().value;
            if (!typeof count == "number" || count < 1)
                count = 1;

            for (let i = getEditor().selectionEnd + 1; i < text.length; i++)
            {
                if (text[i] == "\n")
                    break;
                if (text[i] == ch)
                    count--;
                if (count == 0)
                    return i + 1; // always position the cursor after the char
            }

            liberator.beep();
            return -1;
        },

        // returns the position of char
        findCharBackward: function (ch, count)
        {
            if (!getEditor())
                return -1;

            lastFindChar = ch;
            lastFindCharFunc = this.findCharBackward;

            let text = getEditor().value;
            if (!typeof count == "number" || count < 1)
                count = 1;

            for (let i = getEditor().selectionStart - 1; i >= 0; i--)
            {
                if (text[i] == "\n")
                    break;
                if (text[i] == ch)
                    count--;
                if (count == 0)
                    return i;
            }

            liberator.beep();
            return -1;
        },

        editFileExternally: function (path)
        {
            // TODO: save return value in v:shell_error
            let args = commands.parseArgs(options["editor"], [], "*", true);

            if (args.length < 1)
            {
                liberator.echoerr("No editor specified");
                return;
            }

            args.push(path);
            liberator.callFunctionInThread(null, io.run, io.expandPath(args.shift()), args, true);
        },

        // TODO: clean up with 2 functions for textboxes and currentEditor?
        editFieldExternally: function ()
        {
            if (!options["editor"])
                return false;

            let textBox = null;
            if (!(config.isComposeWindow))
                textBox = document.commandDispatcher.focusedElement;

            let text = ""; // XXX
            if (textBox)
                text = textBox.value;
            else if (typeof GetCurrentEditor == "function") // Thunderbird composer
                text = GetCurrentEditor().outputToString("text/plain", 2);
            else
                return false;

            let oldbg, tmpBg;
            try
            {
                let res = io.withTempFiles(function (tmpfile) {
                    io.writeFile(tmpfile, text);

                    if (textBox)
                    {
                        textBox.setAttribute("readonly", "true");
                        oldBg = textBox.style.backgroundColor;
                        tmpBg = "yellow";
                        textBox.style.backgroundColor = "#bbbbbb";
                    }

                    this.editFileExternally(tmpfile.path);

                    if (textBox)
                        textBox.removeAttribute("readonly");

                    let val = io.readFile(tmpfile);
                    if (textBox)
                        textBox.value = val;
                    else
                    {
                        let editor = GetCurrentEditor();
                        let wholeDocRange = editor.document.createRange();
                        let rootNode = editor.rootElement.QueryInterface(Ci.nsIDOMNode);
                        wholeDocRange.selectNodeContents(rootNode);
                        editor.selection.addRange(wholeDocRange);
                        editor.selection.deleteFromDocument();
                        editor.insertText(val);
                    }
                }, this);
                if (res == false)
                    throw "Couldn't create temporary file";
            }
            catch (e)
            {
                // Errors are unlikely, and our error messages won't
                // likely be any more helpful than that given in the
                // exception.
                liberator.echoerr(e);
                tmpBg = "red";
            }

            // blink the textbox after returning
            if (textBox)
            {
                let colors = [tmpBg, oldBg, tmpBg, oldBg];
                (function () {
                    textBox.style.backgroundColor = colors.shift();
                    if (colors.length > 0)
                        setTimeout(arguments.callee, 100);
                })();
            }

            return true;
        },

        // Abbreviations {{{

        // NOTE: I think this comment block is trying to say something but no
        // one is listening. In space, no one can hear you scream. --djk
        //
        // System for adding abbreviations:
        //
        // filter == ! delete all, and set first (END)
        //
        // if filter == ! remove all and add it as only END
        //
        // variant 1: rhs matches anywhere in loop
        //
        //          1 mod matches anywhere in loop
        //                  a) simple replace and
        //                      I)  (maybe there's another rhs that matches?  not possible)
        //                          (when there's another item, it's opposite mod with different rhs)
        //                          (so do nothing further but END)
        //
        //          2 mod does not match
        //                  a) the opposite is there -> make a ! and put it as only and END
        //                 (b) a ! is there. do nothing END)
        //
        // variant 2: rhs matches *no*were in loop and filter is c or i
        //            every kind of current combo is possible to 1 {c,i,!} or two {c and i}
        //
        //          1 mod is ! split into two i + c END
        //          1 not !: opposite mode (first), add/change 'second' and END
        //          1 not !: same mode (first), overwrite first this END
        //
        // TODO: I don't like these funky filters, I am a funky filter hater. --djk
        //     : make this a separate object
        //     : use Struct for individual abbreviations
        //     : rename "filter" arg "mode"
        /**
         * Adds a new abbreviation. Abbreviations consist of a LHS (the text
         * that is replaced when the abbreviation is expanded) and a RHS (the
         * replacement text).
         *
         * @param {string} filter The mode filter. This specifies the modes in
         *     which this abbreviation is available. Either:
         *       "c" - applies in command-line mode
         *       "i" - applies in insert mode
         *       "!" - applies in both command-line and insert modes
         * @param {string} lhs The LHS of the abbreviation.
         * @param {string} rhs The RHS of the abbreviation.
         */
        addAbbreviation: function (filter, lhs, rhs)
        {
            if (!abbreviations[lhs])
            {
                abbreviations[lhs] = [];
                abbreviations[lhs][0] = [filter, rhs];
                return;
            }

            if (filter == "!")
            {
                if (abbreviations[lhs][1])
                    abbreviations[lhs][1] = "";
                abbreviations[lhs][0] = [filter, rhs];
                return;
            }

            for (let i = 0; i < abbreviations[lhs].length; i++)
            {
                if (abbreviations[lhs][i][1] == rhs)
                {
                    if (abbreviations[lhs][i][0] == filter)
                    {
                        abbreviations[lhs][i] = [filter, rhs];
                        return;
                    }
                    else
                    {
                        if (abbreviations[lhs][i][0] != "!")
                        {
                            if (abbreviations[lhs][1])
                                abbreviations[lhs][1] = "";
                            abbreviations[lhs][0] = ["!", rhs];
                            return;
                        }
                        else
                        {
                            return;
                        }
                    }
                }
            }

            if (abbreviations[lhs][0][0] == "!")
            {
                let tmpOpp = ("i" == filter) ? "c" : "i";
                abbreviations[lhs][1] = [tmpOpp, abbreviations[lhs][0][1]];
                abbreviations[lhs][0] = [filter, rhs];
                return;
            }

            if (abbreviations[lhs][0][0] != filter)
                abbreviations[lhs][1] = [filter, rhs];
            else
                abbreviations[lhs][0] = [filter, rhs];
        },

        /**
         * Expands an abbreviation in the currently active textbox.
         *
         * @param {string} filter The mode filter. (@see #addAbbreviation)
         */
        expandAbbreviation: function (filter)
        {
            let textbox   = getEditor();
            if (!textbox)
                return;
            let text      = textbox.value;
            let currStart = textbox.selectionStart;
            let currEnd   = textbox.selectionEnd;
            let foundWord = text.substring(0, currStart).replace(RegExp("^(.|\\n)*?\\s*(" + abbrevmatch + ")$", "m"), "$2"); // get last word \b word boundary
            if (!foundWord)
                return true;

            for (let lhs in abbreviations)
            {
                for (let i = 0; i < abbreviations[lhs].length; i++)
                {
                    if (lhs == foundWord && (abbreviations[lhs][i][0] == filter || abbreviations[lhs][i][0] == "!"))
                    {
                        // if found, replace accordingly
                        let len = foundWord.length;
                        let abbrText = abbreviations[lhs][i][1];
                        text = text.substring(0, currStart - len) + abbrText + text.substring(currStart);
                        textbox.value = text;
                        textbox.selectionStart = currStart - len + abbrText.length;
                        textbox.selectionEnd   = currEnd   - len + abbrText.length;
                        break;
                    }
                }
            }
            return true;
        },

        /**
         * Returns all abbreviations matching <b>filter</b> and <b>lhs</b>.
         *
         * @param {string} filter The mode filter. (@see #addAbbreviation)
         * @param {string} lhs The LHS of the abbreviation.
         *     (@see #addAbbreviation)
         * @returns {Array} The matching abbreviations [mode, lhs, rhs]
         */
        getAbbreviations: function (filter, lhs)
        {
            // ! -> list all, on c or i ! matches too
            let searchFilter = (filter == "!") ? "!ci" : filter + "!";
            return list = [[mode, left, right] for ([left, [mode, right]] in abbrevs())
                              if (searchFilter.indexOf(mode) >= 0 && left.indexOf(lhs || "") == 0)];
        },

        /**
         * Lists all abbreviations matching <b>filter</b> and <b>lhs</b>.
         *
         * @param {string} filter The mode filter. (@see #addAbbreviation)
         * @param {string} lhs The LHS of the abbreviation.
         *     (@see #addAbbreviation)
         */
        listAbbreviations: function (filter, lhs)
        {
            let list = this.getAbbreviations(filter, lhs);

            if (!list.length)
            {
                liberator.echomsg("No abbreviations found");
            }
            else if (list.length == 1)
            {
                let [mode, lhs, rhs] = list[0];

                liberator.echo(mode + "  " + lhs + "   " + rhs, commandline.FORCE_SINGLELINE); // 2 spaces, 3 spaces
            }
            else
            {
                list = template.tabular(["", "LHS", "RHS"], [], list);
                commandline.echo(list, commandline.HL_NORMAL, commandline.FORCE_MULTILINE);
            }
        },

        /**
         * Deletes all abbreviations matching <b>filter</b> and <b>lhs</b>.
         *
         * @param {string} filter The mode filter. (@see #addAbbreviation)
         * @param {string} lhs The LHS of the abbreviation.
         *     (@see #addAbbreviation)
         */
        removeAbbreviation: function (filter, lhs)
        {
            if (!lhs)
            {
                liberator.echoerr("E474: Invalid argument");
                return false;
            }

            if (abbreviations[lhs]) // abbreviations exists
            {
                if (filter == "!")
                {
                    abbreviations[lhs] = "";
                    return true;
                }
                else
                {
                    if (!abbreviations[lhs][1]) // only one exists
                    {
                        if (abbreviations[lhs][0][0] == "!") // exists as ! -> no 'full' delete
                        {
                            abbreviations[lhs][0][0] = (filter == "i") ? "c" : "i";   // ! - i = c; ! - c = i
                            return true;
                        }
                        else if (abbreviations[lhs][0][0] == filter)
                        {
                            abbreviations[lhs] = "";
                            return true;
                        }
                    }
                    else // two abbreviations exist ( 'i' or 'c' (filter as well))
                    {
                        if (abbreviations[lhs][0][0] == "c" && filter == "c")
                            abbreviations[lhs][0] = abbreviations[lhs][1];

                        abbreviations[lhs][1] = "";

                        return true;
                    }
                }
            }

            liberator.echoerr("E24: No such abbreviation");
            return false;
        },

        /**
         * Removes all abbreviations matching <b>filter</b>.
         *
         * @param {string} filter The mode filter. (@see #addAbbreviation)
         */
        removeAllAbbreviations: function (filter)
        {
            let searchFilter = (filter == "!") ? "!ci" : filter + "!";
            for (let [lhs, [mode, rhs]] in abbrevs())
                if (searchFilter.indexOf(mode) >= 0)
                    this.removeAbbreviation(filter, lhs);
        }
        //}}}
    };
    //}}}
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
