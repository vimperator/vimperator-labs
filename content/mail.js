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

    // used for asynchronously selecting messages after wrapping folders
    var selectMessageKeys = [];
    var selectMessageCount = 1;
    var selectMessageReverse = false;

    var folderListener = {
        OnItemAdded: function(parentItem, item) { },
        OnItemRemoved: function(parentItem, item) { },
        OnItemPropertyChanged: function(item, property, oldValue, newValue) { },
        OnItemIntPropertyChanged: function(item, property, oldValue, newValue) { },
        OnItemBoolPropertyChanged: function(item, property, oldValue, newValue) { },
        OnItemUnicharPropertyChanged: function(item, property, oldValue, newValue) { },
        OnItemPropertyFlagChanged: function(item, property, oldFlag, newFlag) { },

        OnItemEvent: function(folder, event)
        {
            var eventType = event.toString();
            if (eventType == "FolderLoaded")
            {
                if (folder)
                {
                    var msgFolder = folder.QueryInterface(Components.interfaces.nsIMsgFolder);
                    dump (msgFolder.prettiestName + " loaded\n");

                    // Jump to a message when requested
                    var indices = [];
                    if (selectMessageKeys.length > 0)
                    {
                        for (var j = 0; j < selectMessageKeys.length; j++)
                            indices.push([gDBView.findIndexFromKey(selectMessageKeys[j], true), selectMessageKeys[j]]);

                        indices.sort();
                        let index = selectMessageCount - 1;
                        if (selectMessageReverse)
                            index = selectMessageKeys.length - 1 - index;

                        gDBView.selectMsgByKey(indices[index][1]);
                        selectMessageKeys = [];
                    }
                }
            }
            /*else if (eventType == "ImapHdrDownloaded") { }
            else if (eventType == "DeleteOrMoveMsgCompleted") { }
            else if (eventType == "DeleteOrMoveMsgFailed") { }
            else if (eventType == "AboutToCompact") { }
            else if (eventType == "CompactCompleted") { }
            else if (eventType == "RenameCompleted") { }
            else if (eventType == "JunkStatusChanged") { }*/
        }
    }

    var mailSession = Components.classes[mailSessionContractID]
                      .getService(Components.interfaces.nsIMsgMailSession);
    var nsIFolderListener = Components.interfaces.nsIFolderListener;
    var notifyFlags = nsIFolderListener.intPropertyChanged | nsIFolderListener.event;
    mailSession.AddFolderListener(folderListener, notifyFlags);


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
        "Inspect (focus) message",
        function () { content.focus(); });

    vimperator.mappings.add(modes, ["d", "<Del>"],
        "Move mail to Trash folder",
        function () { goDoCommand("cmd_delete"); });

    vimperator.mappings.add(modes, ["j", "<Right>"],
        "Select next message",
        function (count) { vimperator.mail.selectMessage(function (msg) { return true; }, false, false, count); },
        { flags: vimperator.Mappings.flags.COUNT });
        
    vimperator.mappings.add(modes, ["J", "<Tab>"],
        "Select next unread message",
        function (count) { vimperator.mail.selectMessage(function (msg) { return !msg.isRead; }, true, false, count); },
        { flags: vimperator.Mappings.flags.COUNT });

    vimperator.mappings.add(modes, ["k", "<Left>"],
        "Select previous message",
        function (count) { vimperator.mail.selectMessage(function (msg) { return true; }, false, true, count); },
        { flags: vimperator.Mappings.flags.COUNT });
        
    vimperator.mappings.add(modes, ["K"],
        "Select previous unread message",
        function (count) { vimperator.mail.selectMessage(function (msg) { return !msg.isRead; }, true, true, count); },
        { flags: vimperator.Mappings.flags.COUNT });
        
    vimperator.mappings.add(modes, ["r"],
        "Reply to sender",
        function () { goDoCommand("cmd_reply"); });

    vimperator.mappings.add(modes, ["gm"],
        "Get new messages",
        function () { goDoCommand("cmd_getNewMessages"); });

    vimperator.mappings.add([vimperator.modes.NORMAL],
        ["c"], "Change folders",
        function () { vimperator.commandline.open(":", "goto ", vimperator.modes.EX); });

    vimperator.mappings.add(modes, ["]f"],
        "Select next flagged message",
        function (count) { vimperator.mail.selectMessage(function(msg) { return msg.isFlagged; }, true, false, count); },
        { flags: vimperator.Mappings.flags.COUNT });

    vimperator.mappings.add(modes, ["[f"],
        "Select previous flagged message",
        function (count) { vimperator.mail.selectMessage(function(msg) { return msg.isFlagged; }, true, true, count); },
        { flags: vimperator.Mappings.flags.COUNT });

    vimperator.mappings.add(modes, ["]a"],
        "Select next message with an attachment",
        function (count) { vimperator.mail.selectMessage(function(msg) { return gDBView.db.HasAttachments(msg.messageKey); }, true, false, count); },
        { flags: vimperator.Mappings.flags.COUNT });

    vimperator.mappings.add(modes, ["[a"],
        "Select previous message with an attachment",
        function (count) { vimperator.mail.selectMessage(function(msg) { return gDBView.db.HasAttachments(msg.messageKey); }, true, true, count); },
        { flags: vimperator.Mappings.flags.COUNT });



    vimperator.mappings.add(modes, ["<C-i>"],
        "Get new messages",
        function (count) { if (count < 1) count = 1; while (count--) GoNextMessage(nsMsgNavigationType.forward, true); },
        { flags: vimperator.Mappings.flags.COUNT });

    vimperator.mappings.add(modes, ["<C-o>"],
        "Get new messages",
        function (count) { if (count < 1) count = 1; while (count--) GoNextMessage(nsMsgNavigationType.back, true); },
        { flags: vimperator.Mappings.flags.COUNT });

    vimperator.mappings.add(modes, ["gg"],
        "Get new messages",
        function (count) { if (count < 1) count = 1; while (count--) GoNextMessage(nsMsgNavigationType.firstMessage, true); },
        { flags: vimperator.Mappings.flags.COUNT });

    vimperator.mappings.add(modes, ["G"],
        "Get new messages",
        function (count) { if (count < 1) count = 1; while (count--) GoNextMessage(nsMsgNavigationType.lastMessage, false); },
        { flags: vimperator.Mappings.flags.COUNT });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    vimperator.commands.add(["go[to]"],
        "Select a folder",
        function (args, special, count)
        {
            args = args || "Inbox";
            count = count > 0 ? (count - 1) : 0;

            var folder = vimperator.mail.getFolders(args)[count];
            if (!folder)
                vimperator.echoerr("Folder \"" + args + "\" does not exist");
            else
                SelectFolder(folder.URI);
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        getFolders: function(filter)
        {
            var folders = [];
            if (!filter)
                filter = "";

            var tree = GetFolderTree();
            for (let i = 0; i < tree.view.rowCount; i++)
            {
                var resource = GetFolderResource(tree, i).QueryInterface(Components.interfaces.nsIMsgFolder);
                if (/*!resource.isServer && */resource.prettiestName.toLowerCase().indexOf(filter.toLowerCase()) >= 0)
                    folders.push(resource);
            }
            return folders;
        },

        // XXX: probably refactored with another method
        getTotalUnread: function()
        {
            var folders = this.getFolders();

            var unread = 0, flagged = 0;
            for (var i = 0; i < folders.length; i++)
            {
                var msgs = folders[i].getMessages(msgWindow);
                while (msgs.hasMoreElements())
                {
                    var msg = msgs.getNext().QueryInterface(Components.interfaces.nsIMsgDBHdr);
                    if (!msg.isRead)
                        unread++;
                    if (msg.isFlagged)
                        flagged++;
                }
            }
            return unread;
        },

        selectMessage: function(validatorFunc, canWrap, reverse, count)
        {
            if (typeof validatorFunc != "function")
                return;

            if (typeof count != "number" || count < 1)
                count = 1;

            // first try to find in current folder
            if (gDBView)
            {
                // FIXME: doesn't work with collapsed threads
                for (var i = gDBView.selection.currentIndex + (reverse ? -1 : 1);
                     (reverse ? ( i >= 0) : (i < gDBView.rowCount)); reverse ? i-- : i++)
                {
                    var key = gDBView.getKeyAt(i);
                    var msg = gDBView.db.GetMsgHdrForKey(key);
                    if (validatorFunc(msg))
                        count--;

                    if (count == 0)
                    {
                        gDBView.selectMsgByKey(key);
                        return;
                    }
                }
            }

            // then in other folders
            if (canWrap)
            {
                selectMessageReverse = reverse;

                var folders = this.getFolders();
                var ci = GetFolderTree().currentIndex;
                for (var i = 1; i <= folders.length; i++)
                {
                    let index = (i + ci) % folders.length;
                    if (reverse)
                        index = folders.length - 1 - index;

                    var folder = folders[index];
                    if (folder.isServer)
                        continue;

                    selectMessageCount = count;
                    selectMessageKeys = [];

                    var msgs = folder.getMessages(msgWindow);
                    while (msgs.hasMoreElements())
                    {
                        var msg = msgs.getNext().QueryInterface(Components.interfaces.nsIMsgDBHdr);
                        if (validatorFunc(msg))
                        {
                            count--;
                            selectMessageKeys.push(msg.messageKey);
                        }
                    }

                    if (count <= 0)
                    {
                        // SelectFolder is asynchronous, message is selected in folderListener
                        SelectFolder(folder.URI);
                        return;
                    }
                }
            }

            // TODO: finally for the "rest" of the current folder

            vimperator.beep();
        }
    };
    //}}}
};

// vim: set fdm=marker sw=4 ts=4 et:
