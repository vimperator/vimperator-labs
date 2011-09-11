// Copyright (c) 2008-2009 by Kris Maglione <maglione.k at Gmail>
// Copyright (c) 2008-2010 by Martin Stubenschrott <stubenschrott@vimperator.org>
//
//
// This work is licensed for reuse under an MIT license. Details are
// given in the License.txt file included with this file.

/** @scope modules */

/**
 * @constant
 * @property {string} The default highlighting rules. They have the
 * form:
 *    rule ::= selector space space+ css
 *    selector ::= group
 *               | group "," css-selector
 *               | group "," css-selector "," scope
 *    group ::= groupname
 *            | groupname css-selector
 */
// <css>
Highlights.prototype.CSS = <><![CDATA[
    Boolean     color: red;
    Function    color: navy;
    Null        color: blue;
    Number      color: blue;
    Object      color: maroon;
    String      color: green;
    Mapping     color: magenta;

    Key         font-weight: bold;

    Enabled     color: green;
    Disabled    color: red;

    Normal          color: black; background: white;
    ErrorMsg        color: white; background: red; font-weight: bold;
    InfoMsg         color: magenta; background: white;
    ModeMsg         color: white; background: green; border-radius: 1px; padding: 0px 5px;
    MoreMsg         color: green; background: white;
    WarningMsg      color: red; background: white;
    Message         white-space: normal; min-width: 100%; padding-left: 2em; text-indent: -2em; display: block;
    NonText         color: blue; min-height: 16px; padding-left: 2px;
    Preview         color: gray;
    Prompt          background: url("chrome://liberator/skin/prompt.png"); width: 10px; background-position: center; background-repeat: no-repeat;
    PromptText      color: white; background: purple;

    CmdOutput             white-space: pre;
    CmdLine               background: white; color: black; -moz-transition: all 0.25s;
    CmdLine>*             font-family: monospace;

    ContentSeparator      border-top: 1px dotted gray; display: -moz-box;

    CompGroup
    CompGroup:not(:first-of-type)  margin-top: 1ex;
    CompTitle            font-weight: bold; background: -moz-linear-gradient(19% 75% 90deg, #DBDBDB, #D9D9D9, #E7E7E7 100%);
    CompTitle>*          color: #333; border-top: 1px solid gray; border-bottom: 1px solid #BBB; padding: 1px 0.5ex; text-shadow: 1px 1px 0px #E0E0E0;
    CompMsg              font-style: italic; margin-left: 16px;
    CompItem
    CompItem[selected]   background: #FFEC8B; box-shadow: 0px 0px 1px #CC0;
    CompItem>*           height: 18px; min-height: 18px; padding: 0 0.5ex;
    CompIcon             width: 16px; min-width: 16px; display: inline-block; margin-right: .5ex;
    CompIcon>img         max-width: 16px; max-height: 16px; vertical-align: middle;
    CompResult           width: 500px; max-width: 500px; overflow: hidden;
    CompDesc             width: 500px; max-width: 500px; color: gray;

    Indicator   color: blue;
    Filter      border-radius: 2px; background: #ffec8b; border: 1px solid orange;

    Keyword     color: red;
    Tag         color: blue;

    LineNr      color: orange; background: white;
    Question    color: green; background: white; font-weight: bold;

    StatusLine  color: gray; background: transparent; font-weight: normal;

    TabNumber      font-weight: bold; margin: 0px; padding-right: .3ex;

    Title       color: magenta; background: white; font-weight: bold;
    URL         text-decoration: none; color: green;
    URL:hover   text-decoration: underline; cursor: pointer;

    FrameIndicator,,* {
        background-color: red;
        opacity: 0.5;
        z-index: 999;
        position: fixed;
        top: 0;
        bottom: 0;
        left: 0;
        right: 0;
    }

    Bell         border: none; background-color: black;
    Hint,,* {
        font-family: monospace;
        font-size: 10px;
        font-weight: bold;
        text-transform: uppercase;
        color: white;
        background-color: red;
        border-color: ButtonShadow;
        border-width: 0px;
        border-style: solid;
        padding: 0px 1px 0px 1px;
    }
    Hint::after,,*  content: attr(number);
    HintElem,,*     background-color: yellow;  color: black;
    HintActive,,*   background-color: #88FF00; color: black;
    HintImage,,*    opacity: .5;

    Help                                        font-size: 8pt; line-height: 1.4em; font-family: -moz-fixed;

    HelpArg                                     color: #6A97D4;
    HelpOptionalArg                             color: #6A97D4;

    HelpBody                                    display: block; margin: 1em auto; max-width: 100ex;
    HelpBorder,*,liberator://help/*             border-color: silver; border-width: 0px; border-style: solid;
    HelpCode                                    display: block; white-space: pre; margin-left: 2em; font-family: Terminus, Fixed, monospace;

    HelpDefault                                 margin-right: 1ex; white-space: pre;

    HelpDescription                             display: block;
    HelpEm,html|em,liberator://help/*           font-weight: bold; font-style: normal;

    HelpEx                                      display: inline-block; color: #527BBD; font-weight: bold;

    HelpExample                                 display: block; margin: 1em 0;
    HelpExample::before                         content: "Example: "; font-weight: bold;

    HelpInfo                                    display: block; width: 20em; margin-left: auto;
    HelpInfoLabel                               display: inline-block; width: 6em;  color: magenta; font-weight: bold; vertical-align: text-top;
    HelpInfoValue                               display: inline-block; width: 14em; text-decoration: none;             vertical-align: text-top;

    HelpItem                                    display: block; margin: 1em 1em 1em 10em; clear: both;

    HelpKey                                     color: #102663;

    HelpLink,html|a,liberator://help/*          text-decoration: none;
    HelpLink[href]:hover                        text-decoration: underline;

    HelpList,html|ul,liberator://help/*         display: block; list-style: outside disc;
    HelpOrderedList,html|ol,liberator://help/*  display: block; list-style: outside decimal;
    HelpListItem,html|li,liberator://help/*     display: list-item;

    HelpNote                                    color: red; font-weight: bold;

    HelpOpt                                     color: #106326;
    HelpOptInfo                                 display: inline-block; margin-bottom: 1ex;

    HelpParagraph,html|p,liberator://help/*     display: block; margin: 1em 0em;
    HelpParagraph:first-child                   margin-top: 0;
    HelpSpec                                    display: block; margin-left: -10em; float: left; clear: left; color: #FF00FF;

    HelpString                                  display: inline-block; color: green; font-weight: normal; vertical-align: text-top;
    HelpString::before                          content: '"';
    HelpString::after                           content: '"';

    HelpHead,html|h1,liberator://help/* {
        display: block;
        margin: 1em 0;
        padding-bottom: .2ex;
        border-bottom-width: 1px;
        font-size: 2em;
        font-weight: bold;
        color: #527BBD;
        clear: both;
    }
    HelpSubhead,html|h2,liberator://help/* {
        display: block;
        margin: 1em 0;
        padding-bottom: .2ex;
        border-bottom-width: 1px;
        font-size: 1.2em;
        font-weight: bold;
        color: #527BBD;
        clear: both;
    }
    HelpSubsubhead,html|h3,liberator://help/* {
        display: block;
        margin: 1em 0;
        padding-bottom: .2ex;
        font-size: 1.1em;
        font-weight: bold;
        color: #527BBD;
        clear: both;
    }

    HelpTOC
    HelpTOC>ol ol                               margin-left: -1em;

    HelpTab,html|dl,liberator://help/*             display: table; width: 100%; margin: 1em 0; border-bottom-width: 1px; border-top-width: 1px; padding: .5ex 0; table-layout: fixed;
    HelpTabColumn,html|column,liberator://help/*   display: table-column;
    HelpTabColumn:first-child                      width: 25%;
    HelpTabTitle,html|dt,liberator://help/*        display: table-cell; padding: .1ex 1ex; font-weight: bold;
    HelpTabDescription,html|dd,liberator://help/*  display: table-cell; padding: .1ex 1ex; border-width: 0px;
    HelpTabRow,html|dl>html|tr,liberator://help/*  display: table-row;

    HelpTag                                     display: inline-block; color: #999; margin-left: 1ex; font-size: 8pt; font-weight: bold;
    HelpTags                                    display: block; float: right; clear: right;
    HelpTopic                                   color: #102663;
    HelpType                                    margin-right: 2ex;

    HelpWarning                                 color: red; font-weight: bold;

    Logo

    Search,,* {
        font-size: inherit;
        padding: 0;
        color: black;
        background-color: yellow;
    }
    ]]></>.toString();

/**
 * A class to manage highlighting rules. The parameters are the
 * standard parameters for any {@link Storage} object.
 *
 * @author Kris Maglione <maglione.k@gmail.com>
 */
function Highlights(name, store) {
    let self = this;
    let highlight = {};
    let styles = storage.styles;

    const Highlight = Struct("class", "selector", "filter", "default", "value", "base");
    Highlight.defaultValue("filter", function ()
        this.base ? this.base.filter :
        ["chrome://liberator/*",
         "liberator:*",
         "file://*"].concat(config.styleableChrome).join(","));
    Highlight.defaultValue("selector", function () self.selector(this.class));
    Highlight.defaultValue("value", function () this.default);
    Highlight.defaultValue("base", function () {
        let base = this.class.match(/^(\w*)/)[0];
        return base != this.class && base in highlight ? highlight[base] : null;
    });
    Highlight.prototype.toString = function () "Highlight(" + this.class + ")\n\t" + [k + ": " + util.escapeString(v || "undefined") for ([k, v] in this)].join("\n\t");

    function keys() [k for ([k, v] in Iterator(highlight))].sort();

    this.__iterator__ = function () (highlight[v] for ([k, v] in Iterator(keys())));

    this.get = function (k) highlight[k];
    this.set = function (key, newStyle, force, append) {
        let [, class_, selectors] = key.match(/^([a-zA-Z_-]+)(.*)/);

        if (!(class_ in highlight))
            return "Unknown highlight keyword: " + class_;

        let style = highlight[key] || Highlight(key);
        styles.removeSheet(true, style.selector);

        if (append)
            newStyle = (style.value || "").replace(/;?\s*$/, "; " + newStyle);
        if (/^\s*$/.test(newStyle))
            newStyle = null;
        if (newStyle == null) {
            if (style.default == null) {
                delete highlight[style.class];
                styles.removeSheet(true, style.selector);
                return null;
            }
            newStyle = style.default;
            force = true;
        }

        let css = newStyle.replace(/(?:!\s*important\s*)?(?:;?\s*$|;)/g, "!important;")
                          .replace(";!important;", ";", "g"); // Seeming Spidermonkey bug
        if (!/^\s*(?:!\s*important\s*)?;*\s*$/.test(css)) {
            css = style.selector + " { " + css + " }";

            let error = styles.addSheet(true, "highlight:" + style.class, style.filter, css, true);
            if (error)
                return error;
        }
        style.value = newStyle;
        highlight[style.class] = style;
        return null;
    };

    /**
     * Gets a CSS selector given a highlight group.
     *
     * @param {string} class
     */
    this.selector = function (class_) {
        let [, hl, rest] = class_.match(/^(\w*)(.*)/);
        let pattern = "[liberator|highlight~=" + hl + "]"
        if (highlight[hl] && highlight[hl].class != class_)
            pattern = highlight[hl].selector;
        return pattern + rest;
    };

    /**
     * Clears all highlighting rules. Rules with default values are
     * reset.
     */
    this.clear = function () {
        for (let [k, v] in Iterator(highlight))
            this.set(k, null, true);
    };

    /**
     * Bulk loads new CSS rules.
     *
     * @param {string} css The rules to load. See {@link Highlights#css}.
     */
    this.loadCSS = function (css) {
        css.replace(/^(\s*\S*\s+)\{((?:.|\n)*?)\}\s*$/gm, function (_, _1, _2) _1 + " " + _2.replace(/\n\s*/g, " "))
           .split("\n").filter(function (s) /\S/.test(s))
           .forEach(function (style) {
                style = Highlight.apply(Highlight, Array.slice(style.match(/^\s*((?:[^,\s]|\s\S)+)(?:,((?:[^,\s]|\s\S)+)?)?(?:,((?:[^,\s]|\s\S)+))?\s*(.*)$/), 1));
                if (/^[>+ ]/.test(style.selector))
                    style.selector = self.selector(style.class) + style.selector;

                let old = highlight[style.class];
                highlight[style.class] = style;
                if (old && old.value != old.default)
                    style.value = old.value;
        });
        for (let [class_, hl] in Iterator(highlight)) {
            if (hl.value == hl.default)
                this.set(class_);
        }
    };
    this.loadCSS(this.CSS);
}

/**
 * Manages named and unnamed user style sheets, which apply to both
 * chrome and content pages. The parameters are the standard
 * parameters for any {@link Storage} object.
 *
 * @author Kris Maglione <maglione.k@gmail.com>
 */
function Styles(name, store) {
    // Can't reference liberator or Components inside Styles --
    // they're members of the window object, which disappear
    // with this window.
    const self = this;
    const util = modules.util;
    const sleep = liberator.sleep;
    const storage = modules.storage;
    const ios = services.get("io");
    const sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
    const namespace = "@namespace html " + XHTML.uri.quote() + ";\n" +
                      "@namespace xul " + XUL.uri.quote() + ";\n" +
                      "@namespace liberator " + NS.uri.quote() + ";\n";

    const Sheet = Struct("name", "id", "sites", "css", "system", "agent");
    Sheet.prototype.__defineGetter__("fullCSS", function wrapCSS() {
        let filter = this.sites;
        let css = this.css;
        if (filter[0] == "*")
            return namespace + css;
        let selectors = filter.map(function (part) (/[*]$/.test(part)   ? "url-prefix" :
                                                    /[\/:]/.test(part)  ? "url"
                                                                        : "domain")
                                            + '("' + part.replace(/"/g, "%22").replace(/[*]$/, "") + '")')
                              .join(", ");
        return namespace + "/* Liberator style #" + this.id + " */ @-moz-document " + selectors + "{\n" + css + "\n}\n";
    });
    Sheet.prototype.__defineGetter__("enabled", function () this._enabled);
    Sheet.prototype.__defineSetter__("enabled", function (on) {
        this._enabled = Boolean(on);
        if (on) {
            self.registerSheet(cssUri(this.fullCSS));
            if (this.agent)
                self.registerSheet(cssUri(this.fullCSS), true);
        }
        else {
            self.unregisterSheet(cssUri(this.fullCSS));
            self.unregisterSheet(cssUri(this.fullCSS), true);
        }
    });

    let cssUri = function (css) "chrome-data:text/css," + window.encodeURIComponent(css);

    let userSheets = [];
    let systemSheets = [];
    let userNames = {};
    let systemNames = {};

    let id = 0;

    this.__iterator__ = function () Iterator(userSheets.concat(systemSheets));
    this.__defineGetter__("systemSheets", function () Iterator(systemSheets));
    this.__defineGetter__("userSheets", function () Iterator(userSheets));
    this.__defineGetter__("systemNames", function () Iterator(systemNames));
    this.__defineGetter__("userNames", function () Iterator(userNames));

    /**
     * Add a new style sheet.
     *
     * @param {boolean} system Declares whether this is a system or
     *     user sheet. System sheets are used internally by
     *     @liberator.
     * @param {string} name The name given to the style sheet by
     *     which it may be later referenced.
     * @param {string} filter The sites to which this sheet will
     *     apply. Can be a domain name or a URL. Any URL ending in
     *     "*" is matched as a prefix.
     * @param {string} css The CSS to be applied.
     */
    this.addSheet = function (system, name, filter, css, agent) {
        let sheets = system ? systemSheets : userSheets;
        let names = system ? systemNames : userNames;
        if (name && name in names)
            this.removeSheet(system, name);

        let sheet = Sheet(name, id++, filter.split(",").filter(util.identity), String(css), system, agent);

        try {
            sheet.enabled = true;
        }
        catch (e) {
            return e.echoerr || e;
        }
        sheets.push(sheet);

        if (name)
            names[name] = sheet;
        return null;
    };

    /**
     * Get a sheet with a given name or index.
     *
     * @param {boolean} system
     * @param {string or number} sheet The sheet to retrieve. Strings indicate
     *     sheet names, while numbers indicate indices.
     */
    this.get = function get(system, sheet) {
        let sheets = system ? systemSheets : userSheets;
        let names = system ? systemNames : userNames;
        if (typeof sheet === "number")
            return sheets[sheet];
        return names[sheet];
    };

    /**
     * Find sheets matching the parameters. See {@link #addSheet}
     * for parameters.
     *
     * @param {boolean} system
     * @param {string} name
     * @param {string} filter
     * @param {string} css
     * @param {number} index
     */
    this.findSheets = function (system, name, filter, css, index) {
        let sheets = system ? systemSheets : userSheets;
        let names = system ? systemNames : userNames;

        // Grossly inefficient.
        let matches = [k for ([k, v] in Iterator(sheets))];
        if (index)
            matches = String(index).split(",").filter(function (i) i in sheets);
        if (name)
            matches = matches.filter(function (i) sheets[i] == names[name]);
        if (css)
            matches = matches.filter(function (i) sheets[i].css == css);
        if (filter)
            matches = matches.filter(function (i) sheets[i].sites.indexOf(filter) >= 0);
        return matches.map(function (i) sheets[i]);
    };

    /**
     * Remove a style sheet. See {@link #addSheet} for parameters.
     * In cases where <b>filter</b> is supplied, the given filters
     * are removed from matching sheets. If any remain, the sheet is
     * left in place.
     *
     * @param {boolean} system
     * @param {string} name
     * @param {string} filter
     * @param {string} css
     * @param {number} index
     */
    this.removeSheet = function (system, name, filter, css, index) {
        let self = this;
        if (arguments.length == 1) {
            var matches = [system];
            system = matches[0].system;
        }
        let sheets = system ? systemSheets : userSheets;
        let names = system ? systemNames : userNames;

        if (filter && filter.indexOf(",") > -1)
            return filter.split(",").reduce(
                function (n, f) n + self.removeSheet(system, name, f, index), 0);

        if (filter == undefined)
            filter = "";

        if (!matches)
            matches = this.findSheets(system, name, filter, css, index);
        if (matches.length == 0)
            return null;

        for (let [, sheet] in Iterator(matches.reverse())) {
            sheet.enabled = false;
            if (name)
                delete names[name];
            if (sheets.indexOf(sheet) > -1)
                sheets.splice(sheets.indexOf(sheet), 1);

            /* Re-add if we're only changing the site filter. */
            if (filter) {
                let sites = sheet.sites.filter(function (f) f != filter);
                if (sites.length)
                    this.addSheet(system, name, sites.join(","), css, sheet.agent);
            }
        }
        return matches.length;
    };

    /**
     * Register a user style sheet at the given URI.
     *
     * @param {string} uri The URI of the sheet to register.
     * @param {boolean} agent If true, sheet is registered as an agent sheet.
     * @param {boolean} reload Whether to reload any sheets that are
     *     already registered.
     */
    this.registerSheet = function (uri, agent, reload) {
        if (reload)
            this.unregisterSheet(uri, agent);
        uri = ios.newURI(uri, null, null);
        if (reload || !sss.sheetRegistered(uri, agent ? sss.AGENT_SHEET : sss.USER_SHEET))
            sss.loadAndRegisterSheet(uri, agent ? sss.AGENT_SHEET : sss.USER_SHEET);
    };

    /**
     * Unregister a sheet at the given URI.
     *
     * @param {string} uri The URI of the sheet to unregister.
     */
    this.unregisterSheet = function (uri, agent) {
        uri = ios.newURI(uri, null, null);
        if (sss.sheetRegistered(uri, agent ? sss.AGENT_SHEET : sss.USER_SHEET))
            sss.unregisterSheet(uri, agent ? sss.AGENT_SHEET : sss.USER_SHEET);
    };
}

Module("styles", {
    requires: ["config", "liberator", "storage", "util"],

    init: function () {
        let (array = util.Array) {
            update(Styles.prototype, {
                get sites() array([v.sites for ([k, v] in this.userSheets)]).flatten().uniq().__proto__,
                completeSite: function (context, content) {
                    context.anchored = false;
                    try {
                        context.fork("current", 0, this, function (context) {
                            context.title = ["Current Site"];
                            context.completions = [
                                [content.location.host, "Current Host"],
                                [content.location.href, "Current URL"]
                            ];
                        });
                    }
                    catch (e) {}
                    context.fork("others", 0, this, function (context) {
                        context.title = ["Site"];
                        context.completions = [[s, ""] for ([, s] in Iterator(styles.sites))];
                    });
                }
            });
        }
        return storage.newObject("styles", Styles, { store: false });
    }
}, {
}, {
    commands: function () {
        commands.add(["sty[le]"],
            "Add or list user styles",
            function (args) {
                let [filter, css] = args;
                let name = args["-name"];

                if (!css) {
                    let list = Array.concat([i for (i in styles.userNames)],
                                            [i for (i in styles.userSheets) if (!i[1].name)]);
                    let str = template.tabular([{ header: "", style: "min-width: 1em; text-align: center; font-weight: bold;", highlight: "Disabled" }, "Name", "Filter", "CSS"],
                        ([sheet.enabled ? "" : "\u00d7",
                          key,
                          sheet.sites.join(","),
                          sheet.css]
                         for ([i, [key, sheet]] in Iterator(list))
                             if ((!filter || sheet.sites.indexOf(filter) >= 0) && (!name || sheet.name == name))));

                    commandline.echo(str, commandline.HL_NORMAL, commandline.FORCE_MULTILINE);
                }
                else {
                    if ("-append" in args) {
                        let sheet = styles.get(false, name);
                        if (sheet) {
                            filter = sheet.sites.concat(filter).join(",");
                            css = sheet.css + " " + css;
                        }
                    }
                    let err = styles.addSheet(false, name, filter, css);
                    if (err)
                        liberator.echoerr(err);
                }
            },
            {
                bang: true,
                completer: function (context, args) {
                    let compl = [];
                    if (args.completeArg == 0)
                        styles.completeSite(context, content);
                    else if (args.completeArg == 1) {
                        let sheet = styles.get(false, args["-name"]);
                        if (sheet)
                            context.completions = [[sheet.css.replace(/\n+/g, " "), "Current Value"]];
                    }
                },
                hereDoc: true,
                literal: 1,
                options: [[["-name", "-n"], commands.OPTION_STRING, null, function () [[k, v.css] for ([k, v] in Iterator(styles.userNames))]],
                          [["-append", "-a"], commands.OPTION_NOARG]],
                serial: function () [
                    {
                        command: this.name,
                        bang: true,
                        options: sty.name ? { "-name": sty.name } : {},
                        arguments: [sty.sites.join(",")],
                        literalArg: sty.css
                    } for ([k, sty] in styles.userSheets)
                ]
            });

        [
            {
                name: ["stylee[nable]", "stye[nable]"],
                desc: "Enable a user style sheet",
                action: function (sheet) sheet.enabled = true,
                filter: function (sheet) !sheet.enabled
            },
            {
                name: ["styled[isable]", "styd[isable]"],
                desc: "Disable a user style sheet",
                action: function (sheet) sheet.enabled = false,
                filter: function (sheet) sheet.enabled
            },
            {
                name: ["stylet[oggle]", "styt[oggle]"],
                desc: "Toggle a user style sheet",
                action: function (sheet) sheet.enabled = !sheet.enabled
            },
            {
                name: ["dels[tyle]"],
                desc: "Remove a user style sheet",
                action: function (sheet) styles.removeSheet(sheet)
            }
        ].forEach(function (cmd) {
            commands.add(cmd.name, cmd.desc,
                function (args) {
                    styles.findSheets(false, args["-name"], args[0], args.literalArg, args["-index"])
                          .forEach(cmd.action);
                },
            {
                completer: function (context) { context.completions = styles.sites.map(function (site) [site, ""]); },
                literal: 1,
                options: [[["-index", "-i"], commands.OPTION_INT, null,
                            function (context) {
                                context.compare = CompletionContext.Sort.number;
                                return [[i, <>{sheet.sites.join(",")}: {sheet.css.replace("\n", "\\n")}</>]
                                        for ([i, sheet] in styles.userSheets)
                                        if (!cmd.filter || cmd.filter(sheet))];
                            }],
                          [["-name", "-n"],  commands.OPTION_STRING, null,
                            function () [[name, sheet.css]
                                         for ([name, sheet] in Iterator(styles.userNames))
                                         if (!cmd.filter || cmd.filter(sheet))]]]
            });
        });
    },
    completion: function () {
        JavaScript.setCompleter(["get", "addSheet", "removeSheet", "findSheets"].map(function (m) styles[m]),
            [ // Prototype: (system, name, filter, css, index)
                null,
                function (context, obj, args) args[0] ? styles.systemNames : styles.userNames,
                function (context, obj, args) styles.completeSite(context, content),
                null,
                function (context, obj, args) args[0] ? styles.systemSheets : styles.userSheets
            ]);
    }
});

Module("highlight", {
    requires: ["config", "styles"],

    init: function () {
        const self = storage.newObject("highlight", Highlights, { store: false });

        if (self.CSS != Highlights.prototype.CSS) {
            self.CSS = Highlights.prototype.CSS;
            self.loadCSS(self.CSS);
        }
        return self;
    }
}, {
}, {
    commands: function () {
        commands.add(["colo[rscheme]"],
            "Load a color scheme",
            function (args) {
                let scheme = args[0];

                if (scheme == "default")
                    highlight.clear();
                else
                    liberator.assert(io.sourceFromRuntimePath(["colors/" + scheme + ".vimp"]),
                        "No such color scheme: " + scheme);
                autocommands.trigger("ColorScheme", { name: scheme });
            },
            {
                argCount: "1",
                completer: function (context) {
                    context.title = ["Extra Completions"];
                    context.completions = [
                        ["default", "Clear all highlights"]
                    ];
                    context.fork("colorScheme", 0, completion, "colorScheme");
                }
            });

        commands.add(["hi[ghlight]"],
            "Set the style of certain display elements",
            function (args) {
                let style = <><![CDATA[
                    ;
                    display: inline-block !important;
                    position: static !important;
                    margin: 0px !important; padding: 0px !important;
                    width: 3em !important; min-width: 3em !important; max-width: 3em !important;
                    height: 1em !important; min-height: 1em !important; max-height: 1em !important;
                    overflow: hidden !important;
                ]]></>;
                let clear = args[0] == "clear";
                if (clear)
                    args.shift();

                let [key, css] = args;
                liberator.assert(!(clear && css), "Trailing characters");

                if (!css && !clear) {
                    // List matching keys
                    let str = template.tabular(["Key", { header: "Sample", style: "text-align: center" }, "CSS"],
                        ([h.class,
                          <span style={h.value + style}>XXX</span>,
                          template.highlightRegexp(h.value, /\b[-\w]+(?=:)/g, function (str) <span style="font-weight: bold;">{str}</span>)]
                            for (h in highlight)
                                if (!key || h.class.indexOf(key) > -1)));

                    commandline.echo(str, commandline.HL_NORMAL, commandline.FORCE_MULTILINE);
                    return;
                }
                if (!key && clear)
                    highlight.clear();
                else {
                    let error = highlight.set(key, css, clear, "-append" in args);
                    if (error)
                        liberator.echoerr(error);
                }
            },
            {
                // TODO: add this as a standard highlight completion function?
                completer: function (context, args) {
                    // Complete a highlight group on :hi clear ...
                    if (args.completeArg > 0 && args[0] == "clear")
                        args.completeArg = args.completeArg > 1 ? -1 : 0;

                    if (args.completeArg == 0)
                        context.completions = [[v.class, v.value] for (v in highlight)];
                    else if (args.completeArg == 1) {
                        let hl = highlight.get(args[0]);
                        if (hl)
                            context.completions = [[hl.value.replace(/\n+/g, " "), "Current Value"], [hl.default || "", "Default Value"]];
                    }
                },
                hereDoc: true,
                literal: 1,
                options: [[["-append", "-a"], commands.OPTION_NOARG]],
                serial: function () [
                    {
                        command: this.name,
                        arguments: [v.class],
                        literalArg: v.value
                    }
                    for (v in highlight)
                    if (v.value != v.default)
                ]
            });
    },
    completion: function () {
        completion.colorScheme = function colorScheme(context) {
            context.title = ["Color Scheme", "Runtime Path"];
            context.keys = { text: function (f) f.leafName.replace(/\.vimp$/, ""), description: ".parent.path" };
            context.completions = util.Array.flatten(
                io.getRuntimeDirectories("colors").map(
                    function (dir) dir.readDirectory().filter(
                        function (file) /\.vimp$/.test(file.leafName))))

        };

        completion.highlightGroup = function highlightGroup(context) {
            context.title = ["Highlight Group", "Value"];
            context.completions = [[v.class, v.value] for (v in highlight)];
        };
    }
});

// vim: set fdm=marker sw=4 ts=4 et:
