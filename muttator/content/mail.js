// Copyright (c) 2006-2009 by Martin Stubenschrott <stubenschrott@vimperator.org>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the License.txt file included with this file.

const Mail = Module("mail", {
    requires: ["liberator"],

    init: function () {
        services.add("smtpService", "@mozilla.org/messengercompose/smtp;1", Ci.nsISmtpService);

        // used for asynchronously selecting messages after wrapping folders
        this._selectMessageKeys = [];
        this._selectMessageCount = 1;
        this._selectMessageReverse = false;

        this._mailSession = Cc["@mozilla.org/messenger/services/session;1"].getService(Ci.nsIMsgMailSession);
        this._notifyFlags = Ci.nsIFolderListener.intPropertyChanged | Ci.nsIFolderListener.event;
        this._mailSession.AddFolderListener(this._folderListener, this._notifyFlags);

        liberator.open = this.open;
    },

    _folderListener: {
        OnItemAdded: function (parentItem, item) {},
        OnItemRemoved: function (parentItem, item) {},
        OnItemPropertyChanged: function (item, property, oldValue, newValue) {},
        OnItemIntPropertyChanged: function (item, property, oldValue, newValue) {},
        OnItemBoolPropertyChanged: function (item, property, oldValue, newValue) {},
        OnItemUnicharPropertyChanged: function (item, property, oldValue, newValue) {},
        OnItemPropertyFlagChanged: function (item, property, oldFlag, newFlag) {},

        OnItemEvent: function (folder, event) {
            let eventType = event.toString();
            if (eventType == "FolderLoaded") {
                if (folder) {
                    let msgFolder = folder.QueryInterface(Ci.nsIMsgFolder);
                    autocommands.trigger("FolderLoaded", { url: msgFolder });

                    // Jump to a message when requested
                    let indices = [];
                    if (mail._selectMessageKeys.length > 0) {
                        for (let j = 0; j < mail._selectMessageKeys.length; j++)
                            indices.push([gDBView.findIndexFromKey(mail._selectMessageKeys[j], true), mail._selectMessageKeys[j]]);

                        indices.sort();
                        let index = mail._selectMessageCount - 1;
                        if (mail._selectMessageReverse)
                            index = mail._selectMessageKeys.length - 1 - index;

                        gDBView.selectMsgByKey(indices[index][1]);
                        mail._selectMessageKeys = [];
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
    },

    _getCurrentFolderIndex: function () {
        // for some reason, the index is interpreted as a string, therefore the parseInt
        return parseInt(gFolderTreeView.getIndexOfFolder(gFolderTreeView.getSelectedFolders()[0]));
    },

    _getRSSUrl: function () {
        return gDBView.hdrForFirstSelectedMessage.messageId.replace(/(#.*)?@.*$/, "");
    },

    _moveOrCopy: function (copy, destinationFolder, operateOnThread) {
        let folders = mail.getFolders(destinationFolder);
        if (folders.length == 0)
            return void liberator.echoerr("No matching folder for: " + destinationFolder);
        else if (folders.length > 1)
            return liberator.echoerr("More than one match for: " + destinationFolder);

        let count = gDBView.selection.count;
        if (!count)
            return void liberator.beep();

        (copy ? MsgCopyMessage : MsgMoveMessage)(folders[0]);
        setTimeout(function () {
            liberator.echomsg((copy ? "Copied " : "Moved ") + count + " message(s) " + " to: " + folders[0].prettyName);
        }, 100);
    },

    _parentIndex: function (index) {
        let parent = index;
        let tree = GetThreadTree();

        while (true) {
            let tmp = tree.view.getParentIndex(parent);
            if (tmp >= 0)
                parent = tmp;
            else
                break;
        }
        return parent;
    },

    // does not wrap yet, intentional?
    _selectUnreadFolder: function (backwards, count) {
        count = Math.max(1, count);
        let direction = backwards ? -1 : 1;
        let c = this._getCurrentFolderIndex();
        let i = direction;
        let folder;
        while (count > 0 && (c + i) < gFolderTreeView.rowCount && (c + i) >= 0) {
            let resource = gFolderTreeView._rowMap[c+i]._folder;
            if (!resource.isServer && resource.getNumUnread(false)) {
                count -= 1;
                folder = i;
            }
            i += direction;
        }
        if (!folder || count > 0)
            liberator.beep();
        else
            gFolderTreeView.selection.timedSelect(c + folder, 500);
    },

    _escapeRecipient: function (recipient) {
        // strip all ":
        recipient = recipient.replace(/"/g, "");
        return "\"" + recipient + "\"";
    },

    get currentAccount() this.currentFolder.rootFolder,

    get currentFolder() gFolderTreeView.getSelectedFolders()[0],

    /** @property {nsISmtpServer[]} The list of configured SMTP servers. */
    get smtpServers() {
        let servers = services.get("smtpService").smtpServers;
        let ret = [];

        while (servers.hasMoreElements()) {
            let server = servers.getNext();
            if (server instanceof Ci.nsISmtpServer)
                ret.push(server);
        }

        return ret;
    },

    composeNewMail: function (args) {
        let params = Cc["@mozilla.org/messengercompose/composeparams;1"].createInstance(Ci.nsIMsgComposeParams);
        params.composeFields = Cc["@mozilla.org/messengercompose/composefields;1"].createInstance(Ci.nsIMsgCompFields);

        if (args) {
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

            if (args.attachments) {
                while (args.attachments.length > 0) {
                    let url = args.attachments.pop();
                    let file = io.getFile(url);
                    if (!file.exists())
                        return void liberator.echoerr("Could not attach file: " + url);

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

    /**
     * returns Generator of all folders in the current view
     * @param {Boolean} includeServers
     * @param {Boolean} includeMsgFolders
     * @return {Generator}
     *         [
     *           [{Object ftvItem} row, {String} folderPath]
     *           ...
     *         ]
     */
    getAllFolderRowMap: function (includeServers, includeMsgFolders) {
        if (includeServers === undefined)
            includeServers = false;
        if (includeMsgFolders === undefined)
            includeMsgFolders = true;

        function walkChildren(children, prefix) {
            for (let [, row] in Iterator(children)) {
                let folder = row._folder;
                let folderString = prefix + "/" +
                                   (row.useServerNameOnly ? folder.server.prettyName : folder.abbreviatedName);
                yield [row, folderString];
                if (row.children.length > 0)
                    for (let child in walkChildren(row.children, folderString))
                        yield child;
            }
        }
        for (let i = 0; i < gFolderTreeView.rowCount; i++) {
            let row = gFolderTreeView._rowMap[i];
            if (row.level != 0)
                continue;

            let folder = row._folder;
            let folderString = folder.server.prettyName + ": " +
                               (row.useServerNameOnly ? folder.server.prettyName : folder.abbreviatedName);

            if ((folder.isServer && includeServers) || (!folder.isServer && includeMsgFolders))
                yield [row, folderString];

            if (includeMsgFolders && row.children.length > 0)
                for (let child in walkChildren(row.children, folderString))
                    yield child;
        }
    },

    // returns an array of nsIMsgFolder objects
    getFolders: function (filter, includeServers, includeMsgFolders) {
        let folders = [];
        if (!filter)
            filter = "";
        else
            filter = filter.toLowerCase();

        for (let [row, name] in this.getAllFolderRowMap(includeServers, includeMsgFolders)) {
            let folder = row._folder;
            // XXX: row._folder.prettyName is needed ? -- teramako
            if (name.toLowerCase().indexOf(filter) >= 0)
                folders.push(row._folder);
        }
        return folders;
    },

    /**
     * returns array of nsIMsgFolder objects
     * @param {Number} flag
     *        e.g.) Ci.nsMsgFolderFlags.Inbox
     * @see Ci.nsMsgFolderFlags
     * @return {nsIMsgFolder[]}
     */
    getFoldersWithFlag: function (flag) {
        if (flag) {
            return [row._folder for ([row] in this.getAllFolderRowMap(true,true)) if (row._folder.flags & flag)]
        }
        return [];
    },

    getNewMessages: function (currentAccountOnly) {
        if (currentAccountOnly)
            MsgGetMessagesForAccount();
        else
            GetMessagesForAllAuthenticatedAccounts();
    },

    getStatistics: function (currentAccountOnly) {
        let accounts = currentAccountOnly ? [this.currentAccount]
                                          : this.getFolders("", true, false);

        let unreadCount = 0, totalCount = 0, newCount = 0;
        for (let i = 0; i < accounts.length; i++) {
            let account = accounts[i];
            unreadCount += account.getNumUnread(true); // true == deep (includes subfolders)
            totalCount  += account.getTotalMessages(true);
            newCount    += account.getNumUnread(true);
        }

        return { numUnread: unreadCount, numTotal: totalCount, numNew: newCount };
    },

    collapseThread: function () {
        let tree = GetThreadTree();
        if (tree) {
            let parent = this._parentIndex(tree.currentIndex);
            if (tree.changeOpenState(parent, false)) {
                tree.view.selection.select(parent);
                tree.treeBoxObject.ensureRowIsVisible(parent);
                return true;
            }
        }
        return false;
    },

    expandThread: function () {
        let tree = GetThreadTree();
        if (tree) {
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
    selectMessage: function (validatorFunc, canWrap, openThreads, reverse, count) {
        function currentIndex() {
            let index = gDBView.selection.currentIndex;
            if (index < 0)
                index = 0;
            return index;
        }

        function closedThread(index) {
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
        if (gDBView) {
            for (let i = currentIndex() + (reverse ? -1 : (openThreads && closedThread() ? 0 : 1));
                    reverse ? (i >= 0) : (i < gDBView.rowCount);
                    reverse ? i-- : i++) {
                let key = gDBView.getKeyAt(i);
                let msg = gDBView.db.GetMsgHdrForKey(key);

                // a closed thread
                if (openThreads && closedThread(i)) {
                    let thread = gDBView.db.GetThreadContainingMsgHdr(msg);
                    let originalCount = count;

                    for (let j = (i == currentIndex() && !reverse) ? 1 : (reverse ? thread.numChildren - 1 : 0);
                             reverse ? (j >= 0) : (j < thread.numChildren);
                             reverse ? j-- : j++) {
                        msg = thread.getChildAt(j);
                        if (validatorFunc(msg) && --count == 0) {
                            // this hack is needed to get the correct message, because getChildAt() does not
                            // necessarily return the messages in the order they are displayed
                            gDBView.selection.timedSelect(i, GetThreadTree()._selectDelay || 500);
                            GetThreadTree().treeBoxObject.ensureRowIsVisible(i);
                            if (j > 0) {
                                GetThreadTree().changeOpenState(i, true);
                                this.selectMessage(validatorFunc, false, false, false, originalCount);
                            }
                            return;
                        }
                    }
                }
                else { // simple non-threaded message
                    if (validatorFunc(msg) && --count == 0) {
                        gDBView.selection.timedSelect(i, GetThreadTree()._selectDelay || 500);
                        GetThreadTree().treeBoxObject.ensureRowIsVisible(i);
                        return;
                    }
                }
            }
        }

        // then in other folders
        if (canWrap) {
            this._selectMessageReverse = reverse;

            let folders = this.getFolders("", true, true);
            let ci = this._getCurrentFolderIndex();
            for (let i = 1; i < folders.length; i++) {
                let index = (i + ci) % folders.length;
                if (reverse)
                    index = folders.length - 1 - index;

                let folder = folders[index];
                if (folder.isServer)
                    continue;

                this._selectMessageCount = count;
                this._selectMessageKeys = [];

                // sometimes folder.getMessages can fail with an exception
                // TODO: find out why, and solve the problem
                try {
                    var msgs = folder.messages;
                }
                catch (e) {
                    msgs = folder.getMessages(msgWindow); // for older thunderbirds
                }

                while (msgs.hasMoreElements()) {
                    let msg = msgs.getNext().QueryInterface(Ci.nsIMsgDBHdr);
                    if (validatorFunc(msg)) {
                        count--;
                        this._selectMessageKeys.push(msg.messageKey);
                    }
                }

                if (count <= 0) {
                    // SelectFolder is asynchronous, message is selected in this._folderListener
                    SelectFolder(folder.URI);
                    return;
                }
            }
        }

        // TODO: finally for the "rest" of the current folder

        liberator.beep();
    },

    setHTML: function (value) {
        let values = [[true,  1, gDisallow_classes_no_html],  // plaintext
                      [false, 0, 0],                          // HTML
                      [false, 3, gDisallow_classes_no_html]]; // sanitized/simple HTML

        if (typeof value != "number" || value < 0 || value > 2)
            value = 1;

        gPrefBranch.setBoolPref("mailnews.display.prefer_plaintext", values[value][0]);
        gPrefBranch.setIntPref("mailnews.display.html_as", values[value][1]);
        gPrefBranch.setIntPref("mailnews.display.disallow_mime_handlers", values[value][2]);
        ReloadMessage();
    },

    /**
     * open folders and URLs
     * @param {Object} targets
     * @param {Object|Number} params
     */
    open: function (targets, params) {
        let tabmail = document.getElementById("tabmail");

        if (!(targets instanceof Array))
            targets = [targets]; 

        if (!params)
            params = {};
        else if (params instanceof Array)
            params = { where: params };

        let where = params.where || liberator.CURRENT_TAB;
        if (liberator.forceNewTab || liberator.forceNewWindow)
            where = liberator.NEW_TAB;

        if ("from" in params) {
            if (!("where" in params) && options["newtab"] && options.get("newtab").has("all", params.from))
                where = liberator.NEW_TAB;
            if (options["activate"] && !options.get("activate").has("all", params.from)) {
                if (where == liberator.NEW_TAB)
                    where = liberator.NEW_BACKGROUND_TAB;
                else if (where == liberator.NEW_BACKGROUND_TAB)
                    where = liberator.NEW_TAB;
            }
        }

        function openTarget(target, where) {
            if (target instanceof Ci.nsIMsgFolder) {
                if (where == liberator.CURRENT_TAB && tabmail.currentTabInfo.mode.name == "folder") {
                    SelectFolder(target.URI);
                    return;
                }
                let args = {
                    folder: target,
                    background: where != liberator.NEW_TAB
                };
                ["folderPaneVisible", "messagePaneVisible", "msgHdr"].forEach(function(opt){
                    if (opt in params)
                        args[opt] = params[opt];
                });
                tabmail.openTab("folder", args);
                return;
            }
            if (typeof target == "string") {
                try {
                    target = util.createURI(target);
                } catch(e) {
                    return;
                }
            }
            if (!(target instanceof Ci.nsIURI))
                return;

            if (target.schemeIs("mailto")){
                mail.composeNewMail({to: target.path});
                return;
            }
            switch (where) {
            case liberator.CURRENT_TAB:
                if (tabmail.currentTabInfo.mode.name == "contentTab") {
                    tabmail.currentTabInfo.browser.loadURI(target.spec);
                    break;
                }
            case liberator.NEW_TAB:
            case liberator.NEW_WINDOW:
            case liberator.NEW_BACKGROUND_TAB:
                let tab = tabmail.openTab("contentTab", {
                    contentPage: target.spec,
                    background: where != liberator.NEW_TAB,
                    clickHandler: "liberator.modules.mail.siteClickHandler(event)"
                });
                let browser = tab.browser;
                if (browser.hasAttribute("disablehistory")) {
                    browser.webNavigation.sessionHistory =
                        Cc["@mozilla.org/browser/shistory;1"].createInstance(Ci.nsISHistory);
                    browser.removeAttribute("disablehistory");
                }
                break;
            }
        }

        for (let [,target] in Iterator(targets)) {
            openTarget(target, where);
            where = liberator.NEW_BACKGROUND_TAB;
        }
    },

    /**
     * @see specialTabs.siteClickHandler
     */
    siteClickHandler: function(event){
        if (!event.isTrusted || event.getPreventDefault() || event.button)
            return true;

        let href = hRefForClickEvent(event, true);

        let isOpenExternal = true;
        if (href) {
            let uri = makeURI(href);
            switch(uri.scheme){
            case "http":
            case "https":
            case "chrome":
            case "about":
                isOpenExternal = false;
                break;
            case "liberator":
                if (event.target.ownerDocument.location.protocol == "liberator:")
                    config.browser.loadURI(uri.spec);
                event.preventDefault();
                return true;
            default:
                if (specialTabs._protocolSvc.isExposedProtocol(uri.scheme))
                    isOpenExternal = false;
            }

            if (isOpenExternal) {
                event.preventDefault();
                openLinkExternally(href);
            }
        }
    }
}, {
}, {
    commands: function () {
        commands.add(["go[to]"],
            "Select a folder",
            function (args) {
                let count = Math.max(0, args.count - 1);
                let arg = args.literalArg;

                let folder = arg ?
                             mail.getFolders(arg, true, true)[count] :
                             mail.getFoldersWithFlag(Ci.nsMsgFolderFlags.Inbox)[count];
                if (!folder)
                    liberator.echoerr("No such folder: " + arg);
                else
                    liberator.open(folder, {from: "goto"});
            },
            {
                argCount: "?",
                completer: function (context) completion.mailFolder(context),
                count: true,
                literal: 0
            });

        commands.add(["c[ompose]"],
            "Compose a new message",
            function (args) {
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
                    return void liberator.echoerr("Invalid e-mail address");

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
            function (args) { mail._moveOrCopy(true, args.literalArg); },
            {
                argCount: 1,
                completer: function (context) completion.mailFolder(context),
                literal: 0
            });

        commands.add(["move[to]"],
            "Move selected messages",
            function (args) { mail._moveOrCopy(false, args.literalArg); },
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
    },
    completion: function () {
        completion.mailFolder = function mailFolder(context) {
            context.anchored = false;
            context.quote = false;
            context.completions = [[row[1], "Unread: " + row[0]._folder.getNumUnread(false)]
                                   for (row in mail.getAllFolderRowMap(true,true))];
        };
    },
    mappings: function () {
        var myModes = config.mailModes;

        mappings.add(myModes, ["<Return>", "m"],
            "Start message mode",
            //function () { config.browser.contentWindow.focus(); });
            function () { modes.main = modes.MESSAGE; });

        mappings.add(myModes, ["M"],
            "Open the message in new tab",
            function () {
                if (gDBView && gDBView.selection.count < 1)
                    return void liberator.beep();

                OpenMessageInNewTab({shiftKey: options.getPref("mail.tabs.loadInBackground") });
            });

        /*mappings.add([modes.NORMAL],
            ["o"], "Open a message",
            function () { commandline.open("", "open ", modes.EX); });*/

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
            function (count) {
                try {
                    let author = gDBView.hdrForFirstSelectedMessage.mime2DecodedAuthor.toLowerCase();
                    mail.selectMessage(function (msg) msg.mime2DecodedAuthor.toLowerCase().indexOf(author) == 0, true, true, false, count);
                }
                catch (e) { liberator.beep(); }
            },
            { count: true });

        mappings.add(myModes, ["#"],
            "Select previous message from the same sender",
            function (count) {
                try {
                    let author = gDBView.hdrForFirstSelectedMessage.mime2DecodedAuthor.toLowerCase();
                    mail.selectMessage(function (msg) msg.mime2DecodedAuthor.toLowerCase().indexOf(author) == 0, true, true, true, count);
                }
                catch (e) { liberator.beep(); }
            },
            { count: true });

        // SENDING MESSAGES
        mappings.add(myModes, ["c"],
            "Compose a new message",
            function () { commandline.open("", "compose -subject=", modes.EX); });

        mappings.add(myModes, ["C"],
            "Compose a new message to the sender of selected mail",
            function () {
              try {
                  let to = mail._escapeRecipient(gDBView.hdrForFirstSelectedMessage.mime2DecodedAuthor);
                  commandline.open("", "compose " + to + " -subject=", modes.EX);
              }
              catch (e) {
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

        mappings.add(myModes, ["+"],
            "Scroll message down pagewise",
            function (count) { buffer.scrollPages(Math.max(count, 1)); },
            { count: true });

        mappings.add(myModes, ["<Up>"],
            "Scroll message up",
            function (count) { buffer.scrollLines(-Math.max(count, 1)); },
            { count: true });

        mappings.add(myModes, ["-"],
            "Scroll message up pagewise",
            function (count) { buffer.scrollPages(-Math.max(count, 1)); },
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
            function () {
                if (messenger.canUndo())
                    messenger.undo(msgWindow);
                else
                    liberator.beep();
            });
        mappings.add(myModes, ["<C-r>"],
            "Redo",
            function () {
                if (messenger.canRedo())
                    messenger.redo(msgWindow);
                else
                    liberator.beep();
            });

        // GETTING MAIL
        mappings.add(myModes, ["gm"],
            "Get new messages",
            function () { liberator.echomsg("Fetching mail..."); mail.getNewMessages(); });

        mappings.add(myModes, ["gM"],
            "Get new messages for current account only",
            function () { liberator.echomsg("Fetching mail for current account..."); mail.getNewMessages(true); });

        mappings.add(myModes, ["o"],
            "Goto folder",
            function () { commandline.open("", "goto ", modes.EX); });

        // MOVING MAIL
        mappings.add(myModes, ["s"],
            "Move selected messages",
            function () { commandline.open("", "moveto ", modes.EX); });

        mappings.add(myModes, ["S"],
            "Copy selected messages",
            function () { commandline.open("", "copyto ", modes.EX); });

        mappings.add(myModes, ["<C-s>"],
            "Archive message",
            function () { MsgArchiveSelectedMessages(); });

        mappings.add(myModes, ["!"],
            "Mark/unmark selected messages as junk",
            function () { JunkSelectedMessages(!SelectedMessagesAreJunk()); });

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
            function (count) {
                let folder = mail.getFoldersWithFlag(Ci.nsMsgFolderFlags.Inbox)[(count > 0) ? (count - 1) : 0]
                if (folder)
                    SelectFolder(folder.URI);
                else
                    liberator.beep();
            },
            { count: true });

        mappings.add(myModes, ["<C-n>"],
            "Select next folder",
            function (count) {
                count = Math.max(1, count);
                let newPos = mail._getCurrentFolderIndex() + count;
                if (newPos >= gFolderTreeView.rowCount) {
                    newPos = newPos % gFolderTreeView.rowCount;
                    commandline.echo("search hit BOTTOM, continuing at TOP", commandline.HL_WARNINGMSG, commandline.APPEND_TO_MESSAGES);
                }
                gFolderTreeView.selection.timedSelect(newPos, 500);
            },
            { count: true });

        mappings.add(myModes, ["<C-S-N>"],
            "Go to next mailbox with unread messages",
            function (count) {
                mail._selectUnreadFolder(false, count);
            },
            { count: true });

        mappings.add(myModes, ["<C-p>"],
            "Select previous folder",
            function (count) {
                count = Math.max(1, count);
                let newPos = mail._getCurrentFolderIndex() - count;
                if (newPos < 0) {
                    newPos = (newPos % gFolderTreeView.rowCount) + gFolderTreeView.rowCount;
                    commandline.echo("search hit TOP, continuing at BOTTOM", commandline.HL_WARNINGMSG, commandline.APPEND_TO_MESSAGES);
                }
                gFolderTreeView.selection.timedSelect(newPos, 500);
            },
            { count: true });

        mappings.add(myModes, ["<C-S-P>"],
            "Go to previous mailbox with unread messages",
            function (count) {
                mail._selectUnreadFolder(true, count);
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
            function (arg) {
                if (!gDBView.numSelected)
                    return void liberator.beep();

                switch (arg) {
                    case "r": MsgMarkMsgAsRead(); break;
                    case "s": MsgMarkAsFlagged(); break;

                    case "i": // Important
                    case "1":
                        ToggleMessageTagKey(1);
                        break;

                    case "w": // Work
                    case "2":
                        ToggleMessageTagKey(2);
                        break;

                    case "p": // Personal
                    case "3":
                        ToggleMessageTagKey(3);
                        break;

                    case "t": // TODO
                    case "4":
                        ToggleMessageTagKey(4);
                        break;

                    case "l": // Later
                    case "5":
                        ToggleMessageTagKey(5);
                        break;

                    default:
                        liberator.beep();
                }
            },
            {
                arg: true
            });

        // TODO: change binding?
        mappings.add(myModes, ["T"],
            "Mark current folder as read",
            function () {
                if (mail.currentFolder.isServer)
                    return liberator.beep();

                mail.currentFolder.markAllMessagesRead(msgWindow);
            });

        mappings.add(myModes, ["<C-t>"],
            "Mark all messages as read",
            function () {
                mail.getFolders("", false).forEach(function (folder) { folder.markAllMessagesRead(msgWindow); });
            });

        // DISPLAY OPTIONS
        mappings.add(myModes, ["h"],
            "Toggle displayed headers",
            function () {
                let value = gPrefBranch.getIntPref("mail.show_headers", 2);
                gPrefBranch.setIntPref("mail.show_headers", value == 2 ? 1 : 2);
                ReloadMessage();
            });

        mappings.add(myModes, ["x"],
            "Toggle HTML message display",
            function () {
                let wantHtml = (gPrefBranch.getIntPref("mailnews.display.html_as", 1) == 1);
                mail.setHTML(wantHtml ? 1 : 0);
            });

        // YANKING TEXT
        mappings.add(myModes, ["y"],
            "Yank field",
            function (arg) {
                try {
                    let text = "";
                    switch (arg) {
                        case "f":
                        case "y":
                            text = gDBView.hdrForFirstSelectedMessage.mime2DecodedAuthor;
                            break;
                        case "s":
                            text = gDBView.hdrForFirstSelectedMessage.mime2DecodedSubject;
                            break;
                        case "#":
                            text = gDBView.hdrForFirstSelectedMessage.messageId;
                            break;
                        case "t":
                            text = gDBView.hdrForFirstSelectedMessage.mime2DecodedRecipients;
                            break;
                        case "r": // all recipients
                            let cc = gDBView.hdrForFirstSelectedMessage.ccList;
                            text = gDBView.hdrForFirstSelectedMessage.mime2DecodedRecipients + (cc ? ", " + cc : "");
                            break;
                        case "u":
                            if (mail.currentAccount.server.type == "rss") {
                                text = util.this._getRSSUrl(); // TODO: util.this?
                            } // if else, yank nothing
                            break;
                        default:
                            liberator.beep();
                    }
                    util.copyToClipboard(text, true);
                }
                catch (e) { liberator.beep(); }
            },
        {
                arg: true
            });

        // RSS specific mappings
        mappings.add(myModes, ["p"],
            "Open RSS message in browser",
            function () {
                try {
                    if (mail.currentAccount.server.type == "rss")
                        messenger.launchExternalURL(mail._getRSSUrl());
                    // TODO: what to do for non-rss message?
                }
                catch (e) {
                    liberator.beep();
                }
            });
    },
    options: function () {
        // TODO: generate the possible values dynamically from the menu
        options.add(["layout"],
            "Set the layout of the mail window",
            "string", "inherit",
            {
                setter: function (value) {
                    switch (value) {
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
                setter: function (value) {
                    let server = mail.smtpServers.filter(function (s) s.key == value)[0];
                    services.get("smtpService").defaultServer = server;
                    return value;
                },
                completer: function (context) [[s.key, s.serverURI] for ([, s] in Iterator(mail.smtpServers))],
                validator: Option.validateCompleter
            });

        options.add(["foldermode", "folder"],
            "Set the folder mode",
            "string", "smart",
            {
                getter: function () gFolderTreeView.mode,
                setter: function (value) {
                    gFolderTreeView.mode = value;
                    return value;
                },
                completer: function (context) {
                    let modes = gFolderTreeView._modeNames;
                    return modes.map(function(mode) {
                        let name = (mode in gFolderTreeView._modeDisplayNames) ?
                                   gFolderTreeView._modeDisplayNames[mode] :
                                   document.getElementById("bundle_messenger").getString("folderPaneHeader_" + mode);
                        return [mode, name];
                    });
                },
                validator: Option.validateCompleter
            });

        options.add(["remotecontent", "rc"],
            "Allow display remote content",
            "boolean", false,
            {
                scope: Option.SCOPE_LOCAL,
                getter: function () {
                    if (config.browser.id == "messagepane") {
                        let msg = gMessageDisplay.displayedMessage;
                        if (msg)
                            return msg.getUint32Property("remoteContentPolicy") == kAllowRemoteContent ? true : false;
                    }
                },
                setter: function (value) {
                    var policy = value ? kAllowRemoteContent : kBlockRemoteContent;
                    if (config.browser.id == "messagepane") {
                        let msg = gMessageDisplay.displayedMessage;
                        if (msg && msg.getUint32Property("remoteContentPolicy") != policy) {
                            msg.setUint32Property("remoteContentPolicy", policy);
                            ReloadMessage();
                        }
                    }
                    return value;
                },
            });

        /*options.add(["threads"],
            "Use threading to group messages",
            "boolean", true,
            {
                setter: function (value) {
                    if (value)
                        MsgSortThreaded();
                    else
                        MsgSortUnthreaded();

                    return value;
                }
            });*/
    }
});

// vim: set fdm=marker sw=4 ts=4 et:
