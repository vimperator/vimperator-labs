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

vimperator.config = {
    /*** required options, no checks done if they really exist, so be careful ***/
    name: "Vimperator",
    hostApplication: "Firefox",

    /*** optional options, there are checked for existance and a fallback provided  ***/
    features: ["bookmarks", "history", "marks", "quickmarks", "hints", "tabs", "windows"],
    dialogs: [],
    guioptions: { m: ["toolbar-menubar"], T: ["nav-bar"], b: ["PersonalToolbar"] },

    init: function()
    {
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

        /////////////////////////////////////////////////////////////////////////////}}}
        ////////////////////// MAPPINGS ////////////////////////////////////////////////
        /////////////////////////////////////////////////////////////////////////////{{{
    
        vimperator.mappings.add([vimperator.modes.NORMAL],
            ["y"], "Yank current location to the clipboard",
            function () { vimperator.copyToClipboard(vimperator.buffer.URL, true); });

        // opening websites
        vimperator.mappings.add([vimperator.modes.NORMAL],
            ["o"], "Open one or more URLs",
            function () { vimperator.commandline.open(":", "open ", vimperator.modes.EX); });

        vimperator.mappings.add([vimperator.modes.NORMAL], ["O"],
            "Open one or more URLs, based on current location",
            function () { vimperator.commandline.open(":", "open " + vimperator.buffer.URL, vimperator.modes.EX); });

        vimperator.mappings.add([vimperator.modes.NORMAL], ["t"],
            "Open one or more URLs in a new tab",
            function () { vimperator.commandline.open(":", "tabopen ", vimperator.modes.EX); });

        vimperator.mappings.add([vimperator.modes.NORMAL], ["T"],
            "Open one or more URLs in a new tab, based on current location",
            function () { vimperator.commandline.open(":", "tabopen " + vimperator.buffer.URL, vimperator.modes.EX); });

        vimperator.mappings.add([vimperator.modes.NORMAL],
            ["<C-a>"], "Increment last number in URL",
            function (count) { incrementURL(count > 1 ? count : 1); },
            { flags: vimperator.Mappings.flags.COUNT });

        vimperator.mappings.add([vimperator.modes.NORMAL],
            ["<C-x>"], "Decrement last number in URL",
            function (count) { incrementURL(-(count > 1 ? count : 1)); },
            { flags: vimperator.Mappings.flags.COUNT });

        vimperator.mappings.add([vimperator.modes.NORMAL], ["~"],
            "Open home directory",
            function () { vimperator.open("~"); });

        vimperator.mappings.add([vimperator.modes.NORMAL], ["gh"],
            "Open homepage",
            function() { BrowserHome(); });

        vimperator.mappings.add([vimperator.modes.NORMAL], ["gH"],
            "Open homepage in a new tab",
            function ()
            {
                var homepages = gHomeButton.getHomePage();
                vimperator.open(homepages, /\bhomepage\b/.test(vimperator.options["activate"]) ?
                        vimperator.NEW_TAB : vimperator.NEW_BACKGROUND_TAB);
            });

        vimperator.mappings.add([vimperator.modes.NORMAL], ["gu"],
            "Go to parent directory",
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
            { flags: vimperator.Mappings.flags.COUNT });

        vimperator.mappings.add([vimperator.modes.NORMAL], ["gU"],
            "Go to the root of the website",
            function ()
            {
                var uri = content.document.location;
                if (/(about|mailto):/.test(uri.protocol)) // exclude these special protocols for now
                {
                    vimperator.beep();
                    return;
                }
                vimperator.open(uri.protocol + "//" + (uri.host || "") + "/");
            });

        vimperator.mappings.add([vimperator.modes.NORMAL], ["<C-l>"],
            "Redraw the screen",
            function () { vimperator.commands.redraw(); });

        /////////////////////////////////////////////////////////////////////////////}}}
        ////////////////////// COMMANDS ////////////////////////////////////////////////
        /////////////////////////////////////////////////////////////////////////////{{{

        vimperator.commands.add(["downl[oads]", "dl"],
            "Show progress of current downloads",
            function () { vimperator.open("chrome://mozapps/content/downloads/downloads.xul", vimperator.NEW_TAB); });

        vimperator.commands.add(["redr[aw]"],
            "Redraw the screen",
            function ()
            {
                var wu = window.QueryInterface(Components.interfaces.nsIInterfaceRequestor).
                                getInterface(Components.interfaces.nsIDOMWindowUtils);
                wu.redraw();
            });

        // TODO: move sidebar commands to ui.js?
        vimperator.commands.add(["sbcl[ose]"],
            "Close the sidebar window",
            function (args)
            {
                if (args)
                {
                    vimperator.echoerr("E488: Trailing characters");
                    return;
                }

                if (document.getElementById("sidebar-box").hidden == false)
                    toggleSidebar();
            });

        vimperator.commands.add(["sideb[ar]", "sb[ar]", "sbope[n]"],
            "Open the sidebar window",
            function (args)
            {
                if (!args)
                {
                    vimperator.echoerr("E471: Argument required");
                    return;
                }

                // do nothing if the requested sidebar is already open
                if (document.getElementById("sidebar-title").value == args)
                {
                    document.getElementById("sidebar-box").contentWindow.focus();
                    return;
                }

                var menu = document.getElementById("viewSidebarMenu");

                for (var i = 0; i < menu.childNodes.length; i++)
                {
                    if (menu.childNodes[i].label == args)
                    {
                        eval(menu.childNodes[i].getAttribute("oncommand"));
                        break;
                    }
                }
            },
            { completer: function (filter) { return vimperator.completion.sidebar(filter); } });

    }
}

// vim: set fdm=marker sw=4 ts=4 et:
