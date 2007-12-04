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

// command names taken from:
// http://developer.mozilla.org/en/docs/Editor_Embedding_Guide

vimperator.Editor = function () //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    // store our last search with f, F, t or T
    var lastFindChar = null;
    var lastFindCharFunc = null;
    var abbrev = {}; // abbrev["lhr"][0]["{i,c,!}","rhs"]

    function editor()
    {
        return window.document.commandDispatcher.focusedElement;
    }

    function getController()
    {
        var ed = editor();
        if (!ed || !ed.controllers)
            return null;

        return ed.controllers.getControllerForCommand("cmd_beginLine");
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        line: function ()
        {
            var line = 1;
            var text = editor().value;
            for (var i = 0; i < editor().selectionStart; i++)
                if (text[i] == "\n")
                    line++;
            return line;
        },

        col: function ()
        {
            var col = 1;
            var text = editor().value;
            for (var i = 0; i < editor().selectionStart; i++)
            {
                col++;
                if (text[i] == "\n")
                    col = 1;
            }
            return col;
        },

        unselectText: function ()
        {
            var elt = window.document.commandDispatcher.focusedElement;
            if (elt && elt.selectionEnd)
                elt.selectionEnd = elt.selectionStart;
        },

        selectedText: function ()
        {
            var text = editor().value;
            return text.substring(editor().selectionStart, editor().selectionEnd);
        },

        pasteClipboard: function ()
        {
            var elt = window.document.commandDispatcher.focusedElement;

            if (elt.setSelectionRange && readFromClipboard())
                // readFromClipboard would return 'undefined' if not checked
                // dunno about .setSelectionRange
            {
                var rangeStart = elt.selectionStart; // caret position
                var rangeEnd = elt.selectionEnd;
                var tempStr1 = elt.value.substring(0, rangeStart);
                var tempStr2 = readFromClipboard();
                var tempStr3 = elt.value.substring(rangeEnd);
                elt.value = tempStr1 + tempStr2  + tempStr3;
                elt.selectionStart = rangeStart + tempStr2.length;
                elt.selectionEnd = elt.selectionStart;
            }
        },

        // count is optional, defaults to 1
        executeCommand: function (cmd, count)
        {
            var controller = getController();
            if (!controller || !controller.supportsCommand(cmd) || !controller.isCommandEnabled(cmd))
            {
                vimperator.beep();
                return false;
            }

            if (typeof count != "number" || count < 1)
                count = 1;

            var didCommand = false;
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
                        vimperator.beep();
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

            vimperator.modes.set(vimperator.modes.VISUAL, vimperator.modes.TEXTAREA);

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
                    vimperator.beep();
                    return false;
            }

            switch (cmd)
            {
                case "d":
                    this.executeCommand("cmd_delete", 1);
                    // need to reset the mode as the visual selection changes it
                    vimperator.modes.main = vimperator.modes.TEXTAREA;
                    break;
                case "c":
                    this.executeCommand("cmd_delete", 1);
                    vimperator.modes.set(vimperator.modes.INSERT, vimperator.modes.TEXTAREA);
                    break;
                case "y":
                    this.executeCommand("cmd_copy", 1);
                    this.unselectText();
                    break;

                default:
                    vimperator.beep();
                    return false;
            }
            return true;
        },

        // This function will move/select up to given "pos"
        // Simple setSelectionRange() would be better, but we want to maintain the correct
        // order of selectionStart/End (a firefox bug always makes selectionStart <= selectionEnd)
        // Use only for small movements!
        moveToPosition: function (pos, forward, select)
        {
            if (!select)
            {
                editor().setSelectionRange(pos, pos);
                return;
            }

            if (forward)
            {
                if (pos <= editor().selectionEnd || pos > editor().value.length)
                    return false;

                do // TODO: test code for endless loops
                {
                    this.executeCommand("cmd_selectCharNext", 1);
                }
                while (editor().selectionEnd != pos);
            }
            else
            {
                if (pos >= editor().selectionStart || pos < 0)
                    return false;

                do // TODO: test code for endless loops
                {
                    this.executeCommand("cmd_selectCharPrevious", 1);
                }
                while (editor().selectionStart != pos);
            }
        },

        // returns the position of char
        findCharForward: function (ch, count)
        {
            if (!editor())
                return -1;

            lastFindChar = ch;
            lastFindCharFunc = this.findCharForward;

            var text = editor().value;
            if (!typeof count == "number" || count < 1)
                count = 1;

            for (var i = editor().selectionEnd + 1; i < text.length; i++)
            {
                if (text[i] == "\n")
                    break;
                if (text[i] == ch)
                    count--;
                if (count == 0)
                    return i + 1; // always position the cursor after the char
            }

            vimperator.beep();
            return -1;
        },

        // returns the position of char
        findCharBackward: function (ch, count)
        {
            if (!editor())
                return -1;

            lastFindChar = ch;
            lastFindCharFunc = this.findCharBackward;

            var text = editor().value;
            if (!typeof count == "number" || count < 1)
                count = 1;

            for (var i = editor().selectionStart - 1; i >= 0; i--)
            {
                if (text[i] == "\n")
                    break;
                if (text[i] == ch)
                    count--;
                if (count == 0)
                    return i;
            }

            vimperator.beep();
            return -1;
        },

        editWithExternalEditor: function ()
        {
            var textBox = document.commandDispatcher.focusedElement;
            var editor = vimperator.options["editor"];
            var args = [];
            args = editor.split(" ");
            if (args.length < 1)
            {
                vimperator.echoerr("no editor specified");
                return;
            }

            try
            {
                var tmpfile = vimperator.io.createTempFile();
            }
            catch (e)
            {
                vimperator.echoerr("Could not create temporary file: " + e.message);
                return;
            }
            try
            {
                vimperator.io.writeFile(tmpfile, textBox.value);
            }
            catch (e)
            {
                vimperator.echoerr("Could not write to temporary file " + tmpfile.path + ": " + e.message);
                return;
            }

            var prog = args.shift();
            args.push(tmpfile.path)

            textBox.setAttribute("readonly", "true");
            var oldBg = textBox.style.backgroundColor;
            var tmpBg = "yellow";
            textBox.style.backgroundColor = "#bbbbbb";
            var newThread = Components.classes["@mozilla.org/thread-manager;1"].getService().newThread(0);
            // TODO: save return value in v:shell_error
            vimperator.callFunctionInThread(newThread, vimperator.run, [prog, args, true]);
            textBox.removeAttribute("readonly");


    //        if (v:shell_error != 0)
    //        {
    //            tmpBg = "red";
    //            vimperator.echoerr("External editor returned with exit code " + retcode);
    //        }
    //        else
    //        {
                try
                {
                    var val = vimperator.io.readFile(tmpfile);
                    textBox.value = val;
                }
                catch (e)
                {
                    tmpBg = "red";
                    vimperator.echoerr("Could not read from temporary file " + tmpfile.path + ": " + e.message);
                }
    //        }

            // blink the textbox after returning
            var timeout = 100;
            textBox.style.backgroundColor = tmpBg;
            setTimeout(function () {
                textBox.style.backgroundColor = oldBg;
                setTimeout(function () {
                    textBox.style.backgroundColor = tmpBg;
                    setTimeout(function () {
                        textBox.style.backgroundColor = oldBg;
                    }, timeout);
                }, timeout);
            }, timeout);

            tmpfile.remove(false);
        },

        // Abbreviations {{{

        abbreviations: {
            __iterator__: function ()
            {
                var tmpCmd;
                for (var lhs in abbrev)
                {
                    for (var i = 0; i < abbrev[lhs].length; i++)
                    {
                        tmpCmd = (abbrev[lhs][i][0] == "!") ? "abbreviate" : abbrev[lhs][i][0] + "abbrev";
                        yield (tmpCmd + " " + lhs + " " + abbrev[lhs][i][1] + "\n");
                    }
                }
            }
        },

        // filter is i, c or "!" (insert or command abbreviations or both)
        listAbbreviations: function (filter, lhs)
        {
            if (lhs) // list only that one
            {
                if (abbrev[lhs])
                {
                    for (var i = 0; i < abbrev[lhs].length; i++)
                    {
                        if (abbrev[lhs][i][0] == filter)
                            vimperator.echo(abbrev[lhs][i][0] + "    " + lhs + "        " + abbrev[lhs][i][1]);
                        return true;
                    }
                }
                vimperator.echoerr("No abbreviations found");
                return false;
            }
            else // list all (for that filter {i,c,!})
            {
                var flagFound = false;
                var searchFilter = (filter == "!") ? "!ci" : filter + "!"; // ! -> list all, on c or i ! matches too)
                var list = "<table>";
                for (var tmplhs in abbrev)
                {
                    for (var i = 0; i < abbrev[tmplhs].length; i++)
                    {
                        if (searchFilter.indexOf(abbrev[tmplhs][i][0]) > -1)
                        {
                            if (!flagFound)
                                flagFound = true;

                            list += "<tr>";
                            list += "<td> " + abbrev[tmplhs][i][0] + "</td>";
                            list += "<td> " + vimperator.util.escapeHTML(tmplhs) + "</td>";
                            list += "<td> " + vimperator.util.escapeHTML(abbrev[tmplhs][i][1]) + "</td>";
                            list += "</tr>";
                        }
                    }
                }

                if (!flagFound)
                {
                    vimperator.echoerr("No abbreviations found");
                    return;
                }
                list += "</table>";
                vimperator.commandline.echo(list, vimperator.commandline.HL_NORMAL, vimperator.commandline.FORCE_MULTILINE);
            }
        },

        addAbbreviation: function (filter, lhs, rhs)
        {
            if (!abbrev[lhs])
            {
                abbrev[lhs] = [];
                abbrev[lhs][0] = [filter, rhs];
                return;
            }

            if (filter == "!")
            {
                if (abbrev[lhs][1])
                    abbrev[lhs][1] = "";
                abbrev[lhs][0] = [filter, rhs];
                return;
            }

            for (var i = 0; i < abbrev[lhs].length; i++)
            {
                if (abbrev[lhs][i][1] == rhs)
                {
                    if (abbrev[lhs][i][0] == filter)
                    {
                        abbrev[lhs][i] = [filter, rhs];
                        return;
                    }
                    else
                    {
                        if (abbrev[lhs][i][0] != "!")
                        {
                            if (abbrev[lhs][1])
                                abbrev[lhs][1] = "";
                            abbrev[lhs][0] = ["!", rhs];
                            return;
                        }
                        else
                        {
                            return;
                        }
                    }
                }
            }

            if (abbrev[lhs][0][0] == "!")
            {
                var tmpOpp = ("i" == filter) ? "c" : "i";
                abbrev[lhs][1] = [tmpOpp, abbrev[lhs][0][1]];
                abbrev[lhs][0] = [filter, rhs];
                return;
            }

            if (abbrev[lhs][0][0] != filter)
                abbrev[lhs][1] = [filter, rhs];
            else
                abbrev[lhs][0] = [filter, rhs];

            return;

            // System above:
            // filter == ! delete all, and set first (END)
            //
            // if filter == ! remove all and add it as only END
            //
            // variant 1: rhs matches anywere in loop
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
            //            everykind of current combo is possible to 1 {c,i,!} or two {c and i}
            //
            //          1 mod is ! split into two i + c END
            //          1 not !: opposite mode (first), add/change 'second' and END
            //          1 not !: same mode (first), overwrite first this END
            //
        },

        removeAbbreviation: function (filter, lhs)
        {
            if (!lhs)
            {
                vimperator.echoerr("E474: Invalid argument");
                return false;
            }

            if (abbrev[lhs]) // abbrev exists
            {
                if (filter == "!")
                {
                    abbrev[lhs] = "";
                    return true;
                }
                else
                {
                    if (!abbrev[lhs][1]) // only one exists
                    {
                        if (abbrev[lhs][0][0] == "!") // exists as ! -> no 'full' delete
                        {
                            abbrev[lhs][0][0] = (filter == "i") ? "c" : "i";   // ! - i = c; ! - c = i
                            return true;
                        }
                        else if (abbrev[lhs][0][0] == filter)
                        {
                            abbrev[lhs] = "";
                            return true;
                        }
                    }
                    else // two abbrev's exists ( 'i' or  'c' (filter as well))
                    {
                        if (abbrev[lhs][0][0] == "c" && filter == "c")
                            abbrev[lhs][0] = abbrev[lhs][1];

                        abbrev[lhs][1] = "";

                        return true;
                    }
                }
            }

            vimperator.echoerr("E24: No such abbreviation");
            return false;
        },

        removeAllAbbreviations: function (filter)
        {
            if (filter == "!")
            {
                abbrev = {};
            }
            else
            {
                for (var lhs in abbrev)
                {
                    for (var i = 0; i < abbrev[lhs].length; i++)
                    {
                        if (abbrev[lhs][i][0] == "!" || abbrev[lhs][i][0] == filter)
                            this.removeAbbreviation(filter, lhs);
                    }
                }
            }
        },

        expandAbbreviation: function (filter) // try to find an candidate and replace accordingly
        {
            var textbox   = editor();
            var text      = textbox.value;
            var currStart = textbox.selectionStart;
            var currEnd   = textbox.selectionEnd;
            var foundWord = text.substring(0, currStart).replace(/^(.|\n)*?(\S+)$/m, "$2"); // get last word \b word boundary
            if (!foundWord)
                return true;

            for (var lhs in abbrev)
            {
                    for (var i = 0; i < abbrev[lhs].length; i++)
                    {
                        if (lhs == foundWord && (abbrev[lhs][i][0] == filter || abbrev[lhs][i][0] == "!"))
                        {
                            // if found, replace accordingly
                            var len = foundWord.length;
                            var abbrText = abbrev[lhs][i][1];
                            text = text.substring(0, currStart - len) + abbrText + text.substring(currStart);
                            textbox.value = text;
                            textbox.selectionStart = currStart - len + abbrText.length;
                            textbox.selectionEnd   = currEnd   - len + abbrText.length;
                            break;
                        }
                    }
            }
            return true;
        }
        //}}}
    };
    //}}}
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
