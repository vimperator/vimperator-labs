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

vimperator.Map = function (modes, cmds, action, extraInfo) //{{{
{
    if (!modes || (!cmds || !cmds.length) || !action)
        return null;

    this.modes = modes;
    this.names = cmds;
    this.action = action;

    this.usage = [this.names[0]];

    if (extraInfo)
    {
        this.flags = extraInfo.flags || 0;

        if (extraInfo.usage)
        {
            this.usage = extraInfo.usage;
        }
        else
        {
            this.usage = this.names[0]; // only the first command name
            if (this.flags & vimperator.Mappings.flags.COUNT)
                this.usage = "[count]" + this.usage;
            if (this.flags & vimperator.Mappings.flags.ARGUMENT)
                this.usage += " {arg}";
            this.usage = [this.usage]; // FIXME: usage an array - needed for the help
        }

        this.help = extraInfo.help || null;
        this.shortHelp = extraInfo.shortHelp || null;

        this.rhs = extraInfo.rhs || null;
        this.noremap = extraInfo.noremap || false; // XXX: needed for mkv; providing feedkeys true/false still neded?

        // TODO: are these limited to HINTS mode?
        // Only set for hints maps
        this.cancelMode = extraInfo.cancelMode || false;
        this.alwaysActive = extraInfo.alwaysActive || false;
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

    function mappingsIterator(mode, stack)
    {
        var mappings = stack[mode];

        for (var i = 0; i < mappings.length; i++)
            yield mappings[i];

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
            return mappingsIterator(vimperator.modes.NORMAL, main);
        },

        // FIXME:
        getDefaultIterator: function (mode)
        {
            return mappingsIterator(mode, main);
        },

        // FIXME:
        getUserIterator: function (mode)
        {
            return mappingsIterator(mode, user);
        },

        hasMap: function (mode, cmd)
        {
            return userMaps.some(function (map) { return map.hasName(cmd); });
        },

        add: function (map)
        {
            for (var i = 0; i < map.names.length; i++)
            {
                // only store keysyms with uppercase modifier strings
                map.names[i] = map.names[i].replace(/[casm]-/g, function (name) { return name.toUpperCase(); });
                for (var j = 0; j < map.modes.length; j++)
                    removeMap(map.modes[j], map.names[i]);
            }

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

        // TODO: move default maps to their own v.normal namespace
        getDefault: function (mode, cmd)
        {
            return getMap(mode, cmd, main);
        },

        // returns an array of mappings with names which start with "cmd"
        getCandidates: function (mode, cmd)
        {
            var mappings = user[mode].concat(main[mode]);
            var matches = [];

            for (var i = 0; i < mappings.length; i++)
            {
                var map = mappings[i];
                for (var j = 0; j < map.names.length; j++)
                {
                    if (map.names[j].indexOf(cmd) == 0)
                    {
                        // for < only return a candidate if it doesn't look like a <c-x> mapping
                        if (cmd != "<" || !/^<.+>/.test(map.names[j]))
                            matches.push(map);
                    }
                }
            }

            return matches;
        },

        list: function (mode, filter)
        {
            var maps = user[mode];

            if (!maps || maps.length == 0)
            {
                vimperator.echo("No mappings found");
                return;
            }

            var list = "<table>";
            for (var i = 0; i < maps.length; i++)
            {
                for (var j = 0; j < maps[i].names.length; j++)
                {
                    list += "<tr>";
                    list += "<td> " + vimperator.util.escapeHTML(maps[i].names[j]) + "</td>";
                    if (maps[i].rhs)
                        list += "<td> " + (maps[i].noremap ? "*" : " ") + "</td>" + "<td>" + vimperator.util.escapeHTML(maps[i].rhs) + "</td>";
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
                    vimperator.modes.CARET,
                    vimperator.modes.TEXTAREA];

    var noninsertModes = [vimperator.modes.NORMAL,
                          vimperator.modes.VISUAL,
                          vimperator.modes.HINTS,
                          vimperator.modes.CARET,
                          vimperator.modes.TEXTAREA];

    //
    // NORMAL mode
    // {{{

    // vimperator management
    addDefaultMap(new vimperator.Map(allModes, ["<F1>"],
        function () { vimperator.help(null); },
        {
            shortHelp: "Open help window",
            help: "The default section is shown, if you need help for a specific topic, try <code class=\"command\">:help &lt;F1&gt;</code>."
        }
    ));
    addDefaultMap(new vimperator.Map(allModes, ["<Esc>", "<C-[>"],
        vimperator.events.onEscape,
        {
            shortHelp: "Focus content",
            help: "Exits any command line or hint mode and returns to browser mode.<br/>" +
                  "Also focuses the web page, in case a form field has focus and eats our key presses."
        }
    ));
    addDefaultMap(new vimperator.Map(noninsertModes, [":"],
        function () { vimperator.commandline.open(":", "", vimperator.modes.EX); },
        {
            shortHelp: "Start command line mode",
            help: "In command line mode, you can perform extended commands, which may require arguments."
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["i", "<Insert>"],
        function ()
        {
            // setting this option triggers an observer
            // which takes care of the mode setting
            vimperator.options.setFirefoxPref("accessibility.browsewithcaret", true);
        },
        {
            shortHelp: "Start caret mode",
            help: "This mode resembles the Vim normal mode where you see a text cursor and can move around. " +
            "If you want to select text in this mode, press <code class=\"mapping\">v</code> to start its Visual mode."
        }
    ));
    addDefaultMap(new vimperator.Map(allModes, ["<C-q>"],
        function () { vimperator.modes.passAllKeys = true; },
        {
            shortHelp: "Temporarily quit Vimperator mode",
            help: "Disable all Vimperator keys except <code class=\"mapping\">&lt;Esc&gt;</code> and pass them to the next event handler.<br/>" +
                  "This is especially useful, if JavaScript controlled forms like the RichEdit form fields of GMail don't work anymore.<br/>"  +
                  "To exit this mode, press <code class=\"mapping\">&lt;Esc&gt;</code>. If you also need to pass <code class=\"mapping\">&lt;Esc&gt;</code>" +
                  "in this mode to the web page, prepend it with <code class=\"mapping\">&lt;C-v&gt;</code>."
        }
    ));
    addDefaultMap(new vimperator.Map(allModes, ["<C-v>"],
        function () { vimperator.modes.passNextKey = true; },
        {
            shortHelp: "Pass through next key",
            help: "If you need to pass a certain key to a JavaScript form field or another extension prefix the key with <code class=\"mapping\">&lt;C-v&gt;</code>.<br/>" +
                  "Also works to unshadow Firefox shortcuts like <code class=\"mapping\">&lt;C-o&gt;</code> which are otherwise hidden in Vimperator.<br/>" +
                  "When Vimperator mode is temporarily disabled with <code class=\"mapping\">&lt;C-q&gt;</code>, <code class=\"mapping\">&lt;C-v&gt;</code> will pass the next key to Vimperator instead of the web page."
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["<C-c>"],
        BrowserStop,
        {
            shortHelp: "Stop loading",
            help: "Stops loading the current web page."
        }
    ));
    addDefaultMap(new vimperator.Map(allModes, ["<Nop>"],
        function () { return; },
        {
            shortHelp: "Do nothing",
            help: "This command is useful for disabling a specific mapping. " +
                  "<code class=\"command\">:map &lt;C-n&gt; &lt;Nop&gt;</code> will prevent <code class=\"mapping\">&lt;C-n&gt;</code> from doing anything."
        }
    ));

    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["]f"],
        function (count) { vimperator.buffer.shiftFrameFocus(count > 1 ? count : 1, true); },
        {
            shortHelp: "Focus next frame",
            help: "Transfers keyboard focus to the <code class=\"argument\">[count]</code>th next frame in order. The newly focused frame is briefly colored red. Does not wrap.",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["[f"],
        function (count) { vimperator.buffer.shiftFrameFocus(count > 1 ? count : 1, false); },
        {
            shortHelp: "Focus previous frame",
            help: "Transfers keyboard focus to the <code class=\"argument\">[count]</code>th previous frame in order. The newly focused frame is briefly colored red. Does not wrap.",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["]]"],
        function (count) { vimperator.buffer.followDocumentRelationship("next"); },
        {
            shortHelp: "go to 'next' or '>' if it exists.  Beep otherwise.",
            help: "Opens link labeled with next or >.  Useful when browsing forums or documentation.  Change nextpattern to modify its behaviour.  It follows relations between files too.",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["[["],
        function (count) { vimperator.buffer.followDocumentRelationship("previous"); },
        {
            shortHelp: "go to 'prev', 'previous' or '<' if it exists.  Beep otherwise.",
            help: "Opens link labeled with prev, previous or <.  Useful when browsing forums or documentation.  Change nextpattern to modify its behaviour.  It follows relations between files too.",
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
        {
            shortHelp: "Open a prompt to bookmark the current URL",
            help: "Look at <code class='command'>:bmark</code> for more information."
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["A"],
        function () { vimperator.bookmarks.toggle(vimperator.buffer.URL); },
        {
            shortHelp: "Toggle bookmarked state of current URL",
            help: "Add/remove a bookmark for the current location, depending if it already is bookmarked or not."
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["b"],
        function () { vimperator.commandline.open(":", "buffer! ", vimperator.modes.EX); },
        {
            shortHelp: "Open a prompt to switch buffers",
            help: "Typing the corresponding number switches to this buffer."
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["B"],
        function () { vimperator.buffer.list(true); },
        {
            shortHelp: "Toggle buffer list",
            help: "Toggles the display of the buffer list which shows all opened tabs.<br/>" +
                  "WARNING: This mapping may be removed/changed in future."
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["gb"],
        function (count) { vimperator.buffer.switchTo(null, null, count, false); },
        {
            shortHelp: "Repeat last :buffer[!] command",
            help: "This is useful to quickly jump between buffers which have a similar URL or title.",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["gB"],
        function (count) { vimperator.buffer.switchTo(null, null, count, true); },
        {
            shortHelp: "Repeat last :buffer[!] command in reverse direction",
            help: "Just like <code class=\"mapping\">gb</code> but in the other direction.",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["d"],
        function (count) { vimperator.tabs.remove(getBrowser().mCurrentTab, count, false, 0); },
        {
            shortHelp: "Delete current buffer (=tab)",
            help: "Count is supported, <code class=\"mapping\">2d</code> removes the current and next tab and the one to the right is selected. " +
                  "Does not wrap if <code class=\"argument\">[count]</code> is larger than available tabs to the right.",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["D"],
        function (count) { vimperator.tabs.remove(getBrowser().mCurrentTab, count, true, 0); },
        {
            shortHelp: "Delete current buffer (=tab)",
            help: "Count is supported, <code class=\"mapping\">2D</code> removes the current and previous tab and the one to the left is selected. " +
                  "Does not wrap if <code class=\"argument\">[count]</code> is larger than available tabs to the left.",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["~"],
        function () { vimperator.open("~"); },
        {
            shortHelp: "Open home directory",
            help: "You can also use the hints to create the probably fastest file browser on earth."
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["gh"],
        BrowserHome,
        {
            shortHelp: "Go home",
            help: "Opens the homepage in the current tab."
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["gH"],
        function ()
        {
            var homepages = gHomeButton.getHomePage();
            vimperator.open(homepages, /\bhomepage\b/.test(vimperator.options["activate"]) ?
                    vimperator.NEW_TAB : vimperator.NEW_BACKGROUND_TAB);
        },
        {
            shortHelp: "Go home in a new tab",
            help: "Opens the homepage in a new tab. " +
                  "Whether the new tab is activated or not depends on the <code class=\"option\">'activate'</code> option.<br/>"
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["gi"],
        function ()
        {
            if (vimperator.buffer.lastInputField)
                vimperator.buffer.lastInputField.focus();
            else // TODO: Focus first input field on page, or beep if none found
                vimperator.beep();
        },
        {
            shortHelp: "Focus last used input field"
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["go"],
        function (arg) { vimperator.quickmarks.jumpTo(arg, vimperator.CURRENT_TAB); },
        {
            shortHelp: "Jump to a QuickMark in the current tab",
            usage: ["go{a-zA-Z0-9}"],
            help: "Open any QuickMark in the current tab. You can mark any URLs with <code class=\"mapping\">M{a-zA-Z0-9}</code>. " +
                  "These QuickMarks are persistent across browser sessions.",
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
            usage: ["gn{a-zA-Z0-9}"],
            help: "Works like <code class=\"mapping\">go{a-zA-Z0-9}</code> but opens the QuickMark in a new tab. " +
                   "Whether the new tab is activated or not depends on the <code class=\"option\">'activate'</code> option.<br/>" +
                   "Mnemonic: Go in a new tab. <code class=\"mapping\">gt</code> would make more sense but is already taken.",
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
        {
            shortHelp: "Open (put) a URL based on the current clipboard contents in a new buffer",
            help: "Works like <code class=\"mapping\">P</code>, but inverts the <code class=\"option\">'activate'</code> option."
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["gt", "<C-n>", "<C-Tab>", "<C-PageDown>"],
        function (count) { vimperator.tabs.select(count > 0 ? count - 1: "+1", count > 0 ? false : true); },
        {
            shortHelp: "Go to the next tab",
            help: "Cycles to the first tab, when the last is selected.<br/>Count is supported: <code class=\"mapping\">3gt</code> goes to the third tab.",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["gT", "<C-p>", "<C-S-Tab>", "<C-PageUp>"],
        function (count) { vimperator.tabs.select("-" + (count < 1 ? 1 : count), true); },
        {
            shortHelp: "Go {count} pages back",
            help: "Wraps around from the first tab to the last tab.<br/>Count is supported: <code class=\"mapping\">3gT</code> goes three tabs back.",
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
        {
            shortHelp: "Select the alternate tab",
            usage: ["<C-^>"],
            help: "The alternate tab is the last selected tab. This provides a quick method of toggling between two tabs."
        }
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
            usage: ["m{a-zA-Z}"],
            help: "Marks a-z are local to the buffer, whereas A-Z are valid between buffers.",
            flags: vimperator.Mappings.flags.ARGUMENT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["'", "`"],
        function (arg) { vimperator.marks.jumpTo(arg); },
        {
            shortHelp: "Jump to the mark in the current buffer",
            usage: ["'{a-zA-Z}"],
            help: "Marks a-z are local to the buffer, whereas A-Z are valid between buffers.",
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
            usage: ["M{a-zA-Z0-9}"],
            help: "You can go to a marked URL in the current tab with <code class=\"mapping\">go{a-zA-Z0-9}</code> or in a new tab with <code class=\"mapping\">gn{a-zA-Z0-9}</code>. " +
                  "These QuickMarks are persistent across browser sessions.",
            flags: vimperator.Mappings.flags.ARGUMENT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["o"],
        function () { vimperator.commandline.open(":", "open ", vimperator.modes.EX); },
        {
            shortHelp: "Open one or more URLs in the current tab",
            help: "See <code class=\"command\">:open</code> for more details."
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["O"],
        function () { vimperator.commandline.open(":", "open " + vimperator.buffer.URL, vimperator.modes.EX); },
        {
            shortHelp: "Open one or more URLs in the current tab, based on current location",
            help: "Works like <code class=\"mapping\">o</code>, but preselects current URL in the <code class=\"command\">:open</code> query."
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["p", "<MiddleMouse>"],
        function () { vimperator.open(readFromClipboard()); },
        {
            shortHelp: "Open (put) a URL based on the current clipboard contents in the current buffer",
            help: "You can also just select (for non-X11 users: copy) some non-URL text, and search for it with the default search engine or keyword (specified by the <code class=\"option\">'defsearch'</code> option) with <code class=\"mapping\">p</code>."
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["P"],
        function ()
        {
            vimperator.open(readFromClipboard(),
                /\bpaste\b/.test(vimperator.options["activate"]) ?
                vimperator.NEW_TAB : vimperator.NEW_BACKGROUND_TAB);
        },
        {
            shortHelp: "Open (put) a URL based on the current clipboard contents in a new buffer",
            help: "Works like <code class=\"mapping\">p</code>, but opens a new tab.<br/>" +
                  "Whether the new buffer is activated, depends on the <code class=\"option\">'activate'</code> option."
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["<C-l>"],
        function (count) { vimperator.commands.redraw(); },
        {
            shortHelp: "Redraw the screen",
            help: "Works like <code class=\"command\">:redraw</code>.",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["r"],
        function () { vimperator.tabs.reload(getBrowser().mCurrentTab, false); },
        {
            shortHelp: "Reload",
            help: "Forces reloading of the current page."
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["R"],
        function () { vimperator.tabs.reload(getBrowser().mCurrentTab, true); },
        {
            shortHelp: "Reload while skipping the cache",
            help: "Forces reloading of the current page skipping the cache."
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["t"],
        function () { vimperator.commandline.open(":", "tabopen ", vimperator.modes.EX); },
        {
            shortHelp: "Open one or more URLs in a new tab",
            help: "Like <code class=\"mapping\">o</code> but open URLs in a new tab.<br/>" +
                  "See <code class=\"command\">:tabopen</code> for more details."
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["T"],
        function () { vimperator.commandline.open(":", "tabopen " + vimperator.buffer.URL, vimperator.modes.EX); },
        {
            shortHelp: "Open one or more URLs in a new tab, based on current location",
            help: "Works like <code class=\"mapping\">t</code>, but preselects current URL in the <code class=\"command\">:tabopen</code> query."
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["u"],
        function (count) { vimperator.commands.undo("", false, count); },
        {
            shortHelp: "Undo closing of a tab",
            help: "If a count is given, don't close the last but the <code class=\"argument\">[count]</code>th last tab.",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["y"],
        function ()
        {
            var url = vimperator.buffer.URL;
            vimperator.copyToClipboard(url);
            vimperator.echo("Yanked " + url, vimperator.commandline.FORCE_SINGLELINE);
        },
        {
            shortHelp: "Yank current location to the clipboard",
            help: "When running in X11 the location is also put into the selection, which can be pasted with the middle mouse button."
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["Y"],
        function ()
        {
            var sel = window.content.document.getSelection();
            vimperator.copyToClipboard(sel);
        },
        {
            shortHelp: "Copy selected text",
            help: "The currently selected text is copied to the system clipboard."
        }
    ));

    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["zi", "+"],
        function (count) { vimperator.buffer.zoomIn(count > 1 ? count : 1, false); },
        {
            shortHelp: "Enlarge text zoom of current web page",
            help: "Mnemonic: zoom in",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["zm"],
        function (count) { vimperator.buffer.zoomIn((count > 1 ? count : 1) * 3, false); },
        {
            shortHelp: "Enlarge text zoom of current web page by a larger amount",
            help: "Mnemonic: zoom more",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["zo", "-"],
        function (count) { vimperator.buffer.zoomOut(count > 1 ? count : 1, false); },
        {
            shortHelp: "Reduce text zoom of current web page",
            help: "Mnemonic: zoom out",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["zr"],
        function (count) { vimperator.buffer.zoomOut((count > 1 ? count : 1) * 3, false); },
        {
            shortHelp: "Reduce text zoom of current web page by a larger amount",
            help: "Mnemonic: zoom reduce",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["zz"],
        function (count) { vimperator.buffer.textZoom = count > 1 ? count : 100; },
        {
            shortHelp: "Set text zoom value of current web page",
            help: "Zoom value can be between 1 and 2000%. If it is omitted, text zoom is reset to 100%.",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["zI"],
        function (count) { vimperator.buffer.zoomIn(count > 1 ? count : 1, true); },
        {
            shortHelp: "Enlarge full zoom of current web page",
            help: "Mnemonic: zoom in",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["zM"],
        function (count) { vimperator.buffer.zoomIn((count > 1 ? count : 1) * 3, true); },
        {
            shortHelp: "Enlarge full zoom of current web page by a larger amount",
            help: "Mnemonic: zoom more",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["zO"],
        function (count) { vimperator.buffer.zoomOut(count > 1 ? count : 1, true); },
        {
            shortHelp: "Reduce full zoom of current web page",
            help: "Mnemonic: zoom out",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["zR"],
        function (count) { vimperator.buffer.zoomOut((count > 1 ? count : 1) * 3, true); },
        {
            shortHelp: "Reduce full zoom of current web page by a larger amount",
            help: "Mnemonic: zoom reduce",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["zZ"],
        function (count) { vimperator.buffer.fullZoom = count > 1 ? count : 100; },
        {
            shortHelp: "Set full zoom value of current web page",
            help: "Zoom value can be between 1 and 2000%. If it is omitted, full zoom is reset to 100%.",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));

    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["ZQ"],
        function () { vimperator.quit(false); },
        {
            shortHelp: "Quit and don't save the session",
            help: "Works like <code class=\"command\">:qall</code>."
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["ZZ"],
        function () { vimperator.quit(true); },
        {
            shortHelp: "Quit and save the session",
            help: "Quit Vimperator, no matter how many tabs/windows are open. The session is stored.<br/>" +
                  "Works like <code class=\"command\">:xall</code>."
        }
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
            help: "Decrements the last number in URL by 1, or by <code class=\"argument\">count</code> if given.",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["<C-a>"],
        function (count) { incrementURL(count > 1 ? count : 1); },
        {
            shortHelp: "Increment last number in URL",
            help: "Increments the last number in URL by 1, or by <code class=\"argument\">count</code> if given.",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));

    // scrolling commands
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["0", "^"],
        function () { vimperator.buffer.scrollStart(); },
        {
            shortHelp: "Scroll to the absolute left of the document",
            help: "Unlike in Vim, <code class=\"mapping\">0</code> and <code class=\"mapping\">^</code> work exactly the same way."
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["$"],
        function () { vimperator.buffer.scrollEnd(); },
        {
            shortHelp: "Scroll to the absolute right of the document"
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["gg", "<Home>"],
        function (count) { vimperator.buffer.scrollToPercentile(count >  0 ? count : 0); },
        {
            shortHelp: "Goto the top of the document",
            help: "When used with <code class=\"argument\">[count]</code> like in <code class=\"mapping\">35gg</code>, it scrolls to 35% of the document.",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["G", "<End>"],
        function (count) { vimperator.buffer.scrollToPercentile(count >= 0 ? count : 100); },
        {
            shortHelp: "Goto the end of the document",
            help: "When used with <code class=\"argument\">[count]</code> like in <code class=\"mapping\">35G</code>, it scrolls to 35% of the document.",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["h", "<Left>"],
        function (count) { vimperator.buffer.scrollColumns(-(count > 1 ? count : 1)); },
        {
            shortHelp: "Scroll document to the left",
            help: "Count is supported: <code class=\"mapping\">10h</code> will move 10 times as much to the left.<br/>" +
                  "If the document cannot scroll more, a beep is emitted (unless <code class=\"option\">'visualbell'</code> is set).",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["j", "<Down>", "<C-e>"],
        function (count) { vimperator.buffer.scrollLines(count > 1 ? count : 1); },
        {
            shortHelp: "Scroll document down",
            help: "Count is supported: <code class=\"mapping\">10j</code> will move 10 times as much down.<br/>" +
                  "If the document cannot scroll more, a beep is emitted (unless <code class=\"option\">'visualbell'</code> is set).",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["k", "<Up>", "<C-y>"],
        function (count) { vimperator.buffer.scrollLines(-(count > 1 ? count : 1)); },
        {
            shortHelp: "Scroll document up",
            help: "Count is supported: <code class=\"mapping\">10k</code> will move 10 times as much up.<br/>" +
                  "If the document cannot scroll more, a beep is emitted (unless <code class=\"option\">'visualbell'</code> is set).",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    function scrollByScrollSize(count, direction)
    {
        if (count > 0)
            vimperator.options["scroll"] = count;

        if (vimperator.options["scroll"] > 0)
        {
            vimperator.buffer.scrollLines(vimperator.options["scroll"] * direction);
        }
        else
        {
            // scroll half a page down in pixels
            var win = document.commandDispatcher.focusedWindow;
            win.scrollBy(0, vimperator.buffer.pageHeight / 2 * direction);
        }
    }
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["<C-d>"],
        function (count) { scrollByScrollSize(count, 1); },
        {
            shortHelp: "Scroll window downwards in the buffer",
            help: "The number of lines is set by the <code class=\"option\">'scroll'</code> option which defaults to half a page. " +
                  "If <code class=\"argument\">[count]</code> is given <code class=\"option\">'scroll'</code> is first set to this value.",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["<C-u>"],
        function (count) { scrollByScrollSize(count, -1); },
        {
            shortHelp: "Scroll window upwards in the buffer",
            help: "The number of lines is set by the <code class=\"option\">'scroll'</code> option which defaults to half a page. " +
                  "If <code class=\"argument\">[count]</code> is given <code class=\"option\">'scroll'</code> is first set to this value.",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["l", "<Right>"],
        function (count) { vimperator.buffer.scrollColumns(count > 1 ? count : 1); },
        {
            shortHelp: "Scroll document to the right",
            help: "Count is supported: <code class=\"mapping\">10l</code> will move 10 times as much to the right.<br/>" +
                  "If the document cannot scroll more, a beep is emitted (unless <code class=\"option\">'visualbell'</code> is set).",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["<C-b>", "<PageUp>", "<S-Space>"],
        function (count) { vimperator.buffer.scrollPages(-(count > 1 ? count : 1)); },
        {
            shortHelp: "Scroll up a full page",
            help: "Scroll window <code class=\"argument\">[count]</code> pages Backwards (upwards) in the buffer.",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["<C-f>", "<PageDown>", "<Space>"],
        function (count) { vimperator.buffer.scrollPages(count > 1 ? count : 1); },
        {
            shortHelp: "Scroll down a full page",
            help: "Scroll window <code class=\"argument\">[count]</code> pages Forwards (downwards) in the buffer.",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));

    // page info
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["<C-g>"],
        function (count) { vimperator.buffer.pageInfo(false); },
        {
            shortHelp: "Print the current file name",
            help: "Also shows some additional file information like file size or the last modified date. " +
                  "If <code class='argument'>{count}</code> is given print the current file name with full path.",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["g<C-g>"],
        function (count) { vimperator.buffer.pageInfo(true); },
        {
            shortHelp: "Print file information",
            help: "Same as <code class='command'>:pa[geinfo]</code>."
        }
    ));


    // history manipulation and jumplist
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["<C-o>"],
        function (count) { vimperator.history.stepTo(-(count > 1 ? count : 1)); },
        {
            shortHelp: "Go to an older position in the jump list",
            help: "The jump list is just the browser history for now.",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["<C-i>"],
        function (count) { vimperator.history.stepTo(count > 1 ? count : 1); },
        {
            shortHelp: "Go to a newer position in the jump list",
            help: "The jump list is just the browser history for now.",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["H", "<A-Left>", "<M-Left>"],
        function (count) { vimperator.history.stepTo(-(count > 1 ? count : 1)); },
        {
            shortHelp: "Go back in the browser history",
            help: "Count is supported: <code class=\"mapping\">3H</code> goes back 3 steps.",
            flags: vimperator.Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["L", "<A-Right>", "<M-Right>"],
        function (count) { vimperator.history.stepTo(count > 1 ? count : 1); },
        {
            shortHelp: "Go forward in the browser history",
            help: "Count is supported: <code class=\"mapping\">3L</code> goes forward 3 steps.",
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
                    url = url.replace(/^(.*?:)(.*?)([^\/]+\/*)$/, "$1$2/")
                else
                    url = url.replace(/^(.*?:)(.*?)(\/+[^\/]+)$/, "$1$2/")
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
            help: "Count is supported: <code class=\"mapping\">2gu</code> on <code>http://www.example.com/dir1/dir2/file.htm</code> would open <code>http://www.example.com/dir1/</code>.",
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
        {
            shortHelp: "Go to the root of the website",
            help: "<code class=\"mapping\">gU</code> on <code>http://www.example.com/dir1/dir2/file.htm</code> opens <code>http://www.example.com/</code>.<br/>" +
                  "When browsing a local directory, it goes to the root directory."
        }
    ));

    // hint managment
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["f"],
        function () { vimperator.hints.show(vimperator.modes.QUICK_HINT); },
        {
            shortHelp: "Start QuickHint mode",
            usage: ["f{hint}"],
            help: "In QuickHint mode, every hintable item (according to the <code class=\"option\">'hinttags'</code> XPath query) is assigned a unique number (FIXME: numbers shown, but not usable yet).<br/>" +
                  "You can now either type this number or type any part of the URL which you want to follow, and it is followed as soon as it can be uniquely identified. " +
                  "Often it is can be useful to combine these techniques to narrow down results with some letters, and then typing a single digit to make the match unique.<br/>" +
                  "<code class=\"mapping\">&lt;Esc&gt;</code> stops this mode at any time."
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["F"],
        function () { vimperator.hints.show(vimperator.modes.QUICK_HINT, "t"); },
        {
            shortHelp: "Start QuickHint mode, but open link in a new tab",
            usage: ["F{hint}"],
            help: "Like normal QuickHint mode (activated with <code class='mapping'>f</code>) but opens the link in a new tab."
        }
    ));
//    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["F"],
//        function () { vimperator.echo("Always HINT mode not available anymore"); },
//        {
//            shortHelp: "Start AlwaysHint mode (CURRENTLY DISABLED)",
//            help: "In AlwaysHint mode, every hintable item (according to the <code class=\"option\">'hinttags'</code> XPath query) is assigned a label.<br/>" +
//                  "If you then press the keys for a label, it is followed as soon as it can be uniquely identified. Labels stay active after following a hint in this mode, press <code class=\"mapping\">&lt;Esc&gt;</code> to stop this mode.<br/>" +
//                  "This hint mode is especially useful for browsing large sites like Forums as hints are automatically regenerated when switching to a new document.<br/>" +
//                  "Also, most <code class=\"mapping\">Ctrl</code>-prefixed shortcut keys are available in this mode for navigation."
//        }
//    ));
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
            usage: [";{mode}{hint}"],
            help: "ExtendedHint mode is useful, since in this mode you can yank link locations, open them in a new window or save images.<br/>" +
                  "If you want to yank the location of hint <code>24</code>, press <code class=\"mapping\">;y</code> to start this hint mode. " +
                  "Then press <code>24</code> to copy the hint location.<br/><br/>" +
                  "<code class='argument'>{mode}</code> can be either one of:<br/>" +
                  "<ul>" +
                  "<li><code class=\"mapping\">;</code> to focus a link and hover it with the mouse</li>" +
                  "<li><code class=\"mapping\">a</code> to save its destination (prompting for save location)</li>" +
                  "<li><code class=\"mapping\">s</code> to save its destination</li>" +
                  "<li><code class=\"mapping\">o</code> to open its location in the current tab</li>" +
                  "<li><code class=\"mapping\">t</code> to open its location in a new tab</li>" +
                  "<li><code class=\"mapping\">O</code> to open its location in an <code class=\"command\">:open</code> query</li>" +
                  "<li><code class=\"mapping\">T</code> to open its location in a <code class=\"command\">:tabopen</code> query</li>" +
                  "<li><code class=\"mapping\">w</code> to open its destination in a new window</li>" +
                  "<li><code class=\"mapping\">W</code> to open its location in a <code class=\"command\">:winopen</code> query</li>" +
                  "<li><code class=\"mapping\">y</code> to yank its location</li>" +
                  "<li><code class=\"mapping\">Y</code> to yank its text description</li>" +
                  "</ul>" +
                  "Additionally there are two <code class='argument'>{mode}</code>s, which will start an AlwaysHint mode:<br/>" +
                  "<ul>" +
                  "<li><code class=\"mapping\">f</code> to open its location in the current tab</li>" +
                  "<li><code class=\"mapping\">F</code> to open its location in a new tab</li>" +
                  "</ul>" +
                  "These work like the <code class='mapping'>f</code> or <code class='mapping'>F</code> mappings but will keep you in AlwaysHint mode. " +
                  "This is useful if you want to open many links of one page without pressing <code class='mapping'>f</code> or <code class='mapping'>F</code> each time.<br/>" +
                  "Hintable elements for all extended hint modes can be set in the <code class=\"option\">'extendedhinttags'</code> XPath string.",
            flags: vimperator.Mappings.flags.ARGUMENT
        }
    ));

    // search management
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["/"],
        function () { vimperator.search.openSearchDialog(vimperator.modes.SEARCH_FORWARD); },
        {
            shortHelp: "Search forward for a pattern",
            usage: ["/{pattern}[/]<CR>"],
            help: "Search forward for the first occurrence of <code class=\"argument\">{pattern}</code>.<br/>" +
                  "If \"\\c\" appears anywhere in the pattern the whole pattern is handled as though <code class=\"option\">'ignorecase'</code> is on. " +
                  "\"\\C\" forces case-sensitive matching for the whole pattern.<br/>" +
                  "If \"\\l\" appears in the pattern only the text of links is searched for a match as though <code class=\"option\">'linksearch'</code> is on. " +
                  "\"\\L\" forces the entire page to be searched for a match."
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["?"],
        function () { vimperator.search.openSearchDialog(vimperator.modes.SEARCH_BACKWARD); },
        {
            shortHelp: "Search backwards for a pattern",
            usage: ["?{pattern}[?]<CR>"],
            help: "Search backward for the first occurrence of <code class=\"argument\">{pattern}</code>.<br/>" +
                  "If \"\\c\" appears anywhere in the pattern the whole pattern is handled as though <code class=\"option\">'ignorecase'</code> is on. " +
                  "\"\\C\" forces case-sensitive matching for the whole pattern.<br/>" +
                  "If \"\\l\" appears in the pattern only the text of links is searched for a match as though <code class=\"option\">'linksearch'</code> is on. " +
                  "\"\\L\" forces the entire page to be searched for a match.<br/>" +
                  "NOTE: incremental searching currently only works in the forward direction."
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["n"],
        function () { vimperator.search.findAgain(false); },
        {
            shortHelp: "Find next",
            help: "Repeat the last search 1 time (until count is supported)."
        }
    ));
    addDefaultMap(new vimperator.Map([vimperator.modes.NORMAL], ["N"],
        function () { vimperator.search.findAgain(true); },
        {
            shortHelp: "Find previous",
            help: "Repeat the last search 1 time (until count is supported) in the opposite direction."
        }
    ));

    // }}}
    // HINTS mode
    // {{{

//    // action keys
//    addDefaultMap(new vimperator.Map([vimperator.modes.HINTS], ["o"],
//        function () { vimperator.hints.openHints(false, false); },
//        {
//            cancelMode: true,
//            alwaysActive: false
//        }
//    ));
//    addDefaultMap(new vimperator.Map([vimperator.modes.HINTS], ["t"],
//        function () { vimperator.hints.openHints(true,  false); },
//        {
//            cancelMode: true,
//            alwaysActive: false
//        }
//    ));
//    addDefaultMap(new vimperator.Map([vimperator.modes.HINTS], ["<C-w>"],
//        function () { vimperator.hints.openHints(false, true ); },
//        {
//            cancelMode: true,
//            alwaysActive: false
//        }
//    ));
//    addDefaultMap(new vimperator.Map([vimperator.modes.HINTS], ["s"],
//        function () { vimperator.hints.saveHints(true); },
//        {
//            cancelMode: true,
//            alwaysActive: false
//        }
//    ));
//    addDefaultMap(new vimperator.Map([vimperator.modes.HINTS], ["a"],
//        function () { vimperator.hints.saveHints(false); },
//        {
//            cancelMode: true,
//            alwaysActive: false
//        }
//    ));
//    addDefaultMap(new vimperator.Map([vimperator.modes.HINTS], ["y"],
//        function () { vimperator.hints.yankUrlHints(); },
//        {
//            cancelMode: true,
//            alwaysActive: false
//        }
//    ));
//    addDefaultMap(new vimperator.Map([vimperator.modes.HINTS], ["Y"],
//        function () { vimperator.hints.yankTextHints(); },
//        {
//            cancelMode: true,
//            alwaysActive: false
//        }
//    ));
//    addDefaultMap(new vimperator.Map([vimperator.modes.HINTS], [","],
//        function () { vimperator.input.buffer += ","; vimperator.hints.setCurrentState(0); },
//        {
//            cancelMode: false,
//            alwaysActive: true
//        }
//    ));
//    addDefaultMap(new vimperator.Map([vimperator.modes.HINTS], [":"],
//        function () { vimperator.commandline.open(":", "", vimperator.modes.EX); },
//        {
//            cancelMode: false,
//            alwaysActive: true
//        }
//    ));
//
//    // movement keys
//    addDefaultMap(new vimperator.Map([vimperator.modes.HINTS], ["<C-e>"],
//        function (count) { vimperator.buffer.scrollLines(count > 1 ? count : 1); },
//        {
//            cancelMode: false,
//            alwaysActive: true,
//            flags: vimperator.Mappings.flags.COUNT
//        }
//    ));
//    addDefaultMap(new vimperator.Map([vimperator.modes.HINTS], ["<C-y>"],
//        function (count) { vimperator.buffer.scrollLines(-(count > 1 ? count : 1)); },
//        {
//            cancelMode: false,
//            alwaysActive: true,
//            flags: vimperator.Mappings.flags.COUNT
//        }
//    ));
//    addDefaultMap(new vimperator.Map([vimperator.modes.HINTS], ["<Home>"],
//        function () { vimperator.buffer.scrollTop(); },
//        {
//            cancelMode: false,
//            alwaysActive: true
//        }
//    ));
//    addDefaultMap(new vimperator.Map([vimperator.modes.HINTS], ["<End>"],
//        function () { vimperator.buffer.scrollBottom(); },
//        {
//            cancelMode: false,
//            alwaysActive: true
//        }
//    ));
//    addDefaultMap(new vimperator.Map([vimperator.modes.HINTS], ["<PageUp>", "<C-b>"],
//        function (count) { vimperator.buffer.scrollPages(-(count > 1 ? count : 1)); },
//        {
//            cancelMode: false,
//            alwaysActive: true,
//            flags: vimperator.Mappings.flags.COUNT
//        }
//    ));
//    addDefaultMap(new vimperator.Map([vimperator.modes.HINTS], ["<PageDown>", "<C-f>"],
//        function (count) { vimperator.buffer.scrollPages(count > 1 ? count : 1); },
//        {
//            cancelMode: false,
//            alwaysActive: true,
//            flags: vimperator.Mappings.flags.COUNT
//        }
//    ));
//    addDefaultMap(new vimperator.Map([vimperator.modes.HINTS], ["<Left>"],
//        function () { vimperator.buffer.scrollColumns(-(count > 1 ? count : 1)); },
//        {
//            cancelMode: false,
//            alwaysActive: true,
//            flags: vimperator.Mappings.flags.COUNT
//        }
//    ));
//    addDefaultMap(new vimperator.Map([vimperator.modes.HINTS], ["<Down>"],
//        function () { vimperator.buffer.scrollLines(count > 1 ? count : 1); },
//        {
//            cancelMode: false,
//            alwaysActive: true,
//            flags: vimperator.Mappings.flags.COUNT
//        }
//    ));
//    addDefaultMap(new vimperator.Map([vimperator.modes.HINTS], ["<Up>"],
//        function () { vimperator.buffer.scrollLines(-(count > 1 ? count : 1)); },
//        {
//            cancelMode: false,
//            alwaysActive: true,
//            flags: vimperator.Mappings.flags.COUNT
//        }
//    ));
//    addDefaultMap(new vimperator.Map([vimperator.modes.HINTS], ["<Right>"],
//        function () { vimperator.buffer.scrollColumns(count > 1 ? count : 1); },
//        {
//            cancelMode: false,
//            alwaysActive: true,
//            flags: vimperator.Mappings.flags.COUNT
//        }
//    ));
//
//    // tab management
//    addDefaultMap(new vimperator.Map([vimperator.modes.HINTS], ["<C-n>"],
//        function () { vimperator.tabs.select("+1", true); },
//        {
//            cancelMode: true,
//            alwaysActive: true
//        }
//    )); // same as gt, but no count supported
//    addDefaultMap(new vimperator.Map([vimperator.modes.HINTS], ["<C-p>"],
//        function () { vimperator.tabs.select("-1", true); },
//        {
//            cancelMode: true,
//            alwaysActive: true
//        }
//    ));
//
//    // navigation
//    addDefaultMap(new vimperator.Map([vimperator.modes.HINTS], ["<C-o>"],
//        function (count) { vimperator.history.stepTo(count > 0 ? -count : -1); },
//        {
//            cancelMode: false,
//            alwaysActive: true,
//            flags: vimperator.Mappings.flags.COUNT
//        }
//    ));
//    addDefaultMap(new vimperator.Map([vimperator.modes.HINTS], ["<C-i>"],
//        function (count) { vimperator.history.stepTo(count > 1 ? count : 1); },
//        {
//            cancelMode: false,
//            alwaysActive: true,
//            flags: vimperator.Mappings.flags.COUNT
//        }
//    ));
//    addDefaultMap(new vimperator.Map([vimperator.modes.HINTS], ["<C-h>"],
//        function (count) { vimperator.history.stepTo(count > 0 ? -count : -1); },
//        {
//            cancelMode: false,
//            alwaysActive: true,
//            flags: vimperator.Mappings.flags.COUNT
//        }
//    ));
//    addDefaultMap(new vimperator.Map([vimperator.modes.HINTS], ["<C-l>"],
//        function (count) { vimperator.history.stepTo(count > 1 ? count : 1); },
//        {
//            cancelMode: false,
//            alwaysActive: true,
//            flags: vimperator.Mappings.flags.COUNT
//        }
//    ));
//    addDefaultMap(new vimperator.Map([vimperator.modes.HINTS], ["<C-d>"],
//        function () { vimperator.tabs.remove(getBrowser().mCurrentTab, vimperator.input.count, false, 0); },
//        {
//            cancelMode: true,
//            alwaysActive: true
//        }
//    ));
//
//    // cancelMode hint mode keys
//    addDefaultMap(new vimperator.Map([vimperator.modes.HINTS], ["<C-c>"],
//        function () { ; },
//        {
//            cancelMode: true,
//            alwaysActive: true
//        }
//    ));
//    addDefaultMap(new vimperator.Map([vimperator.modes.HINTS], ["<C-g>"],
//        function () { ; },
//        {
//            cancelMode: true,
//            alwaysActive: true
//        }
//    ));
//    addDefaultMap(new vimperator.Map([vimperator.modes.HINTS], ["<C-[>"],
//        function () { ; },
//        {
//            cancelMode: true,
//            alwaysActive: true
//        }
//    ));

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
        {
            shortHelp: "Start visual mode",
            help: "Works for caret mode and textarea mode."
        }
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
                vimperator.beep(); // TODO: yanking is possible for caret mode
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
    addDefaultMap(new vimperator.Map([vimperator.modes.INSERT, vimperator.modes.TEXTAREA], ["<Space>", "<Tab>", "<Return>"],
        function () { return vimperator.editor.expandAbbreviation("i"); },
        { flags: vimperator.Mappings.flags.ALLOW_EVENT_ROUTING }
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
    addDefaultMap(new vimperator.Map([vimperator.modes.COMMAND_LINE],
        ["<C-]>", "<C-5>"], function () { vimperator.editor.expandAbbreviation("c"); }, { }
    ));

    //}}} }}}

    return mappingManager;
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
