// Copyright (c) 2006-2009 by Martin Stubenschrott <stubenschrott@vimperator.org>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the License.txt file included with this file.

const Compose = Module("compose", {
    init: function () {
        var stateListener = {
            QueryInterface: function (id) {
                if (id.equals(Ci.nsIDocumentStateListener))
                    return this;
                throw Cr.NS_NOINTERFACE;
            },

            // this is (also) fired once the new compose window loaded the message for the first time
            NotifyDocumentStateChanged: function (nowDirty) {
                // only edit with external editor if this window was not cached!
                if (options["autoexternal"] && !window.messageWasEditedExternally/* && !gMsgCompose.recycledWindow*/) {
                    window.messageWasEditedExternally = true;
                    editor.editFieldExternally();
                }

            },
            NotifyDocumentCreated: function () {},
            NotifyDocumentWillBeDestroyed: function () {}
        };

        // XXX: Hack!
        window.addEventListener("load", function () {
            if (window.messageWasEditedExternally === undefined) {
                window.messageWasEditedExternally = false;
                GetCurrentEditor().addDocumentStateListener(stateListener);
            }
        }, true);

        window.addEventListener("compose-window-close", function () {
            window.messageWasEditedExternally = false;
        }, true);
    }
}, {
}, {
    mappings: function () {
        mappings.add([modes.COMPOSE],
            ["e"], "Edit message",
            function () {
                GetCurrentEditorElement().contentWindow.focus();
                editor.editFieldExternally();
            });

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
    }
});

// vim: set fdm=marker sw=4 ts=4 et:
