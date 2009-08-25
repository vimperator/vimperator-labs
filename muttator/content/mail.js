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

function Mail() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    services.add("smtpService", "@mozilla.org/messengercompose/smtp;1", Ci.nsISmtpService);

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
            let eventType = event.toString();
            if (eventType == "FolderLoaded")
            {
                if (folder)
                {
                    let msgFolder = folder.QueryInterface(Ci.nsIMsgFolder);
                    autocommands.trigger("FolderLoaded", { url: msgFolder });

                    // Jump to a message when requested
                    let indices = [];
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

    var mailSession = Cc["@mozilla.org/messenger/services/session;1"].getService(Ci.nsIMsgMailSession);
    var nsIFolderListener = Ci.nsIFolderListener;
    var notifyFlags = nsIFolderListener.intPropertyChanged | nsIFolderListener.event;
    mailSession.AddFolderListener(folderListener, notifyFlags);

    function getCurrentFolderIndex()
    {
        // for some reason, the index is interpreted as a string, therefore the parseInt
        return parseInt(gFolderTreeView.getIndexOfFolder(gFolderTreeView.getSelectedFolders()[0]));
    }

    function getRSSUrl()
    {
        return gDBView.hdrForFirstSelectedMessage.messageId.replace(/(#.*)?@.*$/, "");
    }

    function moveOrCopy(copy, destinationFolder, operateOnThread)
    {
        let folders = mail.getFolders(destinationFolder);
        if (folders.length == 0)
            return void liberator.echoerr("Exxx: No matching folder for " + destinationFolder);
        else if (folders.length > 1)
            return liberator.echoerr("Exxx: More than one match for " + destinationFolder);

        let count = gDBView.selection.count;
        if (!count)
            return void liberator.beep();

        (copy ? MsgCopyMessage : MsgMoveMessage)(folders[0]);
        setTimeout(function () {
            liberator.echomsg(count + " message(s) " + (copy ? "copied" : "moved") + " to " + folders[0].prettyName, 1);
        }, 100);
    }

    function parentIndex(index)
    {
        let parent = index;
        let tree = GetThreadTree();

        while (true)
        {
            let tmp = tree.view.getParentIndex(parent);
            if (tmp >= 0)
                parent = tmp;
            else
                break;
        }
        return parent;
    }

    // does not wrap yet, intentional?
    function selectUnreadFolder(backwards, count)
    {
        count = Math.max(1, count);
        let direction = backwards ? -1 : 1;
        let c = getCurrentFolderIndex();
        let i = direction;
        let folder;
        while (count > 0 && (c + i) < gFolderTreeView.rowCount && (c + i) >= 0)
        {
            let resource = gFolderTreeView._rowMap[c+i]._folder;
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
            gFolderTreeView.selection.timedSelect(c + folder, 500);
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

    // FIXME: why does this default to "Archive", I don't have one? The default
    // value won't validate now. mst please fix. --djk
    options.add(["archivefolder"],
        "Set the archive folder",
        "string", "Archive",
        {
            completer: function (context) completion.mailFolder(context),
            validator: Option.validateCompleter
        });

    // TODO: generate the possible values dynamically from the menu
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
            completer: function (context) [
                ["inherit",  "Default View"], // FIXME: correct description?
                ["classic",  "Classic View"],
                ["wide",     "Wide View"],
                ["vertical", "Vertical View"]
            ],
            validator: Option.validateCompleter
        });

    options.add(["smtpserver", "smtp"],
        "Set the default SMTP server",
        "string", services.get("smtpService").defaultServer.key, // TODO: how should we handle these persistent external defaults - "inherit" or null?
        {
            getter: function () services.get("smtpService").defaultServer.key,
            setter: function (value)
            {
                let server = mail.smtpServers.filter(function (s) s.key == value)[0];
                services.get("smtpService").defaultServer = server;
                return value;
            },
            completer: function (context) [[s.key, s.serverURI] for ([, s] in Iterator(mail.smtpServers))],
            validator: Option.validateCompleter
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
                return void liberator.beep();

            MsgOpenNewTabForMessage();
        });

    /*mappings.add([modes.NORMAL],
        ["o"], "Open a message",
        function () { commandline.open(":", "open ", modes.EX); });*/

    mappings.add(myModes, ["<Space>"],
        "Scroll message or select next unread one",
        function () true,
        { route: true });

    mappings.add(myModes, ["t"],
        "Select thread",
        function () { gDBView.ExpandAndSelectThreadByIndex(GetThreadTree().currentIndex, false); });

    mappings.add(myModes, ["d", "<Del>"],
        "Move mail to Trash folder",
        function () { window.goDoCommand("cmd_delete"); });

    mappings.add(myModes, ["j", "<Right>"],
        "Select next message",
        function (count) { mail.selectMessage(function (msg) true, false, false, false, count); },
        { count: true });

    mappings.add(myModes, ["gj"],
        "Select next message, including closed threads",
        function (count) { mail.selectMessage(function (msg) true, false, true, false, count); },
        { count: true });

    mappings.add(myModes, ["J", "<Tab>"],
        "Select next unread message",
        function (count) { mail.selectMessage(function (msg) !msg.isRead, true, true, false, count); },
        { count: true });

    mappings.add(myModes, ["k", "<Left>"],
        "Select previous message",
        function (count) { mail.selectMessage(function (msg) true, false, false, true, count); },
        { count: true });

    mappings.add(myModes, ["gk"],
        "Select previous message",
        function (count) { mail.selectMessage(function (msg) true, false, true, true, count); },
        { count: true });

    mappings.add(myModes, ["K"],
        "Select previous unread message",
        function (count) { mail.selectMessage(function (msg) !msg.isRead, true, true, true, count); },
        { count: true });

    mappings.add(myModes, ["*"],
        "Select next message from the same sender",
        function (count)
        {
            try
            {
                let author = gDBView.hdrForFirstSelectedMessage.mime2DecodedAuthor.toLowerCase();
                mail.selectMessage(function (msg) msg.mime2DecodedAuthor.toLowerCase().indexOf(author) == 0, true, true, false, count);
            }
            catch (e) { liberator.beep(); }
        },
        { count: true });

    mappings.add(myModes, ["#"],
        "Select previous message from the same sender",
        function (count)
        {
            try
            {
                let author = gDBView.hdrForFirstSelectedMessage.mime2DecodedAuthor.toLowerCase();
                mail.selectMessage(function (msg) msg.mime2DecodedAuthor.toLowerCase().indexOf(author) == 0, true, true, true, count);
            }
            catch (e) { liberator.beep(); }
        },
        { count: true });

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
              let to = escapeRecipient(gDBView.hdrForFirstSelectedMessage.mime2DecodedAuthor);
              commandline.open(":", "mail " + to + " -subject=", modes.EX);
          }
          catch (e)
          {
              liberator.beep();
          }
        });

    mappings.add(myModes, ["r"],
        "Reply to sender",
        function () { window.goDoCommand("cmd_reply"); });

    mappings.add(myModes, ["R"],
        "Reply to all",
        function () { window.goDoCommand("cmd_replyall"); });

    mappings.add(myModes, ["f"],
        "Forward message",
        function () { window.goDoCommand("cmd_forward"); });

    mappings.add(myModes, ["F"],
        "Forward message inline",
        function () { window.goDoCommand("cmd_forwardInline"); });

    // SCROLLING
    mappings.add(myModes, ["<Down>"],
        "Scroll message down",
        function (count) { buffer.scrollLines(Math.max(count, 1)); },
        { count: true });

    mappings.add(myModes, ["<Up>"],
        "Scroll message up",
        function (count) { buffer.scrollLines(-Math.max(count, 1)); },
        { count: true });

    mappings.add([modes.MESSAGE], ["<Left>"],
        "Select previous message",
        function (count) { mail.selectMessage(function (msg) true, false, false, true, count); },
        { count: true });

    mappings.add([modes.MESSAGE], ["<Right>"],
        "Select next message",
        function (count) { mail.selectMessage(function (msg) true, false, false, false, count); },
        { count: true });

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
        function () { moveOrCopy(false, options["archivefolder"]); });

    mappings.add(myModes, ["]s"],
        "Select next starred message",
        function (count) { mail.selectMessage(function (msg) msg.isFlagged, true, true, false, count); },
        { count: true });

    mappings.add(myModes, ["[s"],
        "Select previous starred message",
        function (count) { mail.selectMessage(function (msg) msg.isFlagged, true, true, true, count); },
        { count: true });

    mappings.add(myModes, ["]a"],
        "Select next message with an attachment",
        function (count) { mail.selectMessage(function (msg) gDBView.db.HasAttachments(msg.messageKey), true, true, false, count); },
        { count: true });

    mappings.add(myModes, ["[a"],
        "Select previous message with an attachment",
        function (count) { mail.selectMessage(function (msg) gDBView.db.HasAttachments(msg.messageKey), true, true, true, count); },
        { count: true });

    // FOLDER SWITCHING
    mappings.add(myModes, ["gi"],
        "Go to inbox",
        function (count)
        {
            let folder = mail.getFolders("Inbox", false, true)[(count > 0) ? (count - 1) : 0];
            if (folder)
                SelectFolder(folder.URI);
            else
                liberator.beep();
        },
        { count: true });

    mappings.add(myModes, ["<C-n>"],
        "Select next folder",
        function (count)
        {
            count = Math.max(1, count);
            let newPos = getCurrentFolderIndex() + count;
            if (newPos >= gFolderTreeView.rowCount)
            {
                newPos = newPos % gFolderTreeView.rowCount;
                commandline.echo("search hit BOTTOM, continuing at TOP", commandline.HL_WARNINGMSG, commandline.APPEND_TO_MESSAGES);
            }
            gFolderTreeView.selection.timedSelect(newPos, 500);
        },
        { count: true });

    mappings.add(myModes, ["<C-N>"],
        "Go to next mailbox with unread messages",
        function (count)
        {
            selectUnreadFolder(false, count);
        },
        { count: true });

    mappings.add(myModes, ["<C-p>"],
        "Select previous folder",
        function (count)
        {
            count = Math.max(1, count);
            let newPos = getCurrentFolderIndex() - count;
            if (newPos < 0)
            {
                newPos = (newPos % gFolderTreeView.rowCount) + gFolderTreeView.rowCount;
                commandline.echo("search hit TOP, continuing at BOTTOM", commandline.HL_WARNINGMSG, commandline.APPEND_TO_MESSAGES);
            }
            gFolderTreeView.selection.timedSelect(newPos, 500);
        },
        { count: true });

    mappings.add(myModes, ["<C-P>"],
        "Go to previous mailbox with unread messages",
        function (count)
        {
            selectUnreadFolder(true, count);
        },
        { count: true });

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
        function () { window.goDoCommand("cmd_expandAllThreads"); });

    mappings.add(myModes, ["zm", "zM"],
        "Collapse all threads",
        function () { window.goDoCommand("cmd_collapseAllThreads"); });

    mappings.add(myModes, ["<C-i>"],
        "Go forward",
        function (count) { if (count < 1) count = 1; while (count--) GoNextMessage(nsMsgNavigationType.forward, true); },
        { count: true });

    mappings.add(myModes, ["<C-o>"],
        "Go back",
        function (count) { if (count < 1) count = 1; while (count--) GoNextMessage(nsMsgNavigationType.back, true); },
        { count: true });

    mappings.add(myModes, ["gg"],
        "Select first message",
        function (count) { if (count < 1) count = 1; while (count--) GoNextMessage(nsMsgNavigationType.firstMessage, true); },
        { count: true });

    mappings.add(myModes, ["G"],
        "Select last message",
        function (count) { if (count < 1) count = 1; while (count--) GoNextMessage(nsMsgNavigationType.lastMessage, false); },
        { count: true });

    // tagging messages
    mappings.add(myModes, ["l"],
        "Label message",
        function (arg)
        {
            if (!GetSelectedMessages())
                return void liberator.beep();

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
            arg: true
        });

    // TODO: change binding?
    mappings.add(myModes, ["T"],
        "Mark current folder as read",
        function ()
        {
            if (mail.currentFolder.isServer)
                return liberator.beep();

            mail.currentFolder.markAllMessagesRead(msgWindow);
        });

    mappings.add(myModes, ["<C-t>"],
        "Mark all messages as read",
        function ()
        {
            mail.getFolders("", false).forEach(function (folder) { folder.markAllMessagesRead(msgWindow); });
        });

    // DISPLAY OPTIONS
    mappings.add(myModes, ["h"],
        "Toggle displayed headers",
        function ()
        {
            let value = gPrefBranch.getIntPref("mail.show_headers", 2);
            gPrefBranch.setIntPref("mail.show_headers", value == 2 ? 1 : 2);
            ReloadMessage();
        });

    mappings.add(myModes, ["x"],
        "Toggle HTML message display",
        function ()
        {
            let wantHtml = (gPrefBranch.getIntPref("mailnews.display.html_as", 1) == 1);
            mail.setHTML(wantHtml ? 1 : 0);
        });

    // YANKING TEXT
    mappings.add(myModes, ["Y"],
        "Yank subject",
        function ()
        {
            try
            {
                let subject = gDBView.hdrForFirstSelectedMessage.mime2DecodedSubject;
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
        function (args)
        {
            let count = Math.max(0, args.count - 1);
            let arg = args.literalArg || "Inbox";

            let folder = mail.getFolders(arg, true, true)[count];
            if (!folder)
                liberator.echoerr("Exxx: Folder \"" + arg + "\" does not exist");
            else if (liberator.forceNewTab)
                MsgOpenNewTabForFolder(folder.URI);
            else
                SelectFolder(folder.URI);
        },
        {
            argCount: "?",
            completer: function (context) completion.mailFolder(context),
            count: true,
            literal: 0
        });

    commands.add(["m[ail]"],
        "Write a new message",
        function (args)
        {
            let mailargs = {};
            mailargs.to =          args.join(", ");
            mailargs.subject =     args["-subject"];
            mailargs.bcc =         args["-bcc"];
            mailargs.cc =          args["-cc"];
            mailargs.body =        args["-text"];
            mailargs.attachments = args["-attachment"] || [];

            let addresses = args;
            if (mailargs.bcc)
                addresses = addresses.concat(mailargs.bcc);
            if (mailargs.cc)
                addresses = addresses.concat(mailargs.cc);

            // TODO: is there a better way to check for validity?
            if (addresses.some(function (recipient) !(/\S@\S+\.\S/.test(recipient))))
                return void liberator.echoerr("Exxx: Invalid e-mail address");

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
        function (args) { moveOrCopy(true, args.literalArg); },
        {
            argCount: 1,
            completer: function (context) completion.mailFolder(context),
            literal: 0
        });

    commands.add(["move[to]"],
        "Move selected messages",
        function (args) { moveOrCopy(false, args.literalArg); },
        {
            argCount: 1,
            completer: function (context) completion.mailFolder(context),
            literal: 0
        });

    commands.add(["empty[trash]"],
        "Empty trash of the current account",
        function () { window.goDoCommand("cmd_emptyTrash"); },
        { argCount: "0" });

    commands.add(["get[messages]"],
        "Check for new messages",
        function (args) mail.getNewMessages(!args.bang),
        {
            argCount: "0",
            bang: true,
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMPLETIONS /////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    completion.mailFolder = function mailFolder(context) {
        let folders = mail.getFolders(context.filter);
        context.anchored = false;
        context.quote = false;
        context.completions = folders.map(function (folder)
                [folder.server.prettyName + ": " + folder.name,
                 "Unread: " + folder.getNumUnread(false)]);
    };

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        get currentAccount() this.currentFolder.rootFolder,

        get currentFolder() gFolderTreeView.getSelectedFolders()[0],

        /** @property {nsISmtpServer[]} The list of configured SMTP servers. */
        get smtpServers()
        {
            let servers = services.get("smtpService").smtpServers;
            let ret = [];

            while (servers.hasMoreElements())
            {
                let server = servers.getNext();
                if (server instanceof Ci.nsISmtpServer)
                    ret.push(server);
            }

            return ret;
        },

        composeNewMail: function (args)
        {
            let params = Cc["@mozilla.org/messengercompose/composeparams;1"].createInstance(Ci.nsIMsgComposeParams);
            params.composeFields = Cc["@mozilla.org/messengercompose/composefields;1"].createInstance(Ci.nsIMsgCompFields);

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
                        let url = args.attachments.pop();
                        let file = io.getFile(url);
                        if (!file.exists())
                            return void liberator.echoerr("Exxx: Could not attach file `" + url + "'", commandline.FORCE_SINGLELINE);

                        attachment = Cc["@mozilla.org/messengercompose/attachment;1"].createInstance(Ci.nsIMsgAttachment);
                        attachment.url = "file://" + file.path;
                        params.composeFields.addAttachment(attachment);
                    }
                }
            }

            params.type = Ci.nsIMsgCompType.New;

            const msgComposeService = Cc["@mozilla.org/messengercompose;1"].getService();
            msgComposeService = msgComposeService.QueryInterface(Ci.nsIMsgComposeService);
            msgComposeService.OpenComposeWindowWithParams(null, params);
        },

        // returns an array of nsIMsgFolder objects
        getFolders: function (filter, includeServers, includeMsgFolders)
        {
            let folders = [];
            if (!filter)
                filter = "";
            else
                filter = filter.toLowerCase();

            if (includeServers === undefined)
                includeServers = false;
            if (includeMsgFolders === undefined)
                includeMsgFolders = true;

            for (let i = 0; i < gFolderTreeView.rowCount; i++)
            {
                let resource = gFolderTreeView._rowMap[i]._folder;
                if ((resource.isServer && !includeServers) || (!resource.isServer && !includeMsgFolders))
                    continue;

                let folderString = resource.server.prettyName + ": " + resource.name;

                if (resource.prettiestName.toLowerCase().indexOf(filter) >= 0)
                    folders.push(resource);
                else if (folderString.toLowerCase().indexOf(filter) >= 0)
                    folders.push(resource);
            }
            return folders;
        },

        getNewMessages: function (currentAccountOnly)
        {
            if (currentAccountOnly)
                MsgGetMessagesForAccount();
            else
                GetMessagesForAllAuthenticatedAccounts();
        },

        getStatistics: function (currentAccountOnly)
        {
            let accounts = currentAccountOnly ? [this.currentAccount]
                                              : this.getFolders("", true, false);

            let unreadCount = 0, totalCount = 0, newCount = 0;
            for (let i = 0; i < accounts.length; i++)
            {
                let account = accounts[i];
                unreadCount += account.getNumUnread(true); // true == deep (includes subfolders)
                totalCount  += account.getTotalMessages(true);
                newCount    += account.getNumUnread(true);
            }

            return { numUnread: unreadCount, numTotal: totalCount, numNew: newCount };
        },

        collapseThread: function ()
        {
            let tree = GetThreadTree();
            if (tree)
            {
                let parent = parentIndex(tree.currentIndex);
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
            let tree = GetThreadTree();
            if (tree)
            {
                let row = tree.currentIndex;
                if (row >= 0 && tree.changeOpenState(row, true))
                   return true;
            }
            return false;
        },

        /**
         * General-purpose method to find messages.
         *
         * @param {function(nsIMsgDBHdr):boolean} validatorFunc Return
         *     true/false whether msg should be selected or not.
         * @param {boolean} canWrap When true, wraps around folders.
         * @param {boolean} openThreads Should we open closed threads?
         * @param {boolean} reverse Change direction of searching.
         */
        selectMessage: function (validatorFunc, canWrap, openThreads, reverse, count)
        {
            function currentIndex()
            {
                let index = gDBView.selection.currentIndex;
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
                    let key = gDBView.getKeyAt(i);
                    let msg = gDBView.db.GetMsgHdrForKey(key);

                    // a closed thread
                    if (openThreads && closedThread(i))
                    {
                        let thread = gDBView.db.GetThreadContainingMsgHdr(msg);
                        let originalCount = count;

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

                let folders = this.getFolders("", true, true);
                let ci = getCurrentFolderIndex();
                for (let i = 1; i < folders.length; i++)
                {
                    let index = (i + ci) % folders.length;
                    if (reverse)
                        index = folders.length - 1 - index;

                    let folder = folders[index];
                    if (folder.isServer)
                        continue;

                    selectMessageCount = count;
                    selectMessageKeys = [];

                    // sometimes folder.getMessages can fail with an exception
                    // TODO: find out why, and solve the problem
                    try
                    {
                        var msgs = folder.messages;
                    }
                    catch (e)
                    {
                        msgs = folder.getMessages(msgWindow); // for older thunderbirds
                        liberator.dump("WARNING: " + folder.prettyName + " failed to getMessages, trying old API");
                        //continue;
                    }

                    while (msgs.hasMoreElements())
                    {
                        let msg = msgs.getNext().QueryInterface(Ci.nsIMsgDBHdr);
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
            let values = [[true,  1, gDisallow_classes_no_html],  // plaintext
                          [false, 0, 0],                          // HTML
                          [false, 3, gDisallow_classes_no_html]]; // sanitized/simple HTML

            if (typeof value != "number" || value < 0 || value > 2)
                value = 1;

            gPrefBranch.setBoolPref("mailnews.display.prefer_plaintext", values[value][0]);
            gPrefBranch.setIntPref("mailnews.display.html_as", values[value][1]);
            gPrefBranch.setIntPref("mailnews.display.disallow_mime_handlers", values[value][2]);
            ReloadMessage();
        }
    };
    //}}}
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
