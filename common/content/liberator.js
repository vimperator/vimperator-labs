// Copyright (c) 2006-2009 by Martin Stubenschrott <stubenschrott@vimperator.org>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the License.txt file included with this file.


/** @scope modules */

Cu.import("resource://gre/modules/XPCOMUtils.jsm", modules);
Cu.import("resource://gre/modules/AddonManager.jsm")

const plugins = { __proto__: modules };
const userContext = { __proto__: modules };

const EVAL_ERROR = "__liberator_eval_error";
const EVAL_RESULT = "__liberator_eval_result";
const EVAL_STRING = "__liberator_eval_string";

// Move elsewhere?
const Storage = Module("storage", {
    requires: ["services"],

    init: function () {
        Cu.import("resource://liberator/storage.jsm", this);
        modules.Timer = this.Timer; // Fix me, please.

        try {
            let infoPath = services.create("file");
            infoPath.initWithPath(File.expandPath(IO.runtimePath.replace(/,.*/, "")));
            infoPath.append("info");
            infoPath.append(liberator.profileName);
            this.storage.infoPath = infoPath;
        }
        catch (e) {}

        return this.storage;
    }
});

function Runnable(self, func, args) {
    return {
        QueryInterface: XPCOMUtils.generateQI([Ci.nsIRunnable]),
        run: function () { func.apply(self, args); }
    };
}

const FailedAssertion = Class("FailedAssertion", Error, {
    init: function (message) {
        this.message = message;
    }
});

const Liberator = Module("liberator", {
    requires: ["config", "services"],

    init: function () {
        window.liberator = this;
        window.liberator = this;
        modules.liberator = this;
        this.observers = {};
        this.modules = modules;

        // NOTE: services.get("profile").selectedProfile.name doesn't return
        // what you might expect. It returns the last _actively_ selected
        // profile (i.e. via the Profile Manager or -P option) rather than the
        // current profile. These will differ if the current process was run
        // without explicitly selecting a profile.
        /** @property {string} The name of the current user profile. */
        this.profileName = services.get("directory").get("ProfD", Ci.nsIFile).leafName.replace(/^.+?\./, "");

        let platform = Liberator.getPlatformFeature()
        config.features.push(platform);
        if (/^Win(32|64)$/.test(platform))
            config.features.push('Windows');
        
        if (AddonManager) {
            let self = this;
            self._extensions = [];
            AddonManager.getAddonsByTypes(["extension"], function (e) self._extensions = e);
            this.onEnabled = this.onEnabling = this.onDisabled = this.onDisabling = this.onInstalled = 
                this.onInstalling = this.onUninstalled = this.onUninstalling = 
                function () AddonManager.getAddonsByTypes(["extension"], function (e) self._extensions = e);
            AddonManager.addAddonListener(this);
        }
    },

    destroy: function () {
        autocommands.trigger(config.name + "LeavePre", {});
        storage.saveAll();
        liberator.triggerObserver("shutdown", null);
        liberator.log("All liberator modules destroyed");
        autocommands.trigger(config.name + "Leave", {});
    },

    /**
     * @property {number} The current main mode.
     * @see modes#mainModes
     */
    get mode()      modes.main,
    set mode(value) modes.main = value,

    get menuItems() Liberator.getMenuItems(),

    /** @property {Element} The currently focused element. */
    get focus() document.commandDispatcher.focusedElement,

    // TODO: Do away with this getter when support for 1.9.x is dropped
    get extensions() {
        return this._extensions.map(function (e) ({
            id: e.id,
            name: e.name,
            description: e.description,
            enabled: e.isActive,
            icon: e.iconURL,
            options: e.optionsURL,
            version: e.version,
            original: e
        }));
      },

    getExtension: function (name) this.extensions.filter(function (e) e.name == name)[0],

    // Global constants
    CURRENT_TAB: [],
    NEW_TAB: [],
    NEW_BACKGROUND_TAB: [],
    NEW_WINDOW: [],

    forceNewTab: false,
    forceNewWindow: false,

    /** @property {string} The Liberator version string. */
    version: "###VERSION### (created: ###DATE###)", // these VERSION and DATE tokens are replaced by the Makefile

    /**
     * @property {Object} The map of command-line options. These are
     *     specified in the argument to the host application's -{config.name}
     *     option. E.g. $ firefox -vimperator '+u=/tmp/rcfile ++noplugin'
     *     Supported options:
     *         +u=RCFILE   Use RCFILE instead of .vimperatorrc.
     *         ++noplugin  Don't load plugins.
     */
    commandLineOptions: {
        /** @property Whether plugin loading should be prevented. */
        noPlugins: false,
        /** @property An RC file to use rather than the default. */
        rcFile: null,
        /** @property An Ex command to run before any initialization is performed. */
        preCommands: null,
        /** @property An Ex command to run after all initialization has been performed. */
        postCommands: null
    },

    registerObserver: function (type, callback) {
        if (!(type in this.observers))
            this.observers[type] = [];
        this.observers[type].push(callback);
    },

    unregisterObserver: function (type, callback) {
        if (type in this.observers)
            this.observers[type] = this.observers[type].filter(function (c) c != callback);
    },

    // TODO: "zoom": if the zoom value of the current buffer changed
    triggerObserver: function (type) {
        let args = Array.slice(arguments, 1);
        for (let [, func] in Iterator(this.observers[type] || []))
            func.apply(null, args);
    },

    /**
     * Triggers the application bell to notify the user of an error. The
     * bell may be either audible or visual depending on the value of the
     * 'visualbell' option.
     */
    beep: function () {
        // FIXME: popups clear the command line
        if (options["visualbell"]) {
            // flash the visual bell
            let popup = document.getElementById("liberator-visualbell");
            let win = config.visualbellWindow;
            let rect = win.getBoundingClientRect();
            let width = rect.right - rect.left;
            let height = rect.bottom - rect.top;

            // NOTE: this doesn't seem to work in FF3 with full box dimensions
            popup.openPopup(win, "overlap", 1, 1, false, false);
            popup.sizeTo(width - 2, height - 2);
            setTimeout(function () { popup.hidePopup(); }, 20);
        }
        else {
            let soundService = Cc["@mozilla.org/sound;1"].getService(Ci.nsISound);
            soundService.beep();
        }
        return false; // so you can do: if (...) return liberator.beep();
    },

    /**
     * Creates a new thread.
     */
    newThread: function () services.get("threadManager").newThread(0),

    /**
     * Calls a function asynchronously on a new thread.
     *
     * @param {nsIThread} thread The thread to call the function on. If no
     *     thread is specified a new one is created.
     * @optional
     * @param {Object} self The 'this' object used when executing the
     *     function.
     * @param {function} func The function to execute.
     *
     */
    callAsync: function (thread, self, func) {
        thread = thread || services.get("threadManager").newThread(0);
        thread.dispatch(Runnable(self, func, Array.slice(arguments, 3)), thread.DISPATCH_NORMAL);
    },

    /**
     * Calls a function synchronously on a new thread.
     *
     * NOTE: Be sure to call GUI related methods like alert() or dump()
     * ONLY in the main thread.
     *
     * @param {nsIThread} thread The thread to call the function on. If no
     *     thread is specified a new one is created.
     * @optional
     * @param {function} func The function to execute.
     */
    callFunctionInThread: function (thread, func) {
        thread = thread || services.get("threadManager").newThread(0);

        // DISPATCH_SYNC is necessary, otherwise strange things will happen
        thread.dispatch(Runnable(null, func, Array.slice(arguments, 2)), thread.DISPATCH_SYNC);
    },

    /**
     * Prints a message to the console. If <b>msg</b> is an object it is
     * pretty printed.
     *
     * NOTE: the "browser.dom.window.dump.enabled" preference needs to be
     * set.
     *
     * @param {string|Object} msg The message to print.
     */
    dump: function () {
        let msg = Array.map(arguments, function (msg) {
            if (typeof msg == "object")
                msg = util.objectToString(msg);
            return msg;
        }).join(", ");
        msg = String.replace(msg, /\n?$/, "\n");
        window.dump(msg.replace(/^./gm, ("config" in modules && config.name.toLowerCase()) + ": $&"));
    },

    /**
     * Outputs a plain message to the command line.
     *
     * @param {string} str The message to output.
     * @param {number} flags These control the multiline message behaviour.
     *     See {@link CommandLine#echo}.
     */
    echo: function (str, flags) {
        commandline.echo(str, commandline.HL_NORMAL, flags);
    },

    /**
     * Outputs an error message to the command line.
     *
     * @param {string|Error} str The message to output.
     * @param {number} flags These control the multiline message behavior.
     *     See {@link CommandLine#echo}.
     * @param {string} prefix The prefix of error message.
     */
    echoerr: function (str, flags, prefix) {
        try {
            flags |= commandline.APPEND_TO_MESSAGES | commandline.DISALLOW_MULTILINE | commandline.FORCE_SINGLELINE;

            if (typeof str == "object" && "echoerr" in str)
                str = str.echoerr;

            if (options["errorbells"])
                liberator.beep();

            commandline.echo((prefix || "") + str, commandline.HL_ERRORMSG, flags);

            // For errors, also print the stack trace to our :messages list
            if (str instanceof Error) {
                let stackTrace = <></>;
                let stackItems = new Error().stack.split('\n');
                // ignore the first element intenationally!
                for (let i = 1; i < stackItems.length; i++) {
                    let stackItem = stackItems[i];
                    let atIndex = stackItem.lastIndexOf("@");
                    if (atIndex < 0)
                        continue;
                    let stackLocation = stackItem.substring(atIndex + 1);
                    let stackArguments = stackItem.substring(0, atIndex);
                    if (stackArguments)
                        stackArguments = " - " + stackArguments;

                    stackTrace += <><span style="font-weight: normal">&#xa0;&#xa0;at </span>{stackLocation}<span style="font-weight: normal">{stackArguments}</span><br/></>;
                }
                commandline.messages.add({str: stackTrace, highlight: commandline.HL_ERRORMSG});
            }
        } catch (e) {
            // if for some reason, echoerr fails, log this information at least to
            // the console!
            liberator.dump(str);
        }
    },

    /**
     * Outputs an information message to the command line.
     *
     * @param {string} str The message to output.
     * @param {number} flags These control the multiline message behavior.
     *     See {@link CommandLine#echo}.
     */
    echomsg: function (str, flags) {
        flags |= commandline.APPEND_TO_MESSAGES | commandline.DISALLOW_MULTILINE | commandline.FORCE_SINGLELINE;
        commandline.echo(str, commandline.HL_INFOMSG, flags);
    },

    /**
     * Loads and executes the script referenced by <b>uri</b> in the scope
     * of the <b>context</b> object.
     *
     * @param {string} uri The URI of the script to load. Should be a local
     *     chrome:, file:, or resource: URL.
     * @param {Object} context The context object into which the script
     *     should be loaded.
     */
    loadScript: function (uri, context) {
        XML.ignoreWhiteSpace = false;
        XML.prettyPrinting = false;
        services.get("subscriptLoader").loadSubScript(uri, context, "UTF-8");
    },

    eval: function (str, context) {
        try {
            if (!context)
                context = userContext;
            context[EVAL_ERROR] = null;
            context[EVAL_STRING] = str;
            context[EVAL_RESULT] = null;
            this.loadScript("chrome://liberator/content/eval.js", context);
            if (context[EVAL_ERROR]) {
                try {
                    context[EVAL_ERROR].fileName = io.sourcing.file;
                    context[EVAL_ERROR].lineNumber += io.sourcing.line;
                }
                catch (e) {}
                throw context[EVAL_ERROR];
            }
            return context[EVAL_RESULT];
        }
        finally {
            delete context[EVAL_ERROR];
            delete context[EVAL_RESULT];
            delete context[EVAL_STRING];
        }
    },

    // partial sixth level expression evaluation
    // TODO: what is that really needed for, and where could it be used?
    //       Or should it be removed? (c) Viktor
    //       Better name?  See other liberator.eval()
    //       I agree, the name is confusing, and so is the
    //           description --Kris
    evalExpression: function (string) {
        string = string.toString().replace(/^\s*/, "").replace(/\s*$/, "");

        let matches = string.match(/^&(\w+)/);
        if (matches) {
            let opt = this.options.get(matches[1]);

            liberator.assert(opt, "Unknown option: " + matches[1]);

            let type = opt.type;
            let value = opt.getter();

            if (type != "boolean" && type != "number")
                value = value.toString();

            return value;
        }
        // String
        else if ((matches = string.match(/^(['"])([^\1]*?[^\\]?)\1/))) {
            return matches[2].toString();
        }
        // Number
        else if ((matches = string.match(/^(\d+)$/)))
            return parseInt(matches[1], 10);

        let reference = this.variableReference(string);

        if (!reference[0])
            this.echoerr("Undefined variable: " + string);
        else
            return reference[0][reference[1]];
        return null;
    },

    /**
     * Execute an Ex command string. E.g. ":zoom 300".
     *
     * @param {string} str The command to execute.
     * @param {Object} modifiers Any modifiers to be passed to
     *     {@link Command#action}.
     * @param {boolean} silent Whether the command should be echoed on the
     *     command line.
     */
    execute: function (str, modifiers, silent) {
        // skip comments and blank lines
        if (/^\s*("|$)/.test(str))
            return;

        modifiers = modifiers || {};

        let err = null;
        let [count, cmd, special, args] = commands.parseCommand(str.replace(/^'(.*)'$/, "$1"));
        let command = commands.get(cmd);

        if (command === null) {
            err = "Not a " + config.name.toLowerCase() + " command: " + str;
            liberator.focusContent();
        }
        else if (command.action === null)
            err = "Internal error: command.action === null"; // TODO: need to perform this test? -- djk
        else if (count != null && !command.count)
            err = "No range allowed";
        else if (special && !command.bang)
            err = "No ! allowed";

        liberator.assert(!err, err);
        if (!silent)
            commandline.command = str.replace(/^\s*:\s*/, "");

        command.execute(args, special, count, modifiers);
    },

    /**
     * Focuses the content window.
     *
     * @param {boolean} clearFocusedElement Remove focus from any focused
     *     element.
     */
    focusContent: function (clearFocusedElement) {
        if (window != services.get("windowWatcher").activeWindow)
            return;

        let elem = config.mainWidget || window.content;
        // TODO: make more generic
        try {
            if (this.has("tabs")) {
                // select top most frame in a frameset
                let frame = tabs.localStore.focusedFrame;
                if (frame && frame.top == window.content)
                    elem = frame;
            }
        }
        catch (e) {}

        if (clearFocusedElement && liberator.focus)
            liberator.focus.blur();
        if (elem && elem != liberator.focus)
            elem.focus();
    },

    /**
     * Returns whether this Liberator extension supports <b>feature</b>.
     *
     * @param {string} feature The feature name.
     * @returns {boolean}
     */
    has: function (feature) config.features.indexOf(feature) >= 0,

    /**
     * Returns whether the host application has the specified extension
     * installed.
     *
     * @param {string} name The extension name.
     * @returns {boolean}
     */
    hasExtension: function (name) {
        return this._extensions.some(function (e) e.name == name);
    },

    /**
     * Returns the URL of the specified help <b>topic</b> if it exists.
     *
     * @param {string} topic The help topic to lookup.
     * @param {boolean} unchunked Whether to search the unchunked help page.
     * @returns {string}
     */
    findHelp: function (topic, unchunked) {
        if (topic in services.get("liberator:").FILE_MAP)
            return topic;
        unchunked = !!unchunked;
        let items = completion._runCompleter("help", topic, null, unchunked).items;
        let partialMatch = null;

        function format(item) item.description + "#" + encodeURIComponent(item.text);

        for (let [i, item] in Iterator(items)) {
            if (item.text == topic)
                return format(item);
            else if (!partialMatch && topic)
                partialMatch = item;
        }

        if (partialMatch)
            return format(partialMatch);
        return null;
    },

    /**
     * @private
     * Initialize the help system.
     */
    initHelp: function () {
        let namespaces = [config.name.toLowerCase(), "liberator"];
        services.get("liberator:").init({});

        let tagMap = services.get("liberator:").HELP_TAGS;
        let fileMap = services.get("liberator:").FILE_MAP;
        let overlayMap = services.get("liberator:").OVERLAY_MAP;

        // Left as an XPCOM instantiation so it can easilly be moved
        // into XPCOM code.
        function XSLTProcessor(sheet) {
            let xslt = Cc["@mozilla.org/document-transformer;1?type=xslt"].createInstance(Ci.nsIXSLTProcessor);
            xslt.importStylesheet(util.httpGet(sheet).responseXML);
            return xslt;
        }

        // Find help and overlay files with the given name.
        function findHelpFile(file) {
            let result = [];
            for (let [, namespace] in Iterator(namespaces)) {
                let url = ["chrome://", namespace, "/locale/", file, ".xml"].join("");
                let res = util.httpGet(url);
                if (res) {
                    if (res.responseXML.documentElement.localName == "document")
                        fileMap[file] = url;
                    if (res.responseXML.documentElement.localName == "overlay")
                        overlayMap[file] = url;
                    result.push(res.responseXML);
                }
            }
            return result;
        }
        // Find the tags in the document.
        function addTags(file, doc) {
            doc = XSLT.transformToDocument(doc);
            for (let elem in util.evaluateXPath("//xhtml:a/@id", doc))
                tagMap[elem.value] = file;
        }

        const XSLT = XSLTProcessor("chrome://liberator/content/help-single.xsl");

        // Scrape the list of help files from all.xml
        // Always process main and overlay files, since XSLTProcessor and
        // XMLHttpRequest don't allow access to chrome documents.
        tagMap.all = "all";
        let files = findHelpFile("all").map(function (doc)
                [f.value for (f in util.evaluateXPath(
                    "//liberator:include/@href", doc))]);

        // Scrape the tags from the rest of the help files.
        util.Array.flatten(files).forEach(function (file) {
            findHelpFile(file).forEach(function (doc) {
                addTags(file, doc);
            });
        });

        // Process plugin help entries.
        XML.ignoreWhiteSpace = false;
        XML.prettyPrinting = false;
        XML.prettyPrinting = true; // Should be false, but ignoreWhiteSpace=false doesn't work correctly. This is the lesser evil.
        XML.prettyIndent = 4;

        let lang = options.getPref("general.useragent.locale", "en-US");
        function chooseByLang(elems) {
            if (!elems)
                return null;
            function get(lang) {
                let i = elems.length();
                while (i-- > 0){
                    if ((elems[i].@lang).toString() == lang)
                        return elems[i];
                }
            }
            elems = elems.(function::nodeKind() == "element");
            return get(lang) || get(lang.split("-", 2).shift()) || get("") || get("en-US") || get("en") || elems[0] || elems;
        }
        let body = XML();
        for (let [, context] in Iterator(plugins.contexts)) {
            if (context.INFO instanceof XML) {
                let info = chooseByLang(context.INFO);
                body += <h2 xmlns={NS.uri} tag={info.@name + '-plugin'}>{info.@summary}</h2> + info;
            }
        }

        let help = '<?xml version="1.0"?>\n' +
                   '<?xml-stylesheet type="text/xsl" href="chrome://liberator/content/help.xsl"?>\n' +
                   '<!DOCTYPE document SYSTEM "chrome://liberator/content/liberator.dtd">' +
            <document xmlns={NS}
                name="plugins" title={config.name + " Plugins"}>
                <h1 tag="using-plugins">Using Plugins</h1>

                {body}
            </document>.toXMLString();
        fileMap["plugins"] = function () ['text/xml;charset=UTF-8', help];

        addTags("plugins", util.httpGet("liberator://help/plugins").responseXML);
    },

    /**
     * Opens the help page containing the specified <b>topic</b> if it
     * exists.
     *
     * @param {string} topic The help topic to open.
     * @param {boolean} unchunked Whether to use the unchunked help page.
     * @returns {string}
     */
    help: function (topic, unchunked) {
        if (!topic) {
            let helpFile = unchunked ? "all" : options["helpfile"];
            if (helpFile in services.get("liberator:").FILE_MAP)
                liberator.open("liberator://help/" + helpFile, { from: "help" });
            else
                liberator.echomsg("Sorry, help file " + helpFile.quote() + " not found");
            return;
        }

        let page = this.findHelp(topic, unchunked);
        liberator.assert(page != null, "Sorry, no help for: " + topic);

        liberator.open("liberator://help/" + page, { from: "help" });
        if (!options["activate"] || options.get("activate").has("all", "help"))
            content.postMessage("fragmentChange", "*");
    },

    /**
     * The map of global variables.
     *
     * These are set and accessed with the "g:" prefix.
     */
    globalVariables: {},

    loadPlugins: function () {
        function sourceDirectory(dir) {
            liberator.assert(dir.isReadable(), "Cannot read directory: " + dir.path);

            liberator.log("Sourcing plugin directory: " + dir.path + "...");
            dir.readDirectory(true).forEach(function (file) {
                if (file.isFile() && /\.(js|vimp)$/i.test(file.path) && !(file.path in liberator.pluginFiles)) {
                    try {
                        io.source(file.path, false);
                        liberator.pluginFiles[file.path] = true;
                    }
                    catch (e) {
                        liberator.echoerr(e);
                    }
                }
                else if (file.isDirectory())
                    sourceDirectory(file);
            });
        }

        let dirs = io.getRuntimeDirectories("plugin");

        if (dirs.length == 0) {
            liberator.log("No user plugin directory found");
            return;
        }

        liberator.log('Searching for "plugin/**/*.{js,vimp}" in "'
                            + [dir.path.replace(/.plugin$/, "") for ([, dir] in Iterator(dirs))].join(",") + '"');

        dirs.forEach(function (dir) {
            liberator.log("Searching for \"" + (dir.path + "/**/*.{js,vimp}") + "\"", 3);
            sourceDirectory(dir);
        });
    },

    /**
     * Logs a message to the JavaScript error console.
     *
     * @param {string|Object} msg The message to print.
     */
    log: function (msg) {
        if (typeof msg == "object")
            msg = util.objectToString(msg, false);

        services.get("console").logStringMessage(config.name.toLowerCase() + ": " + msg);
    },

    /**
     * Opens one or more URLs. Returns true when load was initiated, or
     * false on error.
     *
     * @param {string|string[]} urls Either a URL string or an array of URLs.
     *     The array can look like this:
     *       ["url1", "url2", "url3", ...]
     *     or:
     *       [["url1", postdata1], ["url2", postdata2], ...]
     * @param {number|Object} where If ommited, CURRENT_TAB is assumed but NEW_TAB
     *     is set when liberator.forceNewTab is true.
     * @param {boolean} force Don't prompt whether to open more than 20
     *     tabs.
     * @returns {boolean}
     */
    open: function (urls, params, force) {
        // convert the string to an array of converted URLs
        // -> see util.stringToURLArray for more details
        //
        // This is strange. And counterintuitive. Is it really
        // necessary? --Kris
        if (typeof urls == "string") {
            // rather switch to the tab instead of opening a new url in case of "12: Tab Title" like "urls"
            if (liberator.has("tabs")) {
                let matches = urls.match(/^(\d+):/);
                if (matches) {
                    tabs.select(parseInt(matches[1], 10) - 1, false, true); // make it zero-based
                    return;
                }
            }

            urls = util.stringToURLArray(urls);
        }

        if (urls.length > 20 && !force) {
            commandline.input("This will open " + urls.length + " new tabs. Would you like to continue? (yes/[no]) ",
                function (resp) {
                    if (resp && resp.match(/^y(es)?$/i))
                        liberator.open(urls, params, true);
                });
            return;
        }

        let flags = 0;
        params = params || {};
        if (params instanceof Array)
            params = { where: params };

        for (let [opt, flag] in Iterator({ replace: "REPLACE_HISTORY", hide: "BYPASS_HISTORY" }))
            if (params[opt])
                flags |= Ci.nsIWebNavigation["LOAD_FLAGS_" + flag];

        let where = params.where || liberator.CURRENT_TAB;
        if (liberator.forceNewTab)
            where = liberator.NEW_TAB;
        else if (liberator.forceNewWindow)
            where = liberator.NEW_WINDOW;

        if ("from" in params && liberator.has("tabs")) {
            if (!('where' in params) && options["newtab"] && options.get("newtab").has("all", params.from))
                where = liberator.NEW_TAB;
            if (options["activate"] && !options.get("activate").has("all", params.from)) {
                if (where == liberator.NEW_TAB)
                    where = liberator.NEW_BACKGROUND_TAB;
                else if (where == liberator.NEW_BACKGROUND_TAB)
                    where = liberator.NEW_TAB;
            }
        }

        if (urls.length == 0)
            return;

        let browser = config.browser;
        function open(urls, where) {
            try {
                let url = Array.concat(urls)[0];
                let postdata = Array.concat(urls)[1];

                // decide where to load the first url
                switch (where) {
                case liberator.CURRENT_TAB:
                    browser.loadURIWithFlags(url, flags, null, null, postdata);
                    break;

                case liberator.NEW_BACKGROUND_TAB:
                case liberator.NEW_TAB:
                    if (!liberator.has("tabs")) {
                        open(urls, liberator.NEW_WINDOW);
                        return;
                    }

                    options.withContext(function () {
                        options.setPref("browser.tabs.loadInBackground", true);
                        browser.loadOneTab(url, null, null, postdata, where == liberator.NEW_BACKGROUND_TAB);
                    });
                    break;

                case liberator.NEW_WINDOW:
                    window.open();
                    let win = services.get("windowMediator").getMostRecentWindow("navigator:browser");
                    win.loadURI(url, null, postdata);
                    browser = win.getBrowser();
                    break;
                }
            }
            catch (e) {}
        }

        for (let [, url] in Iterator(urls)) {
            open(url, where);
            where = liberator.NEW_BACKGROUND_TAB;
        }
    },

    pluginFiles: {},

    // namespace for plugins/scripts. Actually (only) the active plugin must/can set a
    // v.plugins.mode = <str> string to show on v.modes.CUSTOM
    // v.plugins.stop = <func> hooked on a v.modes.reset()
    // v.plugins.onEvent = <func> function triggered, on keypresses (unless <esc>) (see events.js)
    plugins: plugins,

    /**
     * Quit the host application, no matter how many tabs/windows are open.
     *
     * @param {boolean} saveSession If true the current session will be
     *     saved and restored when the host application is restarted.
     * @param {boolean} force Forcibly quit irrespective of whether all
     *    windows could be closed individually.
     */
    quit: function (saveSession, force) {
        // TODO: Use safeSetPref?
        if (saveSession)
            options.setPref("browser.startup.page", 3); // start with saved session
        else
            options.setPref("browser.startup.page", 1); // start with default homepage session

        if (force)
            services.get("appStartup").quit(Ci.nsIAppStartup.eForceQuit);
        else
            window.goQuitApplication();
    },

    /*
     * Tests a condition and throws a FailedAssertion error on
     * failure.
     *
     * @param {boolean} condition The condition to test.
     * @param {string}  message The message to present to the
     *                          user on failure.
     */
    assert: function (condition, message) {
        if (!condition)
            throw new FailedAssertion(message);
    },

    /**
     * Traps errors in the called function, possibly reporting them.
     *
     * @param {function} func The function to call
     * @param {object} self The 'this' object for the function.
     */
    trapErrors: function (func, self) {
        try {
            return func.apply(self || this, Array.slice(arguments, 2));
        }
        catch (e) {
            if (e instanceof FailedAssertion) {
                if (e.message)
                    liberator.echoerr(e.message);
                else
                    liberator.beep();
            }
            else
                liberator.echoerr(e);
            return undefined;
        }
    },

    /**
     * Reports an error to both the console and the host application's
     * Error Console.
     *
     * @param {Object} error The error object.
     */
    /*reportError: function (error) {
        if (Cu.reportError)
            Cu.reportError(error);

        try {
            let obj = {
                toString: function () String(error),
                stack: <>{String.replace(error.stack || Error().stack, /^/mg, "\t")}</>
            };
            for (let [k, v] in Iterator(error)) {
                if (!(k in obj))
                    obj[k] = v;
            }
            if (liberator.storeErrors) {
                let errors = storage.newArray("errors", { store: false });
                errors.toString = function () [String(v[0]) + "\n" + v[1] for ([k, v] in this)].join("\n\n");
                errors.push([new Date, obj + obj.stack]);
            }
            liberator.dump(String(error));
            liberator.dump(obj);
            liberator.dump("");
        }
        catch (e) { window.dump(e); }
    },*/

    /**
     * Restart the host application.
     */
    restart: function () {
        // notify all windows that an application quit has been requested.
        var cancelQuit = Cc["@mozilla.org/supports-PRBool;1"].createInstance(Ci.nsISupportsPRBool);
        services.get("observer").notifyObservers(cancelQuit, "quit-application-requested", null);

        // something aborted the quit process.
        if (cancelQuit.data)
            return;

        // notify all windows that an application quit has been granted.
        services.get("observer").notifyObservers(null, "quit-application-granted", null);

        // enumerate all windows and call shutdown handlers
        let windows = services.get("windowMediator").getEnumerator(null);
        while (windows.hasMoreElements()) {
            let win = windows.getNext();
            if (("tryToClose" in win) && !win.tryToClose())
                return;
        }
        services.get("appStartup").quit(Ci.nsIAppStartup.eRestart | Ci.nsIAppStartup.eAttemptQuit);
    },

    /**
     * Parses a Liberator command-line string i.e. the value of the
     * -liberator command-line option.
     *
     * @param {string} cmdline The string to parse for command-line
     *     options.
     * @returns {Object}
     * @see Commands#parseArgs
     */
    parseCommandLine: function (cmdline) {
        const options = [
            [["+u"], commands.OPTIONS_STRING],
            [["++noplugin"], commands.OPTIONS_NOARG],
            [["++cmd"], commands.OPTIONS_STRING, null, null, true],
            [["+c"], commands.OPTIONS_STRING, null, null, true]
        ];
        return commands.parseArgs(cmdline, options, [], "*");
    },

    sleep: function (delay) {
        let mainThread = services.get("threadManager").mainThread;

        let end = Date.now() + delay;
        while (Date.now() < end)
            mainThread.processNextEvent(true);
        return true;
    },

    callInMainThread: function (callback, self) {
        let mainThread = services.get("threadManager").mainThread;
        if (!services.get("threadManager").isMainThread)
            mainThread.dispatch({ run: callback.call(self) }, mainThread.DISPATCH_NORMAL);
        else
            callback.call(self);
    },

    threadYield: function (flush, interruptable) {
        let mainThread = services.get("threadManager").mainThread;
        liberator.interrupted = false;
        do {
            mainThread.processNextEvent(!flush);
            if (liberator.interrupted)
                throw new Error("Interrupted");
        }
        while (flush === true && mainThread.hasPendingEvents());
    },

    variableReference: function (string) {
        if (!string)
            return [null, null, null];

        let matches = string.match(/^([bwtglsv]):(\w+)/);
        if (matches) { // Variable
            // Other variables should be implemented
            if (matches[1] == "g") {
                if (matches[2] in this.globalVariables)
                    return [this.globalVariables, matches[2], matches[1]];
                else
                    return [null, matches[2], matches[1]];
            }
        }
        else { // Global variable
            if (string in this.globalVariables)
                return [this.globalVariables, string, "g"];
            else
                return [null, string, "g"];
        }
        throw Error("What the fuck?");
    },

    /**
     * @property {Window[]} Returns an array of all the host application's
     *     open windows.
     */
    get windows() {
        let windows = [];
        let enumerator = services.get("windowMediator").getEnumerator("navigator:browser");
        while (enumerator.hasMoreElements())
            windows.push(enumerator.getNext());

        return windows;
    }

}, {
    // return the platform normalized to Vim values
    getPlatformFeature: function () {
        let platform = navigator.platform;
        return /^Mac/.test(platform) ? "MacUnix" :
               platform == "Win32"   ? "Win32" :
               platform == "Win64"   ? "Win64" :
               "Unix";
    },

    // TODO: move this
    getMenuItems: function () {
        function addChildren(node, parent) {
            for (let [, item] in Iterator(node.childNodes)) {
                if (item.childNodes.length == 0 && item.localName == "menuitem"
                    && !/rdf:http:/.test(item.getAttribute("label"))) { // FIXME
                    item.fullMenuPath = parent + item.getAttribute("label");
                    items.push(item);
                }
                else {
                    let path = parent;
                    if (item.localName == "menu")
                        path += item.getAttribute("label") + ".";
                    addChildren(item, path);
                }
            }
        }

        let items = [];
        addChildren(document.getElementById(config.toolbars["menu"][0][0]), "");
        return items;
    },

}, {

    // Only general options are added here, which are valid for all liberator extensions
    options: function () {
        options.add(["errorbells", "eb"],
            "Ring the bell when an error message is displayed",
            "boolean", false);

        options.add(["exrc", "ex"],
            "Allow reading of an RC file in the current directory",
            "boolean", false);

        options.add(["fullscreen", "fs"],
            "Show the current window fullscreen",
            "boolean", false, {
                setter: function (value) window.fullScreen = value,
                getter: function () window.fullScreen
            });

        options.add(["helpfile", "hf"],
            "Name of the main help file",
            "string", "intro");

        options.add(["loadplugins", "lpl"],
            "Load plugin scripts when starting up",
            "boolean", true);

        // TODO: Is this vimperator only? Otherwise fix for Muttator
        options.add(["scrollbars", "sb"],
            "Show scrollbars in the content window when needed",
            "boolean", true, {
                setter: function (value) {
                    if (value)
                        styles.removeSheet(true, "scrollbars");
                    else // Use [orient="horizontal"] if you only want to change the horizontal scrollbars
                        styles.addSheet(true, "scrollbars", "*", "html|html > xul|scrollbar { visibility: collapse !important; }", true);

                    return value;
                }
            });

        options.add(["smallicons", "si"],
            "Show small or normal size icons in the main toolbar",
            "boolean", true, {
                setter: function (value) {
                    try {
                        let mainToolbar = config.mainToolbar;
                        mainToolbar.setAttribute("iconsize", value ? "small" : "large");
                    } catch (e) { }
                    return value;
                },
                getter: function () {
                    try {
                        let mainToolbar = config.mainToolbar;
                        return mainToolbar.getAttribute("iconsize") == "small";
                    } catch (e) {
                        return false;
                    }
                }
            });


        options.add(["titlestring"],
            "Change the title of the window",
            "string", config.defaults.titlestring || config.hostApplication,
            {
                setter: function (value) {
                    let win = document.documentElement;
                    function updateTitle(old, current) {
                        document.title = document.title.replace(RegExp("(.*)" + util.escapeRegex(old)), "$1" + current);
                    }

                    if (services.get("privateBrowsing")) {
                        let oldValue = win.getAttribute("titlemodifier_normal");
                        let suffix = win.getAttribute("titlemodifier_privatebrowsing").substr(oldValue.length);

                        win.setAttribute("titlemodifier_normal", value);
                        win.setAttribute("titlemodifier_privatebrowsing", value + suffix);

                        if (services.get("privateBrowsing").privateBrowsingEnabled) {
                            updateTitle(oldValue + suffix, value + suffix);
                            return value;
                        }
                    }

                    updateTitle(win.getAttribute("titlemodifier"), value);
                    win.setAttribute("titlemodifier", value);

                    return value;
                }
            });

        options.add(["toolbars", "gui"],
            "Show or hide toolbars",
            "stringlist", config.defaults.toolbars || "", {
                setter: function (values) {
                    let toolbars = config.toolbars || {};
                    // a set of actions with the the name of the element as the object's keys
                    // and the collapsed state for the values
                    // Used in order to avoid multiple collapse/uncollapse actions
                    // for values like :set gui=none,tabs
                    let actions = {};
                    for (let [, action] in Iterator(this.parseValues(values))) {
                        if (action == "all" || action == "none") {
                            for (let [name, toolbar] in Iterator(toolbars)) {
                                let ids = toolbar[0] || [];
                                ids.forEach(function (id) actions[id] = action == "none");
                            }
                        } else {
                            let toolbarName = action.replace(/^(no|inv)/, "");
                            let toolbar = toolbars[toolbarName];
                            if (toolbar) {
                                let ids = toolbar[0] || [];
                                ids.forEach(function (id) {
                                    let elem = document.getElementById(id);
                                    if (!elem)
                                        return;

                                    let collapsed = false;
                                    if (action.indexOf("no") == 0)
                                        collapsed = true;
                                    else if (action.indexOf("inv") == 0) {
                                        if (typeof(actions[id]) == "boolean")
                                            collapsed = !actions[id];
                                        else {
                                            let hidingAttribute = elem.getAttribute("type") == "menubar" ? "autohide" : "collapsed";
                                            collapsed = !(elem.getAttribute(hidingAttribute) == "true");
                                        }
                                    }
                                    else
                                        collapsed = false;
                                    
                                    actions[id] = collapsed; // add the action, or change an existing action
                                });
                            }
                        }
                    }

                    // finally we can just execute the actions
                    for (let [id, collapsed] in Iterator(actions)) {
                        let elem = document.getElementById(id);
                        if (!elem)
                            continue;

                        // Firefox4 added this helper function, which does more than
                        // just collapsing elements (like showing or hiding the menu button when the menu is hidden/shown)
                        if (window.setToolbarVisibility)
                            window.setToolbarVisibility(elem, !collapsed);
                        else if (elem.getAttribute("type") == "menubar")
                            elem.setAttribute("autohide", collapsed);
                        else
                            elem.collapsed = collapsed;

                        // HACK: prevent the tab-bar from redisplaying when 'toolbars' option has 'notabs'
                        // @see http://code.google.com/p/vimperator-labs/issues/detail?id=520
                        if (id == "TabsToolbar" && config.tabbrowser.mTabContainer.updateVisibility)
                            config.tabbrowser.mTabContainer.updateVisibility = function () { };

                    }

                    return ""; // we need this value, otherwise "inv" options won't work. Maybe we should just make this a local option
                },
                getter: function() {
                    let toolbars = config.toolbars || {};
                    let values = [];
                    for (let [name, toolbar] in Iterator(toolbars)) {
                        let elem = document.getElementById(toolbar[0]);
                        if (elem) {
                            let hidingAttribute = elem.getAttribute("type") == "menubar" ? "autohide" : "collapsed";
                            values.push(elem.getAttribute(hidingAttribute) == "true" ? "no" + name : name);
                        }
                    }
                    return this.joinValues(values);
                },
                completer: function (context) {
                    let toolbars = config.toolbars || {};
                    let completions = [["all",  "Show all toolbars"],
                                       ["none", "Hide all toolbars"]];

                    for (let [name, toolbar] in Iterator(toolbars)) {
                        let elem = document.getElementById(toolbar[0][0]);
                        if (elem) {
                            let hidingAttribute = elem.getAttribute("type") == "menubar" ? "autohide" : "collapsed";
                            completions.push([elem.getAttribute(hidingAttribute) == "true" ? name : "no" + name,
                                              (elem.getAttribute(hidingAttribute) == "true" ? "Show " : "Hide ") + toolbar[1]]);
                        }
                    }
                    context.completions = completions;
                    context.compare = CompletionContext.Sort.unsorted;
                    return completions;
                },
                validator: function (value) {
                    let toolbars = config.toolbars || {};
                    // "ne" is a simple hack, since in the next line val.replace() makes "ne" out from "none"
                    let values = ["all", "ne"].concat([toolbar for each([toolbar, ] in Iterator(toolbars))]);
                    return value.every(function(val) values.indexOf(val.replace(/^(no|inv)/, "")) >= 0);
                }
            });

        options.add(["verbose", "vbs"],
            "Define which info messages are displayed",
            "number", 1,
            { validator: function (value) value >= 0 && value <= 15 });

        options.add(["visualbell", "vb"],
            "Use visual bell instead of beeping on errors",
            "boolean", false,
            {
                setter: function (value) {
                    options.safeSetPref("accessibility.typeaheadfind.enablesound", !value,
                        "See 'visualbell' option");
                    return value;
                }
            });
    },

    mappings: function () {
        mappings.add(modes.all, ["<F1>"],
            "Open the help page",
            function () { liberator.help(); });

        if (liberator.has("session")) {
            mappings.add([modes.NORMAL], ["ZQ"],
                "Quit and don't save the session",
                function () { liberator.quit(false); });
        }

        mappings.add([modes.NORMAL], ["ZZ"],
            "Quit and save the session",
            function () { liberator.quit(true); });
    },

    commands: function () {
        commands.add(["addo[ns]"],
            "Manage available Extensions and Themes",
            function () {
                liberator.open("chrome://mozapps/content/extensions/extensions.xul",
                    { from: "addons" });
            },
            { argCount: "0" });

        commands.add(["beep"],
            "Play a system beep", // Play? Wrong word. Implies some kind of musicality. --Kris
            function () { liberator.beep(); },
            { argCount: "0" });

        commands.add(["dia[log]"],
            "Open a " + config.name + " dialog",
            function (args) {
                let arg = args[0];

                try {
                    // TODO: why are these sorts of properties arrays? --djk
                    let dialogs = config.dialogs;

                    for (let [, dialog] in Iterator(dialogs)) {
                        if (util.compareIgnoreCase(arg, dialog[0]) == 0) {
                            dialog[2]();
                            return;
                        }
                    }

                    liberator.echoerr("Invalid argument: " + arg);
                }
                catch (e) {
                    liberator.echoerr("Error opening " + arg.quote() + ": " + e);
                }
            }, {
                argCount: "1",
                bang: true,
                completer: function (context) {
                    context.ignoreCase = true;
                    return completion.dialog(context);
                }
            });

        commands.add(["em[enu]"],
            "Execute the specified menu item from the command line",
            function (args) {
                let arg = args.literalArg;
                let items = Liberator.getMenuItems();

                liberator.assert(items.some(function (i) i.fullMenuPath == arg),
                    "Menu not found: " + arg);

                for (let [, item] in Iterator(items)) {
                    if (item.fullMenuPath == arg)
                        item.doCommand();
                }
            }, {
                argCount: "1",
                completer: function (context) completion.menuItem(context),
                literal: 0
            });

        commands.add(["exe[cute]"],
            "Execute the argument as an Ex command",
            // FIXME: this should evaluate each arg separately then join
            // with " " before executing.
            // E.g. :execute "source" io.getRCFile().path
            // Need to fix commands.parseArgs which currently strips the quotes
            // from quoted args
            function (args) {
                try {
                    let cmd = liberator.eval(args.string);
                    liberator.execute(cmd, null, true);
                }
                catch (e) {
                    liberator.echoerr(e);
                }
            });

        commands.add(["exta[dd]"],
            "Install an extension",
            function (args) {
                let file = io.File(args[0]);

                if (file.exists() && file.isReadable() && file.isFile())
                    AddonManager.getInstallForFile(file, function (a) a.install());
                else {
                    if (file.exists() && file.isDirectory())
                        liberator.echoerr("Cannot install a directory: " + file.path);

                    liberator.echoerr("Cannot open file: " + file.path);
                }
            }, {
                argCount: "1",
                completer: function (context) {
                    context.filters.push(function ({ item: f }) f.isDirectory() || /\.xpi$/.test(f.leafName));
                    completion.file(context);
                }
            });

        // TODO: handle extension dependencies
        [
            {
                name: "extde[lete]",
                description: "Uninstall an extension",
                action: "uninstallItem"
            },
            {
                name: "exte[nable]",
                description: "Enable an extension",
                action: "enableItem",
                filter: function ({ item: e }) (!e.enabled || (e.original && e.original.userDisabled))
            },
            {
                name: "extd[isable]",
                description: "Disable an extension",
                action: "disableItem",
                filter: function ({ item: e }) (e.enabled || (e.original && !e.original.userDisabled))
            }
        ].forEach(function (command) {
            commands.add([command.name],
                command.description,
                function (args) {
                    let name = args[0];
                    function action(e) {
                        if (command.action == "uninstallItem")
                            e.original.uninstall();
                        else
                            e.original.userDisabled = command.action == "disableItem";
                    };

                    if (args.bang)
                        liberator.extensions.forEach(function (e) { action(e); });
                    else {
                        liberator.assert(name, "Argument required");

                        let extension = liberator.getExtension(name);
                        if (extension)
                            action(extension);
                        else
                            liberator.echoerr("Invalid argument");
                    }
                }, {
                    argCount: "?", // FIXME: should be "1"
                    bang: true,
                    completer: function (context) {
                        completion.extension(context);
                        if (command.filter)
                            context.filters.push(command.filter);
                    },
                    literal: 0
                });
        });

        commands.add(["exto[ptions]", "extp[references]"],
            "Open an extension's preference dialog",
            function (args) {
                let extension = liberator.getExtension(args[0]);
                liberator.assert(extension && extension.options, "Invalid argument");

                if (args.bang)
                    window.openDialog(extension.options, "_blank", "chrome,toolbar");
                else
                    liberator.open(extension.options, { from: "extoptions" });
            }, {
                argCount: "1",
                bang: true,
                completer: function (context) {
                    completion.extension(context);
                    context.filters.push(function ({ item: e }) e.options);
                },
                literal: 0
            });

        // TODO: maybe indicate pending status too?
        commands.add(["extens[ions]"],
            "List available extensions",
            function (args) {
                let filter = args[0] || "";
                let extensions = liberator.extensions.filter(function (e) e.name.indexOf(filter) >= 0);

                if (extensions.length > 0) {
                    let list = template.tabular(
                        ["Name", "Version", "Status", "Description"],
                        ([template.icon(e, e.name),
                          e.version,
                          e.enabled ? <span highlight="Enabled">enabled</span>
                                    : <span highlight="Disabled">disabled</span>,
                          e.description] for ([, e] in Iterator(extensions)))
                    );

                    commandline.echo(list, commandline.HL_NORMAL, commandline.FORCE_MULTILINE);
                }
                else {
                    if (filter)
                        liberator.echoerr("No matching extensions for: " + filter);
                    else
                        liberator.echoerr("No extensions installed");
                }
            },
            { argCount: "?" });

        [
            {
                name: "h[elp]",
                description: "Open the help page"
            }, {
                name: "helpa[ll]",
                description: "Open the single unchunked help page"
            }
        ].forEach(function (command) {
            let unchunked = command.name == "helpa[ll]";

            commands.add([command.name],
                command.description,
                function (args) {
                    liberator.assert(!args.bang, "Don't panic!");

                    liberator.help(args.literalArg, unchunked);
                }, {
                    argCount: "?",
                    bang: true,
                    completer: function (context) completion.help(context, unchunked),
                    literal: 0
                });
        });

        commands.add(["javas[cript]", "js"],
            "Run a JavaScript command through eval()",
            function (args) {
                if (args.bang) { // open JavaScript console
                    liberator.open("chrome://global/content/console.xul",
                        { from: "javascript" });
                }
                else {
                    try {
                        liberator.eval(args.string);
                    }
                    catch (e) {
                        liberator.echoerr(e);
                    }
                }
            }, {
                bang: true,
                completer: function (context) completion.javascript(context),
                hereDoc: true,
                literal: 0
            });

        commands.add(["loadplugins", "lpl"],
            "Load all plugins immediately",
            function () { liberator.loadPlugins(); },
            { argCount: "0" });

        commands.add(["norm[al]"],
            "Execute Normal mode commands",
            function (args) { events.feedkeys(args.string, args.bang); },
            {
                argCount: "+",
                bang: true
            });

        commands.add(["q[uit]"],
            liberator.has("tabs") ? "Quit current tab" : "Quit application",
            function (args) {
                if (liberator.has("tabs"))
                    tabs.remove(config.browser.mCurrentTab, 1, false, 1);
                else
                    liberator.quit(false, args.bang);
            }, {
                argCount: "0",
                bang: true
            });

        commands.add(["res[tart]"],
            "Force " + config.name + " to restart",
            function () { liberator.restart(); },
            { argCount: "0" });

        commands.add(["time"],
            "Profile a piece of code or run a command multiple times",
            function (args) {
                let count = args.count;
                let special = args.bang;
                args = args.string;

                if (args[0] == ":")
                    var method = function () liberator.execute(args, null, true);
                else
                    method = liberator.eval("(function () {" + args + "})");

                try {
                    if (count > 1) {
                        let each, eachUnits, totalUnits;
                        let total = 0;

                        for (let i in util.interruptibleRange(0, count, 500)) {
                            let now = Date.now();
                            method();
                            total += Date.now() - now;
                        }

                        if (special)
                            return;

                        if (total / count >= 100) {
                            each = total / 1000.0 / count;
                            eachUnits = "sec";
                        }
                        else {
                            each = total / count;
                            eachUnits = "msec";
                        }

                        if (total >= 100) {
                            total = total / 1000.0;
                            totalUnits = "sec";
                        }
                        else
                            totalUnits = "msec";

                        let str = template.genericOutput("Code execution summary",
                                <table>
                                    <tr><td>Executed:</td><td align="right"><span class="times-executed">{count}</span></td><td>times</td></tr>
                                    <tr><td>Average time:</td><td align="right"><span class="time-average">{each.toFixed(2)}</span></td><td>{eachUnits}</td></tr>
                                    <tr><td>Total time:</td><td align="right"><span class="time-total">{total.toFixed(2)}</span></td><td>{totalUnits}</td></tr>
                                </table>);
                        commandline.echo(str, commandline.HL_NORMAL, commandline.FORCE_MULTILINE);
                    }
                    else {
                        let beforeTime = Date.now();
                        method();

                        if (special)
                            return;

                        let afterTime = Date.now();

                        if (afterTime - beforeTime >= 100)
                            liberator.echo("Total time: " + ((afterTime - beforeTime) / 1000.0).toFixed(2) + " sec");
                        else
                            liberator.echo("Total time: " + (afterTime - beforeTime) + " msec");
                    }
                }
                catch (e) {
                    liberator.echoerr(e);
                }
            }, {
                argCount: "+",
                bang: true,
                completer: function (context) {
                    if (/^:/.test(context.filter))
                        return completion.ex(context);
                    else
                        return completion.javascript(context);
                },
                count: true,
                literal: 0
            });

        commands.add(["verb[ose]"],
            "Execute a command with 'verbose' set",
            function (args) {
                let vbs = options.get("verbose");
                let value = vbs.value;
                let setFrom = vbs.setFrom;

                try {
                    vbs.set(args.count || 1);
                    vbs.setFrom = null;
                    liberator.execute(args[0], null, true);
                }
                finally {
                    vbs.set(value);
                    vbs.setFrom = setFrom;
                }
            }, {
                argCount: "+",
                completer: function (context) completion.ex(context),
                count: true,
                literal: 0
            });

        commands.add(["ve[rsion]"],
            "Show version information",
            function (args) {
                if (args.bang)
                    liberator.open("about:");
                else
                    liberator.echo(template.tabular([{ header: "Version Information", style: "font-weight: bold; padding-left: 2ex", colspan: 2 }],
                                                    [[config.name + ":",  liberator.version],
                                                     [config.hostApplication + ":", navigator.userAgent]]));
            }, {
                argCount: "0",
                bang: true
            });

        commands.add(["us[age]"],
            "List all commands, mappings and options with a short description",
            function (args) {
                let usage = {
                    mappings: function() template.table("Mappings", [[item.name || item.names[0], item.description] for (item in mappings)].sort()),
                    commands: function() template.table("Commands", [[item.name || item.names[0], item.description] for (item in commands)]),
                    options:  function() template.table("Options",  [[item.name || item.names[0], item.description] for (item in options)])
                }

                if (args[0] && !usage[args[0]])
                    return void liberator.echoerr("No usage information for: " + args[0]);

                if (args[0])
                    var usage = template.genericOutput(config.name + " Usage", usage[args[0]]());
                else
                    var usage = template.genericOutput(config.name + " Usage", usage["mappings"]() + <br/> + usage["commands"]() + <br/> + usage["options"]());
                liberator.echo(usage, commandline.FORCE_MULTILINE);
            }, {
                argCount: "?",
                bang: false,
                completer: function (context) {
                    context.title = ["Usage Item"];
                    context.compare = CompletionContext.Sort.unsorted;
                    context.completions = [["mappings", "All key bindings"],
                                           ["commands", "All ex-commands"],
                                           ["options",  "All options"]];
                }
            });

    },

    completion: function () {
        completion.dialog = function dialog(context) {
            context.title = ["Dialog"];
            context.completions = config.dialogs;
        };

        completion.extension = function extension(context) {
            context.title = ["Extension"];
            context.anchored = false;
            context.keys = { text: "name", description: "description", icon: "icon" },
            context.completions = liberator.extensions;
        };

        completion.help = function help(context, unchunked) {
            context.title = ["Help"];
            context.anchored = false;
            context.completions = services.get("liberator:").HELP_TAGS;
            if (unchunked)
                context.keys = { text: 0, description: function () "all" };
        };

        completion.menuItem = function menuItem(context) {
            context.title = ["Menu Path", "Label"];
            context.anchored = false;
            context.keys = { text: "fullMenuPath", description: function (item) item.getAttribute("label") };
            context.completions = liberator.menuItems;
        };

        completion.toolbar = function toolbar(context) {
            let toolbox = document.getElementById("navigator-toolbox");
            context.title = ["Toolbar"];
            context.keys = { text: function (item) item.getAttribute("toolbarname"), description: function () "" };
            context.completions = util.evaluateXPath("./*[@toolbarname]", document, toolbox);
        };

        completion.window = function window(context) {
            context.title = ["Window", "Title"]
            context.keys = { text: function (win) liberator.windows.indexOf(win) + 1, description: function (win) win.document.title };
            context.completions = liberator.windows;
        };
    },
    load: function () {
        liberator.triggerObserver("load");

        liberator.log("All modules loaded");

        services.add("commandLineHandler", "@mozilla.org/commandlinehandler/general-startup;1?type=" + config.name.toLowerCase());

        let commandline = services.get("commandLineHandler").optionValue;
        if (commandline) {
            let args = liberator.parseCommandLine(commandline);
            liberator.commandLineOptions.rcFile = args["+u"];
            liberator.commandLineOptions.noPlugins = "++noplugin" in args;
            liberator.commandLineOptions.postCommands = args["+c"];
            liberator.commandLineOptions.preCommands = args["++cmd"];
            liberator.log("Command-line options: " + util.objectToString(liberator.commandLineOptions));
        }


        // first time intro message
        const firstTime = "extensions." + config.name.toLowerCase() + ".firsttime";
        if (options.getPref(firstTime, true)) {
            setTimeout(function () {
                liberator.help();
                options.setPref(firstTime, false);
            }, 1000);
        }

        // always start in normal mode
        modes.reset();

        if (liberator.commandLineOptions.preCommands)
            liberator.commandLineOptions.preCommands.forEach(function (cmd) {
                liberator.execute(cmd);
            });

        // finally, read the RC file and source plugins
        // make sourcing asynchronous, otherwise commands that open new tabs won't work
        setTimeout(function () {
            let extensionName = config.name.toUpperCase();
            let init = services.get("environment").get(extensionName + "_INIT");
            let rcFile = io.getRCFile("~");

            if (liberator.commandLineOptions.rcFile) {
                let filename = liberator.commandLineOptions.rcFile;
                if (!/^(NONE|NORC)$/.test(filename))
                    io.source(io.File(filename).path, false); // let io.source handle any read failure like Vim
            }
            else {
                if (init)
                    liberator.execute(init);
                else {
                    if (rcFile) {
                        io.source(rcFile.path, true);
                        services.get("environment").set("MY_" + extensionName + "RC", rcFile.path);
                    }
                    else
                        liberator.log("No user RC file found");
                }

                if (options["exrc"] && !liberator.commandLineOptions.rcFile) {
                    let localRCFile = io.getRCFile(io.getCurrentDirectory().path);
                    if (localRCFile && !localRCFile.equals(rcFile))
                        io.source(localRCFile.path, true);
                }
            }

            if (liberator.commandLineOptions.rcFile == "NONE" || liberator.commandLineOptions.noPlugins)
                options["loadplugins"] = false;

            if (options["loadplugins"])
                liberator.loadPlugins();

            liberator.initHelp();

            // after sourcing the initialization files, this function will set
            // all gui options to their default values, if they have not been
            // set before by any RC file
            // TODO: Let options specify themselves whether they need to be set at startup!
            for (let option in options) {
                if (!option.hasChanged && ["popups", "smallicons", "titlestring", "toolbars"].indexOf(option.name) >= 0)
                    option.value = option.defaultValue; // call setter
            }

            if (liberator.commandLineOptions.postCommands)
                liberator.commandLineOptions.postCommands.forEach(function (cmd) {
                    liberator.execute(cmd);
                });

            liberator.triggerObserver("enter", null);
            autocommands.trigger(config.name + "Enter", {});
        }, 0);

        statusline.update();
        liberator.log(config.name + " fully initialized");
    }
});

// vim: set fdm=marker sw=4 ts=4 et:
