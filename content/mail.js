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

function Mail() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    // used for asynchronously selecting messages after wrapping folders
    var selectMessageKeys = [];
    var selectMessageCount = 1;
    var selectMessageReverse = false;

    var folderListener = {
        OnItemAdded: function (parentItem, item) {},
        OnItemRemoved: function (parentItem, item) {},
        OnItemPropertyChanged: function (item, property, oldValue, newValue) {},
        OnItemIntPropertyChanged: function (item, property, oldValue, newValue) {},
        OnItemBoolPropertyChanged: function (item, property, oldValue, newValue) {},
        OnItemUnicharPropertyChanged: function (item, property, oldValue, newValue) {},
        OnItemPropertyFlagChanged: function (item, property, oldFlag, newFlag) {},

        OnItemEvent: function (folder, event)
        {
            var eventType = event.toString();
            if (eventType == "FolderLoaded")
            {
                if (folder)
                {
                    var msgFolder = folder.QueryInterface(Components.interfaces.nsIMsgFolder);
                    autocommands.trigger("FolderLoaded", { url: msgFolder });

                    // Jump to a message when requested
                    var indices = [];
                    if (selectMessageKeys.length > 0)
                    {
                        for (let j = 0; j < selectMessageKeys.length; j++)
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
            /*else if (eventType == "ImapHdrDownloaded") {}
            else if (eventType == "DeleteOrMoveMsgCompleted") {}
            else if (eventType == "DeleteOrMoveMsgFailed") {}
            else if (eventType == "AboutToCompact") {}
            else if (eventType == "CompactCompleted") {}
            else if (eventType == "RenameCompleted") {}
            else if (eventType == "JunkStatusChanged") {}*/
        }
    };

    var mailSession = Components.classes["@mozilla.org/messenger/services/session;1"]
                                .getService(Components.interfaces.nsIMsgMailSession);
    var nsIFolderListener = Components.interfaces.nsIFolderListener;
    var notifyFlags = nsIFolderListener.intPropertyChanged | nsIFolderListener.event;
    mailSession.AddFolderListener(folderListener, notifyFlags);

    function getFolderCompletions(filter)
    {
        var completions = [];
        var folders = mail.getFolders(filter);

        for (let folder = 0; folder < folders.length; folder++)
        {
            completions.push([folders[folder].server.prettyName + ": "
                              + folders[folder].name,
                             "Unread: " + folders[folder].getNumUnread(false)]);
        }

        //return [0, completion.filter(completions, filter)];
        return [0, completions];
    }

    function getRSSUrl()
    {
        return gDBView.hdrForFirstSelectedMessage.messageId.replace(/(#.*)?@.*$/, "");
    }

    function moveOrCopy(copy, destinationFolder, operateOnThread)
    {
        if (!destinationFolder)
        {
            liberator.echoerr("E471: Argument required");
            return false;
        }

        var folders = mail.getFolders(destinationFolder);
        if (folders.length == 0)
        {
            liberator.echoerr("E94: No matching folder for " + destinationFolder);
            return false;
        }
        else if (folders.length > 1)
        {
            liberator.echoerr("E93: More than one match for " + destinationFolder);
            return false;
        }

        var count = gDBView.selection.count;
        if (!count)
        {
            liberator.beep();
            return false;
        }

        if (copy)
        {
            MsgCopyMessage(folders[0]);
            setTimeout(function () { liberator.echo(count + " message(s) copied to " + folders[0].prettyName); }, 100);
        }
        else
        {
            MsgMoveMessage(folders[0]);
            setTimeout(function () { liberator.echo(count + " message(s) moved to " + folders[0].prettyName); }, 100);
        }
        return true;
    }

    function parentIndex(index)
    {
        var parent = index;
        var tree = GetThreadTree();

        while (true)
        {
            var tmp = tree.view.getParentIndex(parent);
            if (tmp >= 0)
                parent = tmp;
            else
                break;
        }
        return parent;
    }

    function selectUnreadFolder(backwards, count)
    {
        count = (count > 0 ) ? count : 1;
        var direction = backwards ? -1 : 1;
        var tree = GetFolderTree();
        var c = tree.currentIndex;
        var i = direction;
        var folder;
        while (count > 0 && (c + i) < tree.view.rowCount && (c + i) >= 0)
        {
            var resource = GetFolderResource(tree, (c + i)).QueryInterface(Components.interfaces.nsIMsgFolder);
            if (!resource.isServer && resource.getNumUnread(false))
            {
                count -= 1;
                folder = i;
            }
            i += direction;
        }
        if (!folder || count > 0)
            liberator.beep();
        else
            tree.view.selection.timedSelect(c + folder, tree._selectDelay);
    }

    function escapeRecipient(recipient)
    {
        // strip all ":
        recipient = recipient.replace(/"/g, "");
        return "\"" + recipient + "\"";
    }
    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// OPTIONS /////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

//    options.add(["editor"],
//        "Set the external text editor",
//        "string", "gvim -f");

    options.add(["layout"],
        "Set the layout of the mail window",
        "string", "inherit",
        {
            setter: function (value)
            {
                switch (value)
                {
                    case "classic":  ChangeMailLayout(0); break;
                    case "wide":     ChangeMailLayout(1); break;
                    case "vertical": ChangeMailLayout(2); break;
                    // case "inherit" just does nothing
                }

                return value;
            },
            validator: function (value) /^(classic|wide|vertical|inherit)$/.test(value)
        });

    /*options.add(["threads"],
        "Use threading to group messages",
        "boolean", true,
        {
            setter: function (value)
            {
                if (value)
                    MsgSortThreaded();
                else
                    MsgSortUnthreaded();

                return value;
            }
        });*/

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// MAPPINGS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var myModes = config.mailModes;

    mappings.add(myModes, ["<Return>", "i"],
        "Inspect (focus) message",
        function () { content.focus(); });

    mappings.add(myModes, ["I"],
        "Open the message in new tab",
        function ()
        {
            if (gDBView && gDBView.selection.count < 1)
                return liberator.beep();

            MsgOpenNewTabForMessage();
        });

    /*mappings.add([modes.NORMAL],
        ["o"], "Open a message",
        function () { commandline.open(":", "open ", modes.EX); });*/

    mappings.add(myModes, ["<Space>"],
        "Scroll message or select next unread one",
        function () true,
        { flags: Mappings.flags.ALLOW_EVENT_ROUTING });

    mappings.add(myModes, ["t"],
        "Select thread",
        function () { gDBView.ExpandAndSelectThreadByIndex(GetThreadTree().currentIndex, false); });

    mappings.add(myModes, ["d", "<Del>"],
        "Move mail to Trash folder",
        function () { goDoCommand("cmd_delete"); });

    mappings.add(myModes, ["j", "<Right>"],
        "Select next message",
        function (count) { mail.selectMessage(function (msg) true, false, false, false, count); },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["gj"],
        "Select next message, including closed threads",
        function (count) { mail.selectMessage(function (msg) true, false, true, false, count); },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["J", "<Tab>"],
        "Select next unread message",
        function (count) { mail.selectMessage(function (msg) !msg.isRead, true, true, false, count); },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["k", "<Left>"],
        "Select previous message",
        function (count) { mail.selectMessage(function (msg) true, false, false, true, count); },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["gk"],
        "Select previous message",
        function (count) { mail.selectMessage(function (msg) true, false, true, true, count); },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["K"],
        "Select previous unread message",
        function (count) { mail.selectMessage(function (msg) !msg.isRead, true, true, true, count); },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["*"],
        "Select next message from the same sender",
        function (count)
        {
            try
            {
                var author = gDBView.hdrForFirstSelectedMessage.mime2DecodedAuthor.toLowerCase();
                mail.selectMessage(function (msg) msg.mime2DecodedAuthor.toLowerCase().indexOf(author) == 0, true, true, false, count);
            }
            catch (e) { liberator.beep(); }
        },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["#"],
        "Select previous message from the same sender",
        function (count)
        {
            try
            {
                var author = gDBView.hdrForFirstSelectedMessage.mime2DecodedAuthor.toLowerCase();
                mail.selectMessage(function (msg) msg.mime2DecodedAuthor.toLowerCase().indexOf(author) == 0, true, true, true, count);
            }
            catch (e) { liberator.beep(); }
        },
        { flags: Mappings.flags.COUNT });

    // SENDING MESSAGES
    mappings.add(myModes, ["m"],
        "Compose a new message",
        function () { commandline.open(":", "mail -subject=", modes.EX); });

    mappings.add(myModes, ["M"],
        "Compose a new message to the sender of selected mail",
        function ()
        {
          try
          {
            var to = escapeRecipient(gDBView.hdrForFirstSelectedMessage.mime2DecodedAuthor);
            commandline.open(":", "mail " + to + " -subject=", modes.EX);
          }
          catch (e)
          {
              liberator.beep();
          }
        });

    mappings.add(myModes, ["r"],
        "Reply to sender",
        function () { goDoCommand("cmd_reply"); });

    mappings.add(myModes, ["R"],
        "Reply to all",
        function () { goDoCommand("cmd_replyall"); });

    mappings.add(myModes, ["f"],
        "Forward message",
        function () { goDoCommand("cmd_forward"); });

    mappings.add(myModes, ["F"],
        "Forward message inline",
        function () { goDoCommand("cmd_forwardInline"); });

    // SCROLLING
    mappings.add(myModes, ["<Down>"],
        "Scroll message down",
        function (count) { buffer.scrollLines(count > 1 ? count : 1); },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["<Up>"],
        "Scroll message up",
        function (count) { buffer.scrollLines(-(count > 1 ? count : 1)); },
        { flags: Mappings.flags.COUNT });

    mappings.add([modes.MESSAGE], ["<Left>"],
        "Select previous message",
        function (count) { mail.selectMessage(function (msg) true, false, false, true, count); },
        { flags: Mappings.flags.COUNT });

    mappings.add([modes.MESSAGE], ["<Right>"],
        "Select next message",
        function (count) { mail.selectMessage(function (msg) true, false, false, false, count); },
        { flags: Mappings.flags.COUNT });

    // UNDO/REDO
    mappings.add(myModes, ["u"],
        "Undo",
        function ()
        {
            if (messenger.canUndo())
                messenger.undo(msgWindow);
            else
                liberator.beep();
        });
    mappings.add(myModes, ["<C-r>"],
        "Redo",
        function ()
        {
            if (messenger.canRedo())
                messenger.redo(msgWindow);
            else
                liberator.beep();
        });

    // GETTING MAIL
    mappings.add(myModes, ["gm"],
        "Get new messages",
        function () { mail.getNewMessages(); });

    mappings.add(myModes, ["gM"],
        "Get new messages for current account only",
        function () { mail.getNewMessages(true); });

    // MOVING MAIL
    mappings.add(myModes, ["c"],
        "Change folders",
        function () { commandline.open(":", "goto ", modes.EX); });

    mappings.add(myModes, ["s"],
        "Move selected messages",
        function () { commandline.open(":", "moveto ", modes.EX); });

    mappings.add(myModes, ["S"],
        "Copy selected messages",
        function () { commandline.open(":", "copyto ", modes.EX); });

    mappings.add(myModes, ["<C-s>"],
        "Archive message",
        function () { moveOrCopy(false, "Archive"); });

    mappings.add(myModes, ["]s"],
        "Select next starred message",
        function (count) { mail.selectMessage(function (msg) msg.isFlagged, true, true, false, count); },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["[s"],
        "Select previous starred message",
        function (count) { mail.selectMessage(function (msg) msg.isFlagged, true, true, true, count); },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["]a"],
        "Select next message with an attachment",
        function (count) { mail.selectMessage(function (msg) gDBView.db.HasAttachments(msg.messageKey), true, true, false, count); },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["[a"],
        "Select previous message with an attachment",
        function (count) { mail.selectMessage(function (msg) gDBView.db.HasAttachments(msg.messageKey), true, true, true, count); },
        { flags: Mappings.flags.COUNT });

    // FOLDER SWITCHING
    mappings.add(myModes, ["gi"],
        "Go to inbox",
        function (count)
        {
            var folder = mail.getFolders("Inbox", false, true)[(count > 0) ? (count - 1) : 0];
            if (folder)
                SelectFolder(folder.URI);
            else
                liberator.beep();
        },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["<C-n>"],
        "Select next folder",
        function (count)
        {
            count = (count > 0 ) ? count : 1;
            var tree = GetFolderTree();
            var c = tree.currentIndex;
            if (c + count >= tree.view.rowCount)
            {
                liberator.beep();
                return;
            }
            tree.view.selection.timedSelect(c + count, tree._selectDelay );
        },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["<C-N>"],
        "Go to next mailbox with unread messages",
        function (count)
        {
            selectUnreadFolder(false, count);
        },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["<C-p>"],
        "Select previous folder",
        function (count)
        {
            count = (count > 0 ) ? count : 1;
            var tree = GetFolderTree();
            var c = tree.currentIndex;
            if (c - count < 0)
            {
                liberator.beep();
                return;
            }
            tree.view.selection.timedSelect(c - count, tree._selectDelay );
        },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["<C-P>"],
        "Go to previous mailbox with unread messages",
        function (count)
        {
            selectUnreadFolder(true, count);
        },
        { flags: Mappings.flags.COUNT });

    // THREADING
    mappings.add(myModes, ["za"],
        "Toggle thread collapsed/expanded",
        function () { if (!mail.expandThread()) mail.collapseThread(); });

    mappings.add(myModes, ["zc"],
        "Collapse thread",
        function () { mail.collapseThread(); });

    mappings.add(myModes, ["zo"],
        "Open thread",
        function () { mail.expandThread(); });

    mappings.add(myModes, ["zr", "zR"],
        "Expand all threads",
        function () { goDoCommand("cmd_expandAllThreads"); });

    mappings.add(myModes, ["zm", "zM"],
        "Collapse all threads",
        function () { goDoCommand("cmd_collapseAllThreads"); });

    mappings.add(myModes, ["<C-i>"],
        "Go forward",
        function (count) { if (count < 1) count = 1; while (count--) GoNextMessage(nsMsgNavigationType.forward, true); },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["<C-o>"],
        "Go back",
        function (count) { if (count < 1) count = 1; while (count--) GoNextMessage(nsMsgNavigationType.back, true); },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["gg"],
        "Select first message",
        function (count) { if (count < 1) count = 1; while (count--) GoNextMessage(nsMsgNavigationType.firstMessage, true); },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["G"],
        "Select last message",
        function (count) { if (count < 1) count = 1; while (count--) GoNextMessage(nsMsgNavigationType.lastMessage, false); },
        { flags: Mappings.flags.COUNT });

    // tagging messages
    mappings.add(myModes, ["l"],
        "Label message",
        function (arg)
        {
            if (!GetSelectedMessages())
                return liberator.beep();

            switch (arg)
            {
                case "r": MsgMarkMsgAsRead(); break;
                case "s": MsgMarkAsFlagged(); break;
                case "i": ToggleMessageTagKey(1); break; // Important
                case "w": ToggleMessageTagKey(2); break; // Work
                case "p": ToggleMessageTagKey(3); break; // Personal
                case "t": ToggleMessageTagKey(4); break; // TODO
                case "l": ToggleMessageTagKey(5); break; // Later
                default:  liberator.beep();
            }
        },
        {
            flags: Mappings.flags.ARGUMENT
        });

    // TODO: change binding?
    mappings.add(myModes, ["T"],
        "Mark current folder as read",
        function ()
        {
            if (mail.currentFolder.isServer)
                return liberator.beep();

            mail.currentFolder.markAllMessagesRead();
        });

    mappings.add(myModes, ["<C-t>"],
        "Mark all messages as read",
        function ()
        {
            mail.getFolders("", false).forEach(function (folder) { folder.markAllMessagesRead(); });
        });

    // DISPLAY OPTIONS
    mappings.add(myModes, ["h"],
        "Toggle displayed headers",
        function ()
        {
            var value = gPrefBranch.getIntPref("mail.show_headers", 2);
            gPrefBranch.setIntPref("mail.show_headers", value == 2 ? 1 : 2);
            MsgReload();
        });

    mappings.add(myModes, ["x"],
        "Toggle HTML message display",
        function ()
        {
            var want_html = (gPrefBranch.getIntPref("mailnews.display.html_as", 1) == 1);
            mail.setHTML(want_html ? 1 : 0);
        });

    // YANKING TEXT
    mappings.add(myModes, ["Y"],
        "Yank subject",
        function ()
        {
            try
            {
                var subject = gDBView.hdrForFirstSelectedMessage.mime2DecodedSubject;
                util.copyToClipboard(subject, true);
            }
            catch (e) { liberator.beep(); }
        });

    mappings.add(myModes, ["y"],
        "Yank sender or feed URL",
        function ()
        {
            try
            {
                if (mail.currentAccount.server.type == "rss")
                    util.copyToClipboard(getRSSUrl(), true);
                else
                    util.copyToClipboard(gDBView.hdrForFirstSelectedMessage.mime2DecodedAuthor, true);
            }
            catch (e) { liberator.beep(); }
        });

    // RSS specific mappings
    mappings.add(myModes, ["p"],
        "Open RSS message in browser",
        function ()
        {
            try
            {
                if (mail.currentAccount.server.type == "rss")
                    messenger.launchExternalURL(getRSSUrl());
                // TODO: what to do for non-rss message?
            }
            catch (e)
            {
                liberator.beep();
            }
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    commands.add(["go[to]"],
        "Select a folder",
        function (args, special, count)
        {
            args = args || "Inbox";
            count = count > 0 ? (count - 1) : 0;

            var folder = mail.getFolders(args, true, true)[count];
            if (!folder)
                liberator.echoerr("Folder \"" + args + "\" does not exist");
            else if (liberator.forceNewTab)
                MsgOpenNewTabForFolder(folder.URI);
            else
                SelectFolder(folder.URI);
        },
        {
            completer: function (filter) getFolderCompletions(filter),
            count: true
        });

    commands.add(["m[ail]"],
        "Write a new message",
        function (args)
        {
            var mailargs = {};
            mailargs.to =          args.arguments.join(", ");
            mailargs.subject =     args["-subject"];
            mailargs.bcc =         args["-bcc"];
            mailargs.cc =          args["-cc"];
            mailargs.body =        args["-text"];
            mailargs.attachments = args["-attachment"] || [];

            var addresses = args.arguments;
            if (mailargs.bcc)
                addresses = addresses.concat(mailargs.bcc);
            if (mailargs.cc)
                addresses = addresses.concat(mailargs.cc);

            // TODO: is there a better way to check for validity?
            if (addresses.some(function (recipient) !(/\S@\S+\.\S/.test(recipient))))
            {
                liberator.echoerr("Exxx: Invalid e-mail address");
                return;
            }

            mail.composeNewMail(mailargs);
        },
        {
            options: [[["-subject", "-s"],    commands.OPTION_STRING],
                      [["-attachment", "-a"], commands.OPTION_LIST],
                      [["-bcc", "-b"],        commands.OPTION_STRING],
                      [["-cc", "-c"],         commands.OPTION_STRING],
                      [["-text", "-t"],       commands.OPTION_STRING]]
        });

    commands.add(["copy[to]"],
        "Copy selected messages",
        function (args) { moveOrCopy(true, args.string); },
        { completer: function (filter) getFolderCompletions(filter) });

    commands.add(["move[to]"],
        "Move selected messages",
        function (args) { moveOrCopy(false, args.string); },
        { completer: function (filter) getFolderCompletions(filter) });

    commands.add(["empty[trash]"],
        "Empty trash of the current account",
        function () { goDoCommand("cmd_emptyTrash"); },
        { argCount: "0" });

    commands.add(["get[messages]"],
        "Check for new messages",
        function (args, special) mail.getNewMessages(!special),
        {
            argCount: "0",
            bang: true,
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

        return {

        get currentAccount() this.currentFolder.rootFolder,

        get currentFolder()
        {
            var tree = GetFolderTree();
            return GetFolderResource(tree, tree.currentIndex).
                   QueryInterface(Components.interfaces.nsIMsgFolder);
        },

        composeNewMail: function (args)
        {
            var params = Components.classes["@mozilla.org/messengercompose/composeparams;1"]
                                   .createInstance(Components.interfaces.nsIMsgComposeParams);
            params.composeFields = Components.classes["@mozilla.org/messengercompose/composefields;1"]
                                             .createInstance(Components.interfaces.nsIMsgCompFields);

            if (args)
            {
                if (args.originalMsg)
                    params.originalMsgURI = args.originalMsg;
                if (args.to)
                    params.composeFields.to = args.to;
                if (args.cc)
                    params.composeFields.cc = args.cc;
                if (args.bcc)
                    params.composeFields.bcc = args.bcc;
                if (args.newsgroups)
                    params.composeFields.newsgroups = args.newsgroups;
                if (args.subject)
                    params.composeFields.subject = args.subject;
                if (args.body)
                    params.composeFields.body = args.body;

                if (args.attachments)
                {
                    while (args.attachments.length > 0)
                    {
                        var url = args.attachments.pop();
                        var file = io.getFile(url);
                        if (!file.exists())
                        {
                            liberator.echoerr("Exxx: Could not attach file `" + url + "'", commandline.FORCE_SINGLELINE);
                            return;
                        }

                        attachment = Components.classes["@mozilla.org/messengercompose/attachment;1"]
                                               .createInstance(Components.interfaces.nsIMsgAttachment);
                        attachment.url = "file://" + file.path;
                        params.composeFields.addAttachment(attachment);
                    }
                }
            }

            params.type = Components.interfaces.nsIMsgCompType.New;

            var msgComposeService = Components.classes["@mozilla.org/messengercompose;1"].getService();
            msgComposeService = msgComposeService.QueryInterface(Components.interfaces.nsIMsgComposeService);
            msgComposeService.OpenComposeWindowWithParams(null, params);
        },

        // returns an array of nsIMsgFolder objects
        getFolders: function (filter, includeServers, includeMsgFolders)
        {
            var folders = [];
            if (!filter)
                filter = "";

            if (includeServers === undefined)
                includeServers = false;
            if (includeMsgFolders === undefined)
                includeMsgFolders = true;

            var tree = GetFolderTree();
            for (let i = 0; i < tree.view.rowCount; i++)
            {
                var resource = GetFolderResource(tree, i).QueryInterface(Components.interfaces.nsIMsgFolder);
                if ((resource.isServer && !includeServers) || (!resource.isServer && !includeMsgFolders))
                    continue;

                var folderString = resource.server.prettyName + ": " + resource.name;

                if (resource.prettiestName.toLowerCase().indexOf(filter.toLowerCase()) >= 0)
                    folders.push(resource);
                else if (folderString.toLowerCase().indexOf(filter.toLowerCase()) >= 0)
                    folders.push(resource);
            }
            return folders;
        },

        getNewMessages: function (currentAccountOnly)
        {
            var accounts = currentAccountOnly ? [this.currentAccount]
                                              : this.getFolders("", true, false);

            accounts.forEach(function (account) {
                try
                {
                    account.getNewMessages(msgWindow, null);
                }
                catch (e)
                {
                    liberator.log("Error getting messages for account " + account.prettyName + ": " + e);
                }
            });
        },

        getStatistics: function (currentAccountOnly)
        {
            var accounts = currentAccountOnly ? [this.currentAccount]
                                              : this.getFolders("", true, false);

            var unreadCount = 0, totalCount = 0, newCount = 0;
            for (let i = 0; i < accounts.length; i++)
            {
                var account = accounts[i];
                unreadCount += account.getNumUnread(true); // true == deep (includes subfolders)
                totalCount  += account.getTotalMessages(true);
                newCount    += account.getNumUnread(true);
            }

            return { numUnread: unreadCount, numTotal: totalCount, numNew: newCount };
        },

        collapseThread: function ()
        {
            var tree = GetThreadTree();
            if (tree)
            {
                var parent = parentIndex(tree.currentIndex);
                if (tree.changeOpenState(parent, false))
                {
                    tree.view.selection.select(parent);
                    tree.treeBoxObject.ensureRowIsVisible(parent);
                    return true;
                }
            }
            return false;
        },

        expandThread: function ()
        {
            var tree = GetThreadTree();
            if (tree)
            {
                var row = tree.currentIndex;
                if (row >= 0 && tree.changeOpenState(row, true))
                   return true;
            }
            return false;
        },

        /*
         * general-purpose method to find messages
         * @param validatorFunc(msg): return true/false whether msg should be selected or not
         * @param canWrap: when true, wraps around folders
         * @param openThreads: should we open closed threads?
         * @param reverse: change direction of searching
         */
        selectMessage: function (validatorFunc, canWrap, openThreads, reverse, count)
        {
            function currentIndex()
            {
                var index = gDBView.selection.currentIndex;
                if (index < 0)
                    index = 0;
                return index;
            }

            function closedThread(index)
            {
                if (!(gDBView.viewFlags & nsMsgViewFlagsType.kThreadedDisplay))
                    return false;

                index = (typeof index == "number") ? index : currentIndex();
                return !gDBView.isContainerOpen(index) && !gDBView.isContainerEmpty(index);
            }

            if (typeof validatorFunc != "function")
                return;

            if (typeof count != "number" || count < 1)
                count = 1;

            // first try to find in current folder
            if (gDBView)
            {
                for (let i = currentIndex() + (reverse ? -1 : (openThreads && closedThread() ? 0 : 1));
                    reverse ? (i >= 0) : (i < gDBView.rowCount);
                    reverse ? i-- : i++)
                {
                    var key = gDBView.getKeyAt(i);
                    var msg = gDBView.db.GetMsgHdrForKey(key);

                    // a closed thread
                    if (openThreads && closedThread(i))
                    {
                        var thread = gDBView.db.GetThreadContainingMsgHdr(msg);
                        var originalCount = count;

                        for (let j = (i == currentIndex() && !reverse) ? 1 : (reverse ? thread.numChildren - 1 : 0);
                                 reverse ? (j >= 0) : (j < thread.numChildren);
                                 reverse ? j-- : j++)
                        {
                            msg = thread.getChildAt(j);
                            if (validatorFunc(msg) && --count == 0)
                            {
                                // this hack is needed to get the correct message, because getChildAt() does not
                                // necessarily return the messages in the order they are displayed
                                gDBView.selection.timedSelect(i, GetThreadTree()._selectDelay || 500);
                                GetThreadTree().treeBoxObject.ensureRowIsVisible(i);
                                if (j > 0)
                                {
                                    GetThreadTree().changeOpenState(i, true);
                                    this.selectMessage(validatorFunc, false, false, false, originalCount);
                                }
                                return;
                            }
                        }
                    }
                    else // simple non-threaded message
                    {
                        if (validatorFunc(msg) && --count == 0)
                        {
                            gDBView.selection.timedSelect(i, GetThreadTree()._selectDelay || 500);
                            GetThreadTree().treeBoxObject.ensureRowIsVisible(i);
                            return;
                        }
                    }
                }
            }

            // then in other folders
            if (canWrap)
            {
                selectMessageReverse = reverse;

                var folders = this.getFolders("", true, true);
                var ci = GetFolderTree().currentIndex;
                for (let i = 1; i < folders.length; i++)
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
                        liberator.dump("ERROR: " + folder.prettyName + " failed to getMessages\n");
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
        },

        setHTML: function (value)
        {
            var values = [[true,  1, gDisallow_classes_no_html],  // plaintext
                          [false, 0, 0],                          // HTML
                          [false, 3, gDisallow_classes_no_html]]; // sanitized/simple HTML

            if (typeof value != "number" || value < 0 || value > 2)
                value = 1;

            gPrefBranch.setBoolPref("mailnews.display.prefer_plaintext", values[value][0]);
            gPrefBranch.setIntPref("mailnews.display.html_as", values[value][1]);
            gPrefBranch.setIntPref("mailnews.display.disallow_mime_handlers", values[value][2]);
            MsgReload();
        }
    };
    //}}}
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
