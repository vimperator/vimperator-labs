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

        // FIXME: unused? 
        getDefaultIterator: function (mode)
        {
            return mappingsIterator(mode, main);
        },

        // FIXME: unused? 
        getUserIterator: function (mode)
        {
            return mappingsIterator(mode, user);
        },

        hasMap: function (mode, cmd)
        {
            return user[mode].some(function (map) { return map.hasName(cmd); });
        },

        addDefault: function (modes, keys, description, action, extra)
        {
            addMap (new vimperator.Map([vimperator.modes.NORMAL], keys,
                    action, { shortHelp: description }), false);
        },

        add: function (map)
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

        remove: function (mode, cmd)
        {
            removeMap(mode, cmd);
        },

        removeAll: function (mode)
        {
            user[mode] = [];
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

    var allModes = [vimperator.modes.NONE,
                    vimperator.modes.NORMAL,
                    vimperator.modes.INSERT,
                    vimperator.modes.VISUAL,
                    vimperator.modes.HINTS,
                    vimperator.modes.COMMAND_LINE,
                    vimperator.modes.MESSAGE,
                    vimperator.modes.CARET,
                    vimperator.modes.TEXTAREA];

    var noninsertModes = [vimperator.modes.NORMAL,
                          vimperator.modes.VISUAL,
                          vimperator.modes.HINTS,
                          vimperator.modes.MESSAGE,
                          vimperator.modes.CARET,
                          vimperator.modes.TEXTAREA];

    //
    // NORMAL mode
    // {{{

    // vimperator management
    addDefaultMap(new vimperator.Map(allModes, ["<F1>"],
        function () { vimperator.commands.help(); },
        { shortHelp: "Open help window" }
    ));
    addDefaultMap(new vimperator.Map(allModes, ["<Esc>", "<C-[>"],
        vimperator.events.onEscape,
        { shortHelp: "Focus content" }
    ));
    addDefaultMap(new vimperator.Map(noninsertModes, [":"],
        function () { vimperator.commandline.open(":", "", vimperator.modes.EX); },
        { shortHelp: "Start command line mode" }
    ));

    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL, vimperator.modes.VISUAL, vimperator.modes.CARET], ["<Tab>"],
        function () { document.commandDispatcher.advanceFocus(); },
        { shortHelp: "Advance keyboard focus" }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL, vimperator.modes.VISUAL, vimperator.modes.CARET, vimperator.modes.INSERT, vimperator.modes.TEXTAREA], ["<S-Tab>"],
        function () { document.commandDispatcher.rewindFocus(); },
        { shortHelp: "Rewind keyboard focus" }
    ));
                    
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["i", "<Insert>"],
        function ()
        {
            // setting this option triggers an observer
            // which takes care of the mode setting
            vimperator.options.setPref("accessibility.browsewithcaret", true);
        },
        { shortHelp: "Start caret mode" }
    ));
    addDefaultMap(new vimperator.Map(allModes, ["<C-q>"],
        function () { vimperator.modes.passAllKeys = true; },
        { shortHelp: "Temporarily quit Vimperator mode" }
    ));
    addDefaultMap(new vimperator.Map(allModes, ["<C-v>"],
        function () { vimperator.modes.passNextKey = true; },
        { shortHelp: "Pass through next key" }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["<C-c>"],
        function() { BrowserStop(); },
        { shortHelp: "Stop loading" }
    ));
    addDefaultMap(new vimperator.Map(allModes, ["<Nop>"],
        function () { return; },
        { shortHelp: "Do nothing" }
    ));

    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["]f"],
        function (count) { vimperator.buffer.shiftFrameFocus(count > 1 ? count : 1, true); },
        {
            shortHelp: "Focus next frame",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["[f"],
        function (count) { vimperator.buffer.shiftFrameFocus(count > 1 ? count : 1, false); },
        {
            shortHelp: "Focus previous frame",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["]]"],
        function (count) { vimperator.buffer.followDocumentRelationship("next"); },
        {
            shortHelp: "Follow a link labeled to 'next' or '>' if it exists",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["[["],
        function (count) { vimperator.buffer.followDocumentRelationship("previous"); },
        {
            shortHelp: "Follow a link labeled to 'prev', 'previous' or '<' if it exists",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["a"],
        function ()
        {
            var title = "";
            if (vimperator.buffer.title != vimperator.buffer.URL)
                title = " -title=\"" + vimperator.buffer.title + "\"";
            vimperator.commandline.open(":", "bmark " + vimperator.buffer.URL + title, vimperator.modes.EX);
        },
        { shortHelp: "Open a prompt to bookmark the current URL" }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["A"],
        function () { vimperator.bookmarks.toggle(vimperator.buffer.URL); },
        { shortHelp: "Toggle bookmarked state of current URL" }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["b"],
        function () { vimperator.commandline.open(":", "buffer! ", vimperator.modes.EX); },
        { shortHelp: "Open a prompt to switch buffers" }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["B"],
        function () { vimperator.buffer.list(true); },
        { shortHelp: "Toggle buffer list" }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["gb"],
        function (count) { vimperator.buffer.switchTo(null, null, count, false); },
        {
            shortHelp: "Repeat last :buffer[!] command",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["gB"],
        function (count) { vimperator.buffer.switchTo(null, null, count, true); },
        {
            shortHelp: "Repeat last :buffer[!] command in reverse direction",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["d"],
        function (count) { vimperator.tabs.remove(getBrowser().mCurrentTab, count, false, 0); },
        {
            shortHelp: "Delete current buffer (=tab)",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["D"],
        function (count) { vimperator.tabs.remove(getBrowser().mCurrentTab, count, true, 0); },
        {
            shortHelp: "Delete current buffer (=tab)",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["~"],
        function () { vimperator.open("~"); },
        { shortHelp: "Open home directory" }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["gf"],
        function () { vimperator.commands.viewsource(); },
        { shortHelp: "View source" }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["gF"],
        function () { vimperator.commands.viewsource(null, true); },
        { shortHelp: "View source with an external editor" }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["gh"],
        function() { BrowserHome(); },
        { shortHelp: "Go home" }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["gH"],
        function ()
        {
            var homepages = gHomeButton.getHomePage();
            vimperator.open(homepages, /\bhomepage\b/.test(vimperator.options["activate"]) ?
                    vimperator.NEW_TAB : vimperator.NEW_BACKGROUND_TAB);
        },
        { shortHelp: "Go home in a new tab" }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["gi"],
        function ()
        {
            if (vimperator.buffer.lastInputField)
                vimperator.buffer.lastInputField.focus();
            else
            {
                var first = vimperator.buffer.evaluateXPath(
                    "//*[@type='text'] | //textarea | //xhtml:textarea").snapshotItem(0);

                if (first)
                    first.focus();
                else
                    vimperator.beep();
            }
        },
        { shortHelp: "Focus last used input field" }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["go"],
        function (arg) { vimperator.quickmarks.jumpTo(arg, vimperator.CURRENT_TAB); },
        {
            shortHelp: "Jump to a QuickMark in the current tab",
            flags: vimperator.Mappings.flags.ARGUMENT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["gn"],
        function (arg)
        {
            vimperator.quickmarks.jumpTo(arg,
                /\bquickmark\b/.test(vimperator.options["activate"]) ?
                vimperator.NEW_TAB : vimperator.NEW_BACKGROUND_TAB);
        },
        {
            shortHelp: "Jump to a QuickMark in a new tab",
            flags: vimperator.Mappings.flags.ARGUMENT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["gP"],
        function ()
        {
            vimperator.open(readFromClipboard(),
                /\bpaste\b/.test(vimperator.options["activate"]) ?
                vimperator.NEW_BACKGROUND_TAB : vimperator.NEW_TAB);
        },
        { shortHelp: "Open (put) a URL based on the current clipboard contents in a new buffer" }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["g0", "g^"],
        function (count) { vimperator.tabs.select(0); },
        { shortHelp: "Go to the first tab" }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["g$"],
        function (count) { vimperator.tabs.select("$"); },
        { shortHelp: "Go to the last tab" }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["gt", "<C-n>", "<C-Tab>", "<C-PageDown>"],
        function (count) { vimperator.tabs.select(count > 0 ? count - 1: "+1", count > 0 ? false : true); },
        {
            shortHelp: "Go to the next tab",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["gT", "<C-p>", "<C-S-Tab>", "<C-PageUp>"],
        function (count) { vimperator.tabs.select("-" + (count < 1 ? 1 : count), true); },
        {
            shortHelp: "Go {count} pages back",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["<C-^>", "<C-6>"],
        function ()
        {
            if (vimperator.tabs.alternate == null || vimperator.tabs.getTab() == vimperator.tabs.alternate)
            {
                vimperator.echoerr("E23: No alternate page");
                return;
            }

            // NOTE: this currently relies on v.tabs.index() returning the
            // currently selected tab index when passed null
            var index = vimperator.tabs.index(vimperator.tabs.alternate);

            // TODO: since a tab close is more like a bdelete for us we
            // should probably reopen the closed tab when a 'deleted'
            // alternate is selected
            if (index == -1)
                vimperator.echoerr("E86: Buffer does not exist");  // TODO: This should read "Buffer N does not exist"
            else
                vimperator.tabs.select(index);
        },
        { shortHelp: "Select the alternate tab" }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["m"],
        function (arg)
        {
            if (/[^a-zA-Z]/.test(arg))
            {
                vimperator.beep();
                return;
            }

            vimperator.marks.add(arg);
        },
        {
            shortHelp: "Set mark at the cursor position",
            flags: vimperator.Mappings.flags.ARGUMENT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["'", "`"],
        function (arg) { vimperator.marks.jumpTo(arg); },
        {
            shortHelp: "Jump to the mark in the current buffer",
            flags: vimperator.Mappings.flags.ARGUMENT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["M"],
        function (arg)
        {
            if (/[^a-zA-Z0-9]/.test(arg))
            {
                vimperator.beep();
                return;
            }

            vimperator.quickmarks.add(arg, vimperator.buffer.URL);
        },
        {
            shortHelp: "Add new QuickMark for current URL",
            flags: vimperator.Mappings.flags.ARGUMENT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["o"],
        function () { vimperator.commandline.open(":", "open ", vimperator.modes.EX); },
        { shortHelp: "Open one or more URLs in the current tab" }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["O"],
        function () { vimperator.commandline.open(":", "open " + vimperator.buffer.URL, vimperator.modes.EX); },
        { shortHelp: "Open one or more URLs in the current tab, based on current location" }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["p", "<MiddleMouse>"],
        function () { vimperator.open(readFromClipboard()); },
        { shortHelp: "Open (put) a URL based on the current clipboard contents in the current buffer" }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["P"],
        function ()
        {
            vimperator.open(readFromClipboard(),
                /\bpaste\b/.test(vimperator.options["activate"]) ?
                vimperator.NEW_TAB : vimperator.NEW_BACKGROUND_TAB);
        },
        { shortHelp: "Open (put) a URL based on the current clipboard contents in a new buffer" }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["<C-l>"],
        function (count) { vimperator.commands.redraw(); },
        {
            shortHelp: "Redraw the screen",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["r"],
        function () { vimperator.tabs.reload(getBrowser().mCurrentTab, false); },
        { shortHelp: "Reload current page" }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["R"],
        function () { vimperator.tabs.reload(getBrowser().mCurrentTab, true); },
        { shortHelp: "Reload while skipping the cache" }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["t"],
        function () { vimperator.commandline.open(":", "tabopen ", vimperator.modes.EX); },
        { shortHelp: "Open one or more URLs in a new tab" }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["T"],
        function () { vimperator.commandline.open(":", "tabopen " + vimperator.buffer.URL, vimperator.modes.EX); },
        { shortHelp: "Open one or more URLs in a new tab, based on current location" }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["u"],
        function (count) { vimperator.commands.undo("", false, count); },
        {
            shortHelp: "Undo closing of a tab",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["y"],
        function () { vimperator.copyToClipboard(vimperator.buffer.URL, true); },
        { shortHelp: "Yank current location to the clipboard" }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL, vimperator.modes.VISUAL], ["Y"],
        function ()
        {
            var sel = window.content.document.getSelection();
            if (sel)
                vimperator.copyToClipboard(sel, true);
            else
                vimperator.beep();
        },
        { shortHelp: "Copy selected text" }
    ));

    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["zi", "+"],
        function (count) { vimperator.buffer.zoomIn(count > 1 ? count : 1, false); },
        {
            shortHelp: "Enlarge text zoom of current web page",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["zm"],
        function (count) { vimperator.buffer.zoomIn((count > 1 ? count : 1) * 3, false); },
        {
            shortHelp: "Enlarge text zoom of current web page by a larger amount",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["zo", "-"],
        function (count) { vimperator.buffer.zoomOut(count > 1 ? count : 1, false); },
        {
            shortHelp: "Reduce text zoom of current web page",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["zr"],
        function (count) { vimperator.buffer.zoomOut((count > 1 ? count : 1) * 3, false); },
        {
            shortHelp: "Reduce text zoom of current web page by a larger amount",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["zz"],
        function (count) { vimperator.buffer.textZoom = count > 1 ? count : 100; },
        {
            shortHelp: "Set text zoom value of current web page",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["zI"],
        function (count) { vimperator.buffer.zoomIn(count > 1 ? count : 1, true); },
        {
            shortHelp: "Enlarge full zoom of current web page",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["zM"],
        function (count) { vimperator.buffer.zoomIn((count > 1 ? count : 1) * 3, true); },
        {
            shortHelp: "Enlarge full zoom of current web page by a larger amount",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["zO"],
        function (count) { vimperator.buffer.zoomOut(count > 1 ? count : 1, true); },
        {
            shortHelp: "Reduce full zoom of current web page",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["zR"],
        function (count) { vimperator.buffer.zoomOut((count > 1 ? count : 1) * 3, true); },
        {
            shortHelp: "Reduce full zoom of current web page by a larger amount",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["zZ"],
        function (count) { vimperator.buffer.fullZoom = count > 1 ? count : 100; },
        {
            shortHelp: "Set full zoom value of current web page",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));

    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["ZQ"],
        function () { vimperator.quit(false); },
        { shortHelp: "Quit and don't save the session" }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["ZZ"],
        function () { vimperator.quit(true); },
        { shortHelp: "Quit and save the session" }
    ));
    function incrementURL(count)
    {
        var url = vimperator.buffer.URL;
        var regex = /(.*?)(-?\d+)(\D*)$/;

        var matches = url.match(regex);
        if (!matches || !matches[2]) // no number to increment
        {
            vimperator.beep();
            return;
        }

        var newNum = parseInt(matches[2], 10) + count + ""; // "" to make sure its a string
        var nums = newNum.match(/^(-?)(\d+)$/);
        var oldLength = matches[2].replace(/-/, "").length, newLength = nums[2].length;
        newNum = nums[1] || "";
        for (let i = 0; i < oldLength - newLength; i++)
            newNum += "0"; // keep leading zeros
        newNum += nums[2];

        vimperator.open(matches[1] + newNum + matches[3]);
    }
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["<C-x>"],
        function (count) { incrementURL(-(count > 1 ? count : 1)); },
        {
            shortHelp: "Decrement last number in URL",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["<C-a>"],
        function (count) { incrementURL(count > 1 ? count : 1); },
        {
            shortHelp: "Increment last number in URL",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));

    // scrolling commands
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["0", "^"],
        function () { vimperator.buffer.scrollStart(); },
        { shortHelp: "Scroll to the absolute left of the document" }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["$"],
        function () { vimperator.buffer.scrollEnd(); },
        { shortHelp: "Scroll to the absolute right of the document" }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["gg", "<Home>"],
        function (count) { vimperator.buffer.scrollToPercentile(count >  0 ? count : 0); },
        {
            shortHelp: "Goto the top of the document",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["G", "<End>"],
        function (count) { vimperator.buffer.scrollToPercentile(count >= 0 ? count : 100); },
        {
            shortHelp: "Goto the end of the document",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["h", "<Left>"],
        function (count) { vimperator.buffer.scrollColumns(-(count > 1 ? count : 1)); },
        {
            shortHelp: "Scroll document to the left",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["j", "<Down>", "<C-e>"],
        function (count) { vimperator.buffer.scrollLines(count > 1 ? count : 1); },
        {
            shortHelp: "Scroll document down",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["k", "<Up>", "<C-y>"],
        function (count) { vimperator.buffer.scrollLines(-(count > 1 ? count : 1)); },
        {
            shortHelp: "Scroll document up",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["<C-d>"],
        function (count) { vimperator.buffer.scrollByScrollSize(count, 1); },
        {
            shortHelp: "Scroll window downwards in the buffer",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["<C-u>"],
        function (count) { vimperator.buffer.scrollByScrollSize(count, -1); },
        {
            shortHelp: "Scroll window upwards in the buffer",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["l", "<Right>"],
        function (count) { vimperator.buffer.scrollColumns(count > 1 ? count : 1); },
        {
            shortHelp: "Scroll document to the right",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["<C-b>", "<PageUp>", "<S-Space>"],
        function (count) { vimperator.buffer.scrollPages(-(count > 1 ? count : 1)); },
        {
            shortHelp: "Scroll up a full page",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["<C-f>", "<PageDown>", "<Space>"],
        function (count) { vimperator.buffer.scrollPages(count > 1 ? count : 1); },
        {
            shortHelp: "Scroll down a full page",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));

    // page info
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["<C-g>"],
        function (count) { vimperator.buffer.showPageInfo(false); },
        {
            shortHelp: "Print the current file name",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["g<C-g>"],
        function (count) { vimperator.buffer.showPageInfo(true); },
        { shortHelp: "Print file information" }
    ));


    // history manipulation and jumplist
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["<C-o>"],
        function (count) { vimperator.history.stepTo(-(count > 1 ? count : 1)); },
        {
            shortHelp: "Go to an older position in the jump list",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["<C-i>"],
        function (count) { vimperator.history.stepTo(count > 1 ? count : 1); },
        {
            shortHelp: "Go to a newer position in the jump list",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["H", "<A-Left>", "<M-Left>"],
        function (count) { vimperator.history.stepTo(-(count > 1 ? count : 1)); },
        {
            shortHelp: "Go back in the browser history",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["L", "<A-Right>", "<M-Right>"],
        function (count) { vimperator.history.stepTo(count > 1 ? count : 1); },
        {
            shortHelp: "Go forward in the browser history",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["gu"],
        function (count)
        {
            function isDirectory(url)
            {
                if (/^file:\/|^\//.test(url))
                {
                    //var strippedFilename = url.replace(/^(file:\/\/)?(.*)/, "$2");
                    var file = vimperator.io.getFile(url);
                    if (!file.exists() || !file.isDirectory())
                        return false;
                    else
                        return true;
                }

                // for all other locations just check if the URL ends with /
                return /\/$/.test(url);
            }

            if (count < 1)
                count = 1;

            var url = vimperator.buffer.URL;
            for (var i = 0; i < count; i++)
            {
                if (isDirectory(url))
                    url = url.replace(/^(.*?:)(.*?)([^\/]+\/*)$/, "$1$2/");
                else
                    url = url.replace(/^(.*?:)(.*?)(\/+[^\/]+)$/, "$1$2/");
            }
            url = url.replace(/^(.*:\/+.*?)\/+$/, "$1/"); // get rid of more than 1 / at the end

            if (url == vimperator.buffer.URL)
            {
                vimperator.beep();
                return;
            }
            vimperator.open(url);
        },
        {
            shortHelp: "Go to parent directory",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["gU"],
        function ()
        {
            var uri = content.document.location;
            if (/(about|mailto):/.test(uri.protocol)) // exclude these special protocols for now
            {
                vimperator.beep();
                return;
            }
            vimperator.open(uri.protocol + "//" + (uri.host || "") + "/");
        },
        { shortHelp: "Go to the root of the website" }
    ));

    // hint managment
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["f"],
        function () { vimperator.hints.show(vimperator.modes.QUICK_HINT); },
        { shortHelp: "Start QuickHint mode" }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["F"],
        function () { vimperator.hints.show(vimperator.modes.QUICK_HINT, "t"); },
        { shortHelp: "Start QuickHint mode, but open link in a new tab" }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], [";"],
        function (arg)
        {
            if (arg == "f")
                vimperator.hints.show(vimperator.modes.ALWAYS_HINT, "o");
            else if (arg == "F")
                vimperator.hints.show(vimperator.modes.ALWAYS_HINT, "t");
            else
                vimperator.hints.show(vimperator.modes.EXTENDED_HINT, arg);
        },
        {
            shortHelp: "Start an extended hint mode",
            flags: vimperator.Mappings.flags.ARGUMENT
        }
    ));

    // search management
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["/"],
        function () { vimperator.search.openSearchDialog(vimperator.modes.SEARCH_FORWARD); },
        { shortHelp: "Search forward for a pattern" }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["?"],
        function () { vimperator.search.openSearchDialog(vimperator.modes.SEARCH_BACKWARD); },
        { shortHelp: "Search backwards for a pattern" }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["n"],
        function () { vimperator.search.findAgain(false); },
        { shortHelp: "Find next" }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["N"],
        function () { vimperator.search.findAgain(true); },
        { shortHelp: "Find previous" }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["q"],
        function (arg) { vimperator.events.startRecording(arg); },
        {
            shortHelp: "Record a keysequence into a macro",
            flags: vimperator.Mappings.flags.ARGUMENT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["@"], 
        function (count, arg)
        {
            if (count < 1) count = 1;
            while (count--)
                vimperator.events.playMacro(arg);
        },
        {
            shortHelp: "Play a macro",
            flags: vimperator.Mappings.flags.ARGUMENT | vimperator.Mappings.flags.COUNT
        }
    ));

    // }}}
    // CARET mode
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


    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL, vimperator.modes.CARET, vimperator.modes.TEXTAREA], ["*"],
        function (count)
        {
            vimperator.search.searchSubmitted(vimperator.buffer.getCurrentWord(), false);
            vimperator.search.findAgain();
        },
        { }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL, vimperator.modes.CARET, vimperator.modes.TEXTAREA], ["#"],
        function (count)
        {
            vimperator.search.searchSubmitted(vimperator.buffer.getCurrentWord(), true);
            vimperator.search.findAgain();
        },
        { }
    ));

    // }}}
    // VISUAL mode
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
    // TEXTAREA mode
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
    // INSERT mode
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
    // COMMAND_LINE mode
    //{{{

    addDefaultMap(new vimperator.Map([vimperator.modes.COMMAND_LINE], ["<Space>"],
        function () { return vimperator.editor.expandAbbreviation("c"); },
        { flags: vimperator.Mappings.flags.ALLOW_EVENT_ROUTING }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.COMMAND_LINE], ["<C-]>", "<C-5>"],
        function () { vimperator.editor.expandAbbreviation("c"); }, { }
    ));

    //}}} }}}

    return mappingManager;
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
