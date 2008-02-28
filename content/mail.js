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

vimperator.Mail = function ()
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// OPTIONS /////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

//    vimperator.options.add(["editor"],
//        "Set the external text editor",
//        "string", "gvim -f");
//    vimperator.options.add(["insertmode", "im"],
//        "Use Insert mode as the default for text areas",
//        "boolean", true);

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// MAPPINGS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{
    var modes = vimperator.config.mailModes || [vimperator.modes.NORMAL];

    vimperator.mappings.add(modes, ["<Return>", "i"],
        "Focus message",
        function () { content.focus(); });

    vimperator.mappings.add(modes, ["d", "<Del>"],
        "Move mail to Trash folder",
        function () { goDoCommand("cmd_delete"); });

    vimperator.mappings.add(modes, ["j", "<Right>"],
        "Select next message",
        function () { goDoCommand("cmd_nextMsg"); });

    vimperator.mappings.add(modes, ["J", "<Tab>"],
        "Select next unread message",
        function () { goDoCommand("cmd_nextUnreadMsg"); });

    vimperator.mappings.add(modes, ["k", "<Left>"],
        "Select previous message",
        function () { goDoCommand("cmd_previousMsg"); });

    vimperator.mappings.add(modes, ["K"],
        "Select previous unread message",
        function () { goDoCommand("cmd_previousUnreadMsg"); });

    vimperator.mappings.add(modes, ["r"],
        "Reply to sender",
        function () { goDoCommand("cmd_reply"); });

    vimperator.mappings.add(modes, ["gm"],
        "Get new messages",
        function () { goDoCommand("cmd_getNewMessages"); });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

    };
    //}}}
};

// vim: set fdm=marker sw=4 ts=4 et:
