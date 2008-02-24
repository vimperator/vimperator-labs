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

vimperator.Map = function (modes, cmds, action, extraInfo) //{{{
{
    if (!modes || (!cmds || !cmds.length) || !action)
        return null;

    this.modes = modes;
    this.names = cmds;
    this.action = action;

    if (extraInfo)
    {
        this.flags = extraInfo.flags || 0;

        this.shortHelp = extraInfo.shortHelp || "";

        this.rhs = extraInfo.rhs || null;
        this.noremap = extraInfo.noremap || false;
    }
};

vimperator.Map.prototype = {

    hasName: function (name)
    {
        return this.names.some(function (e) { return e == name; });
    },

    execute: function (motion, count, argument)
    {
        var args = [];

        if (this.flags & vimperator.Mappings.flags.MOTION)
            args.push(motion);
        if (this.flags & vimperator.Mappings.flags.COUNT)
            args.push(count);
        if (this.flags & vimperator.Mappings.flags.ARGUMENT)
            args.push(argument);

        return this.action.apply(this, args);
    }

};
//}}}

vimperator.Mappings = function () //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var main = []; // default mappings
    var user = []; // user created mappings

    for (var mode in vimperator.modes)
    {
        main[mode] = [];
        user[mode] = [];
    }

    function addDefaultMap(map)
    {
        map.modes.forEach(function (mode) { main[mode].push(map); });
    }

    function addMap(map, userMap)
    {
        var where = userMap ? user : main;
        map.modes.forEach(function (mode) { where[mode].push(map); });
    }

    function getMap(mode, cmd, stack)
    {
        var maps = stack[mode];

        for (var i = 0; i < maps.length; i++)
        {
            if (maps[i].hasName(cmd))
                return maps[i];
        }

        return null;
    }

    function removeMap(mode, cmd)
    {
        var maps = user[mode];
        var names;

        for (var i = 0; i < maps.length; i++)
        {
            names = maps[i].names;
            for (var j = 0; j < names.length; j++)
            {
                if (names[j] == cmd)
                {
                    names.splice(j, 1);

                    if (names.length == 0)
                        maps.splice(i, 1);

                    return;
                }
            }
        }
    }

    function mappingsIterator(modes, stack)
    {
        var output;
        var maps = stack[modes[0]];

        for (var i = 0; i < maps.length; i++)
        {
            output = true;
            for (var index = 1; index < modes.length; index++) // check other modes
            {
                output = false; // toggle false, only true whan also found in this mode
                for (var z = 0; z < user[modes[index]].length; z++) // maps
                {
                    // NOTE: when other than user maps, there might be more than only one names[x].
                    //       since only user mappings gets queried here, only names[0] gets checked for equality.
                    if (maps[i].rhs == user[modes[index]][z].rhs && maps[i].names[0] == user[modes[index]][z].names[0])
                    {
                        output = true;
                        break; // found on this mode - check next mode, if there is one, where it could still fail...
                    }
                }
                break; // not found in this mode -> map wont' match all modes...
            }
            if (output)
                yield maps[i];
        }
        throw StopIteration;
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    // FIXME:
    vimperator.Mappings.flags = {
        ALLOW_EVENT_ROUTING: 1 << 0, // if set, return true inside the map command to pass the event further to firefox
        MOTION:              1 << 1,
        COUNT:               1 << 2,
        ARGUMENT:            1 << 3
    };

    var mappingManager = {

        // NOTE: just normal mode for now
        __iterator__: function ()
        {
            return mappingsIterator([vimperator.modes.NORMAL], main);
        },

        add: function (modes, keys, description, action, extra)
        {
            addMap (new vimperator.Map(modes, keys,
                    action, { shortHelp: description, flags: (extra && extra.flags) ? extra.flags : 0 }), false);
        },

        // TODO: change map to "easier" arguments
        addUserMap: function (map)
        {
            // a map can have multiple names
            for (var i = 0; i < map.names.length; i++)
            {
                // only store keysyms with uppercase modifier strings
                map.names[i] = map.names[i].replace(/[casm]-/g, function (name) { return name.toUpperCase(); });
                for (var j = 0; j < map.modes.length; j++)
                    removeMap(map.modes[j], map.names[i]);
            }

            // all maps got removed (matching names = lhs), and added newly here
            for (var k = 0; k < map.modes.length; k++)
                user[map.modes[k]].push(map);
        },

        get: function (mode, cmd)
        {
            return getMap(mode, cmd, user) || getMap(mode, cmd, main);
        },

        getDefault: function (mode, cmd)
        {
            return getMap(mode, cmd, main);
        },

        // returns an array of mappings with names which START with "cmd" (but are NOT "cmd")
        getCandidates: function (mode, cmd)
        {
            var mappings = user[mode].concat(main[mode]);
            var matches = [];

            for (var i = 0; i < mappings.length; i++)
            {
                var map = mappings[i];
                for (var j = 0; j < map.names.length; j++)
                {
                    if (map.names[j].indexOf(cmd) == 0 && map.names[j].length > cmd.length)
                    {
                        // for < only return a candidate if it doesn't look like a <c-x> mapping
                        if (cmd != "<" || !/^<.+>/.test(map.names[j]))
                            matches.push(map);
                    }
                }
            }

            return matches;
        },

        // returns whether the user added a custom user map 
        hasMap: function (mode, cmd)
        {
            return user[mode].some(function (map) { return map.hasName(cmd); });
        },

        remove: function (mode, cmd)
        {
            removeMap(mode, cmd);
        },

        removeAll: function (mode)
        {
            user[mode] = [];
        },

        list: function (modes, filter)
        {
            // modes means, a map must exist in both modes in order to get listed
            var maps = user[modes[0]]; // duplicate (reference) (first mode where it must match)
            var output = [];

            if (!maps || maps.length == 0)
            {
                vimperator.echo("No mappings found");
                return;
            }

            for (var i = 0; i < maps.length; i++) // check on maps items (first mode)
            {
                output.push(true);
                if (filter && maps[i].names[0] != filter) // does it match the filter first of all?
                {
                    output[output.length - 1] = false;
                    continue;
                }
                for (var index = 1; index < modes.length; index++) // check if found in the other modes (1(2nd)-last)
                {
                    output[output.length - 1] = false; // toggle false, only true whan also found in this mode
                    for (var z = 0; z < user[modes[index]].length; z++) // maps on the other modes
                    {
                        // NOTE: when other than user maps, there might be more than only one names[x].
                        //       since only user mappings gets queried here, only names[0] gets checked for equality.
                        if (maps[i].rhs == user[modes[index]][z].rhs && maps[i].names[0] == user[modes[index]][z].names[0])
                        {
                            output[output.length - 1] = true;
                            break; // found on this mode - ok, check next mode...
                        }
                    }
                    break; // not found in this mode -> map wont' match all modes...
                }
            }

            // anything found?
            var flag = false;
            for (var i = 0; i < output.length; i++)
                if (output[i])
                    flag = true;

            if (!flag)
            {
                vimperator.echo("No mappings found");
                return;
            }

            var modeSign = "";
            for (var i = 0; i < modes.length; i++)
            {
                if (modes[i] == vimperator.modes.NORMAL) 
                    modeSign += 'n';
                if ((modes[i] == vimperator.modes.INSERT || modes[i] == vimperator.modes.TEXTAREA) && modeSign.indexOf("i") == -1) 
                    modeSign += 'i';
                if (modes[i] == vimperator.modes.COMMAND_LINE) 
                    modeSign += 'c';
            }

            var list = "<table>";
            for (i = 0; i < maps.length; i++)
            {
                if (!output[i])
                    continue;
                for (var j = 0; j < maps[i].names.length; j++)
                {
                    list += "<tr>";
                    list += "<td> " + modeSign + "   " + vimperator.util.escapeHTML(maps[i].names[j]) + "</td>";
                    if (maps[i].rhs)
                        list += "<td> "+ (maps[i].noremap ? "*" : " ") + "</td>" 
                                        + "<td>" + vimperator.util.escapeHTML(maps[i].rhs) + "</td>";
                    list += "</tr>";
                }
            }
            list += "</table>";

            vimperator.commandline.echo(list, vimperator.commandline.HL_NORMAL, vimperator.commandline.FORCE_MULTILINE);
        }

    };

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// DEFAULT MAPPINGS ////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    // CARET mode, most commands should be moved to buffer.js i guess
    // {{{

    function getSelectionController()
    {
        return getBrowser().docShell
            .QueryInterface(Components.interfaces.nsIInterfaceRequestor)
            .getInterface(Components.interfaces.nsISelectionDisplay)
            .QueryInterface(Components.interfaces.nsISelectionController);

    }
    addDefaultMap(new vimperator.Map([vimperator.modes.CARET, vimperator.modes.TEXTAREA], ["v"],
        function (count) { vimperator.modes.set(vimperator.modes.VISUAL, vimperator.mode); },
        { shortHelp: "Start visual mode" }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.CARET], ["j", "<Down>"],
        function (count)
        {
            if (count < 1) count = 1;
            while (count--)
                getSelectionController().lineMove(true, false);
        },
        { flags: vimperator.Mappings.flags.COUNT }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.CARET], ["k", "<Up>"],
        function (count)
        {
            if (count < 1) count = 1;
            while (count--)
                getSelectionController().lineMove(false, false);

        },
        { flags: vimperator.Mappings.flags.COUNT }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.CARET], ["h", "<Left>"],
        function (count)
        {
            if (count < 1) count = 1;
            while (count--)
                getSelectionController().characterMove(false, false);
        },
        { flags: vimperator.Mappings.flags.COUNT }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.CARET], ["l", "<Right>"],
        function (count)
        {
            if (count < 1) count = 1;
            while (count--)
                getSelectionController().characterMove(true, false);

        },
        { flags: vimperator.Mappings.flags.COUNT }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.CARET], ["b", "B", "<C-Left>"],
        function (count)
        {
            if (count < 1) count = 1;
            while (count--)
                getSelectionController().wordMove(false, false);
        },
        { flags: vimperator.Mappings.flags.COUNT }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.CARET], ["w", "W", "e", "<C-Right>"],
        function (count)
        {
            if (count < 1) count = 1;
            while (count--)
                getSelectionController().wordMove(true, false);

        },
        { flags: vimperator.Mappings.flags.COUNT }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.CARET], ["<C-f>", "<PageDown>"],
        function (count)
        {
            if (count < 1) count = 1;
            while (count--)
                getSelectionController().pageMove(true, false);
        },
        { flags: vimperator.Mappings.flags.COUNT }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.CARET], ["<C-b>", "<PageUp>"],
        function (count)
        {
            if (count < 1) count = 1;
            while (count--)
                getSelectionController().pageMove(false, false);
        },
        { flags: vimperator.Mappings.flags.COUNT }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.CARET], ["gg", "<C-Home>"],
        function (count) { getSelectionController().completeMove(false, false); },
        { }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.CARET], ["G", "<C-End>"],
        function (count) { getSelectionController().completeMove(true, false); },
        { }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.CARET], ["0", "^", "<Home>"],
        function (count) { getSelectionController().intraLineMove(false, false); },
        { }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.CARET], ["$", "<End>"],
        function (count) { getSelectionController().intraLineMove(true, false); },
        { }
    ));


    // }}}
    // VISUAL mode, move to buffer.js
    // {{{

    addDefaultMap(new vimperator.Map([vimperator.modes.VISUAL], ["j", "<Down>"],
        function (count)
        {
            if (count < 1) count = 1;
            while (count--)
            {
                if (vimperator.modes.extended & vimperator.modes.TEXTAREA)
                {
                    vimperator.editor.executeCommand("cmd_selectLineNext");
                    if ((vimperator.modes.extended & vimperator.modes.LINE) && !vimperator.editor.selectedText())
                        vimperator.editor.executeCommand("cmd_selectLineNext");
                }
                else
                    getSelectionController().lineMove(true, true);
            }
        },
        { flags: vimperator.Mappings.flags.COUNT }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.VISUAL], ["k", "<Up>"],
        function (count)
        {
            if (count < 1) count = 1;
            while (count--)
            {
                if (vimperator.modes.extended & vimperator.modes.TEXTAREA)
                {
                    vimperator.editor.executeCommand("cmd_selectLinePrevious");
                    if ((vimperator.modes.extended & vimperator.modes.LINE) && !vimperator.editor.selectedText())
                        vimperator.editor.executeCommand("cmd_selectLinePrevious");
                }
                else
                    getSelectionController().lineMove(false, true);
            }
        },
        { flags: vimperator.Mappings.flags.COUNT }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.VISUAL], ["h", "<Left>"],
        function (count)
        {
            if (count < 1) count = 1;
            while (count--)
            {
                if (vimperator.modes.extended & vimperator.modes.TEXTAREA)
                    vimperator.editor.executeCommand("cmd_selectCharPrevious");
                else
                    getSelectionController().characterMove(false, true);
            }
        },
        { flags: vimperator.Mappings.flags.COUNT }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.VISUAL], ["l", "<Right>"],
        function (count)
        {
            if (count < 1) count = 1;
            while (count--)
            {
                if (vimperator.modes.extended & vimperator.modes.TEXTAREA)
                    vimperator.editor.executeCommand("cmd_selectCharNext");
                else
                    getSelectionController().characterMove(true, true);
            }
        },
        { flags: vimperator.Mappings.flags.COUNT }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.VISUAL], ["b", "B"],
        function (count)
        {
            if (count < 1) count = 1;
            while (count--)
            {
                if (vimperator.modes.extended & vimperator.modes.TEXTAREA)
                    vimperator.editor.executeCommand("cmd_selectWordPrevious");
                else
                    getSelectionController().wordMove(false, true);
            }
        },
        { flags: vimperator.Mappings.flags.COUNT }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.VISUAL], ["w", "W", "e"],
        function (count)
        {
            if (count < 1) count = 1;
            while (count--)
            {
                if (vimperator.modes.extended & vimperator.modes.TEXTAREA)
                    vimperator.editor.executeCommand("cmd_selectWordNext");
                else
                    getSelectionController().wordMove(true, true);
            }
        },
        { flags: vimperator.Mappings.flags.COUNT }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.VISUAL], ["<C-f>", "<PageDown>"],
        function (count)
        {
            if (count < 1) count = 1;
            while (count--)
            {
                if (vimperator.modes.extended & vimperator.modes.TEXTAREA)
                    ;//vimperator.editor.executeCommand("cmd_selectPageNext");
                else
                    getSelectionController().pageMove(true, true);
            }
        },
        { flags: vimperator.Mappings.flags.COUNT }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.VISUAL], ["<C-b>", "<PageUp>"],
        function (count)
        {
            if (count < 1) count = 1;
            while (count--)
            {
                if (vimperator.modes.extended & vimperator.modes.TEXTAREA)
                    ;//vimperator.editor.executeCommand("cmd_selectWordNext");
                else
                    getSelectionController().pageMove(false, true);
            }
        },
        { flags: vimperator.Mappings.flags.COUNT }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.VISUAL], ["gg", "<C-Home>"],
        function (count)
        {
            if (vimperator.modes.extended & vimperator.modes.TEXTAREA)
                vimperator.editor.executeCommand("cmd_selectTop");
            else
                getSelectionController().completeMove(false, true);
        },
        { }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.VISUAL], ["G", "<C-End>"],
        function (count)
        {
            if (vimperator.modes.extended & vimperator.modes.TEXTAREA)
                vimperator.editor.executeCommand("cmd_selectBottom");
            else
                getSelectionController().completeMove(true, true);
        },
        { }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.VISUAL], ["0", "^", "<Home>"],
        function (count)
        {
            if (vimperator.modes.extended & vimperator.modes.TEXTAREA)
                vimperator.editor.executeCommand("cmd_selectBeginLine");
            else
                getSelectionController().intraLineMove(false, true);
        },
        { }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.VISUAL], ["$", "<End>"],
        function (count)
        {
            if (vimperator.modes.extended & vimperator.modes.TEXTAREA)
                vimperator.editor.executeCommand("cmd_selectEndLine");
            else
                getSelectionController().intraLineMove(true, true);
        },
        { }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.VISUAL], ["c", "s"],
        function (count)
        {
            if (vimperator.modes.extended & vimperator.modes.TEXTAREA)
            {
                vimperator.editor.executeCommand("cmd_cut");
                vimperator.modes.set(vimperator.modes.INSERT, vimperator.modes.TEXTAREA);
            }
            else
                vimperator.beep();
        },
        { }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.VISUAL], ["d"],
        function (count)
        {
            if (vimperator.modes.extended & vimperator.modes.TEXTAREA)
            {
                vimperator.editor.executeCommand("cmd_cut");
                vimperator.modes.set(vimperator.modes.TEXTAREA);
            }
            else
                vimperator.beep();
        },
        { }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.VISUAL], ["y"],
        function (count)
        {
            if (vimperator.modes.extended & vimperator.modes.TEXTAREA)
            {
                vimperator.editor.executeCommand("cmd_copy");
                // vimperator.editor.unselectText();
                vimperator.modes.set(vimperator.modes.TEXTAREA);
            }
            else
            {
                var sel = window.content.document.getSelection();
                if (sel)
                    vimperator.copyToClipboard(sel, true);
                else
                    vimperator.beep();
            }
        },
        { }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.VISUAL, vimperator.modes.TEXTAREA], ["p"],
        function (count)
        {
            if (!(vimperator.modes.extended & vimperator.modes.CARET))
            {
                if (!count) count = 1;
                while (count--)
                    vimperator.editor.executeCommand("cmd_paste");
                vimperator.mode = vimperator.modes.TEXTAREA;
            }
            else
                vimperator.beep();
        },
        { }
    ));

    // }}}
    // TEXTAREA mode, move to editor.js
    // {{{

    addDefaultMap(new vimperator.Map([vimperator.modes.TEXTAREA], ["i", "<Insert>"],
        function (count) { vimperator.modes.set(vimperator.modes.INSERT, vimperator.modes.TEXTAREA); },
        { }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.TEXTAREA], ["a"],
        function (count)
        {
            vimperator.editor.executeCommand("cmd_charNext", 1);
            vimperator.modes.set(vimperator.modes.INSERT, vimperator.modes.TEXTAREA);
        },
        { }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.TEXTAREA], ["I", "gI"],
        function (count)
        {
            vimperator.editor.executeCommand("cmd_beginLine", 1);
            vimperator.modes.set(vimperator.modes.INSERT, vimperator.modes.TEXTAREA);
        },
        { }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.TEXTAREA], ["A"],
        function (count)
        {
            vimperator.editor.executeCommand("cmd_endLine", 1);
            vimperator.modes.set(vimperator.modes.INSERT, vimperator.modes.TEXTAREA);
        },
        { }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.TEXTAREA], ["s"],
        function (count)
        {
            vimperator.editor.executeCommand("cmd_deleteCharForward", 1);
            vimperator.modes.set(vimperator.modes.INSERT, vimperator.modes.TEXTAREA);
        },
        { }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.TEXTAREA], ["S"],
        function (count)
        {
            vimperator.editor.executeCommand("cmd_deleteToEndOfLine", 1);
            vimperator.editor.executeCommand("cmd_deleteToBeginningOfLine", 1);
            vimperator.modes.set(vimperator.modes.INSERT, vimperator.modes.TEXTAREA);
        },
        { }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.TEXTAREA], ["C"],
        function (count)
        {
            vimperator.editor.executeCommand("cmd_deleteToEndOfLine", 1);
            vimperator.modes.set(vimperator.modes.INSERT, vimperator.modes.TEXTAREA);
        },
        { }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.TEXTAREA], ["v"],
        function (count) { vimperator.modes.set(vimperator.modes.VISUAL, vimperator.modes.TEXTAREA); },
        { }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.TEXTAREA], ["V"],
        function (count)
        {
            vimperator.modes.set(vimperator.modes.VISUAL, vimperator.modes.TEXTAREA | vimperator.modes.LINE);
            vimperator.editor.executeCommand("cmd_beginLine", 1);
            vimperator.editor.executeCommand("cmd_selectLineNext", 1);
        },
        { }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.TEXTAREA], ["u"],
        function (count) { vimperator.editor.executeCommand("cmd_undo", count); vimperator.mode = vimperator.modes.TEXTAREA; },
        { flags: vimperator.Mappings.flags.COUNT }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.TEXTAREA], ["<C-r>"],
        function (count) { vimperator.editor.executeCommand("cmd_redo", count); vimperator.mode = vimperator.modes.TEXTAREA; },
        { flags: vimperator.Mappings.flags.COUNT }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.TEXTAREA], ["j", "<Down>", "<Return>"],
        function (count) { vimperator.editor.executeCommand("cmd_lineNext", count); },
        { flags: vimperator.Mappings.flags.COUNT }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.TEXTAREA], ["k", "<Up>"],
        function (count) { vimperator.editor.executeCommand("cmd_linePrevious", count); },
        { flags: vimperator.Mappings.flags.COUNT }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.TEXTAREA], ["h", "<Left>", "<BS>"],
        function (count) { vimperator.editor.executeCommand("cmd_charPrevious", count); },
        { flags: vimperator.Mappings.flags.COUNT }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.TEXTAREA], ["l", "<Right>", "<Space>"],
        function (count) { vimperator.editor.executeCommand("cmd_charNext", count); },
        { flags: vimperator.Mappings.flags.COUNT }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.TEXTAREA], ["w", "W", "e", "<C-Right>"],
        function (count) { vimperator.editor.executeCommand("cmd_wordNext", count); },
        { flags: vimperator.Mappings.flags.COUNT }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.TEXTAREA], ["b", "B", "<C-Left>"],
        function (count) { vimperator.editor.executeCommand("cmd_wordPrevious", 1); },
        { flags: vimperator.Mappings.flags.COUNT }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.TEXTAREA], ["gg", "<C-Home>"],
        function (count) { vimperator.editor.executeCommand("cmd_moveTop", 1); },
        { }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.TEXTAREA], ["G", "<C-End>"],
        function (count) { vimperator.editor.executeCommand("cmd_moveBottom", 1); },
        { }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.TEXTAREA], ["0", "^", "<Home>"],
        function (count) { vimperator.editor.executeCommand("cmd_beginLine", 1); },
        { }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.TEXTAREA], ["$", "<End>"],
        function (count) { vimperator.editor.executeCommand("cmd_endLine", 1); },
        { }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.TEXTAREA], ["<C-f>", "<PageDown>"],
        function (count) { vimperator.editor.executeCommand("cmd_movePageDown", count); },
        { flags: vimperator.Mappings.flags.COUNT }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.TEXTAREA], ["<C-b>", "<PageUp>"],
        function (count) { vimperator.editor.executeCommand("cmd_movePageUp", count); },
        { flags: vimperator.Mappings.flags.COUNT }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.TEXTAREA], ["o"],
        function (count)
        {
            vimperator.editor.executeCommand("cmd_endLine", 1);
            vimperator.modes.set(vimperator.modes.INSERT, vimperator.modes.TEXTAREA);
            vimperator.events.feedkeys("<Return>");
        },
        {  }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.TEXTAREA], ["O"],
        function (count)
        {
            vimperator.editor.executeCommand("cmd_beginLine", 1);
            vimperator.modes.set(vimperator.modes.INSERT, vimperator.modes.TEXTAREA);
            vimperator.events.feedkeys("<Return>");
            vimperator.editor.executeCommand("cmd_linePrevious", 1);
        },
        {  }
    ));

    // no need to check if we are really in TEXTAREA mode, as findCharForward/Backward will return -1 otherwise
    addDefaultMap(new vimperator.Map([vimperator.modes.TEXTAREA, vimperator.modes.VISUAL], ["f"],
        function (count, arg)
        {
            var pos = vimperator.editor.findCharForward(arg, count);
            if (pos >= 0)
                vimperator.editor.moveToPosition(pos, true, vimperator.mode == vimperator.modes.VISUAL);
        },
        { flags: vimperator.Mappings.flags.ARGUMENT | vimperator.Mappings.flags.COUNT}
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.TEXTAREA, vimperator.modes.VISUAL], ["F"],
        function (count, arg)
        {
            var pos = vimperator.editor.findCharBackward(arg, count);
            if (pos >= 0)
                vimperator.editor.moveToPosition(pos, false, vimperator.mode == vimperator.modes.VISUAL);
        },
        { flags: vimperator.Mappings.flags.ARGUMENT | vimperator.Mappings.flags.COUNT}
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.TEXTAREA, vimperator.modes.VISUAL], ["t"],
        function (count, arg)
        {
            var pos = vimperator.editor.findCharForward(arg, count);
            if (pos >= 0)
                vimperator.editor.moveToPosition(pos - 1, true, vimperator.mode = vimperator.modes.VISUAL);
        },
        { flags: vimperator.Mappings.flags.ARGUMENT | vimperator.Mappings.flags.COUNT}
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.TEXTAREA, vimperator.modes.VISUAL], ["T"],
        function (count, arg)
        {
            var pos = vimperator.editor.findCharBackward(arg, count);
            if (pos >= 0)
                vimperator.editor.moveToPosition(pos + 1, false, vimperator.mode = vimperator.modes.VISUAL);
        },
        { flags: vimperator.Mappings.flags.ARGUMENT | vimperator.Mappings.flags.COUNT}
    ));
    // addDefaultMap(new vimperator.Map([vimperator.modes.TEXTAREA, vimperator.modes.VISUAL], [";"],
    //     function (count, arg)
    //     {
    //         var pos = vimperator.editor.findCharBackward(null, count);
    //         if (pos >= 0)
    //             vimperator.editor.moveToPosition(pos + 1, false, vimperator.mode = vimperator.modes.VISUAL);
    //     },
    //     { flags: vimperator.Mappings.flags.ARGUMENT | vimperator.Mappings.flags.COUNT}
    // ));

    // commands which require a motion
    addDefaultMap(new vimperator.Map([vimperator.modes.TEXTAREA], ["d"],
        function (motion, count) { vimperator.editor.executeCommandWithMotion("d", motion, count); },
        { flags: vimperator.Mappings.flags.MOTION | vimperator.Mappings.flags.COUNT }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.TEXTAREA], ["c"],
        function (motion, count) { vimperator.editor.executeCommandWithMotion("c", motion, count); },
        { flags: vimperator.Mappings.flags.MOTION | vimperator.Mappings.flags.COUNT }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.TEXTAREA], ["y"],
        function (motion, count) { vimperator.editor.executeCommandWithMotion("y", motion, count); },
        { flags: vimperator.Mappings.flags.MOTION | vimperator.Mappings.flags.COUNT }
    ));

    // }}}
    // INSERT mode, move to editor.js
    // {{{

    addDefaultMap(new vimperator.Map([vimperator.modes.INSERT, vimperator.modes.COMMAND_LINE], ["<C-w>"],
        function () { vimperator.editor.executeCommand("cmd_deleteWordBackward", 1); },
        { }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.INSERT, vimperator.modes.COMMAND_LINE], ["<C-u>"],
        function ()
        {
            // broken in FF3, deletes the whole line:
            // vimperator.editor.executeCommand("cmd_deleteToBeginningOfLine", 1);
            vimperator.editor.executeCommand("cmd_selectBeginLine", 1);
            vimperator.editor.executeCommand("cmd_delete", 1);
        },
        { }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.INSERT, vimperator.modes.COMMAND_LINE], ["<C-k>"],
        function () { vimperator.editor.executeCommand("cmd_deleteToEndOfLine", 1); },
        { }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.INSERT, vimperator.modes.COMMAND_LINE], ["<C-a>", "<Home>"],
        function () { vimperator.editor.executeCommand("cmd_beginLine", 1); },
        { }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.INSERT, vimperator.modes.COMMAND_LINE], ["<C-e>", "<End>"],
        function () { vimperator.editor.executeCommand("cmd_endLine", 1); },
        { }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.INSERT, vimperator.modes.COMMAND_LINE], ["<C-h>"], // let firefox handle <BS>
        function () { vimperator.editor.executeCommand("cmd_deleteCharBackward", 1); },
        { }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.INSERT, vimperator.modes.COMMAND_LINE], ["<C-d>"],
        function () { vimperator.editor.executeCommand("cmd_deleteCharForward", 1); },
        { }
    ));
//    addDefaultMap(new vimperator.Map([vimperator.modes.INSERT, vimperator.modes.COMMAND_LINE], ["<C-b>"],
//        function () { vimperator.editor.executeCommand("cmd_charPrevious", 1); },
//        { }
//    ));
//    addDefaultMap(new vimperator.Map([vimperator.modes.INSERT, vimperator.modes.COMMAND_LINE], ["<C-f>"],
//        function () { vimperator.editor.executeCommand("cmd_charNext", 1); },
//        { }
//    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.INSERT, vimperator.modes.COMMAND_LINE], ["<S-Insert>"],
        function () { vimperator.editor.pasteClipboard(); },
        { }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.INSERT, vimperator.modes.TEXTAREA], ["<C-i>"],
        function () { vimperator.editor.editWithExternalEditor(); },
        { }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.INSERT, vimperator.modes.TEXTAREA], ["<Space>", "<Return>"],
    function () { return vimperator.editor.expandAbbreviation("i"); },
        { flags: vimperator.Mappings.flags.ALLOW_EVENT_ROUTING }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.INSERT, vimperator.modes.TEXTAREA], ["<Tab>"],
        function () { vimperator.editor.expandAbbreviation("i"); document.commandDispatcher.advanceFocus(); },
        { }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.INSERT, vimperator.modes.TEXTAREA],
        ["<C-]>", "<C-5>"], function () { vimperator.editor.expandAbbreviation("i"); }, { }
    ));

    //}}}

    return mappingManager;
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
