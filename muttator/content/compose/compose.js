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

function Compose() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    config.features = ["addressbook"]; // the composer has no special features

    var stateListener = {
        QueryInterface: function (id)
        {
            if (id.equals(Ci.nsIDocumentStateListener))
                return this;
            throw Cr.NS_NOINTERFACE;
        },

        // this is (also) fired once the new compose window loaded the message for the first time
        NotifyDocumentStateChanged: function (nowDirty)
        {
            // only edit with external editor if this window was not cached!
            if (options["autoexternal"] && !window.messageWasEditedExternally/* && !gMsgCompose.recycledWindow*/)
            {
                window.messageWasEditedExternally = true;
                editor.editFieldExternally();
            }

        },
        NotifyDocumentCreated: function () {},
        NotifyDocumentWillBeDestroyed: function () {}
    };

    // XXX: Hack!
    window.document.addEventListener("load", function () {
        if (window.messageWasEditedExternally === undefined)
        {
            window.messageWasEditedExternally = false;
            GetCurrentEditor().addDocumentStateListener(stateListener);
        }
    }, true);

    window.addEventListener("compose-window-close", function () {
        window.messageWasEditedExternally = false;
    }, true);

    /*window.document.addEventListener("unload", function () {
        GetCurrentEditor().removeDocumentStateListener(config.stateListener);
    }, true);*/

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// OPTIONS /////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// MAPPINGS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    mappings.add([modes.COMPOSE],
        ["e"], "Edit message",
        function () { editor.editFieldExternally(); });

    mappings.add([modes.COMPOSE],
        ["y"], "Send message now",
        function () { window.goDoCommand("cmd_sendNow"); });

    mappings.add([modes.COMPOSE],
        ["Y"], "Send message later",
        function () { window.goDoCommand("cmd_sendLater"); });

    // FIXME: does not really work reliably
    mappings.add([modes.COMPOSE],
        ["t"], "Select To: field",
        function () { awSetFocus(0, awGetInputElement(1)); });

    mappings.add([modes.COMPOSE],
        ["s"], "Select Subject: field",
        function () { GetMsgSubjectElement().focus(); });

    mappings.add([modes.COMPOSE],
        ["i"], "Select message body",
        function () { SetMsgBodyFrameFocus(); });

    mappings.add([modes.COMPOSE],
        ["q"], "Close composer, ask when for unsaved changes",
        function () { DoCommandClose(); });

    mappings.add([modes.COMPOSE],
        ["Q", "ZQ"], "Force closing composer",
        function () { MsgComposeCloseWindow(true); /* cache window for better performance*/ });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {};

    //}}}
} //}}}

// vim: set fdm=marker sw=4 ts=4 et:
