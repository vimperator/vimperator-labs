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

function Map(mode, cmds, action, extra_info) //{{{
{
    if (!mode || (!cmds || !cmds.length) || !action)
        return null;

    this.mode = mode;
    this.names = cmds;
    this.action = action;

    this.usage = [this.names[0]];

    if (extra_info)
    {
        this.flags = extra_info.flags || 0;

        if (extra_info.usage)
            this.usage = extra_info.usage;
        else
        {
            this.usage = this.names[0]; // only the first command name
            if (this.flags & Mappings.flags.COUNT)
                this.usage = "[count]" + this.usage;
            if (this.flags & Mappings.flags.ARGUMENT)
                this.usage += " {arg}";
            this.usage = [this.usage]; // FIXME: usage an array - needed for the help
        }

        this.help = extra_info.help || null;
        this.short_help = extra_info.short_help || null;

        this.rhs = extra_info.rhs || null;

        // TODO: are these limited to HINTS mode?
        // Only set for hints maps
        this.cancel_mode = extra_info.cancel_mode || false;
        this.always_active = extra_info.always_active || false;
    }
}

Map.prototype.hasName = function(name)
{
    for (var i = 0; i < this.names.length; i++)
    {
        if (this.names[i] == name)
            return true;
    }

    return false;
}

// Since we will add many Map-objects, we add some functions as prototypes
// this will ensure we only have one copy of each function, not one for each object
Map.prototype.execute = function(motion, count, argument)
{
    var args = [];
    if (this.flags & Mappings.flags.MOTION)
        args.push(motion);
    if (this.flags & Mappings.flags.COUNT)
        args.push(count);
    if (this.flags & Mappings.flags.ARGUMENT)
        args.push(argument);
    this.action.apply(this, args);
}
//}}}

function Mappings() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var main = []; // array of default Map() objects
    var user = []; // array of objects created by :map

    for each (var mode in vimperator.modes)
    {
        main[mode] = [];
        user[mode] = [];
    }

    function addDefaultMap(map)
    {
        if (!main[map.mode])
            main[map.mode] = [];

        main[map.mode].push(map);
    }

    function getMap(mode, cmd, stack)
    {
        //if (!stack || !stack[mode] || !stack[mode].length)
        //    return null;

        var maps = stack[mode];
        var names;

        for (var i = 0; i < maps.length; i++)
        {
            names = maps[i].names;
            for (var j = 0; j < names.length; j++)
                if (names[j] == cmd)
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
                    names.splice(j, 1)

                    if (names.length == 0)
                        maps.splice(i, 1);

                    return;
                }
            }
        }
    }

    function mappingsIterator(mode)
    {
        var mappings = main[mode];

        //// FIXME: do we want to document user commands by default?
        //mappings = user[mode].concat(main[mode]);

        for (var i = 0; i < mappings.length; i++)
            yield mappings[i];

        throw StopIteration;
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    Mappings.flags = {
        MOTION:     1 << 0,
        COUNT:      1 << 1,
        ARGUMENT:   1 << 2
    };

    // NOTE: just normal mode for now
    this.__iterator__ = function()
    {
        return mappingsIterator(vimperator.modes.NORMAL);
    }

    this.getIterator = function(mode)
    {
        return mappingsIterator(mode);
    }

    this.hasMap = function(mode, cmd)
    {
        var user_maps = user[mode];

        for (var i = 0; i < user_maps.length; i++)
        {
            if (user_maps[i].names.indexOf(cmd) != -1)
                return true;
        }

        return false;
    }

    this.add = function(map)
    {
        for (var i = 0; i < map.names.length; i++)
            removeMap(map.mode, map.names[i]);

        user[map.mode].push(map);
    }

    this.remove = function(mode, cmd)
    {
        removeMap(mode, cmd);
    }

    this.removeAll = function(mode)
    {
        user[mode] = [];
    }

    this.get = function(mode, cmd)
    {
        var map = getMap(mode, cmd, user);

        if (!map)
            map = getMap(mode, cmd, main);

        return map;
    }

    // TODO: move default maps to their own v.normal namespace
    this.getDefaultMap = function(mode, cmd)
    {
        return getMap(mode, cmd, main);
    }

    // returns an array of mappings with names which start with "cmd"
    this.getCandidates = function(mode, cmd)
    {
        var mappings = [];
        var matches = [];

        mappings = user[mode].concat(main[mode]);

        for (var i = 0; i < mappings.length; i++)
        {
            var map = mappings[i];
            for (var j = 0; j < map.names.length; j++)
            {
                if (map.names[j].indexOf(cmd) == 0)
                    matches.push(map)
            }
        }

        return matches;
    }

    // TODO: implement filtering
    this.list = function(mode, filter)
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
                list += "<td> " + vimperator.util.escapeHTML(maps[i].names[j]) + "</td>"
                if (maps[i].rhs)
                    list += "<td> " + vimperator.util.escapeHTML(maps[i].rhs) + "</td>"
                list += "</tr>";
            }
        }
        list += "</table>";

        vimperator.commandline.echo(list, vimperator.commandline.HL_NORMAL, true); // TODO: force of multiline widget a better way
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// DEFAULT MAPPINGS ////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    //
    // Normal mode
    // {{{
    // vimperator management
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["<F1>"],
        function() { vimperator.help(null); },
        {
            short_help: "Open help window",
            help: "The default section is shown, if you need help for a specific topic, try <code class=\"command\">:help &lt;F1&gt;</code>."
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, [":"],
        function() { vimperator.commandline.open(":", "", vimperator.modes.EX); },
        {
            short_help: "Start command line mode",
            help: "In command line mode, you can perform extended commands, which may require arguments."
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["I"],
        function() { vimperator.addMode(null, vimperator.modes.ESCAPE_ALL_KEYS); },
        {
            short_help: "Disable Vimperator keys",
            help: "Starts an 'ignorekeys' mode, where all keys except <code class=\"mapping\">&lt;Esc&gt;</code> are passed to the next event handler.<br/>" +
                  "This is especially useful, if JavaScript controlled forms like the RichEdit form fields of GMail don't work anymore.<br/>"  +
                  "To exit this mode, press <code class=\"mapping\">&lt;Esc&gt;</code>. If you also need to pass <code class=\"mapping\">&lt;Esc&gt;</code>" +
                  "in this mode to the web page, prepend it with <code class=\"mapping\">&lt;C-v&gt;</code>."
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["<C-v>"],
        function() { vimperator.addMode(null, vimperator.modes.ESCAPE_ONE_KEY); },
        {
            short_help: "Escape next key",
            help: "If you need to pass a certain key to a JavaScript form field or another extension prefix the key with <code class=\"mapping\">&lt;C-v&gt;</code>.<br/>" +
                  "Also works to unshadow Firefox shortcuts like <code class=\"mapping\">&lt;C-o&gt;</code> which are otherwise hidden in Vimperator.<br/>" +
                  "When in 'ignorekeys' mode (activated by <code class=\"mapping\">&lt;I&gt;</code>), <code class=\"mapping\">&lt;C-v&gt;</code> will pass the next key to Vimperator instead of the web page."
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["<C-c>"],
        BrowserStop,
        {
            short_help: "Stop loading",
            help: "Stops loading the current web page."
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["<Nop>"],
        function() { return; },
        {
            short_help: "Do nothing",
            help: "This command is useful for disabling a specific mapping. " +
                  "<code class=\"command\">:map &lt;C-n&gt; &lt;Nop&gt;</code> will prevent <code class=\"mapping\">&lt;C-n&gt;</code> from doing anything."
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["<Esc>", "<C-[>"],
        vimperator.events.onEscape,
        {
            short_help: "Focus content",
            help: "Exits any command line or hint mode and returns to browser mode.<br/>" +
                  "Also focuses the web page, in case a form field has focus and eats our key presses."
        }
    ));

    addDefaultMap(new Map(vimperator.modes.NORMAL, ["]f"],
        function(count) { vimperator.buffer.shiftFrameFocus(count > 1 ? count : 1, true); },
        {
            short_help: "Focus next frame",
            help: "Transfers keyboard focus to the <code class=\"argument\">[count]</code>th next frame in order. The newly focused frame is briefly colored red. Does not wrap.",
            flags: Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["[f"],
        function(count) { vimperator.buffer.shiftFrameFocus(count > 1 ? count : 1, false); },
        {
            short_help: "Focus previous frame",
            help: "Transfers keyboard focus to the <code class=\"argument\">[count]</code>th previous frame in order. The newly focused frame is briefly colored red. Does not wrap.",
            flags: Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["b"],
        function() { vimperator.commandline.open(":", "buffer! ", vimperator.modes.EX); },
        {
            short_help: "Open a prompt to switch buffers",
            help: "Typing the corresponding number switches to this buffer."
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["B"],
        function() { vimperator.buffer.list(true); },
        {
            short_help: "Toggle buffer list",
            help: "Toggles the display of the buffer list which shows all opened tabs.<br/>" +
                  "WARNING: This mapping may be removed/changed in future."
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["gb"],
        function(count) { vimperator.buffer.switchTo(null, null, count, false); },
        {
            short_help: "Repeat last :buffer[!] command",
            help: "This is useful to quickly jump between buffers which have a similar URL or title.",
            flags: Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["gB"],
        function(count) { vimperator.buffer.switchTo(null, null, count, true); },
        {
            short_help: "Repeat last :buffer[!] command in reverse direction",
            help: "Just like <code class=\"mapping\">gb</code> but in the other direction.",
            flags: Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["d"],
        function(count) { vimperator.tabs.remove(getBrowser().mCurrentTab, count, false, 0); },
        {
            short_help: "Delete current buffer (=tab)",
            help: "Count is supported, <code class=\"mapping\">2d</code> removes the current and next tab and the one to the right is selected. " +
                  "Does not wrap if <code class=\"argument\">[count]</code> is larger than available tabs to the right.",
            flags: Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["D"],
        function(count) { vimperator.tabs.remove(getBrowser().mCurrentTab, count, true, 0); },
        {
            short_help: "Delete current buffer (=tab)",
            help: "Count is supported, <code class=\"mapping\">2D</code> removes the current and previous tab and the one to the left is selected. " +
                  "Does not wrap if <code class=\"argument\">[count]</code> is larger than available tabs to the left.",
            flags: Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["gh"],
        BrowserHome,
        {
            short_help: "Go home",
            help: "Opens the homepage in the current tab."
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["gH"],
        function()
        {
            var homepages = gHomeButton.getHomePage();
            vimperator.open(homepages, /\bhomepage\b/.test(vimperator.options["activate"]) ?
                    vimperator.NEW_TAB : vimperator.NEW_BACKGROUND_TAB);
        },
        {
            short_help: "Go home in a new tab",
            help: "Opens the homepage in a new tab. " +
                  "Whether the new tab is activated or not depends on the <code class=\"option\">'activate'</code> option.<br/>"
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["go"],
        function(arg) { vimperator.quickmarks.jumpTo(arg, vimperator.CURRENT_TAB) },
        {
            short_help: "Jump to a QuickMark in the current tab",
            usage: ["go{a-zA-Z0-9}"],
            help: "Open any QuickMark in the current tab. You can mark any URLs with <code class=\"mapping\">M{a-zA-Z0-9}</code>. " +
                  "These QuickMarks are persistent across browser sessions.",
            flags: Mappings.flags.ARGUMENT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["gn"],
        function(arg)
        {
            vimperator.quickmarks.jumpTo(arg,
                /\bquickmark\b/.test(vimperator.options["activate"]) ?
                vimperator.NEW_TAB : vimperator.NEW_BACKGROUND_TAB);
        },
        {
            short_help: "Jump to a QuickMark in a new tab",
            usage: ["gn{a-zA-Z0-9}"],
            help: "Works like <code class=\"mapping\">go{a-zA-Z0-9}</code> but opens the QuickMark in a new tab. " +
                   "Whether the new tab is activated or not depends on the <code class=\"option\">'activate'</code> option.<br/>" +
                   "Mnemonic: Go in a new tab. <code class=\"mapping\">gt</code> would make more sense but is already taken.",
            flags: Mappings.flags.ARGUMENT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["gP"],
        function()
        {
            vimperator.open(readFromClipboard(),
                /\bpaste\b/.test(vimperator.options["activate"]) ?
                vimperator.NEW_BACKGROUND_TAB : vimperator.NEW_TAB);
        },
        {
            short_help: "Open (put) a URL based on the current clipboard contents in a new buffer",
            help: "Works like <code class=\"mapping\">P</code>, but inverts the <code class=\"option\">'activate'</code> option."
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["gt", "<C-n>", "<C-Tab>"],
        function(count) { vimperator.tabs.select(count > 0 ? count -1: "+1", count > 0 ? false : true); },
        {
            short_help: "Go to the next tab",
            help: "Cycles to the first tab, when the last is selected.<br/>Count is supported: <code class=\"mapping\">3gt</code> goes to the third tab.",
            flags: Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["gT", "<C-p>", "<C-S-Tab>"],
        function(count) { vimperator.tabs.select(count > 0 ? count -1: "-1", count > 0 ? false : true); },
        {
            short_help: "Go to the previous tab",
            help: "Cycles to the last tab, when the first is selected.<br/>Count is supported: <code class=\"mapping\">3gT</code> goes to the third tab.",
            flags: Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ['<C-^>', '<C-6>'],
        function()
        {
            if (vimperator.tabs.getTab() == vimperator.tabs.alternate)
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
                vimperator.echoerr("E86: Buffer does not exist")  // TODO: This should read "Buffer N does not exist"
            else
                vimperator.tabs.select(index);
        },
        {
            short_help: "Select the alternate tab",
            usage: ['<C-^>'],
            help: "The alternate tab is the last selected tab. This provides a quick method of toggling between two tabs."
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["m"],
        function(arg)
        {
            if (/[^a-zA-Z]/.test(arg))
            {
                vimperator.beep();
                return;
            }

            vimperator.marks.add(arg)
        },
        {
            short_help: "Set mark at the cursor position",
            usage: ["m{a-zA-Z}"],
            help: "Marks a-z are local to the buffer, whereas A-Z are valid between buffers.",
            flags: Mappings.flags.ARGUMENT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["'", "`"],
        function(arg) { vimperator.marks.jumpTo(arg) },
        {
            short_help: "Jump to the mark in the current buffer",
            usage: ["'{a-zA-Z}"],
            help: "Marks a-z are local to the buffer, whereas A-Z are valid between buffers.",
            flags: Mappings.flags.ARGUMENT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["M"],
        function(arg)
        {
            if (/[^a-zA-Z0-9]/.test(arg))
            {
                vimperator.beep();
                return;
            }

            vimperator.quickmarks.add(arg, vimperator.buffer.URL)
        },
        {
            short_help: "Add new QuickMark for current URL",
            usage: ["M{a-zA-Z0-9}"],
            help: "You can go to a marked URL in the current tab with <code class=\"mapping\">go{a-zA-Z0-9}</code> or in a new tab with <code class=\"mapping\">gn{a-zA-Z0-9}</code>. " +
                  "These QuickMarks are persistent across browser sessions.",
            flags: Mappings.flags.ARGUMENT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["o"],
        function() { vimperator.commandline.open(":", "open ", vimperator.modes.EX); },
        {
            short_help: "Open one or more URLs in the current tab",
            help: "See <code class=\"command\">:open</code> for more details."
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["O"],
        function() { vimperator.commandline.open(":", "open " + vimperator.buffer.URL, vimperator.modes.EX); },
        {
            short_help: "Open one or more URLs in the current tab, based on current location",
            help: "Works like <code class=\"mapping\">o</code>, but preselects current URL in the <code class=\"command\">:open</code> query."
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["p", "<MiddleMouse>"],
        function() { vimperator.open(readFromClipboard()); },
        {
            short_help: "Open (put) a URL based on the current clipboard contents in the current buffer",
            help: "You can also just select (for non-X11 users: copy) some non-URL text, and search for it with the default search engine or keyword (specified by the <code class=\"option\">'defsearch'</code> option) with <code class=\"mapping\">p</code>."
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["P"],
        function()
        {
            vimperator.open(readFromClipboard(),
                /\bpaste\b/.test(vimperator.options["activate"]) ?
                vimperator.NEW_TAB : vimperator.NEW_BACKGROUND_TAB);
        },
        {
            short_help: "Open (put) a URL based on the current clipboard contents in a new buffer",
            help: "Works like <code class=\"mapping\">p</code>, but opens a new tab.<br/>" +
                  "Whether the new buffer is activated, depends on the <code class=\"option\">'activate'</code> option."
        }
    ));
    addDefaultMap(new Map([vimperator.modes.NORMAL], ["<C-l>"],
        function(count) { vimperator.commands.redraw(); },
        {
            short_help: "Redraw the screen",
            help: "Works like <code class=\"command\">:redraw</code>.",
            flags: Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["r"],
        function() { vimperator.tabs.reload(getBrowser().mCurrentTab, false); },
        {
            short_help: "Reload",
            help: "Forces reloading of the current page."
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["R"],
        function() { vimperator.tabs.reload(getBrowser().mCurrentTab, true); },
        {
            short_help: "Reload while skipping the cache",
            help: "Forces reloading of the current page skipping the cache."
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["t"],
        function() { vimperator.commandline.open(":", "tabopen ", vimperator.modes.EX); },
        {
            short_help: "Open one or more URLs in a new tab",
            help: "Like <code class=\"mapping\">o</code> but open URLs in a new tab.<br/>" +
                  "See <code class=\"command\">:tabopen</code> for more details."
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["T"],
        function() { vimperator.commandline.open(":", "tabopen " + vimperator.buffer.URL, vimperator.modes.EX); },
        {
            short_help: "Open one or more URLs in a new tab, based on current location",
            help: "Works like <code class=\"mapping\">t</code>, but preselects current URL in the <code class=\"command\">:tabopen</code> query."
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["u"],
        function(count) { vimperator.commands.undo("", false, count); },
        {
            short_help: "Undo closing of a tab",
            help: "If a count is given, don't close the last but the <code class=\"argument\">[count]</code>th last tab.",
            flags: Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["y"],
        function()
        {
            var url = vimperator.buffer.URL;
            vimperator.copyToClipboard(url);
            vimperator.echo("Yanked " + url);
        },
        {
            short_help: "Yank current location to the clipboard",
            help: "When running in X11 the location is also put into the selection, which can be pasted with the middle mouse button."
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["Y"],
        function()
        {
            var sel = window.content.document.getSelection();
            vimperator.copyToClipboard(sel);
        },
        {
            short_help: "Copy selected text",
            help: "The currently selected text is copied to the system clipboard."
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["zi", "+"],
        function(count) { vimperator.buffer.zoomIn(count > 1 ? count : 1); },
        {
            short_help: "Zoom in current web page by 25%",
            flags: Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["zI"],
        function(count) { vimperator.buffer.zoomIn((count > 1 ? count : 1) * 4); },
        {
            short_help: "Zoom in current web page by 100%",
            flags: Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["zo", "-"],
        function(count) { vimperator.buffer.zoomOut(count > 1 ? count : 1); },
        {
            short_help: "Zoom out current web page by 25%",
            flags: Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["zO"],
        function(count) { vimperator.buffer.zoomOut((count > 1 ? count : 1) * 4); },
        {
            short_help: "Zoom out current web page by 100%",
            flags: Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["zz"],
        function(count) { vimperator.buffer.textZoom = count > 1 ? count : 100; },
        {
            short_help: "Set zoom value of the web page",
            help: "Zoom value can be between 1 and 2000%. If it is omitted, zoom is reset to 100%.",
            flags: Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["ZQ"],
        function() { vimperator.quit(false); },
        {
            short_help: "Quit and don't save the session",
            help: "Works like <code class=\"command\">:qall</code>."
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["ZZ"],
        function() { vimperator.quit(true); },
        {
            short_help: "Quit and save the session",
            help: "Quit Vimperator, no matter how many tabs/windows are open. The session is stored.<br/>" +
                  "Works like <code class=\"command\">:xall</code>."
        }
    ));

    // scrolling commands
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["0", "^"],
        function() { vimperator.buffer.scrollStart(); },
        {
            short_help: "Scroll to the absolute left of the document",
            help: "Unlike in Vim, <code class=\"mapping\">0</code> and <code class=\"mapping\">^</code> work exactly the same way."
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["$"],
        function() { vimperator.buffer.scrollEnd(); },
        {
            short_help: "Scroll to the absolute right of the document"
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["gg", "<Home>"],
        function(count) { vimperator.buffer.scrollToPercentile(count >  0 ? count : 0); },
        {
            short_help: "Goto the top of the document",
            help: "When used with <code class=\"argument\">[count]</code> like in <code class=\"mapping\">35gg</code>, it scrolls to 35% of the document.",
            flags: Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["G", "<End>"],
        function(count) { vimperator.buffer.scrollToPercentile(count >= 0 ? count : 100); },
        {
            short_help: "Goto the end of the document",
            help: "When used with <code class=\"argument\">[count]</code> like in <code class=\"mapping\">35G</code>, it scrolls to 35% of the document.",
            flags: Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["h", "<Left>"],
        function(count) { vimperator.buffer.scrollColumns(-(count > 1 ? count : 1)); },
        {
            short_help: "Scroll document to the left",
            help: "Count is supported: <code class=\"mapping\">10h</code> will move 10 times as much to the left.<br/>" +
                  "If the document cannot scroll more, a beep is emitted (unless <code class=\"option\">'beep'</code> is turned off).",
            flags: Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["j", "<Down>", "<C-e>"],
        function(count) { vimperator.buffer.scrollLines(count > 1 ? count : 1); },
        {
            short_help: "Scroll document down",
            help: "Count is supported: <code class=\"mapping\">10j</code> will move 10 times as much down.<br/>" +
                  "If the document cannot scroll more, a beep is emitted (unless <code class=\"option\">'beep'</code> is turned off).",
            flags: Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["k", "<Up>", "<C-y>"],
        function(count) { vimperator.buffer.scrollLines(-(count > 1 ? count : 1)); },
        {
            short_help: "Scroll document up",
            help: "Count is supported: <code class=\"mapping\">10k</code> will move 10 times as much up.<br/>" +
                  "If the document cannot scroll more, a beep is emitted (unless <code class=\"option\">'beep'</code> is turned off).",
            flags: Mappings.flags.COUNT
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
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["<C-d>"],
        function(count) { scrollByScrollSize(count, 1); },
        {
            short_help: "Scroll window downwards in the buffer",
            help: "The number of lines is set by the <code class=\"option\">'scroll'</code> option which defaults to half a page. " +
                  "If <code class=\"argument\">[count]</code> is given <code class=\"option\">'scroll'</code> is first set to this value.",
            flags: Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["<C-u>"],
        function(count) { scrollByScrollSize(count, -1); },
        {
            short_help: "Scroll window upwards in the buffer",
            help: "The number of lines is set by the <code class=\"option\">'scroll'</code> option which defaults to half a page. " +
                  "If <code class=\"argument\">[count]</code> is given <code class=\"option\">'scroll'</code> is first set to this value.",
            flags: Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["l", "<Right>"],
        function(count) { vimperator.buffer.scrollColumns(count > 1 ? count : 1); },
        {
            short_help: "Scroll document to the right",
            help: "Count is supported: <code class=\"mapping\">10l</code> will move 10 times as much to the right.<br/>" +
                  "If the document cannot scroll more, a beep is emitted (unless <code class=\"option\">'beep'</code> is turned off).",
            flags: Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["<C-b>", "<PageUp>", "<S-Space>"],
        function(count) { vimperator.buffer.scrollPages(-(count > 1 ? count : 1)); },
        {
            short_help: "Scroll up a full page",
            help: "Scroll window <code class=\"argument\">[count]</code> pages Backwards (upwards) in the buffer.",
            flags: Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["<C-f>", "<PageDown>", "<Space>"],
        function(count) { vimperator.buffer.scrollPages(count > 1 ? count : 1); },
        {
            short_help: "Scroll down a full page",
            help: "Scroll window <code class=\"argument\">[count]</code> pages Forwards (downwards) in the buffer.",
            flags: Mappings.flags.COUNT
        }
    ));

    // history manipulation and jumplist
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["<C-o>"],
        function(count) { vimperator.history.stepTo(-(count > 1 ? count : 1)); },
        {
            short_help: "Go to an older position in the jump list",
            help: "The jump list is just the browser history for now.",
            flags: Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["<C-i>"],
        function(count) { vimperator.history.stepTo(count > 1 ? count : 1); },
        {
            short_help: "Go to a newer position in the jump list",
            help: "The jump list is just the browser history for now.",
            flags: Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["H", "<A-Left>", "<M-Left>"],
        function(count) { vimperator.history.stepTo(-(count > 1 ? count : 1)); },
        {
            short_help: "Go back in the browser history",
            help: "Count is supported: <code class=\"mapping\">3H</code> goes back 3 steps.",
            flags: Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["L", "<A-Right>", "<M-Right>"],
        function(count) { vimperator.history.stepTo(count > 1 ? count : 1); },
        {
            short_help: "Go forward in the browser history",
            help: "Count is supported: <code class=\"mapping\">3L</code> goes forward 3 steps.",
            flags: Mappings.flags.COUNT
        }
    ));
    function isDirectory(url)
    {
        if (url.match(/^file:\/\//) || url.match(/^\//))
        {
            var stripedFilename = url.replace(/^(file:\/\/)?(.*)/, "$2");
            var file = vimperator.io.fopen(stripedFilename, '<');
            if (!file)
                return false;

            if (file.localFile.isDirectory())
                return true;
            else
                return false;
        }
        // for all other locations just check if the URL ends with /
        if (url.match(/\/$/))
            return true;
        else
            return false;
    }
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["gu", "<BS>"],
        function(count)
        {
            var gocmd = "";
            if (isDirectory(vimperator.buffer.URL))
                gocmd = "../";
            else
                gocmd = "./";

            if (count < 1)
                count = 1;

            for (var i = 0; i < count - 1; i++)
                gocmd += "../";

            vimperator.open(gocmd);
        },
        {
            short_help: "Go to parent directory",
            help: "Count is supported: <code class=\"mapping\">2gu</code> on <code>http://www.example.com/dir1/dir2/file.htm</code> would open <code>http://www.example.com/dir1/</code>.",
            flags: Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["gU", "<C-BS>"],
        function() { vimperator.open("..."); },
        {
            short_help: "Go to the root of the website",
            help: "<code class=\"mapping\">gU</code> on <code>http://www.example.com/dir1/dir2/file.htm</code> opens <code>http://www.example.com/</code>.<br/>" +
                  "When browsing a local directory, it goes to the root document."
        }
    ));

    // hint managment
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["f"],
        function() { vimperator.hints.enableHahMode(vimperator.modes.QUICK_HINT); },
        {
            short_help: "Start QuickHint mode",
            help: "In QuickHint mode, every hintable item (according to the <code class=\"option\">'hinttags'</code> XPath query) is assigned a label.<br/>" +
                  "If you then press the keys for a label, it is followed as soon as it can be uniquely identified and this mode is stopped. Or press <code class=\"mapping\">&lt;Esc&gt;</code> to stop this mode.<br/>" +
                  "If you write the hint in ALLCAPS, the hint is followed in a background tab."
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["F"],
        function() { vimperator.hints.enableHahMode(vimperator.modes.ALWAYS_HINT); },
        {
            short_help: "Start AlwaysHint mode",
            help: "In AlwaysHint mode, every hintable item (according to the <code class=\"option\">'hinttags'</code> XPath query) is assigned a label.<br/>" +
                  "If you then press the keys for a label, it is followed as soon as it can be uniquely identified. Labels stay active after following a hint in this mode, press <code class=\"mapping\">&lt;Esc&gt;</code> to stop this mode.<br/>" +
                  "This hint mode is especially useful for browsing large sites like Forums as hints are automatically regenerated when switching to a new document.<br/>" +
                  "Also, most <code class=\"mapping\">Ctrl</code>-prefixed shortcut keys are available in this mode for navigation."
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, [";"],
        function() { vimperator.hints.enableHahMode(vimperator.modes.EXTENDED_HINT); },
        {
            short_help: "Start ExtendedHint mode",
            help: "ExtendedHint mode is useful, since in this mode you can yank link locations, or open them in a new window.<br/>" +
                  "E.g., if you want to yank the location of hint <code>AB</code>, press <code class=\"mapping\">;</code> to start this hint mode.<br/>" +
                  "Then press <code>AB</code> to select the hint. Now press <code class=\"mapping\">y</code> to yank its location.<br/>" +
                  "Actions for selected hints in ExtendedHint mode are:<br/>" +
                  "<ul>" +
                  "<li><code class=\"mapping\">y</code> to yank its location</li>" +
                  "<li><code class=\"mapping\">Y</code> to yank its text description</li>" +
                  "<li><code class=\"mapping\">o</code> to open its location in the current tab</li>" +
                  "<li><code class=\"mapping\">t</code> to open its location in a new tab</li>" +
                  "<li><code class=\"mapping\">O</code> to open its location in an <code class=\"command\">:open</code> query (not implemented yet)</li>" +
                  "<li><code class=\"mapping\">T</code> to open its location in an <code class=\"command\">:tabopen</code> query (not implemented yet)</li>" +
                  "<li><code class=\"mapping\">s</code> to save its destination</li>" +
                  "<li><code class=\"mapping\">a</code> to save its destination (prompting for save location)</li>" +
                  "<li><code class=\"mapping\">&lt;C-w&gt;</code> to open its destination in a new window</li>" +
                  "</ul>" +
                  "Multiple hints can be separated by commas where it makes sense. <code class=\"mapping\">;ab,ac,adt</code> opens <code>AB</code>, <code>AC</code> and <code>AD</code> in a new tab.<br/>" +
                  "Hintable elements for this mode can be set in the <code class=\"option\">'extendedhinttags'</code> XPath string."
        }
    ));

    // search management
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["/"],
        function() { vimperator.search.openSearchDialog(vimperator.modes.SEARCH_FORWARD); },
        {
            short_help: "Search forward for a pattern",
            usage: ["/{pattern}[/]<CR>"],
            help: "Search forward for the first occurance of <code class=\"argument\">{pattern}</code>.<br/>" +
                  "If \"\\c\" appears anywhere in the pattern the whole pattern is handled as though <code class=\"option\">'ignorecase'</code> is on. " +
                  "\"\\C\" forces case-sensitive matching for the whole pattern.<br/>" +
                  "If \"\\l\" appears in the pattern only the text of links is searched for a match as though <code class=\"option\">'linksearch'</code> is on. " +
                  "\"\\L\" forces the entire page to be searched for a match."
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["?"],
        function() { vimperator.search.openSearchDialog(vimperator.modes.SEARCH_BACKWARD); },
        {
            short_help: "Search backwards for a pattern",
            usage: ["?{pattern}[?]<CR>"],
            help: "Search backward for the first occurance of <code class=\"argument\">{pattern}</code>.<br/>" +
                  "If \"\\c\" appears anywhere in the pattern the whole pattern is handled as though <code class=\"option\">'ignorecase'</code> is on. " +
                  "\"\\C\" forces case-sensitive matching for the whole pattern.<br/>" +
                  "If \"\\l\" appears in the pattern only the text of links is searched for a match as though <code class=\"option\">'linksearch'</code> is on. " +
                  "\"\\L\" forces the entire page to be searched for a match.<br/>" +
                  "NOTE: incremental searching currently only works in the forward direction."
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["n"],
        function() { vimperator.search.findAgain(false); },
        {
            short_help: "Find next",
            help: "Repeat the last search 1 time (until count is supported)."
        }
    ));
    addDefaultMap(new Map(vimperator.modes.NORMAL, ["N"],
        function() { vimperator.search.findAgain(true); },
        {
            short_help: "Find previous",
            help: "Repeat the last search 1 time (until count is supported) in the opposite direction."
        }
    ));


    // }}}
    // Hints mode
    // {{{

    // action keys
    addDefaultMap(new Map(vimperator.modes.HINTS, ["o"],
        function() { vimperator.hints.openHints(false, false); },
        {
            cancel_mode: true,
            always_active: false
        }
    ));
    addDefaultMap(new Map(vimperator.modes.HINTS, ["t"],
        function() { vimperator.hints.openHints(true,  false); },
        {
            cancel_mode: true,
            always_active: false
        }
    ));
    addDefaultMap(new Map(vimperator.modes.HINTS, ["<C-w>"],
        function() { vimperator.hints.openHints(false, true ); },
        {
            cancel_mode: true,
            always_active: false
        }
    ));
    addDefaultMap(new Map(vimperator.modes.HINTS, ["s"],
        function() { vimperator.hints.saveHints(true); },
        {
            cancel_mode: true,
            always_active: false
        }
    ));
    addDefaultMap(new Map([vimperator.modes.HINTS], ["a"],
        function() { vimperator.hints.saveHints(false); },
        {
            cancel_mode: true,
            always_active: false
        }
    ));
    addDefaultMap(new Map(vimperator.modes.HINTS, ["y"],
        function() { vimperator.hints.yankUrlHints(); },
        {
            cancel_mode: true,
            always_active: false
        }
    ));
    addDefaultMap(new Map(vimperator.modes.HINTS, ["Y"],
        function() { vimperator.hints.yankTextHints(); },
        {
            cancel_mode: true,
            always_active: false
        }
    ));
    addDefaultMap(new Map(vimperator.modes.HINTS, [","],
        function() { vimperator.input.buffer += ','; vimperator.hints.setCurrentState(0); },
        {
            cancel_mode: false,
            always_active: true
        }
    ));
    addDefaultMap(new Map(vimperator.modes.HINTS, [":"],
        function() { vimperator.commandline.open(':', '', vimperator.modes.EX); },
        {
            cancel_mode: false,
            always_active: true
        }
    ));

    // movement keys
    addDefaultMap(new Map(vimperator.modes.HINTS, ["<C-e>"],
        function(count) { vimperator.buffer.scrollLines(count > 1 ? count : 1); },
        {
            cancel_mode: false,
            always_active: true,
            flags: Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.HINTS, ["<C-y>"],
        function(count) { vimperator.buffer.scrollLines(-(count > 1 ? count : 1)); },
        {
            cancel_mode: false,
            always_active: true,
            flags: Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.HINTS, ["<Home>"],
        function() { vimperator.buffer.scrollTop(); },
        {
            cancel_mode: false,
            always_active: true
        }
    ));
    addDefaultMap(new Map(vimperator.modes.HINTS, ["<End>"],
        function() { vimperator.buffer.scrollBottom(); },
        {
            cancel_mode: false,
            always_active: true
        }
    ));
    addDefaultMap(new Map(vimperator.modes.HINTS, ["<PageUp>", "<C-b>"],
        function(count) { vimperator.buffer.scrollPages(-(count > 1 ? count : 1)); },
        {
            cancel_mode: false,
            always_active: true,
            flags: Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.HINTS, ["<PageDown>", "<C-f>"],
        function(count) { vimperator.buffer.scrollPages(count > 1 ? count : 1); },
        {
            cancel_mode: false,
            always_active: true,
            flags: Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.HINTS, ["<Left>"],
        function() { vimperator.buffer.scrollColumns(-(count > 1 ? count : 1)); },
        {
            cancel_mode: false,
            always_active: true,
            flags: Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.HINTS, ["<Down>"],
        function() { vimperator.buffer.scrollLines(count > 1 ? count : 1); },
        {
            cancel_mode: false,
            always_active: true,
            flags: Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.HINTS, ["<Up>"],
        function() { vimperator.buffer.scrollLines(-(count > 1 ? count : 1)); },
        {
            cancel_mode: false,
            always_active: true,
            flags: Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.HINTS, ["<Right>"],
        function() { vimperator.buffer.scrollColumns(count > 1 ? count : 1); },
        {
            cancel_mode: false,
            always_active: true,
            flags: Mappings.flags.COUNT
        }
    ));

    // tab management
    addDefaultMap(new Map(vimperator.modes.HINTS, ["<C-n>"],
        function() { vimperator.tabs.select('+1', true); },
        {
            cancel_mode: true,
            always_active: true
        }
    )); // same as gt, but no count supported
    addDefaultMap(new Map(vimperator.modes.HINTS, ["<C-p>"],
        function() { vimperator.tabs.select('-1', true); },
        {
            cancel_mode: true,
            always_active: true
        }
    ));

    // navigation
    addDefaultMap(new Map(vimperator.modes.HINTS, ["<C-o>"],
        function(count) { vimperator.history.stepTo(count > 0 ? -count : -1); },
        {
            cancel_mode: false,
            always_active: true,
            flags: Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.HINTS, ["<C-i>"],
        function(count) { vimperator.history.stepTo(count > 1 ? count : 1); },
        {
            cancel_mode: false,
            always_active: true,
            flags: Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.HINTS, ["<C-h>"],
        function(count) { vimperator.history.stepTo(count > 0 ? -count : -1); },
        {
            cancel_mode: false,
            always_active: true,
            flags: Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.HINTS, ["<C-l>"],
        function(count) { vimperator.history.stepTo(count > 1 ? count : 1); },
        {
            cancel_mode: false,
            always_active: true,
            flags: Mappings.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.modes.HINTS, ["<C-d>"],
        function() { vimperator.tabs.remove(getBrowser().mCurrentTab, vimperator.input.count, false, 0); },
        {
            cancel_mode: true,
            always_active: true
        }
    ));

    // cancel_mode hint mode keys
    addDefaultMap(new Map(vimperator.modes.HINTS, ["<C-c>"],
        function() { ; },
        {
            cancel_mode: true,
            always_active: true
        }
    ));
    addDefaultMap(new Map(vimperator.modes.HINTS, ["<C-g>"],
        function() { ; },
        {
            cancel_mode: true,
            always_active: true
        }
    ));
    addDefaultMap(new Map(vimperator.modes.HINTS, ["<C-[>"],
        function() { ; },
        {
            cancel_mode: true,
            always_active: true
        }
    ));
    addDefaultMap(new Map(vimperator.modes.HINTS, ["<Esc>"],
        function() { ; },
        {
            cancel_mode: true,
            always_active: true
        }
    ));
    //}}}
    //}}}
} //}}}

// vim: set fdm=marker sw=4 ts=4 et:
