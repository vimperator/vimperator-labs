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

liberator.Mail = function ()
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

//    liberator.options.add(["editor"],
//        "Set the external text editor",
//        "string", "gvim -f");

    liberator.options.add(["layout"],
        "Set the layout of the mail window",
        "string", "inherit",
        {
            validator: function (value) { return /^(classic|wide|vertical|inherit)$/.test(value); },
            setter:    function (value)
            {
                switch (value)
                {
                    case "classic":  ChangeMailLayout(0); break;
                    case "wide":     ChangeMailLayout(1); break;
                    case "vertical": ChangeMailLayout(2); break;
                    // case "inherit" just does nothing
                }
            }
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// MAPPINGS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var modes = liberator.config.mailModes || [liberator.modes.NORMAL];

    liberator.mappings.add(modes, ["<Return>", "i"],
        "Inspect (focus) message",
        function () { content.focus(); });

    liberator.mappings.add(modes, ["d", "<Del>"],
        "Move mail to Trash folder",
        function () { goDoCommand("cmd_delete"); });

    liberator.mappings.add(modes, ["j", "<Right>"],
        "Select next message",
        function (count) { liberator.mail.selectMessage(function (msg) { return true; }, false, false, count); },
        { flags: liberator.Mappings.flags.COUNT });
        
    liberator.mappings.add(modes, ["J", "<Tab>"],
        "Select next unread message",
        function (count) { liberator.mail.selectMessage(function (msg) { return !msg.isRead; }, true, false, count); },
        { flags: liberator.Mappings.flags.COUNT });

    liberator.mappings.add(modes, ["k", "<Left>"],
        "Select previous message",
        function (count) { liberator.mail.selectMessage(function (msg) { return true; }, false, true, count); },
        { flags: liberator.Mappings.flags.COUNT });
        
    liberator.mappings.add(modes, ["K"],
        "Select previous unread message",
        function (count) { liberator.mail.selectMessage(function (msg) { return !msg.isRead; }, true, true, count); },
        { flags: liberator.Mappings.flags.COUNT });
        
    liberator.mappings.add(modes, ["r"],
        "Reply to sender",
        function () { goDoCommand("cmd_reply"); });

    liberator.mappings.add(modes, ["gm"],
        "Get new messages",
        function () { liberator.mail.getNewMessages(); });

    liberator.mappings.add(modes, ["gM"],
        "Get new messages for current account only",
        function () { liberator.mail.getNewMessages(true); });

    liberator.mappings.add([liberator.modes.NORMAL],
        ["c"], "Change folders",
        function () { liberator.commandline.open(":", "goto ", liberator.modes.EX); });

    liberator.mappings.add(modes, ["]s"],
        "Select next starred message",
        function (count) { liberator.mail.selectMessage(function(msg) { return msg.isFlagged; }, true, false, count); },
        { flags: liberator.Mappings.flags.COUNT });

    liberator.mappings.add(modes, ["[s"],
        "Select previous starred message",
        function (count) { liberator.mail.selectMessage(function(msg) { return msg.isFlagged; }, true, true, count); },
        { flags: liberator.Mappings.flags.COUNT });

    liberator.mappings.add(modes, ["]a"],
        "Select next message with an attachment",
        function (count) { liberator.mail.selectMessage(function(msg) { return gDBView.db.HasAttachments(msg.messageKey); }, true, false, count); },
        { flags: liberator.Mappings.flags.COUNT });

    liberator.mappings.add(modes, ["[a"],
        "Select previous message with an attachment",
        function (count) { liberator.mail.selectMessage(function(msg) { return gDBView.db.HasAttachments(msg.messageKey); }, true, true, count); },
        { flags: liberator.Mappings.flags.COUNT });


    liberator.mappings.add(modes, ["zc"],
        "Collapse thread",
        function () { liberator.mail.collapseThread(); });

    liberator.mappings.add(modes, ["zo"],
        "Open thread",
        function () { liberator.mail.expandThread(); });


    liberator.mappings.add(modes, ["<C-i>"],
        "Get new messages",
        function (count) { if (count < 1) count = 1; while (count--) GoNextMessage(nsMsgNavigationType.forward, true); },
        { flags: liberator.Mappings.flags.COUNT });

    liberator.mappings.add(modes, ["<C-o>"],
        "Get new messages",
        function (count) { if (count < 1) count = 1; while (count--) GoNextMessage(nsMsgNavigationType.back, true); },
        { flags: liberator.Mappings.flags.COUNT });

    liberator.mappings.add(modes, ["gg"],
        "Get new messages",
        function (count) { if (count < 1) count = 1; while (count--) GoNextMessage(nsMsgNavigationType.firstMessage, true); },
        { flags: liberator.Mappings.flags.COUNT });

    liberator.mappings.add(modes, ["G"],
        "Get new messages",
        function (count) { if (count < 1) count = 1; while (count--) GoNextMessage(nsMsgNavigationType.lastMessage, false); },
        { flags: liberator.Mappings.flags.COUNT });

    // tagging messages
    liberator.mappings.add(modes, ["tr"],
        "Toggle selected messages read",
        function ()
        {
            if (!GetSelectedMessages())
            {
                liberator.beep();
                return;
            }

            MsgMarkMsgAsRead();
        });
    liberator.mappings.add(modes, ["tR"],
        "Tag thread as read",
        function ()
        {
            // TODO: ensure thread or beep

            MsgMarkThreadAsRead();
        });


    liberator.mappings.add(modes, ["ts"],
        "Toggle selected messages starred",
        function ()
        {
            if (!GetSelectedMessages())
            {
                liberator.beep();
                return;
            }

            MsgMarkMsgAsFlagged();
        });

    liberator.mappings.add(modes, ["T"],
        "Mark current folder as read",
        function ()
        {
            if (liberator.mail.currentFolder.isServer)
            {
                liberator.beep();
                return;
            }

            liberator.mail.currentFolder.markAllMessagesRead();
        });

    liberator.mappings.add(modes, ["<C-t>"],
        "Mark all messages as read",
        function ()
        {
            liberator.mail.getFolders("", false).forEach(function(folder) {
                folder.markAllMessagesRead();
            });
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    liberator.commands.add(["go[to]"],
        "Select a folder",
        function (args, special, count)
        {
            args = args || "Inbox";
            count = count > 0 ? (count - 1) : 0;

            var folder = liberator.mail.getFolders(args, true, true)[count];
            if (!folder)
                liberator.echoerr("Folder \"" + args + "\" does not exist");
            else
                SelectFolder(folder.URI);
        });

    liberator.commands.add(["get[messages]"],
        "Check for new messages",
        function (args, special)
        {
            if (args)
            {
                liberator.echoerr("E488: Trailing characters");
                return;
            }

            liberator.mail.getNewMessages(!special);
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        get currentAccount() { return this.currentFolder.rootFolder; },

        get currentFolder() {
            var tree = GetFolderTree();
            return GetFolderResource(tree, tree.currentIndex).
                   QueryInterface(Components.interfaces.nsIMsgFolder);
        },

        getFolders: function(filter, includeServers, includeMsgFolders)
        {
            var folders = [];
            if (!filter)
                filter = "";

            if (typeof includeServers == "undefined")
                includeServers = false;
            if (typeof includeMsgFolders == "undefined")
                includeMsgFolders = true;

            var tree = GetFolderTree();
            for (let i = 0; i < tree.view.rowCount; i++)
            {
                var resource = GetFolderResource(tree, i).QueryInterface(Components.interfaces.nsIMsgFolder);
                if ((resource.isServer && !includeServers) || (!resource.isServer && !includeMsgFolders))
                    continue;

                if (resource.prettiestName.toLowerCase().indexOf(filter.toLowerCase()) >= 0)
                    folders.push(resource);
            }
            return folders;
        },

        getNewMessages: function(currentAccountOnly)
        {
            var accounts = currentAccountOnly ? [this.currentAccount]
                                              : this.getFolders("", true, false);

            accounts.forEach( function(account) { account.getNewMessages(msgWindow, null); });
        },

        getStatistics: function(currentAccountOnly)
        {
            var accounts = currentAccountOnly ? [this.currentAccount]
                                              : this.getFolders("", true, false);

            var unreadCount = 0, totalCount = 0, newCount = 0;;
            for (var i = 0; i < accounts.length; i++)
            {
                var account = accounts[i];
                unreadCount += account.getNumUnread(true); // true == deep (includes subfolders)
                totalCount  += account.getTotalMessages(true);
                newCount    += account.getNumUnread(true);
            }

            return { numUnread: unreadCount, numTotal: totalCount, numNew: newCount }
        },

        collapseThread: function()
        {
            //var tree = document.getElementById('folderTree');
            var tree = GetThreadTree();
            if (tree)
            {
                if (!tree.changeOpenState(tree.currentIndex, false))
                {
                    var parentIndex = tree.view.getParentIndex(tree.currentIndex);
                    if (parentIndex >= 0)
                    {
                        tree.view.selection.select(parentIndex);
                        tree.treeBoxObject.ensureRowIsVisible(parentIndex);
                    }
                }
            }
        },

        expandThread: function()
        {
            //var tree = document.getElementById('folderTree');

            var tree = GetThreadTree();
            if (tree)
            {
                var row = tree.currentIndex;
                if (row >= 0 && !tree.changeOpenState(row, true))
                {
                    var view = tree.view;
                    if (row + 1 < view.rowCount && view.getParentIndex(row + 1) == row)
                    {
                        tree.view.selection.timedSelect(row + 1, tree._selectDelay);
                        tree.treeBoxObject.ensureRowIsVisible(row + 1);
                    }
                }
            }
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
                //var curIndex = 
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
                        // gDBView.selectMsgByKey(key);
                        gDBView.selection.timedSelect(i, GetThreadTree()._selectDelay || 500);
                        GetThreadTree().treeBoxObject.ensureRowIsVisible(i);
                        return;
                    }
                }
            }

            // then in other folders
            if (canWrap)
            {
                selectMessageReverse = reverse;

                var folders = this.getFolders("", true, true);
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

                    // sometimes folder.getMessages can fail with an exception
                    // TODO: find out why, and solve the problem
                    try
                    {
                        var msgs = folder.getMessages(msgWindow);
                    }
                    catch (e)
                    {
                        dump("ERROR: " + folder.prettyName + " failed to getMessages\n");
                        continue;
                    }

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

            liberator.beep();
        }
    };
    //}}}
};

// vim: set fdm=marker sw=4 ts=4 et:
